import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runUpdatedCli, newerVersion, type UpdateOptions } from '../src/runtime/update.js';

const name = '@ganzhibin/juejin-cli';
const defaults: UpdateOptions = { packageRoot: '/node_modules/@ganzhibin/juejin-cli', version: '0.2.1', env: {} };
function registry(version: string) { return (async () => Response.json({ name, version })) as typeof fetch; }

test('stable versions compare numerically and never accept prereleases, paths or command text', () => {
  assert.equal(newerVersion('0.2.10', '0.2.9'), true);
  for (const version of ['0.2.1', '0.1.9', '1.0.0-beta.1', '../2.0.0', '1.0.0;echo secret', '01.0.0']) {
    assert.equal(newerVersion(version, '0.2.1'), false);
  }
});

test('source, CI, pinned npx and opt-out never contact the registry', async () => {
  const fetch = (() => { throw new Error('must not fetch'); }) as typeof globalThis.fetch;
  for (const env of [{ CI: 'true' }, { npm_command: 'exec' }, { JUEJIN_AUTO_UPDATE: '0' }, { JUEJIN_UPDATE_CHILD: '1' }]) {
    assert.equal(await runUpdatedCli([], { ...defaults, env, fetch }), undefined);
  }
  assert.equal(await runUpdatedCli([], { ...defaults, packageRoot: '/source', fetch }), undefined);
});

test('download failure falls back before running any business command', async () => {
  const cache = await mkdtemp(join(tmpdir(), 'juejin-update-'));
  try {
    let launches = 0;
    const result = await runUpdatedCli(['article', 'publish', '--draft', '123'], {
      ...defaults, cache, fetch: registry('0.3.0'),
      prepare: async () => { throw new Error('download timed out'); },
      launch: async () => { launches++; return 0; },
    });
    assert.equal(result, undefined);
    assert.equal(launches, 0);
  } finally { await rm(cache, { recursive: true }); }
});

test('an updated command receives exact arguments once; errors and exit codes never replay it', async () => {
  const cache = await mkdtemp(join(tmpdir(), 'juejin-update-'));
  try {
    const args = ['draft', 'update', '123', '有 空格 & 特殊字符.md', '--json'];
    let calls = 0;
    const options: UpdateOptions = {
      ...defaults, cache, fetch: registry('0.3.0'), prepare: async () => 'new-cli.js',
      launch: async (entry, received, env) => {
        calls++;
        assert.equal(entry, 'new-cli.js');
        assert.deepEqual(received, args);
        assert.equal(env.JUEJIN_UPDATE_CHILD, '1');
        return 5;
      },
    };
    assert.equal(await runUpdatedCli(args, options), 5);
    assert.equal(calls, 1);
    await assert.rejects(runUpdatedCli(args, { ...options, launch: async () => { calls++; throw new Error('child failed'); } }), /未重试原命令/);
    assert.equal(calls, 2);
  } finally { await rm(cache, { recursive: true }); }
});

test('offline launches use a complete cached update and ignore incomplete downloads', async () => {
  const cache = await mkdtemp(join(tmpdir(), 'juejin-update-'));
  try {
    const root = join(cache, '0.3.0', 'node_modules', '@ganzhibin', 'juejin-cli');
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ name, version: '0.3.0' }));
    await writeFile(join(cache, 'latest.json'), JSON.stringify({ version: '0.3.0' }));
    const options: UpdateOptions = {
      ...defaults, cache, fetch: (async () => { throw new Error('offline'); }) as typeof fetch,
      launch: async entry => { assert.equal(entry, join(root, 'dist', 'cli.js')); return 0; },
    };
    assert.equal(await runUpdatedCli([], options), undefined);
    await writeFile(join(root, 'dist', 'cli.js'), '');
    assert.equal(await runUpdatedCli([], options), 0);
  } finally { await rm(cache, { recursive: true }); }
});

test('a recent successful version check is reused, while future or expired timestamps are not', async () => {
  const cache = await mkdtemp(join(tmpdir(), 'juejin-update-'));
  try {
    let requests = 0;
    const options = { ...defaults, cache, fetch: (async () => { requests++; return Response.json({ name, version: '0.2.1' }); }) as typeof fetch };
    for (const checkedAt of [Date.now(), Date.now() + 120000, Date.now() - 120000]) {
      await writeFile(join(cache, 'latest.json'), JSON.stringify({ version: '0.2.1', checkedAt }));
      assert.equal(await runUpdatedCli([], options), undefined);
    }
    assert.equal(requests, 2);
  } finally { await rm(cache, { recursive: true }); }
});
