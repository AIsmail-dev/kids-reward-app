import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    console.log("CRON: Generating tasks for the current day...");

    const SUPA_URL = process.env.VITE_SUPABASE_URL || "https://tvsznlwyvamovdxlpzuc.supabase.co";
    const SUPA_KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_CjnlgIJwWu1s1GpAU-7e6Q_zckxdHiV";
    const supabase = createClient(SUPA_URL, SUPA_KEY);

    try {
        const today = new Date();
        // Force evaluation to Riyadh timezone precisely at midnight or immediately after
        const tzOffset = 3 * 60; // Riyadh is UTC+3
        const localTime = new Date(today.getTime() + tzOffset * 60 * 1000);

        // This gives exactly "YYYY-MM-DD" accurately
        const todayStr = localTime.toISOString().split('T')[0];

        const dw = localTime.getDay(); // 0 (Sun) to 6 (Sat)
        const dom = localTime.getDate();
        const weekDays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const currentDayName = weekDays[dw];

        console.log(`Cron localized execution for: ${todayStr} (${currentDayName})`);

        const { data: tasks, error } = await supabase.from('tasks').select('*').eq('active', true);
        if (error) throw error;

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
            // Check to avoid duplicates in case cron retries
            const { data: existing } = await supabase
                .from('task_occurrences')
                .select('task_id')
                .eq('scheduled_date', todayStr);

            const existingTaskIds = new Set(existing?.map(e => e.task_id) || []);
            const finalInsertions = occurrences.filter(o => !existingTaskIds.has(o.task_id));

            if (finalInsertions.length > 0) {
                const { error: insErr } = await supabase.from('task_occurrences').insert(finalInsertions);
                if (insErr) throw insErr;
                console.log(`Successfully generated ${finalInsertions.length} new tasks today.`);
                return res.status(200).json({ success: true, count: finalInsertions.length });
            } else {
                return res.status(200).json({ success: true, message: "Tasks already exist for today." });
            }
        }

        return res.status(200).json({ success: true, message: "No active tasks matched today's sequence." });

    } catch (err) {
        console.error("Cron Error Database interaction:", err);
        return res.status(500).json({ error: err.message });
    }
}
