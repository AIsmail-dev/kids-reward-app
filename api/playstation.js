import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import notify from './notify.js';

// PlayStation time: an approved `playstation_time` request adds its minutes to the kid's PlayStation
// limit for today, through Sony's PS Family parental controls. Sony has no public API: the calls go
// to the kids-psn container (docker/psn/server.py, the unofficial `psnfamily` library), which holds
// the PSN login. Unlike a Family Link bonus, the minutes aren't a clock window: they can be played
// any time until midnight.
const PSN_URL = process.env.PSN_SERVICE_URL; // e.g. http://kids-psn:8090
// The bridge keeps to 1 request / 3 s, so a grant (read, set, read back) takes ~10 s.
const PSN_TIMEOUT_MS = 45000;
const READBACK_DELAYS_MS = (process.env.PLAYSTATION_READBACK_DELAYS || '2000,5000').split(',').map(Number);
const MAX_MINUTES_PER_DAY = 1440;
const ON_LIMIT_ACTION = 'FORCE_LOGOUT'; // the console signs the kid out when the time is up

const riyadhToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function psn(method, path, body) {
    if (!PSN_URL) throw new Error('The PlayStation service is not set up on this server.');
    let res;
    try {
        res = await fetch(PSN_URL + path, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(PSN_TIMEOUT_MS),
        });
    } catch (e) {
        throw new Error(e.name === 'TimeoutError' ? 'PlayStation did not respond in time.' : "Can't reach the PlayStation service.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `PlayStation service error (${res.status})`);
    return data;
}

function push(body) {
    return notify({ method: 'POST', body }, { status() { return this; }, json() {} })
        .catch((e) => console.error('playstation: push failed', e));
}

// Grants read today's limit and then write a new one, so they must not overlap.
// Everything runs in the one kids-web process, so an in-process queue is enough.
let grantQueue = Promise.resolve();
function enqueue(fn) {
    const run = grantQueue.then(fn);
    grantQueue = run.catch(() => {});
    return run;
}

// Sets today's limit to the request's target and confirms Sony shows it. Returns the target.
async function applyGrant(supabase, request) {
    const { data: link } = await supabase
        .from('playstation_links')
        .select('psn_member_id, psn_account_id')
        .eq('kid_id', request.kid_id)
        .maybeSingle();
    if (!link) throw new Error('This kid is not linked to a PlayStation account. Link them in Settings.');

    const amount = Number(request.amount);
    if (!Number.isInteger(amount) || amount < 15 || amount % 15) throw new Error(`Invalid number of minutes: ${request.amount}`);

    const today = riyadhToday();
    const readLimit = async () => (await psn('GET', `/playtime?accountId=${encodeURIComponent(link.psn_account_id)}`)).todayLimitMinutes;
    const current = await readLimit();

    // A same-day retry resends the total worked out the first time (Sony's call sets the limit
    // outright, so adding the minutes again would grant them twice). If it's already there, done.
    let target = request.playstation_target_date === today ? request.playstation_target_minutes : null;
    if (target && current !== null && current >= target) return target;

    if (!target) {
        if (current === null) {
            // Setting a limit here would restrict a kid who has none.
            throw new Error('This PlayStation account has no play-time limit, so there is nothing to add to. Set one in the PlayStation Family app.');
        }
        target = current + amount; // a blocked day (0) counts as nothing left to add to
        if (target > MAX_MINUTES_PER_DAY) throw new Error(`That would make today's limit ${target} minutes, more than a full day.`);
        await supabase
            .from('wallet_requests')
            .update({ playstation_target_minutes: target, playstation_target_date: today })
            .eq('id', request.id);
    }

    await psn('POST', '/today-limit', { memberId: link.psn_member_id, minutes: target });

    // Only count it once Sony shows it.
    for (const delay of READBACK_DELAYS_MS) {
        await sleep(delay);
        if ((await readLimit()) >= target) return target;
    }
    throw new Error('Sony accepted the new limit but it did not show up. Check the PlayStation Family app before retrying.');
}

// Adds an approved request's minutes to today's PlayStation limit (on approval, or a parent's retry).
async function grant(supabase, requestId, actor) {
    const { data: request } = await supabase.from('wallet_requests').select('*').eq('id', requestId).maybeSingle();
    if (!request || request.wallet !== 'playstation_time') return { status: 'refused', error: 'Request not found.' };
    if (request.status !== 'approved') return { status: 'refused', error: 'This request is not waiting to be added.' };

    // Claiming the row makes this safe against double taps.
    const { data: claimed, error } = await supabase
        .from('wallet_requests')
        .update({ playstation_status: 'granting' })
        .eq('id', requestId)
        .eq('status', 'approved')
        .or('playstation_status.is.null,playstation_status.eq.failed')
        .select('*');
    if (error) throw error;
    if (!claimed?.length) return { status: 'refused', error: 'This is already being added.' };

    const [{ data: kid }, { data: parent }] = await Promise.all([
        supabase.from('users').select('name').eq('id', request.kid_id).maybeSingle(),
        supabase.from('users').select('name').eq('id', actor.id).maybeSingle(),
    ]);
    const kidName = kid?.name || 'Your kid';

    let target;
    try {
        target = await applyGrant(supabase, claimed[0]);
    } catch (e) {
        const message = e.message;
        console.error(`playstation: grant ${requestId} failed:`, e);
        await supabase
            .from('wallet_requests')
            .update({ playstation_status: 'failed', playstation_error: message })
            .eq('id', requestId);
        await push({
            title: 'PlayStation time not added 🎮',
            message: `${kidName}'s ${request.amount} minutes couldn't be added: ${message.replace(/\.$/, '')}. Retry it or give the points back in Approve.`,
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
            fulfilled_by_name: parent?.name || 'PlayStation',
            playstation_status: 'granted',
            playstation_error: null,
        })
        .eq('id', requestId);
    await push({
        title: 'PlayStation time added! 🎮',
        message: `${request.amount} minutes added to your PlayStation for today (${target} min in total). Have fun!`,
        targetKidId: request.kid_id,
        url: '/login',
        type: 'notify_kid',
    });
    return { status: 'granted', todayLimitMinutes: target };
}

async function getStatus(supabase) {
    const [{ data: kids }, { data: links }] = await Promise.all([
        supabase.from('users').select('id, name').eq('role', 'kid').order('name'),
        supabase.from('playstation_links').select('kid_id, psn_member_id, psn_account_id, psn_name'),
    ]);
    const base = { kids: kids || [], links: links || [], children: [] };
    try {
        return { ...base, ...(await psn('GET', '/status')) };
    } catch (e) {
        return { ...base, connected: false, error: e.message };
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
        console.error('playstation: missing required env vars');
        return res.status(500).json({ error: 'Server misconfigured' });
    }
    const supabase = createClient(SUPA_URL, SERVICE_KEY);
    const body = req.body || {};
    const action = req.method === 'GET' ? req.query?.action : body.action;

    const actor = getActor(req);
    if (!actor) return res.status(401).json({ error: 'Login required' });
    if (actor.role !== 'parent') return res.status(401).json({ error: 'Parent login required' });

    try {
        if (req.method === 'GET' && action === 'status') return res.status(200).json(await getStatus(supabase));
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

        if (action === 'grant') {
            if (!body.requestId) return res.status(400).json({ error: 'requestId is required' });
            return res.status(200).json(await enqueue(() => grant(supabase, body.requestId, actor)));
        }
        if (action === 'connect') {
            await psn('POST', '/connect', { npsso: body.npsso });
            return res.status(200).json(await getStatus(supabase));
        }
        if (action === 'disconnect') {
            await psn('POST', '/disconnect');
            return res.status(200).json({ success: true });
        }
        if (action === 'link') {
            const { kidId, memberId, accountId, name } = body;
            if (!kidId) return res.status(400).json({ error: 'kidId is required' });
            if (!memberId || !accountId) {
                const { error } = await supabase.from('playstation_links').delete().eq('kid_id', kidId);
                if (error) return res.status(500).json({ error: error.message });
                return res.status(200).json({ success: true });
            }
            const { error } = await supabase.from('playstation_links').upsert({
                kid_id: kidId, psn_member_id: memberId, psn_account_id: accountId, psn_name: name || null,
                updated_at: new Date().toISOString(),
            });
            if (error) return res.status(500).json({ error: error.message });
            // When earned time runs out, the console signs the kid out (chosen by the parents).
            try {
                await psn('POST', '/on-limit', { memberId, action: ON_LIMIT_ACTION });
            } catch (e) {
                return res.status(200).json({ success: true, warning: `Linked, but couldn't turn on sign-out at the limit: ${e.message}` });
            }
            return res.status(200).json({ success: true });
        }
        return res.status(400).json({ error: 'Unknown action' });
    } catch (e) {
        console.error(`playstation: ${action} failed:`, e);
        return res.status(502).json({ error: e.message });
    }
}
