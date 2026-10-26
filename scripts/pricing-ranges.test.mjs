import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { twitterPricingRanges, hasAvailablePricing } from '../lib/pricing-ranges.ts';
import { pricingRates } from '../lib/pricing-display.ts';
import { matchesPricingAmount } from '../lib/pricing-filter.ts';

const saved = JSON.parse(readFileSync(new URL('../imports/creator-pricing/dailyloud-message/prepared.json', import.meta.url), 'utf8'));
const empty = { retweet_rate: null, comment_rate: null, quote_rate: null, bundle_rate_min: null, bundle_rate_max: null };
const dailyLoud = { ...empty, rate_ranges: twitterPricingRanges(saved.source_rows) };

test('quote ranges replace fixed quote prices and match only overlapping budgets', () => {
  const pricing = { ...empty, quote_rate: 100, rate_ranges: twitterPricingRanges([
    { platform: 'twitter', parsed_rates: { currency: 'USD', quote_rate_min: 150, quote_rate_max: 200 } },
  ]) };
  assert.equal(hasAvailablePricing({ ...pricing, quote_rate: null }), true);
  assert.deepEqual(pricingRates(pricing), [{ label: 'Quote', value: '$150 – $200' }]);
  for (const value of [150, 175, 200]) assert.equal(matchesPricingAmount(pricing, value), true);
  for (const value of [100, 149, 201]) assert.equal(matchesPricingAmount(pricing, value), false);
});

test('DailyLoud range-only source is available and renders all three USD ranges', () => {
  assert.equal(hasAvailablePricing(dailyLoud), true);
  assert.deepEqual(pricingRates(dailyLoud), [
    { label: 'Tweet', value: '$1,700 – $3,700' },
    { label: 'Retweet', value: '$1,400 – $1,600' },
    { label: 'BBC Brands / Products / Models / External Links (per tweet)', value: '$2,900 – $10,000' },
  ]);
  assert.equal(hasAvailablePricing(empty), false);
  assert.equal(hasAvailablePricing({ ...empty, comment_rate: 0 }), true);
});

test('range filters include exact budget overlaps and exclude gaps and outside values', () => {
  for (const amount of [1400, 1500, 1600, 1700, 3700, 10000]) assert.equal(matchesPricingAmount(dailyLoud, amount), true, String(amount));
  for (const amount of [1399, 1650, 10001]) assert.equal(matchesPricingAmount(dailyLoud, amount), false, String(amount));
  assert.equal(matchesPricingAmount(dailyLoud, 1001, 2000), true);
  assert.equal(matchesPricingAmount(dailyLoud, 101, 200), false);
});

test('ignore other platforms and malformed bounds; a later range replaces the same category', () => {
  const record = (platform, min, max) => ({ platform, parsed_rates: { currency: 'USD', retweet_rate_min: min, retweet_rate_max: max } });
  assert.deepEqual(twitterPricingRanges([record('instagram', 550, 550), record('twitter', 100, 50), record('twitter', -1, 50), record('twitter', '10', 50)]), []);
  const ranges = twitterPricingRanges([record('twitter', 1400, 1600), record('twitter', 1500, 1800)]);
  assert.deepEqual(ranges, [{ kind: 'retweet', label: 'Retweet', min: 1500, max: 1800 }]);
  assert.deepEqual(pricingRates({ ...empty, retweet_rate: 100, rate_ranges: ranges }), [{ label: 'Retweet', value: '$1,500 – $1,800' }]);
  assert.equal(matchesPricingAmount({ ...empty, retweet_rate: 100, rate_ranges: ranges }, 100), false);
});

test('a retweet-and-comment package stays distinct from a standalone comment or all-three bundle', () => {
  const pricing = { ...empty, retweet_rate: 300, quote_rate: 800, rate_ranges: twitterPricingRanges([
    { platform: 'twitter', parsed_rates: { currency: 'USD', retweet_comment_rate_min: 500, retweet_comment_rate_max: 500 } },
  ]) };
  assert.deepEqual(pricingRates(pricing), [
    { label: 'Retweet', value: '$300' },
    { label: 'Quote', value: '$800' },
    { label: 'Retweet + comment', value: '$500' },
  ]);
  assert.equal(matchesPricingAmount(pricing, 500), true);
  assert.equal(matchesPricingAmount(pricing, 200), false);
});

