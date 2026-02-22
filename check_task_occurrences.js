"use strict";
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const { data, error } = await supabase
        .from('task_occurrences')
        .select('*')
        .limit(1)
    console.log("task_occurrences columns:", data ? Object.keys(data[0] || {}) : [], "Data:", data, "Error:", error)
}
run()
