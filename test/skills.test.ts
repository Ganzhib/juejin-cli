import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { autoInstallSkill, installSkill, skillStatus } from '../src/runtime/skills.js';
import { VERSION } from '../src/package.js';
import { PACKAGE_NAME, PACKAGE_ROOT } from '../src/package.js';

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

test('upgrades a managed legacy entry in place while retaining unrelated files', async () => {
  const home = await mkdtemp(join(tmpdir(), 'juejin-skill-upgrade-'));
  const target = join(home, 'juejin-cli');
  try {
    await mkdir(target);
    const legacy = 'Legacy entry linking to a sibling drawio skill';
    await writeFile(join(target, 'SKILL.md'), legacy);
    await writeFile(join(target, 'notes.txt'), 'Keep my notes');
    await writeFile(join(target, '.juejin-cli-install.json'), JSON.stringify({
      package: PACKAGE_NAME, version: VERSION,
      files: { 'SKILL.md': createHash('sha256').update(legacy).digest('hex') },
    }));
    await installSkill(target);
    assert.equal((await skillStatus(target)).state, 'installed');
    assert.equal(await readFile(join(target, 'notes.txt'), 'utf8'), 'Keep my notes');
    assert.match(await readFile(join(target, 'SKILL.md'), 'utf8'), /assets\/drawio\/GUIDE\.md/);
    assert.ok(await readFile(join(target, 'assets/drawio/scripts/validate.py'), 'utf8'));
  } finally { await rm(home, { recursive: true, force: true }); }
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

test('bundled drawio installs scripts and binary data without changing bytes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'juejin-drawio-'));
  try {
    const target = join(home, 'drawio-skill');
    await installSkill(target, 'drawio-skill');
    assert.deepEqual(await readFile(join(target, 'data/shape-index.json.gz')), await readFile(join(PACKAGE_ROOT, 'skills/juejin-cli/assets/drawio/data/shape-index.json.gz')));
    assert.match(await readFile(join(target, 'SKILL.md'), 'utf8'), /name: drawio-skill/);
    assert.ok((await readFile(join(target, 'scripts/validate.py'), 'utf8')).length > 0);
    assert.equal((await skillStatus(target)).state, 'installed');
    await writeFile(join(target, 'SKILL.md'), 'custom drawio');
    await assert.rejects(installSkill(target, 'drawio-skill'), /已有自定义 Skill/);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('automatic installation exposes one self-contained entry and preserves a legacy sibling', async () => {
  const home = await mkdtemp(join(tmpdir(), 'juejin-unified-skill-'));
  const savedRoot = process.env.JUEJIN_SKILLS_DIR;
  const savedAuto = process.env.JUEJIN_AUTO_INSTALL_SKILL;
  process.env.JUEJIN_SKILLS_DIR = home;
  process.env.JUEJIN_AUTO_INSTALL_SKILL = '1';
  try {
    await autoInstallSkill();
    assert.deepEqual(await readdir(home), ['juejin-cli']);
    const target = join(home, 'juejin-cli');
    const files = await readdir(target, { recursive: true });
    assert.deepEqual(files.filter(file => /(^|[\\/])SKILL\.md$/.test(file)), ['SKILL.md']);
    assert.deepEqual(await readFile(join(target, 'assets/drawio/data/shape-index.json.gz')),
      await readFile(join(PACKAGE_ROOT, 'skills/juejin-cli/assets/drawio/data/shape-index.json.gz')));
    const entry = await readFile(join(target, 'SKILL.md'), 'utf8');
    for (const match of entry.matchAll(/\]\(([^)]+)\)/g)) await readFile(join(target, match[1]!));
    await mkdir(join(home, 'drawio-skill'));
    await writeFile(join(home, 'drawio-skill/SKILL.md'), 'User-owned legacy drawing skill');
    await autoInstallSkill();
    assert.equal(await readFile(join(home, 'drawio-skill/SKILL.md'), 'utf8'), 'User-owned legacy drawing skill');
    assert.equal((await skillStatus(target)).state, 'installed');
  } finally {
    if (savedRoot === undefined) delete process.env.JUEJIN_SKILLS_DIR; else process.env.JUEJIN_SKILLS_DIR = savedRoot;
    if (savedAuto === undefined) delete process.env.JUEJIN_AUTO_INSTALL_SKILL; else process.env.JUEJIN_AUTO_INSTALL_SKILL = savedAuto;
    await rm(home, { recursive: true, force: true });
  }
});
