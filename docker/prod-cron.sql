-- pg_cron jobs for the Docker production stack, re-applied by deploy.sh (cron.schedule replaces a
-- job with the same name). They call the app container over the kids-prod network, replacing the
-- cloud setup's Vercel Cron (api/cron-tasks, 21:00 UTC = midnight Riyadh).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule('generate-daily-tasks', '0 21 * * *',
  $$SELECT net.http_get('http://kids-web:8080/api/cron-tasks')$$);

-- Prayer reminders: the endpoint checks the current Riyadh minute against today's prayer times and
-- fires a push (with the per-kid spoken clip) at each prayer and every 30 min after while the prayer
-- task is still pending, so it must run every minute (api/trigger_prayer_reminders.js). This replaces
-- the cloud setup's Vercel Cron (sql/04 pointed at a Vercel URL, which the self-hosted stack isn't).
SELECT cron.schedule('trigger-prayer-reminders', '* * * * *',
  $$SELECT net.http_get('http://kids-web:8080/api/trigger_prayer_reminders')$$);

-- Removed job: screen time now starts when the kid taps Start (sql/12), so nothing runs at midnight.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'familylink-process-due';
