import { createClient } from '@supabase/supabase-js';

// Prod env (read-only here — anon key, matches what the app itself uses)
const PROD_URL = "https://tvsznlwyvamovdxlpzuc.supabase.co";
const PROD_KEY = "sb_publishable_CjnlgIJwWu1s1GpAU-7e6Q_zckxdHiV";

// Local dev env — service_role key required since dev now has RLS enabled
// (anon key alone can no longer bulk read/write across users). Get this
// from `supabase status` / .env.local, never hardcode it here.
const DEV_URL = process.env.DEV_SUPABASE_URL || "http://127.0.0.1:54321";
const DEV_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DEV_SERVICE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is required (source .env.local first).");
    process.exit(1);
}

const prodClient = createClient(PROD_URL, PROD_KEY);
const devClient = createClient(DEV_URL, DEV_SERVICE_KEY);

// push_subscriptions is deliberately NEVER synced: those rows are
// device-specific push tokens tied to real family phones/browsers.
// Copying them into dev would let dev-triggered test notifications
// (api/notify.js, api/trigger_prayer_reminders.js) actually land on
// real production devices. Dev starts with zero subscribers by design —
// to test push locally, enable notifications from a browser pointed at
// the local dev site, which creates a fresh, local-only subscription.

async function syncData() {
    console.log("Fetching Prod Users...");
    const { data: prodUsers, error: uErr } = await prodClient.from('users').select('*');
    if (uErr) { console.error("Error fetching Prod Users:", uErr); return; }

    console.log("Fetching Prod Tasks...");
    const { data: prodTasks, error: tErr } = await prodClient.from('tasks').select('*');
    if (tErr) { console.error("Error fetching Prod Tasks:", tErr); return; }

    console.log("Fetching Prod Task Occurrences...");
    const { data: prodOccurrences, error: oErr } = await prodClient.from('task_occurrences').select('*');
    if (oErr) { console.error("Error fetching Prod Task Occurrences:", oErr); return; }

    console.log("Fetching Prod Wallet Transactions...");
    const { data: prodWallet, error: wErr } = await prodClient.from('wallet_transactions').select('*');
    if (wErr) { console.error("Error fetching Prod Wallet Transactions:", wErr); return; }

    console.log("Fetching Prod Withdrawals...");
    const { data: prodWithdrawals, error: dErr } = await prodClient.from('withdrawals').select('*');
    if (dErr) { console.error("Error fetching Prod Withdrawals:", dErr); return; }

    // Wipe dev data, children first (FK order), users last.
    console.log("Wiping dev wallet_transactions, withdrawals, task_occurrences, tasks, users...");
    await devClient.from('wallet_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await devClient.from('withdrawals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await devClient.from('task_occurrences').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await devClient.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await devClient.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log(`Inserting ${prodUsers.length} Users into Dev...`);
    if (prodUsers.length) {
        const { error } = await devClient.from('users').insert(prodUsers);
        if (error) { console.error("Error inserting users:", error); return; }
    }

    console.log(`Inserting ${prodTasks.length} Tasks into Dev...`);
    if (prodTasks.length) {
        const { error } = await devClient.from('tasks').insert(prodTasks);
        if (error) { console.error("Error inserting tasks:", error); return; }
    }

    console.log(`Inserting ${prodOccurrences.length} Task Occurrences into Dev...`);
    if (prodOccurrences.length) {
        const { error } = await devClient.from('task_occurrences').insert(prodOccurrences);
        if (error) { console.error("Error inserting task_occurrences:", error); return; }
    }

    console.log(`Inserting ${prodWallet.length} Wallet Transactions into Dev...`);
    if (prodWallet.length) {
        const { error } = await devClient.from('wallet_transactions').insert(prodWallet);
        if (error) { console.error("Error inserting wallet_transactions:", error); return; }
    }

    console.log(`Inserting ${prodWithdrawals.length} Withdrawals into Dev...`);
    if (prodWithdrawals.length) {
        const { error } = await devClient.from('withdrawals').insert(prodWithdrawals);
        if (error) { console.error("Error inserting withdrawals:", error); return; }
    }

    console.log("✅ Sync Complete! (push_subscriptions intentionally skipped)");
}

syncData();
