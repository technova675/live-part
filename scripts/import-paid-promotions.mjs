// Import explicit paid-promotion flags by default. Database exports are supported.
// --confirm-paid is only for datasets explicitly classified as paid by the user;
// it records that provenance and preserves the original source record.
// Preview: node scripts/import-paid-promotions.mjs --dry-run dataset.json
// SQL setup: node scripts/import-paid-promotions.mjs --sql setup.sql dataset.json
// Import after creating the table:
// node --env-file=.env.local scripts/import-paid-promotions.mjs dataset.json
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { paidAuthorProfiles } from "./paid-promotion-profiles.mjs";
import { userConfirmedPaidTweet } from "./user-confirmed-paid-tweet.mjs";

export function selectPaidRows(tweets, sourceFile, scrapedAt, { confirmedPaid = false } = {}) {
  if (!Array.isArray(tweets)) throw new Error("Dataset must be a JSON array");
  const rows = new Map();
  for (const record of tweets) {
    // Database exports wrap the original tweet in raw. Never infer a paid label
    // from is_paid_partnership. Explicit user confirmation is a separate opt-in.
    const sourceTweet = record?.raw && typeof record.raw === "object" ? record.raw : record;
    // Some scraper runs emit empty tweet placeholders for unavailable results.
    // Skip only fully blank placeholders; malformed nonempty records still fail.
    if (confirmedPaid && sourceTweet?.id === "" && !sourceTweet.url && !sourceTweet.text
      && !Object.keys(sourceTweet.author ?? {}).length) continue;
    const tweet = confirmedPaid ? userConfirmedPaidTweet(sourceTweet) : sourceTweet;
    if (tweet?.contentDisclosure?.advertising?.isPaidPromotion !== true) continue;
    if (typeof tweet.id !== "string" || !tweet.id.trim()) {
      throw new Error("Paid tweet must have a nonempty string id");
    }
    if (!(tweet.author?.username || tweet.authorUsername) || !(tweet.url || tweet.tweetUrl)) {
      throw new Error(`Paid tweet ${tweet.id} is missing its author or URL`);
    }
    const date = tweet.createdAt ? new Date(tweet.createdAt) : null;
    rows.set(tweet.id, {
      raw: tweet,
      posted_at: date && !isNaN(date.getTime()) ? date.toISOString() : null,
      source_file: basename(sourceFile),
      scraped_at: record !== tweet && record.scraped_at && !isNaN(Date.parse(record.scraped_at))
        ? new Date(record.scraped_at).toISOString() : scrapedAt,
    });
  }
  return [...rows.values()];
}

function sqlValue(value) {
  return value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
}

export function setupSql(rows) {
  const migration = readFileSync(new URL("../supabase/migrations/20261023_paid_promotion_posts.sql", import.meta.url), "utf8");
  const inserts = rows.map((row) => {
    // JSON strings can contain backslashes. standard_conforming_strings preserves them.
    return `insert into public.paid_promotion_posts (raw, posted_at, source_file, scraped_at)\nvalues (${sqlValue(JSON.stringify(row.raw))}::jsonb, ${sqlValue(row.posted_at)}::timestamptz, ${sqlValue(row.source_file)}, ${sqlValue(row.scraped_at)}::timestamptz)\non conflict (tweet_id) do update set raw = excluded.raw, posted_at = excluded.posted_at, source_file = excluded.source_file, scraped_at = excluded.scraped_at, imported_at = now();`;
  });
  return `begin;\nset local standard_conforming_strings = on;\n\n${migration}\n${inserts.join("\n\n")}\ncommit;\n`;
}


