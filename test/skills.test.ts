import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installSkill, skillStatus } from '../src/skills.js';
import { VERSION } from '../src/package.js';

test('installs a complete Skill once and leaves matching installations untouched', async () => {
  const home = await mkdtemp(join(tmpdir(), 'juejin-skill-'));
  const target = join(home, 'juejin-cli');
  try {
    assert.equal((await skillStatus(target)).state, 'missing');
    await installSkill(target);
    const receipt = await readFile(join(target, '.juejin-cli-install.json'), 'utf8');
    assert.ok((await readFile(join(target, 'SKILL.md'), 'utf8')).includes('name: juejin-cli'));
    assert.ok((await readFile(join(target, 'references', 'scenarios.md'), 'utf8')).includes('专栏'));
    await installSkill(target);
    assert.equal(await readFile(join(target, '.juejin-cli-install.json'), 'utf8'), receipt);
    assert.equal((await skillStatus(target)).version, VERSION);
  } finally { await rm(home, { recursive: true }); }
});

test('keeps user-edited Skills and reports the conflict', async () => {
  const home = await mkdtemp(join(tmpdir(), 'juejin-skill-'));
  const target = join(home, 'juejin-cli');
  try {
    await installSkill(target);
    await writeFile(join(target, 'SKILL.md'), 'My instructions');
    assert.equal((await skillStatus(target)).state, 'modified');
    await assert.rejects(() => installSkill(target), /已有自定义 Skill/);
    assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), 'My instructions');
  } finally { await rm(home, { recursive: true }); }
});

test('does not take over a same-named skill created outside this package', async () => {
  const home = await mkdtemp(join(tmpdir(), 'juejin-skill-'));
  const target = join(home, 'juejin-cli');
  try {
    await mkdir(target);
    await writeFile(join(target, 'SKILL.md'), 'Existing skill');
    await assert.rejects(() => installSkill(target), /已有自定义 Skill/);
    assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), 'Existing skill');
  } finally { await rm(home, { recursive: true }); }
});
