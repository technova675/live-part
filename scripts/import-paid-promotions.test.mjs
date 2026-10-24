import assert from "node:assert/strict";
import test from "node:test";
import { selectPaidRows, setupSql } from "./import-paid-promotions.mjs";

const tweet = {
  id: "2113376177192947820",
  author: { username: "PopBase" },
  url: "https://x.com/PopBase/status/2113376177192947820",
  createdAt: "Thu Oct 22 21:05:19 +0000 2026",
  contentDisclosure: { advertising: { isPaidPromotion: true } },
  media: [{ type: "photo", mediaUrl: "https://example.com/photo.jpg" }],
};

test("only the outer tweet's explicit boolean true qualifies", () => {
  const rows = selectPaidRows([
    tweet,
    ...[false, null, "true", 1].map((flag) => ({ ...tweet, contentDisclosure: { advertising: { isPaidPromotion: flag } } })),
    { ...tweet, contentDisclosure: undefined, quotedTweet: tweet },
    null,
  ], "dataset.json", null);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].raw, tweet);
  assert.equal(rows[0].posted_at, "2026-10-22T21:05:19.000Z");
});

test("duplicate IDs update one row without losing original metadata", () => {
  const latest = { ...tweet, viewCount: 300, text: "Sponsor's post\\text" };
  const rows = selectPaidRows([tweet, latest], "dataset.json", null);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].raw, latest);
  const sql = setupSql(rows);
  assert.ok(sql.includes("Sponsor''s post"));
  assert.ok(sql.includes("standard_conforming_strings = on"));
});

test("invalid paid records fail before import", () => {
  assert.throws(() => selectPaidRows({}, "dataset.json", null), /JSON array/);
  assert.throws(() => selectPaidRows([{ ...tweet, id: 123 }], "dataset.json", null), /string id/);
  assert.throws(() => selectPaidRows([{ ...tweet, author: null }], "dataset.json", null), /author or URL/);
});

test("database exports use the raw paid flag and preserve the original scrape timestamp", () => {
  const rows = selectPaidRows([
    { raw: tweet, is_paid_partnership: true, scraped_at: "2026-10-20T12:00:00+00:00" },
    { raw: { ...tweet, id: "unconfirmed", contentDisclosure: undefined }, is_paid_partnership: true },
    { raw: { ...tweet, id: "false", contentDisclosure: { advertising: { isPaidPromotion: false } } }, is_paid_partnership: true },
    { raw: { tweet_id: "other-format" }, is_paid_partnership: true },
  ], "database.json", "2026-10-23T12:00:00.000Z");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].raw, tweet);
  assert.equal(rows[0].scraped_at, "2026-10-20T12:00:00.000Z");
  assert.equal(rows[0].source_file, "database.json");
});
