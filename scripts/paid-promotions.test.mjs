import assert from "node:assert/strict";
import test from "node:test";
import { authorsFromPromotions, mergeCreatorDirectory } from "../lib/paid-promotions.ts";

const row = {
  author_username: "New_Creator",
  author_name: "Latest name",
  author_followers: 100,
  author: { isBlueVerified: true, profilePicture: "https://example.com/avatar_normal.jpg", createdAt: "bad date" },
  view_count: 10,
};

test("synced DM permissions preserve false and unknown rather than inheriting older open DMs", () => {
  for (const can_dm of [true, false, null, undefined]) {
    const [author] = mergeCreatorDirectory([], [{ username: 'new_creator', can_dm }], [
      { ...row, author: { ...row.author, canDm: true } },
    ]);
    assert.equal(author.profile.canDm, can_dm ?? null);
  }
  assert.equal(authorsFromPromotions([{ ...row, author: { canDm: true } }])[0].profile.canDm, true);
  assert.equal(authorsFromPromotions([{ ...row, author: {} }])[0].profile.canDm, null);
});

test("new creators appear without an entry in the old author table", () => {
  const [author] = authorsFromPromotions([row]);
  assert.equal(author.id, "new_creator");
  assert.equal(author.paidPosts, 1);
  assert.equal(author.verified, true);
  assert.equal(author.profile.avatarUrl, "https://example.com/avatar_400x400.jpg");
  assert.equal(author.profile.joinedAt, null);
});

test("case variants group together using the newest profile and known view counts", () => {
  const [author] = authorsFromPromotions([
    row,
    { ...row, author_username: "new_creator", author_name: "Older name", author_followers: 20, view_count: 30 },
    { ...row, author_username: "NEW_CREATOR", view_count: null },
  ]);
  assert.equal(author.name, "Latest name");
  assert.equal(author.followers, 100);
  assert.equal(author.paidPosts, 3);
  assert.equal(author.medianViews, 20);
});

test("empty tables, missing profiles, zero views, and follower sorting", () => {
  assert.deepEqual(authorsFromPromotions([]), []);
  const authors = authorsFromPromotions([
    { ...row, author: null, author_followers: null, view_count: null },
    { ...row, author_username: "Larger", author_followers: 200, view_count: 0 },
  ]);
  assert.equal(authors[0].username, "Larger");
  assert.equal(authors[0].medianViews, 0);
  assert.equal(authors[1].profile, null);
  assert.equal(authors[1].medianViews, null);
});


test("the complete creator directory survives an empty promotion table", () => {
  const creators = [
    { author_username: "First", author_name: "First creator", author_followers: 100, author_blue_verified: true },
    { author_username: "Second", author_name: "Second creator", author_followers: 50, author_blue_verified: false },
  ];
  const authors = mergeCreatorDirectory(creators, [], []);
  assert.equal(authors.length, 2);
  assert.ok(authors.every(author => author.paidPosts === 0 && author.medianViews === null));
  assert.equal(authors[0].name, "First creator");
});

test("counts merge case-insensitively without dropping other creators or synced profiles", () => {
  const creators = [
    { author_username: "NEW_CREATOR", author_name: "Directory name", author_followers: 10, author_blue_verified: false },
    { author_username: "NoPosts", author_name: "No posts yet", author_followers: 5, author_blue_verified: false },
  ];
  const profile = {
    username: "new_creator", name: "Synced name", followers: 200, blue_verified: true,
    bio: "Synced bio", avatar_url: "https://example.com/synced.jpg", banner_url: null,
    location: null, website: null, following: 10, tweets: 30, professional_category: null, account_created_at: null,
  };
  const authors = mergeCreatorDirectory(creators, [profile], [row, { ...row, author_username: "PromotionOnly" }]);
  assert.equal(authors.length, 3);
  const matched = authors.find(author => author.id === "new_creator");
  assert.equal(matched.paidPosts, 1);
  assert.equal(matched.name, "Synced name");
  assert.equal(matched.profile.avatarUrl, profile.avatar_url);
  assert.equal(authors.find(author => author.username === "NoPosts").paidPosts, 0);
  assert.equal(authors.find(author => author.username === "PromotionOnly").paidPosts, 1);
});

test("profile-only imports enter the directory even without legacy creators or paid posts", () => {
  const profile = {
    username: "New_Import", name: "New import", followers: 123, blue_verified: true,
    bio: "Imported profile", avatar_url: "https://example.com/import.jpg", banner_url: null,
    location: null, website: null, following: 3, tweets: 5, professional_category: null, account_created_at: null,
  };
  const authors = mergeCreatorDirectory([], [profile], []);
  assert.equal(authors.length, 1);
  assert.equal(authors[0].id, "new_import");
  assert.equal(authors[0].paidPosts, 0);
  assert.equal(authors[0].medianViews, null);
  assert.equal(authors[0].followers, 123);
  assert.equal(authors[0].profile.bio, "Imported profile");
});

test("synced profiles update promotion-only creators without adding a duplicate or losing stats", () => {
  const profile = {
    username: "NEW_CREATOR", name: "Fresh profile", followers: 999, blue_verified: false,
    bio: "Latest bio", avatar_url: null, banner_url: null, location: null, website: null,
    following: 10, tweets: 50, professional_category: null, account_created_at: null,
  };
  const authors = mergeCreatorDirectory([], [profile], [row, row]);
  assert.equal(authors.length, 1);
  assert.equal(authors[0].name, "Fresh profile");
  assert.equal(authors[0].followers, 999);
  assert.equal(authors[0].verified, false);
  assert.equal(authors[0].paidPosts, 2);
  assert.equal(authors[0].medianViews, 10);
});
