```sql
-- Create the telemetry events table
create table public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  chat_id bigint not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.telemetry_events enable row level security;

-- Allow anonymous inserts (since our bot acts as the server right now)
create policy "Allow insert access"
  on public.telemetry_events
  for insert
  to anon
  with check (true);

-- (Optional) If you want to query them securely from the dashboard, you don't need a select policy
-- as the Supabase dashboard uses the service role bypass.

-- Create an index to speed up querying events by chat ID or type later
create index idx_telemetry_events_chat_id on public.telemetry_events(chat_id);
create index idx_telemetry_events_type on public.telemetry_events(event_type);
```
