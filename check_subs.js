import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.VITE_SUPABASE_URL || "https://tvsznlwyvamovdxlpzuc.supabase.co";
const SUPA_KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_CjnlgIJwWu1s1GpAU-7e6Q_zckxdHiV";
const supabase = createClient(SUPA_URL, SUPA_KEY);

async function check() {
    const { data: subs, error } = await supabase.from('push_subscriptions').select('*');
    if (error) {
        console.error("error fetching subs", error);
    } else {
        console.log(`Found ${subs.length} push subscriptions`);
    }
}
check();
