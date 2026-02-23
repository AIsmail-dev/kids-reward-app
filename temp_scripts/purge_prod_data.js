import { createClient } from '@supabase/supabase-js';

const PROD_URL = "https://tvsznlwyvamovdxlpzuc.supabase.co";
const PROD_KEY = "sb_publishable_CjnlgIJwWu1s1GpAU-7e6Q_zckxdHiV";

const prodClient = createClient(PROD_URL, PROD_KEY);

async function purgeProdData() {
    console.log("WARNING: Purging production transactions and occurrences...");

    console.log("Emptying wallet_transactions...");
    const { error: wErr } = await prodClient.from('wallet_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (wErr) console.error("Error clearing wallet_transactions:", wErr);

    console.log("Emptying withdrawals...");
    const { error: dErr } = await prodClient.from('withdrawals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (dErr) console.error("Error clearing withdrawals:", dErr);

    console.log("Emptying task_occurrences...");
    const { error: oErr } = await prodClient.from('task_occurrences').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (oErr) console.error("Error clearing task_occurrences:", oErr);

    console.log("✅ Production Data Purged.");
}

purgeProdData();
