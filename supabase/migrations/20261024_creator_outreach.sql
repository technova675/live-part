-- Contact history supplied by the user. X user IDs remain stable across renames.
create table if not exists public.creator_outreach (
  user_id text primary key check (user_id ~ '^[0-9]+$'),
  screen_name text not null check (screen_name ~ '^[A-Za-z0-9_]{1,15}$'),
  username text generated always as (lower(screen_name)) stored,
  status text not null default 'not_contacted'
    check (status in ('not_contacted', 'messaged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_outreach_username_idx
  on public.creator_outreach (username);
create index if not exists creator_outreach_status_idx
  on public.creator_outreach (status);

-- Server-only access, consistent with author_profiles.
alter table public.creator_outreach enable row level security;

comment on table public.creator_outreach is
  'Creator outreach tracking. Match X user ID first, or lowercase username when no ID is available. A missing row means no contact history is recorded here.';
comment on column public.creator_outreach.created_at is
  'Time this tracking row was created; not the original message sent time.';
