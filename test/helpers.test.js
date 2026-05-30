import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv, extractPathParams, matchPath } from '../src/index.js';

test('matchPath and extractPathParams parse dynamic routes', () => {
  assert.equal(matchPath('/events/tremendicon-2026/competitions/youth', '/events/:eventSlug/competitions/:competitionSlug'), true);
  assert.deepEqual(
    extractPathParams('/events/tremendicon-2026/competitions/youth', '/events/:eventSlug/competitions/:competitionSlug'),
    { eventSlug: 'tremendicon-2026', competitionSlug: 'youth' }
  );
});

test('buildCsv escapes values with commas and quotes', () => {
  const csv = buildCsv([{ name: 'Judge "A"', notes: 'Great, clean work' }]);
  assert.equal(csv.trim(), 'name,notes\n"Judge ""A""","Great, clean work"');
});