function directRequest(url, init = {}) {
  return new Promise((resolve, reject) => {
    const body = init.body;
    const headers = { ...init.headers, Connection: "close" };
    if (body != null) headers["Content-Length"] = String(Buffer.byteLength(body));
    const req = httpsRequest(url, { method: init.method ?? "GET", headers, family: 4, agent: false, timeout: 60000 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("error", reject);
      res.on("aborted", () => reject(new Error("Database response interrupted")));
      res.on("end", () => {
        const bytes = Buffer.concat(chunks);
        resolve(new Response(bytes.length ? bytes : null, { status: res.statusCode, headers: Object.fromEntries(Object.entries(res.headers).filter(([, value]) => value !== undefined).map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : value])) }));
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Database request timed out")));
    req.end(body);
  });
}
// Upserts are safe to retry when a network interruption leaves the outcome unknown.
export async function request(url, init = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await directRequest(url, init);
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt >= 3) return response;
      await response.arrayBuffer();
      console.warn(`Transient database response ${response.status}; retry ${attempt + 1}/3`);
    } catch (error) {
      if (attempt >= 3) throw error;
      console.warn(`Database request interrupted; retry ${attempt + 1}/3`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}
export async function main(args = process.argv.slice(2)) {
  const files = [];
  let dryRun = false;
  let sqlFile;
  let withProfiles = false;
  let confirmedPaid = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--confirm-paid") confirmedPaid = true;
    else if (args[i] === "--with-profiles") withProfiles = true;
    else if (args[i] === "--dry-run") dryRun = true;
    else if (args[i] === "--sql") {
      sqlFile = args[++i];
      if (!sqlFile || sqlFile.startsWith("--")) throw new Error("--sql needs an output path");
    } else if (args[i].startsWith("--")) throw new Error(`Unknown option: ${args[i]}`);
    else files.push(args[i]);
  }
  if (!files.length) throw new Error("Pass one or more dataset JSON files");
  if (withProfiles && sqlFile) throw new Error("--with-profiles uses REST imports, not SQL output");
  if (dryRun && sqlFile) throw new Error("Choose --dry-run or --sql");
  if (sqlFile && files.some((file) => resolve(file) === resolve(sqlFile))) {
    throw new Error("SQL output must not overwrite a source dataset");
  }

  if (confirmedPaid) console.log("Paid classification supplied by the user; original source records are retained in raw._import.sourceRecord");

  // Parse and validate every input before making any database writes.
  const selected = new Map();
  for (const file of files) {
    const tweets = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    const stamp = basename(file).match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{3})/);
    const scrapedAt = stamp
      ? `${stamp[1]}T${stamp[2]}:${stamp[3]}:${stamp[4]}.${stamp[5]}Z`
      : statSync(file).mtime.toISOString();
    const paid = selectPaidRows(tweets, file, scrapedAt, { confirmedPaid });
    for (const row of paid) selected.set(row.raw.id, row);
    console.log(`${basename(file)}: ${tweets.length} input posts, ${paid.length} unique paid-promotion posts`);
  }
  const rows = [...selected.values()];
  const authors = withProfiles ? paidAuthorProfiles(rows) : [];
  if (dryRun) {
    console.log(`Dry run: ${rows.length} unique posts and ${authors.length} author profiles would be imported; no database writes`);
    return rows;
  }
  if (sqlFile) {
    writeFileSync(sqlFile, setupSql(rows), { encoding: "utf8", flag: "wx" });
    console.log(`Wrote table setup and ${rows.length} paid posts to ${sqlFile}`);
    return rows;
  }
  if (!rows.length) {
    console.log("No confirmed paid-promotion posts to import");
    return rows;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  let profiles = [];
  if (withProfiles && authors.length) {
    const existing = [];
    for (let i = 0; i < authors.length; i += 100) {
      const handles = authors.slice(i, i + 100).map((author) => author.username).join(",");
      const response = await request(`${url}/rest/v1/author_profiles?select=*&username=in.(${handles})`, { headers });
      if (!response.ok) throw new Error(`Profile preflight failed ${response.status}: ${await response.text()}`);
      existing.push(...await response.json());
    }
    profiles = paidAuthorProfiles(rows, existing);
    const known = new Set(existing.map((profile) => profile.username.toLowerCase()));
    console.log(`Author profiles: ${profiles.filter((profile) => known.has(profile.username)).length} existing to update; ${profiles.filter((profile) => !known.has(profile.username)).length} new to insert`);
  }
  for (let i = 0; i < rows.length; i += 50) {
    const response = await request(`${url}/rest/v1/paid_promotion_posts?on_conflict=tweet_id`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal,missing=default",
      },
      body: JSON.stringify(rows.slice(i, i + 50)),
    });
    if (!response.ok) throw new Error(`Supabase error ${response.status}: ${await response.text()}`);
    console.log(`Saved ${Math.min(i + 50, rows.length)} / ${rows.length} paid posts`);
  }
  for (let i = 0; i < profiles.length; i += 200) {
    const response = await request(`${url}/rest/v1/author_profiles?on_conflict=username`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(profiles.slice(i, i + 200)),
    });
    if (!response.ok) throw new Error(`Profile upsert failed ${response.status}: ${await response.text()}`);
  }
  console.log(`Imported ${rows.length} unique paid-promotion posts${withProfiles ? ` and ${profiles.length} author profiles` : ""}`);
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}








