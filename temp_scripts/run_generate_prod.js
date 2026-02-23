import { createClient } from '@supabase/supabase-js';

const PROD_URL = "https://tvsznlwyvamovdxlpzuc.supabase.co";
const PROD_KEY = "sb_publishable_CjnlgIJwWu1s1GpAU-7e6Q_zckxdHiV";
const prodClient = createClient(PROD_URL, PROD_KEY);

async function generateTasksForToday() {
    const today = new Date();
    // Use Saudi timezone offset or local, assuming UTC for ISO string split
    const tzOffset = 3 * 60; // Riyadh is UTC+3
    const localTime = new Date(today.getTime() + tzOffset * 60 * 1000);
    const todayStr = localTime.toISOString().split('T')[0];
    const dw = localTime.getDay(); // 0 (Sun) to 6 (Sat)
    const dom = localTime.getDate();

    const weekDays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const currentDayName = weekDays[dw];

    console.log("Fetching active tasks for", todayStr, "...");

    const { data: tasks, error } = await prodClient.from('tasks').select('*').eq('active', true);
    if (error) { console.error("Error fetching tasks", error); return; }

    const occurrences = [];
    for (const t of tasks) {
        let shouldCreate = false;
        if (t.recurrence === 'daily') shouldCreate = true;
        if (t.recurrence === 'weekly' && t.week_day === currentDayName) shouldCreate = true;
        if (t.recurrence === 'monthly' && t.month_day === dom) shouldCreate = true;

        if (shouldCreate) {
            occurrences.push({
                task_id: t.id,
                kid_id: t.assigned_kid,
                scheduled_date: todayStr,
                status: 'pending'
            });
        }
    }

    if (occurrences.length > 0) {
        console.log(`Inserting ${occurrences.length} task occurrences for today...`);
        const { error: insErr } = await prodClient.from('task_occurrences').insert(occurrences);
        if (insErr) console.error("Error inserting occurrences:", insErr);
        else console.log("Successfully generated today's tasks in PROD!");
    } else {
        console.log("No tasks to generate for today.");
    }
}

generateTasksForToday();
