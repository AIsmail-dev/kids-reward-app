import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { FamilyLink } from 'g-family-link';
import jwt from 'jsonwebtoken';
import notify from './notify.js';

// Google has no public Family Link API: this uses its private web endpoints through the parent's
// session cookies. They are a full Google login, so they stay in a file on this server only, never
// in the database (reachable over REST, and copied into backups) or the browser.
const COOKIE_FILE = path.join(process.env.FAMILYLINK_DATA_DIR || '.familylink', 'cookies.json');
const AUTH_USER = Number(process.env.FAMILYLINK_AUTH_USER || 0);
const GOOGLE_TIMEOUT_MS = 20000;
const READBACK_DELAYS_MS = (process.env.FAMILYLINK_READBACK_DELAYS || '3000,5000').split(',').map(Number);
const MAX_MINUTES_PER_DAY = 1440;

const riyadhToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Google did not respond in time')), GOOGLE_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function push(body) {
    return notify({ method: 'POST', body }, { status() { return this; }, json() {} })
        .catch((e) => console.error('familylink: push failed', e));
}

async function loadClient() {
    let cookies;
    try {
        cookies = JSON.parse(await readFile(COOKIE_FILE, 'utf-8'));
    } catch (e) {
        if (e.code === 'ENOENT') throw new Error('Family Link is not connected');
        throw e;
    }
    return FamilyLink.fromCookies(cookies, AUTH_USER);
}

function describeError(e) {
    if (e.statusCode === 401) return 'Google session expired. Reconnect Family Link in Admin → Settings.';
    return e.message;
}

// Grants read the current bonus window and then write a new one, so they must not overlap.
// Everything runs in the one kids-web process, so an in-process queue is enough.
let grantQueue = Promise.resolve();
function enqueue(fn) {
    const run = grantQueue.then(fn);
    grantQueue = run.catch(() => {});
    return run;
}

// Refused for now (e.g. downtime), not failed: the request stays ready to start later.
class NotNowError extends Error {}

const riyadhTime = (date) => date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' });

// A bonus is a clock window: Google stores when the override was created and its length, and lifts
// the daily limit, downtime and school time until then, used or not. The library only reports the
// length, so read the start from the raw response to know when the current window ends.
async function readWindowEnd(client, childId, deviceId) {
    const raw = (await withTimeout(client._api.getAppliedTimeLimits(childId))).json;
    const row = (raw?.[1] || []).find((r) => Array.isArray(r) && (r[0]?.[3] === deviceId || r[25] === deviceId));
    const override = row?.[0];
    if (!Array.isArray(override) || override[2] !== 10) return 0;
    const startedAt = Number(override[1]);
    const seconds = Number(override[13]?.[0]?.[0]);
    return startedAt && seconds ? startedAt + seconds * 1000 : 0;
}

