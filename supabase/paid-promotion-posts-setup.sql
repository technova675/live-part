begin;
set local standard_conforming_strings = on;

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

insert into public.paid_promotion_posts (raw, posted_at, source_file, scraped_at)
values ('{"id":"2113376177192947820","text":"‘The Odyssey’ and ‘You Can See Everything’ are currently the leading contenders on Polymarket US to win Best Picture at the Oscars. https://t.co/mGBmwO8pa8","retweetCount":76,"replyCount":63,"likeCount":2071,"quoteCount":107,"viewCount":217569,"bookmarkCount":118,"conversationId":"2113376177192947820","contentDisclosure":{"advertising":{"isPaidPromotion":true}},"displayTextRange":[0,131],"edit":{"editableUntilMsecs":"1792706719000","editTweetIds":["2113376177192947820"]},"entities":{"hashtags":[],"urls":[],"userMentions":[]},"isNoteTweet":false,"isPinned":false,"isQuoteStatus":false,"isReply":false,"isRetweet":false,"isTranslatable":false,"lang":"en","possiblySensitive":false,"type":"tweet","url":"https://x.com/PopBase/status/2113376177192947820","viewState":"EnabledWithCount","createdAt":"Thu Oct 22 21:05:19 +0000 2026","media":[{"allowDownload":true,"availabilityStatus":"Available","displayUrl":"pic.x.com/mGBmwO8pa8","expandedUrl":"https://x.com/PopBase/status/2113376177192947820/photo/1","faceRects":{"large":[{"h":670,"w":670,"x":490,"y":1104}],"medium":[{"h":392,"w":392,"x":287,"y":647}],"orig":[{"h":670,"w":670,"x":490,"y":1104}],"small":[{"h":222,"w":222,"x":162,"y":366}]},"focusRects":[{"h":819,"w":1462,"x":0,"y":1075},{"h":1462,"w":1462,"x":0,"y":586},{"h":1667,"w":1462,"x":0,"y":381},{"h":2048,"w":1024,"x":358,"y":0},{"h":2048,"w":1462,"x":0,"y":0}],"height":2048,"id":"2113376172507856896","indices":[132,155],"mediaKey":"3_2113376172507856896","mediaUrl":"https://pbs.twimg.com/media/HVQ4bocbAAARw-q.jpg","sizes":{"large":{"h":2048,"resize":"fit","w":1462},"medium":{"h":1200,"resize":"fit","w":857},"small":{"h":680,"resize":"fit","w":485},"thumb":{"h":150,"resize":"crop","w":150}},"type":"photo","url":"https://t.co/mGBmwO8pa8","width":1462},{"allowDownload":true,"availabilityStatus":"Available","displayUrl":"pic.x.com/mGBmwO8pa8","expandedUrl":"https://x.com/PopBase/status/2113376177192947820/photo/1","focusRects":[{"h":640,"w":1142,"x":0,"y":0},{"h":1142,"w":1142,"x":0,"y":0},{"h":1302,"w":1142,"x":0,"y":0},{"h":1600,"w":800,"x":0,"y":0},{"h":1600,"w":1142,"x":0,"y":0}],"height":1600,"id":"2113376172512034816","indices":[132,155],"mediaKey":"3_2113376172512034816","mediaUrl":"https://pbs.twimg.com/media/HVQ4bodawAAn8wb.jpg","sizes":{"large":{"h":1600,"resize":"fit","w":1142},"medium":{"h":1200,"resize":"fit","w":857},"small":{"h":680,"resize":"fit","w":485},"thumb":{"h":150,"resize":"crop","w":150}},"type":"photo","url":"https://t.co/mGBmwO8pa8","width":1142}],"author":{"id":"1138458175663988738","username":"PopBase","name":"Pop Base","followers":7544286,"contactInfo":{"emails":[{"value":"pr@popbase.com","source":"bio","domain":"popbase.com"},{"value":"email@popbase.tv","source":"bio","domain":"popbase.tv"}]},"email":"pr@popbase.com","following":2694,"verified":true,"isBlueVerified":true,"isVerified":true,"profilePicture":"https://pbs.twimg.com/profile_images/1268086791443230737/BRGz4AiW_normal.jpg","profilePictureOriginal":"https://pbs.twimg.com/profile_images/1268086791443230737/BRGz4AiW.jpg","coverPicture":"https://pbs.twimg.com/profile_banners/1138458175663988738/1585520513","profileBannerUrl":"https://pbs.twimg.com/profile_banners/1138458175663988738/1585520513","description":"Pop Base is your best source for all pop culture related entertainment and news. For press inquiries: pr@popbase.com | All other inquiries: email@popbase.tv","createdAt":"Tue Jun 11 14:49:15 +0000 2019","statusesCount":96680,"mediaCount":79501,"protected":false,"favouritesCount":3906,"isTranslator":false,"possiblySensitive":false,"pinnedTweetIds":["2113350778060702011"],"verifiedType":"Blue","profileBio":{"description":"Pop Base is your best source for all pop culture related entertainment and news. For press inquiries: pr@popbase.com | All other inquiries: email@popbase.tv","entities":{"description":{}}},"hasGraduatedAccess":true,"parodyCommentaryFanLabel":"None","profileDescriptionLanguage":"en","profileImageShape":"Circle","profileTranslatorType":"none","superFollowEligible":false},"searchTerm":"from:PopBase since:2026-10-22","tweetUrl":"https://x.com/PopBase/status/2113376177192947820","twitterUrl":"https://twitter.com/PopBase/status/2113376177192947820","authorId":"1138458175663988738","authorUsername":"PopBase","authorName":"Pop Base","authorFollowers":7544286,"authorContactInfo":{"emails":[{"value":"pr@popbase.com","source":"bio","domain":"popbase.com"},{"value":"email@popbase.tv","source":"bio","domain":"popbase.tv"}]},"authorEmail":"pr@popbase.com","authorFollowing":2694,"authorVerified":true,"authorIsBlueVerified":true,"authorIsVerified":true,"authorProfilePicture":"https://pbs.twimg.com/profile_images/1268086791443230737/BRGz4AiW_normal.jpg","authorProfilePictureOriginal":"https://pbs.twimg.com/profile_images/1268086791443230737/BRGz4AiW.jpg","authorCoverPicture":"https://pbs.twimg.com/profile_banners/1138458175663988738/1585520513","authorProfileBannerUrl":"https://pbs.twimg.com/profile_banners/1138458175663988738/1585520513","authorDescription":"Pop Base is your best source for all pop culture related entertainment and news. For press inquiries: pr@popbase.com | All other inquiries: email@popbase.tv","authorCreatedAt":"Tue Jun 11 14:49:15 +0000 2019","authorStatusesCount":96680,"authorMediaCount":79501,"authorProtected":false,"authorFavouritesCount":3906,"authorIsTranslator":false,"authorPossiblySensitive":false,"authorPinnedTweetIds":["2113350778060702011"],"authorVerifiedType":"Blue","authorProfileBio":{"description":"Pop Base is your best source for all pop culture related entertainment and news. For press inquiries: pr@popbase.com | All other inquiries: email@popbase.tv","entities":{"description":{}}},"authorHasGraduatedAccess":true,"authorParodyCommentaryFanLabel":"None","authorProfileDescriptionLanguage":"en","authorProfileImageShape":"Circle","authorProfileTranslatorType":"none","authorSuperFollowEligible":false,"mediaUrls":["https://pbs.twimg.com/media/HVQ4bocbAAARw-q.jpg","https://t.co/mGBmwO8pa8","https://pbs.twimg.com/media/HVQ4bodawAAn8wb.jpg"],"imageUrls":["https://pbs.twimg.com/media/HVQ4bocbAAARw-q.jpg","https://t.co/mGBmwO8pa8","https://pbs.twimg.com/media/HVQ4bodawAAn8wb.jpg"]}'::jsonb, '2026-10-22T21:05:19.000Z'::timestamptz, 'dataset_x-tweet-scraper_2026-10-23_10-45-27-538.json', '2026-10-23T10:45:27.538Z'::timestamptz)
on conflict (tweet_id) do update set raw = excluded.raw, posted_at = excluded.posted_at, source_file = excluded.source_file, scraped_at = excluded.scraped_at, imported_at = now();
commit;
