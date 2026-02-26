-- Add a column to track who last updated a task occurrence.
ALTER TABLE public.task_occurrences 
ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
