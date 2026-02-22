import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const VAPID_PUBLIC = "BFEfkz9ji2VeaQDjPghfCZT3tju-6DYv6kMsjsaJ-NfpblzuKRxrT4YJM8MeK3MJVakZ3keNo4N9zAL6DsqkvD8";
const VAPID_PRIVATE = "RQVngakZXhAppFQT__CGx7zNEK--0LwMb0icMJbmunA";
webpush.setVapidDetails('mailto:admin@kidsrewards.app', VAPID_PUBLIC, VAPID_PRIVATE);

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

    // Get current Riyadh time in HH:MM Format 24hr
    const nowRiyadh = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
    const h = String(nowRiyadh.getHours()).padStart(2, '0');
    const m = String(nowRiyadh.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${h}:${m}`;
    const todayDate = nowRiyadh.toISOString().split('T')[0];

    try {
        const aladhanRes = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=Riyadh&country=Saudi%20Arabia&method=4`);
        if (!aladhanRes.ok) return res.status(500).json({ error: "Failed to fetch prayer times" });
        const data = await aladhanRes.json();
        const timings = data.data.timings;

        // Ensure robust matching whether tasks were named "صلاة الفجر" or simply "فجر" or "Fajr"
        const prayerKeys = {
            'Fajr': ['فجر', 'fajr'],
            'Dhuhr': ['ظهر', 'dhuhr', 'zuhr'],
            'Asr': ['عصر', 'asr'],
            'Maghrib': ['مغرب', 'maghrib'],
            'Isha': ['عشاء', 'isha']
        };

        const currentDue = [];
        const times = { Fajr: timings.Fajr, Dhuhr: timings.Dhuhr, Asr: timings.Asr, Maghrib: timings.Maghrib, Isha: timings.Isha };

        for (const [p, t] of Object.entries(times)) {
            // Strictly check for equality (this cron is expected to run every 1 minute)
            if (t === currentTimeStr) currentDue.push(p);
        }

        if (currentDue.length === 0) {
            return res.status(200).json({ message: "No prayer exactly right now", serverTimeRiyadh: currentTimeStr, prayerTimes: times });
        }

        // Only bother fetching Prayer tasks that are pending and haven't triggered today
        const { data: occurrences, error: occErr } = await supabase.from('task_occurrences')
            .select('id, kid_id, tasks!inner(title, task_type)')
            .eq('scheduled_date', todayDate)
            .eq('status', 'pending')
            .eq('reminder_sent', false)
            .eq('tasks.task_type', 'prayer');

        if (occErr) return res.status(500).json({ error: occErr.message });
        if (!occurrences || occurrences.length === 0) return res.status(200).json({ message: "No pending prayer tasks to remind about." });

        const toRemind = occurrences.filter(occ => {
            const title = (occ.tasks.title || "").toLowerCase();
            return currentDue.some(due => {
                return prayerKeys[due].some(keyword => title.includes(keyword));
            });
        });

        if (toRemind.length === 0) return res.status(200).json({ message: "No matching task titles for the current prayer time." });

        // Safely check off these specific tasks globally so we never double-notify
        const occIds = toRemind.map(o => o.id);
        await supabase.from('task_occurrences').update({ reminder_sent: true }).in('id', occIds);

        // Batch Web-Push logic exactly how we do for Kids/Parents normally
        const kidIds = [...new Set(toRemind.map(o => o.kid_id))];
        const { data: subs } = await supabase.from('push_subscriptions').select('subscription, user_id').in('user_id', kidIds);

        let promises = [];
        toRemind.forEach(occ => {
            const kidSubs = (subs || []).filter(s => s.user_id === occ.kid_id);
            const payload = JSON.stringify({
                title: 'حان وقت الصلاة! 🕌',
                body: `حان الآن وقت ${occ.tasks.title}. هيا لنصلي ونكسب المكافأة! 🌟`,
                url: '/',
                type: 'notify_kid'
            });
            kidSubs.forEach(s => promises.push(webpush.sendNotification(s.subscription, payload).catch(e => console.error(e))));
        });

        await Promise.allSettled(promises);
        return res.status(200).json({ success: true, notifications_sent: promises.length, prayers_due: currentDue });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
