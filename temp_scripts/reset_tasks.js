"use strict";
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    console.log("Clearing task occurrences...");
    await supabase.from('task_occurrences').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log("Clearing tasks...");
    await supabase.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log("Fetching users (Farida and Yahia)...");
    const { data: users, error: userErr } = await supabase.from('users').select('id, name').in('name', ['Farida', 'Yahia']);

    if (userErr || !users) {
        console.error("Error fetching users:", userErr);
        return;
    }

    const tasksToCreate = ["صلاة الفجر", "صلاة الظهر", "صلاة العصر", "صلاة المغرب", "صلاة العشاء"];
    const insertData = [];

    for (const user of users) {
        for (const taskName of tasksToCreate) {
            insertData.push({
                title: taskName,
                reward: 2, // Assuming default 2
                recurrence: 'daily',
                assigned_kid: user.id,
                active: true
            });
        }
    }

    console.log("Inserting new tasks...");
    const { error: insertErr } = await supabase.from('tasks').insert(insertData);
    if (insertErr) {
        console.error("Error inserting tasks:", insertErr);
        return;
    }

    console.log("Triggering generateTasks function...");
    const res = await fetch('https://tvsznlwyvamovdxlpzuc.supabase.co/functions/v1/generateTasks', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2c3pubHd5dmFtb3ZkeGxwenVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTU3ODUyMCwiZXhwIjoyMDg3MTU0NTIwfQ.yjR9m8NZuTNzwPqJPT6XG9J9-M2WYzxBTbWcBwnDIuk',
            'Content-Type': 'application/json'
        }
    });

    const text = await res.text();
    console.log("Job Response:", res.status, text);
    console.log("Database reset and repopulated successfully!");
}

run();
