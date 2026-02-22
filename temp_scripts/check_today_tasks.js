"use strict";
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
        .from('task_occurrences')
        .select('*, tasks:task_id ( title, reward, assigned_kid )')
        .eq('scheduled_date', today)

    console.log(`task_occurrences for ${today}:`, JSON.stringify(data, null, 2))
    if (error) console.log("Error:", error)
}
run()
