-- If you want to check for any other existing cron jobs, you can run:
-- SELECT * FROM cron.job;

-- Add a UNIQUE constraint to guarantee that even if multiple requests happen at the same millisecond, 
-- Postgres will block the second one and physically prevent duplicate tasks for the same day.
ALTER TABLE public.task_occurrences 
ADD CONSTRAINT unique_task_occurrence UNIQUE (task_id, scheduled_date);
