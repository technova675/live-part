# Paid-promotion posts

`public.paid_promotion_posts` stores only tweets whose outer
`contentDisclosure.advertising.isPaidPromotion` is the JSON boolean `true`.
The database rejects false, missing, null, and string `"true"` values, including
posts whose only paid label belongs to a quoted tweet.

## Create and populate the table

Run `supabase/paid-promotion-posts-setup.sql` in the project's Supabase SQL editor.
It creates the table and imports the one confirmed paid post from
`dataset_x-tweet-scraper_2026-10-23_10-45-27-538.json` (76 input posts).
The file runs in a transaction and can be rerun without duplicate tweet IDs.
It has been verified in a temporary PostgreSQL instance; it has not been applied
to the hosted database. The configured REST credentials cannot execute table DDL.

For a schema-only deployment, apply
`supabase/migrations/20261023_paid_promotion_posts.sql` instead.

## Import subsequent datasets

From the project directory, preview without credentials or network access:

```powershell
node scripts/import-paid-promotions.mjs --dry-run path/to/dataset.json
```

After the table exists, import using the existing server credentials:

```powershell
node --env-file=.env.local scripts/import-paid-promotions.mjs path/to/dataset.json
```

Multiple input file paths are supported. Later inputs replace earlier records
with the same tweet ID. Only the explicit paid flag decides eligibility; the
importer does not add date, reply, or retweet restrictions beyond the dataset's
search settings. No timestamp is used to infer whether a post is paid.

To generate a new combined schema-and-data SQL file without contacting Supabase:

```powershell
node scripts/import-paid-promotions.mjs --sql supabase/new-paid-promotion-setup.sql path/to/dataset.json
```

SQL output refuses to overwrite an existing file. Raw tweet data, including all
media, entities, author details, and disclosure metadata, is retained in `raw`.
Frequently queried fields are generated from `raw`, keeping them consistent.
Tweet IDs remain text to preserve their precision. RLS is enabled; access follows
the existing server-only service-role pattern. The dashboard shows every tracked creator, using this table for post counts and median views. Creator post lists
also use only this table. Creators with no confirmed promotions display a zero-post badge.



## User-confirmed paid datasets

For a dataset explicitly identified as paid partnerships by the project owner,
use `--confirm-paid --with-profiles`. This also accepts the alternate scraper's
`author.userName`, `extendedEntities.media`, and `quoted_tweet` fields:

```powershell
$datasetFiles = Get-ChildItem -LiteralPath 'New folder (2)' -Filter '*.json' -File | Sort-Object Name | Select-Object -ExpandProperty FullName
node --env-file=.env.local scripts/import-paid-promotions.mjs --confirm-paid --with-profiles @datasetFiles
```

This opt-in sets the normalized paid flag to true and records
`raw._import.paidPromotionSource = "user-confirmed"`. The unmodified original
record is stored in `raw._import.sourceRecord`; source files stay untouched.
Only the imported outer posts receive this classification, not referenced quoted
posts. Posts upsert by tweet ID and profiles by lowercase username.
Without `--confirm-paid`, the importer still requires an explicit source flag.
