"use strict";
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const { data, error } = await supabase
        .from('tasks')
        .insert({
            title: "Test Task via Script",
            reward: 5,
            recurrence: 'daily',
            assigned_kid: '11111111-1111-1111-1111-111111111111',
            active: true
        })
    console.log("Insert result:", data, "Error:", error)
}
run()
