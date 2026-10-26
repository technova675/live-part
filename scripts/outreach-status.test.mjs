import test from 'node:test';
import assert from 'node:assert/strict';
import { messagedCreatorUsernames } from '../lib/outreach-status.ts';

test('message history follows the stable ID after a handle rename', () => {
  const result = messagedCreatorUsernames([{ user_id: '1', username: 'old_name', status: 'messaged' }], [{ username: 'New_Name', rest_id: '1' }]);
  assert.ok(result.includes('new_name'));
});

test('a recycled handle with a different known ID does not inherit a messaged badge', () => {
  assert.deepEqual(messagedCreatorUsernames([{ user_id: '1', username: 'recycled', status: 'messaged' }], [{ username: 'recycled', rest_id: '2' }]), []);
});

test('username fallback is case insensitive and excludes uncontacted rows', () => {
  const rows = [
    { user_id: '1', username: 'Creator_A', status: 'messaged' },
    { user_id: '2', username: 'Creator_B', status: 'not_contacted' },
    { user_id: '1', username: 'creator_a', status: 'messaged' },
  ];
  assert.deepEqual(messagedCreatorUsernames(rows, [{ username: 'CREATOR_A', rest_id: null }]), ['creator_a']);
  assert.deepEqual(messagedCreatorUsernames([], []), []);
});
