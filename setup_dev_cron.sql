-- 1. Create the generateTasks function
CREATE OR REPLACE FUNCTION public.generatetasks()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  today_date DATE := CURRENT_DATE;
  today_dow INT := EXTRACT(ISODOW FROM CURRENT_DATE); -- 1=Monday, 7=Sunday
  today_dom INT := EXTRACT(DAY FROM CURRENT_DATE);
  task_record RECORD;
BEGIN
  -- Find all active tasks that should run today
  FOR task_record IN 
    SELECT * FROM public.tasks 
    WHERE active = true 
    AND (
      recurrence = 'daily'
      OR (recurrence = 'weekly' AND (week_day IS NULL OR week_day::INT = today_dow))
      OR (recurrence = 'monthly' AND (month_day IS NULL OR month_day = today_dom))
    )
  LOOP
    -- Prevent duplicate task occurrences for the same task on the same day
    IF NOT EXISTS (
      SELECT 1 FROM public.task_occurrences 
      WHERE task_id = task_record.id AND scheduled_date = today_date
    ) THEN
      INSERT INTO public.task_occurrences (task_id, kid_id, scheduled_date, status)
      VALUES (task_record.id, task_record.assigned_kid, today_date, 'pending');
    END IF;
  END LOOP;
END;
$$;

-- 2. Enable the pg_cron extension (This allows background schedules)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 3. Schedule the function to run at midnight every day
-- The first parameter is the job name, the second is the cron schedule (0 0 * * * = midnight), the third is the query.
SELECT cron.schedule('generate-daily-tasks', '0 0 * * *', 'SELECT public.generatetasks()');
