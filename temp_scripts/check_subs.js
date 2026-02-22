import { createClient } from '@supabase/supabase-js';

const DEV_URL = "https://gkvxttdjrmczswstfoog.supabase.co";
const DEV_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdrdnh0dGRqcm1jenN3c3Rmb29nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODA0OTksImV4cCI6MjA4NzM1NjQ5OX0.M0zfOhU7xtvJ9xdsrwA99Zpyd6Is9vzQo0DOpE3FyMw";

const devClient = createClient(DEV_URL, DEV_KEY);

async function checkSubs() {
    console.log("Fetching Dev Subscriptions...");
    const { data: subs, error: sErr } = await devClient.from('push_subscriptions').select('*');
    if (sErr) { console.error("Error:", sErr); return; }
    console.log("Subscriptions count:", subs ? subs.length : 0);
    if (subs && subs.length > 0) {
        console.log("Subs:", JSON.stringify(subs, null, 2));
    }
}

checkSubs();
