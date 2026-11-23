import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Server-to-server endpoint for the Yahya Learning Hub (needs sql/15_learning_credits.sql).
// Never called from a browser: every request must carry an HMAC-SHA256 signature made with
// LEARNHUB_HMAC_SECRET, which only this server and the Learning Hub API know.
//
//   POST /api/learning-credit
//   headers: x-learnhub-timestamp: <unix seconds>
//            x-learnhub-signature: hex(HMAC_SHA256(secret, `${timestamp}.${JSON.stringify(body)}`))
//   body:    { action: 'credit',  kid_id, points, event_id, reason }
//            { action: 'reverse', event_id, reason }
//            { action: 'balance', kid_id }
//            { action: 'lookup',  event_ids: [...] }            (reconciliation)
//
// Idempotent: a repeated credit/reverse for the same event_id returns the original ledger row
// with duplicate: true — enforced by the unique index on (source, external_ref).

const SOURCE = 'learning-hub';
const MAX_SKEW_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function verifySignature(req, secret) {
    const ts = req.headers['x-learnhub-timestamp'];
    const sig = req.headers['x-learnhub-signature'];
    if (typeof ts !== 'string' || typeof sig !== 'string' || !/^\d{9,11}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) return false;
    if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_SECONDS) return false;
    const expected = createHmac('sha256', secret).update(`${ts}.${JSON.stringify(req.body ?? null)}`).digest();
    return timingSafeEqual(expected, Buffer.from(sig, 'hex'));
}

const row = (r) => ({ ledger_id: r.id, kid_id: r.kid_id, amount: Number(r.amount), created_at: r.created_at });

