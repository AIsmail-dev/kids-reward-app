-- Run this in your Supabase SQL Editor to track exact completion times!
ALTER TABLE task_occurrences ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
