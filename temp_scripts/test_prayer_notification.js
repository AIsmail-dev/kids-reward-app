import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const VAPID_PUBLIC = "BFEfkz9ji2VeaQDjPghfCZT3tju-6DYv6kMsjsaJ-NfpblzuKRxrT4YJM8MeK3MJVakZ3keNo4N9zAL6DsqkvD8";
const VAPID_PRIVATE = "RQVngakZXhAppFQT__CGx7zNEK--0LwMb0icMJbmunA";
webpush.setVapidDetails('mailto:admin@kidsrewards.app', VAPID_PUBLIC, VAPID_PRIVATE);

async function testNotification() {
    const SUPA_URL = "https://tvsznlwyvamovdxlpzuc.supabase.co";
    const SUPA_KEY = "sb_publishable_CjnlgIJwWu1s1GpAU-7e6Q_zckxdHiV";
    const supabase = createClient(SUPA_URL, SUPA_KEY);

    const faridaId = "11111111-1111-1111-1111-111111111111";
    const yahiaId = "22222222-2222-2222-2222-222222222222";

    console.log("Fetching subscriptions for Farida and Yahia...");
    const { data: subs, error } = await supabase.from('push_subscriptions').select('*').in('user_id', [faridaId, yahiaId]);

    if (error) {
        console.error("error fetching subs", error);
        return;
    }

    if (!subs || subs.length === 0) {
        console.log("NO SUBSCRIPTIONS FOUND. Notifications will fail. The kids need to open the app once to subscribe.");
        return;
    }

    console.log(`Found ${subs.length} push subscriptions. Sending test prayer notification...`);

    const payload = JSON.stringify({
        title: 'حان وقت الصلاة! 🕌',
        body: 'حان الآن وقت صلاة الظهر! (TEST)',
        url: '/',
        type: 'notify_kid',
        customSound: '/dhuhr_now.mp3'
    });

    const results = await Promise.allSettled(subs.map(s => {
        return webpush.sendNotification(s.subscription, payload);
    }));

    results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
            const userRef = subs[idx].user_id === faridaId ? 'Farida' : 'Yahia';
            console.log(`✅ SENT successfully to ${userRef}`);
        } else {
            console.error(`❌ FAILED for sub ${idx}:`, r.reason);
        }
    });
}

testNotification();
