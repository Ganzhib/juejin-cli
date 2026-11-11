import { test } from 'node:test';
import assert from 'node:assert/strict';
// The release script also runs before npm ci, so it deliberately has no dependencies.
import { planRelease } from '../scripts/release-version.mjs';

const commit = 'a'.repeat(40);
test('main releases automatically increase past every published stable version', () => {
  const registry = { versions: { '0.2.0': {}, '0.2.9': {}, '1.0.0-beta.1': {} }, 'dist-tags': { latest: '0.2.0' } };
  assert.deepEqual(planRelease({ version: '0.2.1' }, registry, commit), { publish: true, version: '0.2.10' });
  assert.deepEqual(planRelease({ version: '1.0.0' }, registry, commit), { publish: true, version: '1.0.0' });
});
test('retrying an already published commit skips publication even when latest has advanced', () => {
  assert.deepEqual(planRelease({ version: '0.2.1' }, { versions: { '0.2.1': { gitHead: commit }, '0.2.2': {} } }, commit),
    { publish: false, version: '0.2.1' });
  assert.throws(() => planRelease({ version: '0.2.1' }, null, commit), /Invalid registry/);
  assert.throws(() => planRelease({ version: '0.2.1' }, { versions: {} }, 'unknown'), /commit SHA/);
});
