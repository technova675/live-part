import assert from "node:assert/strict";
import test from "node:test";
import { paidAuthorProfiles } from "./paid-promotion-profiles.mjs";

const row = {
  posted_at: "2026-10-23T10:00:00Z",
  raw: { id: "1", author: { username: "PaidAuthor", name: "New name", followers: 100, protected: false, createdAt: "Tue Jun 11 14:49:15 +0000 2019" }, contentDisclosure: { advertising: { isPaidPromotion: true } } },
};

test("only confirmed outer paid flags produce author profiles", () => {
  const profiles = paidAuthorProfiles([row, { raw: { author: { username: "Unpaid" } } }, { raw: { contentDisclosure: { advertising: { isPaidPromotion: "true" } }, author: { username: "NotBoolean" } } }]);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].username, "paidauthor");
  assert.equal(profiles[0].screen_name, "PaidAuthor");
  assert.equal(profiles[0].account_created_at, "2019-06-11T14:49:15.000Z");
});

test("case variants deduplicate and the latest post snapshot wins", () => {
  const older = { posted_at: "2026-10-22T10:00:00Z", raw: { ...row.raw, author: { username: "paidauthor", name: "Old name" } } };
  const profiles = paidAuthorProfiles([row, older]);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, "New name");
});

test("updates preserve unavailable fields and retain explicit false and zero", () => {
  const profiles = paidAuthorProfiles([{ ...row, raw: { ...row.raw, author: { ...row.raw.author, followers: 0 } } }], [
    { username: "paidauthor", can_dm: true, website: "https://example.com", protected: true, name: "Old name" },
  ]);
  assert.equal(profiles[0].name, "New name");
  assert.equal(profiles[0].followers, 0);
  assert.equal(profiles[0].protected, false);
  assert.equal(profiles[0].can_dm, true);
  assert.equal(profiles[0].website, "https://example.com");
});
