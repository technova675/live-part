-- Posts carrying X's "Paid partnership" label, one row per tweet.
-- Seeded from paid_partnership_by_user/_all_users.csv via scripts/import-paid-posts.mjs.
-- Run this once in the Supabase SQL editor.

create table if not exists public.paid_posts (
  tweet_id text primary key,
  author_id bigint not null references public.paid_authors (id) on delete cascade,
  author_username text not null,           -- canonical casing from paid_authors
  url text not null,
  posted_at timestamptz,
  brand text,                              -- sponsor, when identified ('Brand unclear' kept as-is)
  text text,
  view_count bigint,
  like_count integer,
  retweet_count integer,
  quote_count integer,
  author_followers integer,                -- follower count when the post was scraped
  sources text[] not null default '{}',    -- how it was found: quote_tweets, grok_paid_posts, search_posts
  imported_at timestamptz not null default now()
);

create index if not exists paid_posts_author_posted_idx on public.paid_posts (author_id, posted_at desc);
create index if not exists paid_posts_brand_idx on public.paid_posts (brand) where brand is not null;

-- Server-only access via the service role key; keep anon out.
alter table public.paid_posts enable row level security;
