"use strict";
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    console.log("Updating all tasks reward to 1...");
    const { data, error } = await supabase
        .from('tasks')
        .update({ reward: 1 })
        .neq('id', '00000000-0000-0000-0000-000000000000');

    console.log("Update result:", data, "Error:", error);
}

run();
