import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'juejin-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args, env = {}) {
  return execFileSync(command, args, { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
}
try {
  const [packed] = JSON.parse(run(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', directory]));
  const paths = new Set(packed.files.map(file => file.path));
  for (const path of ['dist/cli.js', 'skills/juejin-cli/SKILL.md', 'skills/juejin-cli/references/scenarios.md', 'scripts/postinstall.mjs']) assert.ok(paths.has(path), `Missing ${path}`);
  assert.ok(![...paths].some(path => path.includes('session.json') || path.startsWith('output/')));
  const archive = join(directory, packed.filename);
  const prefix = join(directory, 'install');
  const skillsRoot = join(directory, 'skills');
  const env = { JUEJIN_AUTO_INSTALL_SKILL: '1', JUEJIN_SKILLS_DIR: skillsRoot };
  run(npm, ['install', '--prefix', prefix, '--omit=dev', '--no-audit', '--no-fund', archive], env);
  const installed = join(prefix, 'node_modules', ...packed.name.split('/'));
  const cli = join(installed, 'dist', 'cli.js');
  const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(run(process.execPath, [cli, '--version'], env).trim(), metadata.version);
  await access(join(skillsRoot, 'juejin-cli', 'SKILL.md'));
  const result = JSON.parse(run(process.execPath, [cli, 'skill', 'status', '--json'], env));
  assert.equal(result.data.state, 'installed');
  assert.equal(result.data.version, metadata.version);
  // A package installed with scripts disabled still installs the Skill on its first invocation.
  await rm(skillsRoot, { recursive: true });
  run(process.execPath, [cli, '--help'], env);
  await access(join(skillsRoot, 'juejin-cli', 'SKILL.md'));
  console.log(`PASS archive installation, executable, bundled Skill and first-run recovery (${metadata.version})`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
