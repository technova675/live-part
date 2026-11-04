import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request } from './import-paid-promotions.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { username, message, rates, clear_fields = [], supersede_messages = [] } = JSON.parse(input);
assert.match(username, /^[a-z0-9_]{1,15}$/i);
assert.ok(typeof message === 'string' && message.trim());
assert.ok(rates && typeof rates === 'object' && !Array.isArray(rates));
const scalarFields = ['retweet_rate', 'quote_rate', 'comment_rate', 'bundle_rate_min', 'bundle_rate_max'];
assert.ok(Array.isArray(clear_fields) && clear_fields.every(field => scalarFields.includes(field)));
assert.ok(Array.isArray(supersede_messages) && supersede_messages.every(item => typeof item === 'string' && item.trim()));
for (const [field, value] of Object.entries(rates)) {
  assert.match(field, /^[a-z_]+$/);
  assert.ok(Number.isFinite(value) && value >= 0, `Invalid ${field}`);
}

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Missing Supabase credentials');
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const resolvedIp = process.env.SUPABASE_RESOLVED_IP;
const lookup = resolvedIp ? (_hostname, _options, callback) => callback(null, resolvedIp, 4) : undefined;
async function db(path, init = {}) {
  const response = await request(`${base}/rest/v1/${path}`, { ...init, lookup, headers: { ...headers, ...init.headers } });
  if (!response.ok) throw new Error(`Database HTTP ${response.status}: ${await response.text()}`);
  return response.json().catch(() => null);
}

const [profiles, before] = await Promise.all([
  db(`author_profiles?select=username,name&username=ilike.${username}`),
  db(`creator_pricing?select=*&username=ilike.${username}`),
]);
assert.ok(profiles.length <= 1, 'Duplicate author profiles');
assert.ok(before.length <= 1, 'Duplicate pricing rows');
const old = before[0] ?? {};
const handle = profiles[0]?.username ?? old.username ?? username.toLowerCase();
const stamp = new Date().toISOString();
const sourceIdFor = value => `user-message-${handle.toLowerCase()}-${createHash('sha256').update(value.trim()).digest('hex').slice(0, 16)}`;
const sourceId = sourceIdFor(message);
const supersededIds = new Set(supersede_messages.map(sourceIdFor));
const sourceRows = (Array.isArray(old.source_rows) ? old.source_rows : []).filter(source => source.source_id !== sourceId && !supersededIds.has(source.source_id));
sourceRows.push({ source_id: sourceId, source_type: 'user_supplied_message', platform: 'twitter', recorded_at: stamp,
  message: message.trim(), parsed_rates: { platform: 'twitter', currency: 'USD', ...rates } });
const marker = `[${sourceId}]`;
const notes = [...(old.notes?.split('\n') ?? []).filter(line => !line.startsWith(marker) && ![...supersededIds].some(id => line.startsWith(`[${id}]`))),
  `${marker} USD: ${message.trim().replace(/\s+/g, ' ')}`].join('\n');
const scalars = Object.fromEntries(scalarFields.filter(field => field in rates).map(field => [field, rates[field]]));
for (const field of clear_fields) {
  assert.ok(!(field in rates), `Cannot clear and set ${field}`);
  scalars[field] = null;
}
await db('creator_pricing?on_conflict=username', {
  method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify([{ username: handle, creator_name: profiles[0]?.name ?? old.creator_name ?? handle,
    x_profile_url: old.x_profile_url ?? `https://x.com/${handle}`, ...scalars, currency: 'USD',
    ...(rates.bundle_rate_min != null || rates.bundle_rate_max != null ? { bundle_currency: 'USD' } : {}),
    source_rows: sourceRows, notes, source_file: sourceId, updated_at: stamp }]),
});
const saved = await db(`creator_pricing?select=*&username=ilike.${username}`);
assert.equal(saved.length, 1);
for (const [field, value] of Object.entries(scalars)) assert.equal(saved[0][field], value, field);
assert.deepEqual(saved[0].source_rows, sourceRows);
console.log(JSON.stringify({ username: handle, action: before.length ? 'updated' : 'inserted', authorProfilePresent: profiles.length === 1, rates, cleared: clear_fields, verified: true }));
