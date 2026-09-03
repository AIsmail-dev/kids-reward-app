import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.VITE_SUPABASE_URL || "https://tvsznlwyvamovdxlpzuc.supabase.co";
const SUPA_KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_CjnlgIJwWu1s1GpAU-7e6Q_zckxdHiV";
const supabase = createClient(SUPA_URL, SUPA_KEY);

async function backfillUpdatedBy() {
    const { data: missingNames, error: mErr } = await supabase
        .from('task_occurrences')
        .select('id')
        .in('status', ['waiting_parent', 'approved', 'completed'])
        .or('updated_by_name.is.null,updated_by_name.eq.null');

    if (mErr) {
        console.error("Error fetching", mErr);
        return;
    }

    if (missingNames && missingNames.length > 0) {
        console.log(`Found ${missingNames.length} tasks matching missing updated_by_name. Backfilling...`);
        for (let i = 0; i < missingNames.length; i += 50) {
            const chunk = missingNames.slice(i, i + 50);
            await Promise.all(chunk.map(async (m) => {
                await supabase.from('task_occurrences').update({ updated_by_name: 'System (Legacy)' }).eq('id', m.id);
            }));
        }
        console.log("Finished backfilling updated_by_name.");
    } else {
        console.log("No missing names found, or column doesn't exist yet.");
    }
}

backfillUpdatedBy();
