ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'prayer';
ALTER TABLE task_occurrences ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;
UPDATE tasks SET task_type = 'prayer' WHERE task_type IS NULL;

-- Enable network extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Setup the CRON job to run every minute and hit the Vercel API
-- We will schedule it, please change the URL below to match your actual DEV or PROD URL!
SELECT cron.schedule('prayer-reminders-job', '* * * * *', $$
    SELECT net.http_post(
        url := 'https://REPLACE_WITH_YOUR_VERCEL_URL.vercel.app/api/trigger_prayer_reminders',
        headers := '{"Content-Type": "application/json"}'::jsonb
    );
$$);
