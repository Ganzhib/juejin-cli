import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Run against an installed package: node scripts/live-acceptance.mjs --cli <installed>/dist/cli.js
const args = process.argv.slice(2);
const cliIndex = args.indexOf('--cli');
if (cliIndex < 0 || !args[cliIndex + 1]) throw new Error('Pass --cli with the installed package dist/cli.js path');
const cli = resolve(args[cliIndex + 1]);
const write = args.includes('--write');
const results = [];
const ids = {};

function run(name, command, { expectError = false } = {}) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [cli, ...command, '--json'], { encoding: 'utf8', timeout: 60_000 });
  const elapsed_ms = Math.round(performance.now() - start);
  let document;
  try { document = JSON.parse((result.status === 0 ? result.stdout : result.stderr).trim()); }
  catch { document = null; }
  const passed = expectError
    ? result.status !== 0 && document?.ok === false
    : result.status === 0 && document?.ok === true;
  results.push({ name, passed, elapsed_ms, error_code: passed ? undefined : document?.error?.code ?? result.error?.code ?? 'INVALID_JSON' });
  if (!passed) throw new Error(`${name} failed; inspect the JSON report before another write`);
  return document.data;
}

try {
  run('version and schema', ['schema', 'article', 'publish']);
  run('categories', ['category', 'list']);
  const search = run('article search', ['article', 'search', 'TypeScript', '--limit', '2']);
  results.at(-1).returned_items = search.items.length;
  results.push({ name: 'search limit respected', passed: search.items.length <= 2, requested_items: 2, returned_items: search.items.length });
  const article = search.items[0];
  if (article) run('article detail', ['article', 'get', article.article_id]);
  run('recommendations', ['recommend', '--limit', '2']);
  run('hot list', ['hot', '--limit', '2']);
  run('tag list', ['tag', 'list', '--limit', '2']);
  run('input error JSON', ['article', 'get', 'invalid-id'], { expectError: true });
  run('auth status', ['auth', 'status']);
  run('draft list', ['draft', 'list', '--limit', '2']);
  run('article list', ['article', 'list', '--limit', '2']);
  run('column list', ['column', 'list', '--limit', '2']);
  run('operation history', ['history', '--limit', '2']);

  if (write) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const directory = mkdtempSync(join(tmpdir(), 'juejin-live-'));
    const file = join(directory, 'article.md');
    const image = join(directory, 'pixel.png');
    writeFileSync(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR3sAAAAASUVORK5CYII=', 'base64'));
    writeFileSync(file, `---\ntitle: CLI 自动化验收 ${stamp}\nbrief: 这是一篇用于验证掘金命令行工具的测试文章，记录草稿创建、更新与发布流程。正文说明了验收目的，避免给读者造成正式技术文章的误解。\ncategory: 开发工具\ntags: TypeScript\n---\n\n# CLI 自动化验收\n\n此文章用于真实流程验收。\n`);
    run('draft preflight', ['draft', 'create', file, '--dry-run']);
    ids.draft_id = run('draft create', ['draft', 'create', file]).draft_id;
    run('image upload', ['image', 'upload', image]);
    writeFileSync(file, `---\ntitle: CLI 自动化验收 ${stamp}\nbrief: 这是一篇用于验证掘金命令行工具的测试文章，记录草稿创建、更新与发布流程。正文说明了验收目的，避免给读者造成正式技术文章的误解。\ncategory: 开发工具\ntags: TypeScript\n---\n\n# CLI 自动化验收\n\n此文章用于真实流程验收。更新已完成。\n\n![验收像素](./pixel.png)\n`);
    run('draft update', ['draft', 'update', ids.draft_id, file]);
    // Generated test content must remain a draft. Public publication uses real reviewed articles.
  }
} catch (error) {
  results.push({ name: 'stopped', passed: false, reason: error.message });
} finally {
  const passed = results.filter(item => item.passed).length;
  const attempted = results.filter(item => item.name !== 'stopped').length;
  console.log(JSON.stringify({ package_cli: cli, write, passed, attempted, command_check_pass_rate: attempted ? passed / attempted : 0, publication_result: 'not_tested', ids, results }, null, 2));
  if (passed !== attempted) process.exitCode = 1;
}
