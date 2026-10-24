-- Full tweet details as returned by the Apify "x-tweet-scraper" actor
-- (ggd/dataset_x-tweet-scraper_*.json; "twitter-scraper-lite" files are accepted too).
-- One row per tweet, plus one row per media item. Seeded by scripts/import-posts.mjs.
--
-- The "Paid partnership" label is contentDisclosure.advertising.isPaidPromotion in
-- the x-tweet-scraper output; it lands in is_paid_partnership below.
-- Run this once in the Supabase SQL editor.

create table if not exists public.posts (
  tweet_id text primary key,
  author_id bigint references public.paid_authors (id) on delete cascade,
  author_username text not null,           -- as scraped (author.userName)
  author_x_id text,                        -- X's numeric user id
  url text not null,
  text text,                               -- full text (noteTweet.text for long posts)
  is_note_tweet boolean not null default false,
  lang text,
  posted_at timestamptz,
  source text,                             -- posting client, when present
  reply_count integer,
  retweet_count integer,
  like_count integer,
  quote_count integer,
  bookmark_count integer,
  view_count bigint,
  is_reply boolean not null default false,
  is_retweet boolean not null default false,
  is_quote boolean not null default false,
  is_pinned boolean not null default false,
  possibly_sensitive boolean,
  conversation_id text,
  in_reply_to_tweet_id text,
  in_reply_to_username text,
  quoted_tweet_id text,
  quoted_tweet jsonb,                      -- the quoted tweet's text/author/counts, for inline rendering
  card jsonb,                              -- link preview card, when present
  hashtags text[] not null default '{}',
  cashtags text[] not null default '{}',
  mentions text[] not null default '{}',   -- usernames mentioned in the text
  urls jsonb not null default '[]',        -- [{url, display_url, expanded_url}]
  is_paid_partnership boolean,             -- X's "Paid partnership" label; null when the scraper didn't report it
  brand text,
  scrape_mode text,                        -- engagementMode the row came from (e.g. quotes)
  scrape_source_tweet_id text,             -- sourceTweetId: the tweet whose quotes/replies were scraped
  raw jsonb not null,
  scraped_at timestamptz,
  imported_at timestamptz not null default now()
);

create table if not exists public.post_media (
  media_key text primary key,
  tweet_id text not null references public.posts (tweet_id) on delete cascade,
  position smallint not null,              -- order within the post
  type text not null check (type in ('photo', 'video', 'animated_gif')),
  url text not null,                       -- image, or video poster frame
  width integer,
  height integer,
  duration_ms integer,
  video_url text,                          -- highest-bitrate mp4
  variants jsonb                           -- all video variants (hls + mp4 bitrates)
);

create index if not exists posts_author_posted_idx on public.posts (author_id, posted_at desc);
create index if not exists posts_username_idx on public.posts (lower(author_username));
create index if not exists posts_paid_idx on public.posts (is_paid_partnership) where is_paid_partnership;
create index if not exists post_media_tweet_idx on public.post_media (tweet_id, position);

-- Server-only access via the service role key; keep anon out.
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
