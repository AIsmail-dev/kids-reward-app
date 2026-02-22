import { createClient } from '@supabase/supabase-js';

const DEV_URL = "https://gkvxttdjrmczswstfoog.supabase.co";
const DEV_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdrdnh0dGRqcm1jenN3c3Rmb29nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODA0OTksImV4cCI6MjA4NzM1NjQ5OX0.M0zfOhU7xtvJ9xdsrwA99Zpyd6Is9vzQo0DOpE3FyMw";

const devClient = createClient(DEV_URL, DEV_KEY);

async function run() {
    console.log("Fetching Farida's user ID...");
    const { data: users, error: uErr } = await devClient.from('users').select('id, name').eq('name', 'Farida');
    if (uErr || !users || users.length === 0) { console.error("Error fetching Farida:", uErr); return; }

    const faridaId = users[0].id;
    console.log("Found Farida:", faridaId);

    console.log("Resetting all tasks assigned to Farida to 'pending'...");

    // In our logic, 'task_occurrences' join with 'tasks' on task_id to check 'assigned_kid' for latest dashboard.
    // However, task_occurrences might also have kidn_id set directly.
    // Easiest is to just bulk update all occurrences that have kid_id = faridaId OR belong to her tasks.

    // First let's get her tasks
    const { data: herTasks } = await devClient.from('tasks').select('id').eq('assigned_kid', faridaId);
    const taskIds = herTasks ? herTasks.map(t => t.id) : [];

    if (taskIds.length > 0) {
        const { data, error } = await devClient.from('task_occurrences')
            .update({ status: 'pending' })
            .in('task_id', taskIds);

        console.log("Reset complete for her tasks.", error ? "Error: " + error : "");
    }
}

run();
