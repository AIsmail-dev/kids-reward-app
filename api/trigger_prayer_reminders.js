import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const VAPID_PUBLIC = "BFEfkz9ji2VeaQDjPghfCZT3tju-6DYv6kMsjsaJ-NfpblzuKRxrT4YJM8MeK3MJVakZ3keNo4N9zAL6DsqkvD8";
const VAPID_PRIVATE = "RQVngakZXhAppFQT__CGx7zNEK--0LwMb0icMJbmunA";
webpush.setVapidDetails('mailto:admin@kidsrewards.app', VAPID_PUBLIC, VAPID_PRIVATE);

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const SUPA_URL = process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPA_URL || !SERVICE_KEY) {
        console.error('trigger_prayer_reminders: missing required Supabase env vars');
        return res.status(500).json({ error: 'Server misconfigured' });
    }
    const supabase = createClient(SUPA_URL, SERVICE_KEY);

    // Get current Riyadh time in HH:MM Format 24hr
    const nowRiyadh = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
    const h = nowRiyadh.getHours();
    const m = nowRiyadh.getMinutes();
    const currentTotalMinutes = h * 60 + m;
    const todayDate = nowRiyadh.toISOString().split('T')[0];

    try {
        const aladhanRes = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=Riyadh&country=Saudi%20Arabia&method=4`);
        if (!aladhanRes.ok) return res.status(500).json({ error: "Failed to fetch prayer times" });
        const data = await aladhanRes.json();
        const timings = data.data.timings;

        // Ensure robust matching whether tasks were named "صلاة الفجر" or simply "فجر" or "Fajr"
        const prayerKeys = {
            'Fajr': { keywords: ['فجر', 'fajr'], soundBase: 'fajr' },
            'Dhuhr': { keywords: ['ظهر', 'dhuhr', 'zuhr'], soundBase: 'dhuhr' },
            'Asr': { keywords: ['عصر', 'asr'], soundBase: 'asr' },
            'Maghrib': { keywords: ['مغرب', 'maghrib'], soundBase: 'maghrib' },
            'Isha': { keywords: ['عشاء', 'isha'], soundBase: 'isha' }
        };

        const activePrayers = [];
        const times = { Fajr: timings.Fajr, Dhuhr: timings.Dhuhr, Asr: timings.Asr, Maghrib: timings.Maghrib, Isha: timings.Isha };

        for (const [p, t] of Object.entries(times)) {
            const [pHour, pMin] = t.split(':').map(Number);
            const prayerTotalMinutes = pHour * 60 + pMin;

            let diff = currentTotalMinutes - prayerTotalMinutes;

            // If the time is later in the current day, diff will be negative
            if (diff >= 0 && diff % 30 === 0 && diff < 1440) {
                activePrayers.push({
                    name: p,
                    isReminder: diff > 0, // 0 = exactly time, 30+ = reminder
                    config: prayerKeys[p]
                });
            }
        }

        if (activePrayers.length === 0) {
            return res.status(200).json({ message: "No prayer or reminder exactly at this minute", serverTimeRiyadh: `${h}:${m}` });
        }

        // Only bother fetching Prayer tasks that are pending
        const { data: occurrences, error: occErr } = await supabase.from('task_occurrences')
            .select('id, kid_id, tasks!inner(title, task_type)')
            .eq('scheduled_date', todayDate)
            .eq('status', 'pending')
            .eq('tasks.task_type', 'prayer');

        if (occErr) return res.status(500).json({ error: occErr.message });
        if (!occurrences || occurrences.length === 0) return res.status(200).json({ message: "No pending prayer tasks to remind about." });

        let promises = [];
        let notificationsSent = 0;

        const kidIds = [...new Set(occurrences.map(o => o.kid_id))];
        const { data: subs } = await supabase.from('push_subscriptions').select('subscription, user_id').in('user_id', kidIds);

        occurrences.forEach(occ => {
            const title = (occ.tasks.title || "").toLowerCase();

            // Check if this task matches the active prayer we are checking right now
            const matchedPrayer = activePrayers.find(ap =>
                ap.config.keywords.some(k => title.includes(k))
            );

            if (matchedPrayer) {
                const kidSubs = (subs || []).filter(s => s.user_id === occ.kid_id);
                const soundFile = `/${matchedPrayer.config.soundBase}_${matchedPrayer.isReminder ? 'remind' : 'now'}.mp3`;

                const titleText = matchedPrayer.isReminder ? 'تذكير بالصلاة! 📿' : 'حان وقت الصلاة! 🕌';
                const bodyText = matchedPrayer.isReminder
                    ? `لا تنسى صلاة ${matchedPrayer.config.keywords[0]}! هيا اكسب مكافأتك.`
                    : `حان الآن وقت صلاة ${matchedPrayer.config.keywords[0]}!`;

                const payload = JSON.stringify({
                    title: titleText,
                    body: bodyText,
                    url: '/',
                    type: 'notify_kid',
                    customSound: soundFile
                });

                kidSubs.forEach(s => {
                    promises.push(webpush.sendNotification(s.subscription, payload).catch(e => console.error(e)));
                    notificationsSent++;
                });
            }
        });

        await Promise.allSettled(promises);
        return res.status(200).json({ success: true, notifications_sent: notificationsSent, active_prayers: activePrayers });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
