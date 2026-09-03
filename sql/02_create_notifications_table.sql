-- RUN THIS IN YOUR SUPABASE SQL EDITOR --
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamp with time zone default now(),
  unique(user_id, subscription)
);
