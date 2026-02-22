import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Prod env
const PROD_URL = "https://tvsznlwyvamovdxlpzuc.supabase.co";
const PROD_KEY = "sb_publishable_CjnlgIJwWu1s1GpAU-7e6Q_zckxdHiV";

// Dev env
const DEV_URL = "https://gkvxttdjrmczswstfoog.supabase.co";
const DEV_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdrdnh0dGRqcm1jenN3c3Rmb29nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODA0OTksImV4cCI6MjA4NzM1NjQ5OX0.M0zfOhU7xtvJ9xdsrwA99Zpyd6Is9vzQo0DOpE3FyMw";

const prodClient = createClient(PROD_URL, PROD_KEY);
const devClient = createClient(DEV_URL, DEV_KEY);

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

    // First wipe DEV data starting with tables depending on others.
    console.log("Wiping Dev task_occurrences, tasks, users...");
    await devClient.from('task_occurrences').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await devClient.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    // Important: we also have wallet_transactions / withdrawals / push_subscriptions. We wipe them too to ensure users can be deleted
    await devClient.from('wallet_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await devClient.from('withdrawals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await devClient.from('push_subscriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await devClient.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log(`Inserting ${prodUsers.length} Users into Dev...`);
    if (prodUsers.length) await devClient.from('users').insert(prodUsers);

    console.log(`Inserting ${prodTasks.length} Tasks into Dev...`);
    if (prodTasks.length) await devClient.from('tasks').insert(prodTasks);

    console.log(`Inserting ${prodOccurrences.length} Task Occurrences into Dev...`);
    if (prodOccurrences.length) await devClient.from('task_occurrences').insert(prodOccurrences);

    console.log("✅ Sync Complete!");
}

syncData();
