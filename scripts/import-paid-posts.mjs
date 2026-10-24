// Upserts paid partnership posts from a CSV into public.paid_posts (safe to re-run).
// Usage: node --env-file=.env.local scripts/import-paid-posts.mjs [path/to/_all_users.csv]

import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "paid_partnership_by_user/_all_users.csv";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env vars");

const CHUNK = 500;

async function supabase(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  return res;
}

// RFC 4180 parser: quoted fields may contain commas, newlines and "" escapes.
function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);

  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const int = (v) => (v === "" ? null : Number(v));

// Map lower(username) -> paid_authors row; PostgREST caps responses at 1000 rows.
const authors = new Map();
for (let from = 0; ; from += 1000) {
  const res = await supabase("paid_authors?select=id,author_username&order=id", {
    headers: { Range: `${from}-${from + 999}` },
  });
  const page = await res.json();
  for (const a of page) authors.set(a.author_username.toLowerCase(), a);
  if (page.length < 1000) break;
}

const csv = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
const posts = [];
const unknown = new Set();

for (const r of csv) {
  const author = authors.get(r.author_username.toLowerCase());
  if (!author) {
    unknown.add(r.author_username);
    continue;
  }
  posts.push({
    tweet_id: r.tweet_id,
    author_id: author.id,
    author_username: author.author_username,
    url: r.url,
    posted_at: r.posted_at || null,
    brand: r.brand.trim() || null,
    text: r.text || null,
    view_count: int(r.view_count),
    like_count: int(r.like_count),
    retweet_count: int(r.retweet_count),
    quote_count: int(r.quote_count),
    author_followers: int(r.author_followers),
    sources: r.sources ? r.sources.split(";").filter(Boolean) : [],
  });
}

for (let i = 0; i < posts.length; i += CHUNK) {
  await supabase("paid_posts?on_conflict=tweet_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(posts.slice(i, i + CHUNK)),
  });
  console.log(`upserted ${Math.min(i + CHUNK, posts.length)} / ${posts.length}`);
}

console.log(`done: ${posts.length} posts from ${new Set(posts.map((p) => p.author_id)).size} authors`);
if (unknown.size) console.warn(`skipped ${unknown.size} authors not in paid_authors:`, [...unknown]);
