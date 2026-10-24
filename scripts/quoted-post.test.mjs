import assert from "node:assert/strict";
import test from "node:test";
import { normalizeQuotedPost, postPresentation, quoteLinkUrls } from "../lib/post-media.ts";

const quoted = {
  id: "123", url: "https://x.com/QuotedAuthor/status/123",
  createdAt: "Tue Sep 15 22:40:07 +0000 2026",
  author: { username: "QuotedAuthor", name: "Quoted author", isBlueVerified: true, profilePicture: "https://example.com/avatar.jpg" },
  text: "Short text", noteTweet: { text: "Full quoted post text https://t.co/image" },
  media: [{ type: "photo", mediaUrl: "https://example.com/chart.jpg", url: "https://t.co/image" }],
};

test("quoted posts retain their own author, full note text, date and attachments", () => {
  const quote = normalizeQuotedPost(quoted);
  assert.equal(quote.name, "Quoted author");
  assert.equal(quote.username, "QuotedAuthor");
  assert.equal(quote.verified, true);
  assert.equal(quote.avatarUrl, quoted.author.profilePicture);
  assert.equal(quote.text, "Full quoted post text");
  assert.equal(quote.attachments[0].imageUrl, "https://example.com/chart.jpg");
  assert.equal(quote.postedAt, "2026-09-15T22:40:07.000Z");
});

test("only represented quote links are removed from the parent text", () => {
  const quote = normalizeQuotedPost(quoted);
  const entities = { urls: [
    { url: "https://t.co/quote", expandedUrl: quoted.url },
    { url: "https://t.co/other", expandedUrl: "https://example.com/other" },
  ] };
  const post = postPresentation("Parent https://t.co/quote\nhttps://t.co/other", [], null, entities, quoteLinkUrls(quote, entities));
  assert.equal(post.text, "Parent\nhttps://t.co/other");
});

test("missing quoted objects have a usable fallback and absent quotes stay absent", () => {
  assert.equal(normalizeQuotedPost(null), null);
  const quote = normalizeQuotedPost(null, "123");
  assert.equal(quote.url, "https://x.com/i/status/123");
  assert.equal(quote.name, "Quoted post");
  assert.deepEqual(quote.attachments, []);
});

test("quoted videos and card-only quotes reuse attachment presentation", () => {
  const video = normalizeQuotedPost({ ...quoted, media: [{ ...quoted.media[0], type: "video", videoVariants: [{ contentType: "video/mp4", url: "https://example.com/video.mp4" }] }] });
  assert.equal(video.attachments[0].videoUrl, "https://example.com/video.mp4");
  const card = normalizeQuotedPost({ ...quoted, media: [], card: { url: "https://example.com", bindingValues: { title: "Quoted link" } } });
  assert.equal(card.card.title, "Quoted link");
});
