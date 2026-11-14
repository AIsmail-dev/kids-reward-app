import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const VAPID_PUBLIC = "BFEfkz9ji2VeaQDjPghfCZT3tju-6DYv6kMsjsaJ-NfpblzuKRxrT4YJM8MeK3MJVakZ3keNo4N9zAL6DsqkvD8";
const VAPID_PRIVATE = "RQVngakZXhAppFQT__CGx7zNEK--0LwMb0icMJbmunA";
webpush.setVapidDetails('mailto:admin@kidsrewards.app', VAPID_PUBLIC, VAPID_PRIVATE);

// High urgency so Android delivers while the phone is dozing; a reminder is stale after 30 minutes
// (the next one follows).
const PUSH_OPTIONS = { urgency: 'high', TTL: 1800 };

// Arabic spelling of each kid's name, keyed by users.name lowercased, for the notification text.
// The same slug picks the Android app's spoken clip for that kid (scripts/gen-kid-prayer-clips.sh).
const KID_NAMES_AR = { yahia: 'يحيى', farida: 'فريدة' };

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

    // The current Riyadh date and minute, whatever the server's own time zone.
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    const h = Number(parts.hour);
    const m = Number(parts.minute);
    const currentTotalMinutes = h * 60 + m;
    const todayDate = `${parts.year}-${parts.month}-${parts.day}`;

    try {
        // Today's Umm al-Qura times for Riyadh, asked for by date so they're never another day's.
        const aladhanRes = await fetch(`https://api.aladhan.com/v1/timingsByCity/${parts.day}-${parts.month}-${parts.year}?city=Riyadh&country=Saudi%20Arabia&method=4`);
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

            // One notification per prayer, at its time. (There used to be a reminder every 30 minutes
            // after it while the task was pending, which kept going all day.)
            if (currentTotalMinutes === prayerTotalMinutes) {
                activePrayers.push({ name: p, isReminder: false, config: prayerKeys[p] });
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
        const { data: kids } = await supabase.from('users').select('id, name').in('id', kidIds);
        const kidSlugs = Object.fromEntries((kids || []).map(k => [k.id, (k.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')]));

        const notified = new Set(); // kid + prayer: one notification even if two tasks match
        occurrences.forEach(occ => {
            const title = (occ.tasks.title || "").toLowerCase();

            // Check if this task matches the active prayer we are checking right now
            const matchedPrayer = activePrayers.find(ap =>
                ap.config.keywords.some(k => title.includes(k))
            );

            if (matchedPrayer && !notified.has(`${occ.kid_id}:${matchedPrayer.name}`)) {
                notified.add(`${occ.kid_id}:${matchedPrayer.name}`);
                const kidSubs = (subs || []).filter(s => s.user_id === occ.kid_id);
                const soundFile = `/${matchedPrayer.config.soundBase}_${matchedPrayer.isReminder ? 'remind' : 'now'}.mp3`;

                const titleText = matchedPrayer.isReminder ? 'تذكير بالصلاة! 📿' : 'حان وقت الصلاة! 🕌';
                const kidSlug = kidSlugs[occ.kid_id] || '';
                const greeting = KID_NAMES_AR[kidSlug] ? `يا ${KID_NAMES_AR[kidSlug]}، ` : '';
                const bodyText = greeting + (matchedPrayer.isReminder
                    ? `لا تنسى صلاة ${matchedPrayer.config.keywords[0]}! هيا اكسب مكافأتك.`
                    : `حان الآن وقت صلاة ${matchedPrayer.config.keywords[0]}!`);

                const payload = JSON.stringify({
                    title: titleText,
                    body: bodyText,
                    url: '/',
                    type: 'notify_kid',
                    customSound: soundFile,
                    kid: kidSlug
                });

                kidSubs.forEach(s => {
                    promises.push(webpush.sendNotification(s.subscription, payload, PUSH_OPTIONS).catch(e => console.error(e)));
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
