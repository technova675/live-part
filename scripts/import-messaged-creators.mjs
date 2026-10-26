import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { request } from './import-paid-promotions.mjs';

const file = process.argv[2];
if (!file) throw new Error('Pass the messaged-creators JSON file');
const records = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
if (!Array.isArray(records)) throw new Error('Expected a JSON array');
const unique = new Map();
for (const row of records) {
  const handle = row.screen_name?.replace(/^@/, '');
  if (typeof row.user_id !== 'string' || !/^\d+$/.test(row.user_id) || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error('Invalid user ID or screen name');
  const previous = unique.get(row.user_id);
  if (previous && previous.screen_name.toLowerCase() !== handle.toLowerCase()) throw new Error(`Conflicting handles for user ID ${row.user_id}`);
  unique.set(row.user_id, { user_id: row.user_id, screen_name: handle, status: 'messaged' });
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing database credentials');
async function db(path, init = {}) {
  const res = await request(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers } });
  if (!res.ok) throw new Error(`Database ${res.status}: ${await res.text()}`);
  return res;
}
const rows = [...unique.values()];
const existing = new Set();
for (let offset = 0; offset < rows.length; offset += 100) {
  const chunk = rows.slice(offset, offset + 100);
  const known = await (await db(`creator_outreach?select=user_id&user_id=in.(${chunk.map(row => row.user_id).join(',')})`)).json();
  known.forEach(row => existing.add(row.user_id));
}
const stamp = new Date().toISOString();
for (let offset = 0; offset < rows.length; offset += 100) {
  await db('creator_outreach?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(offset, offset + 100).map(row => ({ ...row, updated_at: stamp }))) });
}
let verified = 0;
for (let offset = 0; offset < rows.length; offset += 100) {
  const expected = rows.slice(offset, offset + 100);
  const saved = await (await db(`creator_outreach?select=user_id,screen_name,status&user_id=in.(${expected.map(row => row.user_id).join(',')})`)).json();
  const actual = new Map(saved.map(row => [row.user_id, row]));
  for (const row of expected) {
    const match = actual.get(row.user_id);
    if (!match || match.status !== 'messaged' || match.screen_name !== row.screen_name) throw new Error(`Verification failed for ${row.user_id}`);
    verified++;
  }
}
const report = { importedAt: stamp, inputRows: records.length, uniqueUsers: rows.length, inserted: rows.filter(row => !existing.has(row.user_id)).length, updated: rows.filter(row => existing.has(row.user_id)).length, verified, status: 'messaged' };
await mkdir(new URL('../imports/creator-outreach/', import.meta.url), { recursive: true });
await writeFile(new URL('../imports/creator-outreach/report.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
