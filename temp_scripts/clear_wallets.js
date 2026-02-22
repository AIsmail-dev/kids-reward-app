"use strict";
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    console.log("Clearing wallet transactions to zero out balances...");
    const { data, error } = await supabase
        .from('wallet_transactions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything

    console.log("Clear result:", data, "Error:", error);
}

run();
