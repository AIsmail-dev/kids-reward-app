import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const VAPID_PUBLIC = "BFEfkz9ji2VeaQDjPghfCZT3tju-6DYv6kMsjsaJ-NfpblzuKRxrT4YJM8MeK3MJVakZ3keNo4N9zAL6DsqkvD8";
const VAPID_PRIVATE = "RQVngakZXhAppFQT__CGx7zNEK--0LwMb0icMJbmunA";

webpush.setVapidDetails('mailto:admin@kidsrewards.app', VAPID_PUBLIC, VAPID_PRIVATE);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { title, message, targetRole, targetKidId, url } = req.body;

    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

    try {
        let query = supabase.from('users').select('id');
        if (targetRole) query = query.eq('role', targetRole);
        if (targetKidId) query = query.eq('id', targetKidId);

        const { data: users, error: userErr } = await query;
        if (userErr || !users) return res.status(500).json({ error: userErr });

        const userIds = users.map(u => u.id);
        if (userIds.length === 0) return res.status(200).json({ success: true, count: 0, reason: "No matching users found" });

        const { data: subs, error: subErr } = await supabase.from('push_subscriptions').select('subscription').in('user_id', userIds);
        if (subErr || !subs) return res.status(500).json({ error: subErr });

        const payload = JSON.stringify({ title, body: message, url: url || '/' });
        const promises = subs.map(s => webpush.sendNotification(s.subscription, payload).catch(e => console.error("Push Error", e)));

        await Promise.all(promises);
        return res.status(200).json({ success: true, count: subs.length });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