async function applyBonus(supabase, request) {
    const { data: link } = await supabase
        .from('familylink_links')
        .select('google_child_id, google_device_id')
        .eq('kid_id', request.kid_id)
        .maybeSingle();
    if (!link) throw new Error('This kid is not linked to a device. Link them in Admin → Settings.');

    const { google_child_id: childId, google_device_id: deviceId } = link;
    const amount = Number(request.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_MINUTES_PER_DAY) {
        throw new Error(`Invalid number of minutes: ${request.amount}`);
    }

    const client = await loadClient();
    const [limits, windowEnd] = await Promise.all([
        withTimeout(client.getAppliedTimeLimits(childId)),
        readWindowEnd(client, childId, deviceId),
    ]);
    const device = limits.devices[deviceId];
    if (!device) throw new Error('The linked device was not found on Family Link.');
    if (!device.dailyLimitEnabled) {
        // Sending a bonus here could impose a limit on a device that has none.
        throw new Error('This device has no daily limit today, so there is nothing to extend.');
    }

    const now = Date.now();
    // A retry after a failed read-back: if the window it sent is on the device, it did apply.
    const sentEnd = request.familylink_ends_at ? Date.parse(request.familylink_ends_at) : 0;
    if (sentEnd > now && windowEnd >= sentEnd - 90000) return sentEnd;

    if (windowEnd <= now && (device.bedtimeActive || device.schooltimeActive)) {
        // The bonus would lift these too. But Google keeps a schedule's windows in the applied limits
        // after the parent switches the schedule off, and the library doesn't check the switch, so
        // ask for it. Only a schedule seen and switched off is ignored: if the rules can't be read,
        // the window counts.
        const rules = await withTimeout(client.getTimeLimitRules(childId));
        const off = (ruleId, enabled) => Boolean(ruleId) && !enabled;
        const downtime = device.bedtimeActive && !off(rules.bedtimeRuleId, rules.bedtimeEnabled);
        const schooltime = device.schooltimeActive && !off(rules.schooltimeRuleId, rules.schoolTimeEnabled);
        if (downtime || schooltime) {
            throw new NotNowError(`It's ${downtime ? 'downtime' : 'school time'} now. Start it later.`);
        }
    }

    // Time used during a window still counts toward the daily limit (the device locks when it ends),
    // so it must cover what was left of the limit plus the request. A running window is extended from
    // its real end instead.
    const baseMinutes = windowEnd > now ? Math.ceil((windowEnd - now) / 60000) : device.remainingMinutes;
    const target = baseMinutes + amount;
    if (target > MAX_MINUTES_PER_DAY) throw new Error(`Bonus of ${target} minutes is more than a full day.`);
    const endsAt = now + target * 60000;

    await supabase
        .from('wallet_requests')
        .update({ familylink_target_minutes: target, familylink_ends_at: new Date(endsAt).toISOString() })
        .eq('id', request.id);

    if (!(await withTimeout(client.addTimeBonus(childId, deviceId, target)))) {
        throw new Error('Google refused the bonus.');
    }

    // A 200 from Google doesn't prove a bonus applied, so it only counts once it reads back.
    for (const delay of READBACK_DELAYS_MS) {
        await sleep(delay);
        if ((await readWindowEnd(client, childId, deviceId)) >= endsAt - 90000) return endsAt;
    }
    throw new Error('Google accepted the bonus but it did not show up on the device. Check Family Link before retrying.');
}

// Starts an approved request's screen time now: by the kid it belongs to, or by a parent.
async function start(supabase, requestId, actor) {
    const today = riyadhToday();
    const { data: request } = await supabase.from('wallet_requests').select('*').eq('id', requestId).maybeSingle();
    if (!request || request.wallet !== 'screen_time' || (actor.role === 'kid' && request.kid_id !== actor.id)) {
        return { status: 'refused', error: 'Request not found.' };
    }
    if (request.status !== 'approved') return { status: 'refused', error: 'This request is not waiting to be started.' };
    if (request.scheduled_date > today) return { status: 'refused', error: `This is for ${request.scheduled_date}. Start it on that day.` };

    // Claiming the row makes this safe against double taps.
    const previous = request.familylink_status;
    const { data: claimed, error } = await supabase
        .from('wallet_requests')
        .update({ familylink_status: 'granting' })
        .eq('id', requestId)
        .eq('status', 'approved')
        .or('familylink_status.is.null,familylink_status.in.(ready,failed)')
        .select('*');
    if (error) throw error;
    if (!claimed?.length) return { status: 'refused', error: 'This is already being started.' };

    const [{ data: kid }, { data: starter }] = await Promise.all([
        supabase.from('users').select('name').eq('id', request.kid_id).maybeSingle(),
        supabase.from('users').select('name').eq('id', actor.id).maybeSingle(),
    ]);
    const kidName = kid?.name || 'Your kid';
    const what = `${request.amount} minutes`;

    let endsAt;
    try {
        endsAt = await applyBonus(supabase, claimed[0]);
    } catch (e) {
        if (e instanceof NotNowError) {
            await supabase.from('wallet_requests').update({ familylink_status: previous }).eq('id', requestId);
            return { status: 'refused', error: e.message };
        }
        const message = describeError(e);
        console.error(`familylink: start ${requestId} failed:`, e);
        await supabase
            .from('wallet_requests')
            .update({ familylink_status: 'failed', familylink_error: message })
            .eq('id', requestId);
        await push({
            title: 'Screen time did not start ⏰',
            message: `${kidName}'s ${what} couldn't be added on Family Link: ${message}`,
            targetRole: 'parent',
            url: '/parent',
            type: 'notify_parent',
        });
        return { status: 'failed', error: message };
    }

    await supabase
        .from('wallet_requests')
        .update({
            status: 'fulfilled',
            fulfilled_at: new Date().toISOString(),
            fulfilled_by_name: starter?.name || 'Family Link',
            familylink_status: 'granted',
            familylink_error: null,
        })
        .eq('id', requestId);
    const until = riyadhTime(new Date(endsAt));
    await push(actor.role === 'kid'
        ? { title: 'Screen time started ⏰', message: `${kidName} started ${what}, until ${until}.`, targetRole: 'parent', url: '/parent', type: 'notify_parent' }
        : { title: 'Screen time added! 🎉', message: `${what} added to your device, until ${until}. Enjoy!`, targetKidId: request.kid_id, url: '/login', type: 'notify_kid' });
    return { status: 'granted', endsAt: new Date(endsAt).toISOString() };
}

