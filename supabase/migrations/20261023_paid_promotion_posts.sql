-- Xquik rich/camelCase tweet output. Only an explicit JSON boolean true qualifies.
-- All source fields are retained in raw; generated columns stay consistent with it.
create table if not exists public.paid_promotion_posts (
  raw jsonb not null,
  tweet_id text generated always as (raw ->> 'id') stored primary key,
  author_username text generated always as (coalesce(raw #>> '{author,username}', raw ->> 'authorUsername')) stored not null,
  author_x_id text generated always as (coalesce(raw #>> '{author,id}', raw ->> 'authorId')) stored,
  author_name text generated always as (coalesce(raw #>> '{author,name}', raw ->> 'authorName')) stored,
  author_followers bigint generated always as (coalesce(raw #>> '{author,followers}', raw ->> 'authorFollowers')::bigint) stored,
  url text generated always as (coalesce(raw ->> 'url', raw ->> 'tweetUrl')) stored not null,
  text text generated always as (coalesce(raw #>> '{noteTweet,text}', raw ->> 'fullText', raw ->> 'text')) stored,
  lang text generated always as (raw ->> 'lang') stored,
  posted_at timestamptz,
  reply_count bigint generated always as ((raw ->> 'replyCount')::bigint) stored,
  retweet_count bigint generated always as ((raw ->> 'retweetCount')::bigint) stored,
  like_count bigint generated always as ((raw ->> 'likeCount')::bigint) stored,
  quote_count bigint generated always as ((raw ->> 'quoteCount')::bigint) stored,
  bookmark_count bigint generated always as ((raw ->> 'bookmarkCount')::bigint) stored,
  view_count bigint generated always as ((raw ->> 'viewCount')::bigint) stored,
  is_reply boolean generated always as ((raw ->> 'isReply')::boolean) stored,
  is_retweet boolean generated always as ((raw ->> 'isRetweet')::boolean) stored,
  is_quote boolean generated always as ((raw ->> 'isQuoteStatus')::boolean) stored,
  is_note_tweet boolean generated always as ((raw ->> 'isNoteTweet')::boolean) stored,
  conversation_id text generated always as (raw ->> 'conversationId') stored,
  quoted_tweet_id text generated always as (raw ->> 'quotedTweetId') stored,
  quoted_tweet jsonb generated always as (raw -> 'quotedTweet') stored,
  author jsonb generated always as (raw -> 'author') stored,
  media jsonb generated always as (raw -> 'media') stored,
  entities jsonb generated always as (raw -> 'entities') stored,
  card jsonb generated always as (raw -> 'card') stored,
  content_disclosure jsonb generated always as (raw -> 'contentDisclosure') stored,
  is_paid_promotion boolean generated always as (
    (raw #> '{contentDisclosure,advertising,isPaidPromotion}') = 'true'::jsonb
  ) stored,
  search_term text generated always as (raw ->> 'searchTerm') stored,
  source_file text not null,
  scraped_at timestamptz,
  imported_at timestamptz not null default now(),
  constraint paid_promotion_posts_confirmed_only check (is_paid_promotion is true)
);

create index if not exists paid_promotion_posts_author_posted_idx
  on public.paid_promotion_posts (lower(author_username), posted_at desc);

-- Access follows the project's existing server-only service-role pattern.
alter table public.paid_promotion_posts enable row level security;