test('Scobleizer engagement package and custom post preserve their service labels', () => {
  const pricing = { ...empty, retweet_rate: 1295, quote_rate: 2195, rate_ranges: twitterPricingRanges([
    { platform: 'twitter', parsed_rates: { currency: 'USD', like_comment_bookmark_rate_min: 1895, like_comment_bookmark_rate_max: 1895, custom_tweet_rate_min: 2495, custom_tweet_rate_max: 2495 } },
  ]) };
  assert.deepEqual(pricingRates(pricing), [
    { label: 'Retweet', value: '$1,295' },
    { label: 'Quote', value: '$2,195' },
    { label: 'Like + comment + bookmark', value: '$1,895' },
    { label: 'Custom X post', value: '$2,495' },
  ]);
  for (const amount of [1295, 1895, 2195, 2495]) assert.equal(matchesPricingAmount(pricing, amount), true);
  assert.equal(matchesPricingAmount(pricing, 1894), false);
});

test('post, thread, and article prices remain separate offers and match their budgets', () => {
  const pricing = { ...empty, retweet_rate: 80, quote_rate: 650, rate_ranges: twitterPricingRanges([
    { platform: 'twitter', parsed_rates: { currency: 'USD', tweet_rate_min: 500, tweet_rate_max: 500, thread_rate_min: 850, thread_rate_max: 850, article_rate_min: 1000, article_rate_max: 1000 } },
  ]) };
  assert.deepEqual(pricingRates(pricing), [
    { label: 'Retweet', value: '$80' }, { label: 'Quote', value: '$650' },
    { label: 'Tweet', value: '$500' }, { label: 'Thread', value: '$850' }, { label: 'Article', value: '$1,000' },
  ]);
  for (const amount of [80, 500, 650, 850, 1000]) assert.equal(matchesPricingAmount(pricing, amount), true);
  assert.equal(matchesPricingAmount(pricing, 900), false);
});

test('text and video formats retain their own prices alongside the quote rate', () => {
  const pricing = { ...empty, quote_rate: 1000, rate_ranges: twitterPricingRanges([
    { platform: 'twitter', parsed_rates: { currency: 'USD', text_post_rate_min: 2100, text_post_rate_max: 2100, video_post_rate_min: 4200, video_post_rate_max: 4200 } },
  ]) };
  assert.deepEqual(pricingRates(pricing), [
    { label: 'Quote', value: '$1,000' },
    { label: 'Text post', value: '$2,100' },
    { label: 'Video post', value: '$4,200' },
  ]);
  for (const amount of [1000, 2100, 4200]) assert.equal(matchesPricingAmount(pricing, amount), true);
  assert.equal(matchesPricingAmount(pricing, 3000), false);
});

test('four-action engagement package is not shown as a standalone retweet or an all-three bundle', () => {
  const pricing = { ...empty, quote_rate: 200, rate_ranges: twitterPricingRanges([
    { platform: 'twitter', parsed_rates: { currency: 'USD', repost_like_comment_bookmark_rate_min: 100, repost_like_comment_bookmark_rate_max: 100 } },
  ]) };
  assert.deepEqual(pricingRates(pricing), [
    { label: 'Quote', value: '$200' },
    { label: 'Repost + like + comment + bookmark', value: '$100' },
  ]);
  assert.equal(matchesPricingAmount(pricing, 100), true);
  assert.equal(matchesPricingAmount(pricing, 200), true);
  assert.equal(matchesPricingAmount(pricing, 150), false);
});

test('short and long quote prices are separate fixed offers, not a continuous range', () => {
  const pricing = { ...empty, retweet_rate: 50, rate_ranges: twitterPricingRanges([
    { platform: 'twitter', parsed_rates: { currency: 'USD', short_quote_rate_min: 80, short_quote_rate_max: 80, long_quote_rate_min: 140, long_quote_rate_max: 140 } },
  ]) };
  assert.deepEqual(pricingRates(pricing), [
    { label: 'Retweet', value: '$50' },
    { label: 'Short quote tweet', value: '$80' },
    { label: 'Long quote tweet', value: '$140' },
  ]);
  for (const value of [50, 80, 140]) assert.equal(matchesPricingAmount(pricing, value), true);
  assert.equal(matchesPricingAmount(pricing, 100), false);
});

test('multi-tweet and weekly project packages keep their totals distinct from single-tweet rates', () => {
  const pricing = { ...empty, retweet_rate: 30, rate_ranges: twitterPricingRanges([
    { platform: 'twitter', parsed_rates: { currency: 'USD', tweet_rate_min: 50, tweet_rate_max: 50, three_tweets_rate_min: 100, three_tweets_rate_max: 100, weekly_project_package_rate_min: 300, weekly_project_package_rate_max: 300 } },
  ]) };
  assert.deepEqual(pricingRates(pricing), [
    { label: 'Retweet', value: '$30' },
    { label: 'Tweet', value: '$50' },
    { label: '3 tweets', value: '$100' },
    { label: 'Weekly: daily tweet + retweet + bio', value: '$300' },
  ]);
  for (const value of [30, 50, 100, 300]) assert.equal(matchesPricingAmount(pricing, value), true);
  assert.equal(matchesPricingAmount(pricing, 150), false);
});
