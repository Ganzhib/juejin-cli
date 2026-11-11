import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { access, mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PACKAGE_NAME, PACKAGE_ROOT, VERSION } from '../package.js';
import { CliError } from '../shared/errors.js';

const REGISTRY = 'https://registry.npmjs.org';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function newerVersion(candidate: unknown, current: string): candidate is string {
  if (typeof candidate !== 'string' || !stableVersion.test(candidate) || !stableVersion.test(current)) return false;
  const left = candidate.split('.').map(BigInt);
  const right = current.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i];
  }
  return false;
}

export interface UpdateOptions {
  packageRoot?: string;
  version?: string;
  cache?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  prepare?: (version: string, cache: string) => Promise<string>;
  launch?: (entry: string, args: string[], env: NodeJS.ProcessEnv) => Promise<number>;
  notice?: (event: 'install' | 'ready' | 'fallback', version: string) => void;
}

async function installedEntry(cache: string, version: string): Promise<string | undefined> {
  if (!stableVersion.test(version)) return undefined;
  const root = join(cache, version, 'node_modules', ...PACKAGE_NAME.split('/'));
  try {
    const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    if (metadata.name !== PACKAGE_NAME || metadata.version !== version) return undefined;
    const entry = join(root, 'dist', 'cli.js');
    await access(entry);
    return entry;
  } catch { return undefined; }
}

async function npmEntry(): Promise<string> {
  const executable = await realpath(process.execPath);
  const candidates = [
    process.env.npm_execpath,
    join(dirname(executable), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    resolve(dirname(executable), '../lib/node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(executable), '../share/nodejs/npm/bin/npm-cli.js'),
  ];
  for (const candidate of candidates) {
    if (!candidate || !candidate.endsWith('npm-cli.js')) continue;
    try { await access(candidate); return candidate; } catch { /* Try the next Node distribution layout. */ }
  }
  throw new Error('未找到 Node.js 配套的 npm');
}

async function prepareVersion(version: string, cache: string): Promise<string> {
  const existing = await installedEntry(cache, version);
  if (existing) return existing;
  const npm = await npmEntry();
  await mkdir(cache, { recursive: true });
  const staging = await mkdtemp(join(cache, '.install-'));
  try {
    // Never touch a running installation or ask for administrator rights. npm verifies archive integrity.
    await new Promise<void>((resolveInstall, reject) => {
      const child = spawn(process.execPath, [npm, 'install', '--prefix', staging,
        `${PACKAGE_NAME}@${version}`, `--registry=${REGISTRY}`, '--ignore-scripts', '--omit=dev',
        '--no-audit', '--no-fund', '--package-lock=false', '--fetch-retries=0', '--fetch-timeout=15000'],
      { stdio: 'ignore', windowsHide: true, timeout: 60000,
        env: { ...process.env, JUEJIN_AUTO_UPDATE: '0', npm_config_engine_strict: 'true' } });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolveInstall() : reject(new Error('下载更新失败')));
    });
    const packageRoot = join(staging, 'node_modules', ...PACKAGE_NAME.split('/'));
    const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    if (metadata.name !== PACKAGE_NAME || metadata.version !== version) throw new Error('更新包版本不匹配');
    await access(join(packageRoot, 'dist', 'cli.js'));
    try { await rename(staging, join(cache, version)); }
    catch (error) { if (!await installedEntry(cache, version)) throw error; }
    return (await installedEntry(cache, version))!;
  } finally { await rm(staging, { recursive: true, force: true }); }
}

function launchVersion(entry: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { stdio: 'inherit', env, windowsHide: true });
    const interrupt = () => { child.kill('SIGINT'); };
    const terminate = () => { child.kill('SIGTERM'); };
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => {
      cleanup();
      resolveExit(code ?? (128 + (signal ? constants.signals[signal] ?? 1 : 1)));
    });
  });
}

/** Returns undefined only before any business command has started. */
export async function runUpdatedCli(args: string[], options: UpdateOptions = {}): Promise<number | undefined> {
  const env = options.env ?? process.env;
  const root = options.packageRoot ?? PACKAGE_ROOT;
  const version = options.version ?? VERSION;
  // Source checkouts, CI, explicit npx versions and the delegated child keep their selected version.
  if (env.JUEJIN_AUTO_UPDATE === '0' || env.JUEJIN_UPDATE_CHILD === '1' || env.CI ||
      env.npm_command === 'exec' || !root.split(/[\\/]/).includes('node_modules')) return undefined;
  const cache = options.cache ?? env.JUEJIN_UPDATE_DIR ?? join(homedir(), '.cache', 'juejin-cli', 'versions');
  let target = version;
  let entry: string | undefined;
  let recentlyChecked = false;
  try {
    const saved = JSON.parse(await readFile(join(cache, 'latest.json'), 'utf8'));
    if (newerVersion(saved?.version, version)) {
      entry = await installedEntry(cache, saved.version);
      if (entry) target = saved.version;
    }
    const age = Date.now() - saved.checkedAt;
    recentlyChecked = typeof saved.checkedAt === 'number' && age >= 0 && age < 60000 &&
      stableVersion.test(saved.version) && (!newerVersion(saved.version, version) || Boolean(entry));
  } catch { /* The bundled version remains usable without a writable cache. */ }
  if (!recentlyChecked) try {
    const response = await (options.fetch ?? fetch)(`${REGISTRY}/${encodeURIComponent(PACKAGE_NAME)}/latest`,
      { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    if (!response.ok) throw new Error('更新检查失败');
    const latest = await response.json() as { name?: string; version?: string };
    if (latest.name !== PACKAGE_NAME || !latest.version || !stableVersion.test(latest.version)) throw new Error('无效版本');
    if (newerVersion(latest.version, target)) {
      options.notice?.('install', latest.version);
      entry = await (options.prepare ?? prepareVersion)(latest.version, cache);
      target = latest.version;
    }
    const temporary = join(cache, `latest.${randomUUID()}.tmp`);
    try {
      await mkdir(cache, { recursive: true });
      await writeFile(temporary, JSON.stringify({ version: target, checkedAt: Date.now() }), { flag: 'wx' });
      await rename(temporary, join(cache, 'latest.json'));
    } catch { /* A cache pointer failure must not discard a complete installation. */ }
    finally { await rm(temporary, { force: true }).catch(() => {}); }
  } catch { options.notice?.('fallback', target); }
  if (!entry) return undefined;
  options.notice?.('ready', target);
  try {
    // No catch-and-run-old fallback beyond this boundary: the child may already have published an article.
    return await (options.launch ?? launchVersion)(entry, args,
      { ...env, JUEJIN_UPDATE_CHILD: '1', JUEJIN_AUTO_UPDATE: '0' });
  } catch {
    throw new CliError('INTERNAL', '新版 CLI 启动或执行异常，未重试原命令。请先核对操作回执。');
  }
}