export default async function handler(req, res) {
    // Server-to-server only. kids-web is also published to the internet through Tailscale Funnel;
    // Caddy tags every Funnel request with this header, so anything arriving that way gets a 404.
    // The Learning Hub calls kids-web directly on the kids-prod Docker network, without the header.
    if (req.headers['tailscale-funnel-request']) return res.status(404).json({ error: "Not found" });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const SUPA_URL = process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SECRET = process.env.LEARNHUB_HMAC_SECRET;
    // Off unless explicitly configured: no secret → the endpoint does nothing.
    if (!SECRET || SECRET.length < 32) return res.status(503).json({ error: 'Learning Hub credits are not enabled' });
    if (!SUPA_URL || !SERVICE_KEY) {
        console.error('api/learning-credit: missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
        return res.status(500).json({ error: 'Server misconfigured' });
    }
    if (!verifySignature(req, SECRET)) return res.status(401).json({ error: 'Bad signature' });

    const MAX_POINTS = Number(process.env.LEARNHUB_MAX_POINTS_PER_EVENT || 100);
    const DAILY_MAX = Number(process.env.LEARNHUB_DAILY_MAX_POINTS || 200);
    const admin = createClient(SUPA_URL, SERVICE_KEY);
    const body = req.body || {};

    const findByRef = async (ref) => {
        const { data, error } = await admin.from('wallet_transactions')
            .select('id, kid_id, amount, created_at').eq('source', SOURCE).eq('external_ref', ref).maybeSingle();
        if (error) throw new Error(error.message);
        return data;
    };

    // Insert once; on a unique violation return the row that already exists.
    const insertOnce = async (values) => {
        const { data, error } = await admin.from('wallet_transactions').insert(values).select('id, kid_id, amount, created_at').single();
        if (!error) return { ...row(data), duplicate: false };
        if (error.code !== '23505') throw new Error(error.message);
        const existing = await findByRef(values.external_ref);
        if (!existing) throw new Error('conflict without existing row');
        if (existing.kid_id !== values.kid_id || Number(existing.amount) !== Number(values.amount)) {
            const e = new Error('event_id already used for a different credit');
            e.status = 409;
            throw e;
        }
        return { ...row(existing), duplicate: true };
    };

    try {
        if (body.action === 'credit') {
            const { kid_id, points, event_id, reason } = body;
            if (!UUID.test(kid_id || '')) return res.status(400).json({ error: 'kid_id must be a UUID' });
            if (!Number.isInteger(points) || points < 1 || points > MAX_POINTS) return res.status(400).json({ error: `points must be 1–${MAX_POINTS}` });
            if (typeof event_id !== 'string' || event_id.length < 3 || event_id.length > 200) return res.status(400).json({ error: 'event_id required' });

            const prior = await findByRef(event_id);
            if (prior) {
                if (prior.kid_id !== kid_id || Number(prior.amount) !== points) return res.status(409).json({ error: 'event_id already used for a different credit' });
                return res.status(200).json({ ...row(prior), duplicate: true });
            }

            const { data: kid } = await admin.from('users').select('id, role').eq('id', kid_id).maybeSingle();
            if (!kid || kid.role !== 'kid') return res.status(404).json({ error: 'No such kid' });

            // Defence in depth on top of the Learning Hub's own caps: at most DAILY_MAX net learning points per kid per Riyadh day
            // (reversals count against it, so a reversed credit frees its share).
            // Riyadh is UTC+3 all year (the repo-wide convention, see CLAUDE.md).
            const riyadhNow = new Date(Date.now() + 3 * 3600_000);
            const riyadhMidnightUtc = new Date(Date.UTC(riyadhNow.getUTCFullYear(), riyadhNow.getUTCMonth(), riyadhNow.getUTCDate()) - 3 * 3600_000);
            const { data: today } = await admin.from('wallet_transactions')
                .select('amount').eq('kid_id', kid_id).eq('source', SOURCE).gte('created_at', riyadhMidnightUtc.toISOString());
            const used = (today || []).reduce((a, r) => a + Number(r.amount), 0);
            if (used + points > DAILY_MAX) return res.status(422).json({ error: `Daily learning limit reached (${used}/${DAILY_MAX})` });

            const result = await insertOnce({
                kid_id, wallet: 'points', type: 'reward', amount: points,
                source: SOURCE, external_ref: event_id, note: String(reason || 'Learning Hub').slice(0, 200),
            });
            return res.status(200).json(result);
        }

        if (body.action === 'reverse') {
            const { event_id, reason } = body;
            if (typeof event_id !== 'string' || event_id.length < 3 || event_id.length > 200) return res.status(400).json({ error: 'event_id required' });
            const orig = await findByRef(event_id);
            if (!orig) return res.status(404).json({ error: 'Nothing to reverse for that event_id' });
            const result = await insertOnce({
                kid_id: orig.kid_id, wallet: 'points', type: 'withdraw', amount: -Math.abs(Number(orig.amount)),
                source: SOURCE, external_ref: `reverse:${event_id}`, note: `Reversed: ${String(reason || '').slice(0, 180)}`,
            });
            return res.status(200).json(result);
        }

        if (body.action === 'balance') {
            if (!UUID.test(body.kid_id || '')) return res.status(400).json({ error: 'kid_id must be a UUID' });
            const { data, error } = await admin.from('wallet_transactions').select('amount').eq('kid_id', body.kid_id).eq('wallet', 'points');
            if (error) throw new Error(error.message);
            return res.status(200).json({ kid_id: body.kid_id, points: (data || []).reduce((a, r) => a + Number(r.amount), 0) });
        }

        if (body.action === 'lookup') {
            const ids = Array.isArray(body.event_ids) ? body.event_ids.filter((x) => typeof x === 'string').slice(0, 500) : [];
            if (!ids.length) return res.status(200).json({ found: [] });
            const { data, error } = await admin.from('wallet_transactions')
                .select('id, kid_id, amount, external_ref, created_at').eq('source', SOURCE).in('external_ref', ids);
            if (error) throw new Error(error.message);
            return res.status(200).json({ found: (data || []).map((r) => ({ event_id: r.external_ref, ...row(r) })) });
        }

        return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
        console.error('api/learning-credit:', err.message);
        return res.status(err.status || 500).json({ error: err.status ? err.message : 'Ledger write failed' });
    }
}
