import assert from "node:assert/strict";
import test from "node:test";
import { userConfirmedPaidTweet } from "./user-confirmed-paid-tweet.mjs";
import { selectPaidRows } from "./import-paid-promotions.mjs";
import { paidAuthorProfiles } from "./paid-promotion-profiles.mjs";

const source = {
  id: "123", url: "https://x.com/example/status/123", text: "A partnership post",
  author: { userName: "Example", url: "https://x.com/Example", followers: 10 },
  extendedEntities: { media: [{ type: "video", media_key: "1", media_url_https: "https://example.com/poster.jpg", original_info: { width: 1280, height: 720 }, video_info: { variants: [{ content_type: "video/mp4", url: "https://example.com/video.mp4" }] } }] },
  isQuote: true,
  quoted_tweet: { id: "456", author: { userName: "Quoted" }, text: "Original post", extendedEntities: { media: [] } },
};

test("user-confirmed classification preserves the original source and does not label the quoted author", () => {
  const before = structuredClone(source);
  const tweet = userConfirmedPaidTweet(source);
  assert.equal(tweet.contentDisclosure.advertising.isPaidPromotion, true);
  assert.equal(tweet._import.paidPromotionSource, "user-confirmed");
  assert.deepEqual(tweet._import.sourceRecord, before);
  assert.deepEqual(source, before);
  assert.equal(tweet.quotedTweet.author.username, "Quoted");
  assert.equal(tweet.quotedTweet.contentDisclosure, undefined);
});

test("alternate media and author names normalize for the existing renderer and profile importer", () => {
  const tweet = userConfirmedPaidTweet(source);
  assert.equal(tweet.author.username, "Example");
  assert.equal(tweet.media[0].mediaUrl, "https://example.com/poster.jpg");
  assert.equal(tweet.media[0].videoVariants[0].contentType, "video/mp4");
  assert.equal(tweet.media[0].width, 1280);
  assert.equal(tweet.quotedTweetId, "456");
  const rows = selectPaidRows([source, source], "input.json", null, { confirmedPaid: true });
  assert.equal(rows.length, 1);
  const profiles = paidAuthorProfiles(rows, [{ username: "example", website: "https://example.com" }]);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].username, "example");
  assert.equal(profiles[0].website, "https://example.com");
});

test("normal imports still reject posts without an explicit paid flag", () => {
  assert.deepEqual(selectPaidRows([source], "input.json", null), []);
});

test("fully blank scraper placeholders are skipped but malformed real posts still fail", () => {
  const blank = { type: "tweet", id: "", url: "", text: "", author: {} };
  const rows = selectPaidRows([blank, source], "input.json", null, { confirmedPaid: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].raw.id, source.id);
  assert.throws(() => selectPaidRows([{ ...blank, text: "A real post missing its ID" }], "input.json", null, { confirmedPaid: true }), /string id/);
});
