-- Full X profile info for paid_authors, fetched via Apify
-- (kaitoeasyapi/premium-twitter-user-scraper-pay-per-result) in batches of 100.
-- Run this once in the Supabase SQL editor.

create table if not exists public.author_profiles (
  username text primary key,               -- lower(screen_name), joins to lower(paid_authors.author_username)
  screen_name text not null,
  rest_id text,
  name text,
  bio text,
  avatar_url text,
  banner_url text,
  location text,
  website text,
  followers integer,
  following integer,
  tweets integer,
  media_tweets integer,
  likes integer,
  blue_verified boolean,
  protected boolean,
  can_dm boolean,
  professional_type text,
  professional_category text,
  account_created_at timestamptz,
  raw jsonb not null,
  fetched_at timestamptz not null default now()
);

-- One row per batch of 100 (offset_start = 0, 100, 200, ...).
create table if not exists public.author_sync_batches (
  offset_start integer primary key,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  run_id text,
  dataset_id text,
  requested integer not null default 0,
  fetched integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Server-only access via the service role key; keep anon out.
alter table public.author_profiles enable row level security;
alter table public.author_sync_batches enable row level security;