async function getStatus(supabase) {
    const [{ data: kids }, { data: links }] = await Promise.all([
        supabase.from('users').select('id, name').eq('role', 'kid').order('name'),
        supabase.from('familylink_links').select('kid_id, google_child_id, google_device_id'),
    ]);
    const base = { kids: kids || [], links: links || [], children: [] };

    let client;
    try {
        client = await loadClient();
    } catch (e) {
        return { ...base, connected: false };
    }
    try {
        const children = await withTimeout(client.getChildren());
        base.children = await Promise.all(children.map(async (child) => ({
            id: child.userId,
            name: child.profile?.displayName || 'Child',
            devices: (await withTimeout(client.getDevices(child.userId)))
                .map((d) => ({ id: d.deviceId, name: d.name || d.model || 'Device' })),
        })));
        return { ...base, connected: true };
    } catch (e) {
        return { ...base, connected: true, error: describeError(e) };
    }
}

function getActor(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    try {
        const claims = jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms: ['HS256'] });
        return { id: claims.sub, role: claims.app_role };
    } catch {
        return null;
    }
}

export default async function handler(req, res) {
    const SUPA_URL = process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPA_URL || !SERVICE_KEY || !process.env.SUPABASE_JWT_SECRET) {
        console.error('familylink: missing required env vars');
        return res.status(500).json({ error: 'Server misconfigured' });
    }
    const supabase = createClient(SUPA_URL, SERVICE_KEY);
    const body = req.body || {};
    const action = req.method === 'GET' ? req.query?.action : body.action;

    const actor = getActor(req);
    if (!actor) return res.status(401).json({ error: 'Login required' });

    if (req.method === 'POST' && action === 'start') {
        if (!body.requestId) return res.status(400).json({ error: 'requestId is required' });
        return res.status(200).json(await enqueue(() => start(supabase, body.requestId, actor)));
    }

    if (actor.role !== 'parent') return res.status(401).json({ error: 'Parent login required' });

    if (req.method === 'GET' && action === 'status') {
        return res.status(200).json(await getStatus(supabase));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (action === 'connect') {
        const { cookies } = body;
        if (!Array.isArray(cookies) || !cookies.some((c) => c?.name === 'SAPISID')) {
            return res.status(400).json({ error: 'That is not a Cookie-Editor JSON export containing the SAPISID cookie.' });
        }
        await mkdir(path.dirname(COOKIE_FILE), { recursive: true, mode: 0o700 });
        await writeFile(COOKIE_FILE, JSON.stringify(cookies), { mode: 0o600 });
        await chmod(COOKIE_FILE, 0o600);
        return res.status(200).json(await getStatus(supabase));
    }
    if (action === 'disconnect') {
        await unlink(COOKIE_FILE).catch((e) => { if (e.code !== 'ENOENT') throw e; });
        return res.status(200).json({ success: true });
    }
    if (action === 'link') {
        const { kidId, childId, deviceId } = body;
        if (!kidId) return res.status(400).json({ error: 'kidId is required' });
        const { error } = childId && deviceId
            ? await supabase.from('familylink_links').upsert({
                kid_id: kidId, google_child_id: childId, google_device_id: deviceId, updated_at: new Date().toISOString(),
            })
            : await supabase.from('familylink_links').delete().eq('kid_id', kidId);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
}
