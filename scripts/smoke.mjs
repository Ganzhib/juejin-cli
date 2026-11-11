import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = mkdtempSync(join(tmpdir(), 'juejin-public-smoke-'));
function run(args) {
  const output = execFileSync(process.execPath, ['dist/cli.js', '--home', home, '--json', ...args], { encoding: 'utf8', timeout: 60_000 });
  const result = JSON.parse(output);
  assert.equal(result.ok, true);
  process.stdout.write(`PASS ${args.join(' ')}\n`);
  return result.data;
}

try {
  const categories = run(['category', 'list']);
  assert.ok(categories.length > 0);
  const tags = run(['tag', 'list', '--limit', '2']);
  assert.equal(tags.items.length, 2);
  const hot = run(['hot', '--limit', '2']);
  assert.equal(hot.length, 2);
  const recommended = run(['recommend', '--limit', '2']);
  assert.ok(recommended.items.length > 0);
  const search = run(['article', 'search', 'TypeScript', '--limit', '2']);
  assert.ok(search.items.length > 0);
  const article = run(['article', 'get', search.items[0].article_id]);
  assert.ok(article.article_info.mark_content.length > 0);
  const columns = run(['column', 'list', '--user', '131597122679661', '--limit', '2']);
  assert.ok(columns.items.length > 0);
  const columnId = columns.items[0].column.column_id;
  const column = run(['column', 'get', columnId]);
  assert.equal(column.column.column_id, columnId);
  const entries = run(['column', 'articles', columnId, '--limit', '2']);
  assert.ok(entries.items.length > 0);
} finally {
  rmSync(home, { recursive: true });
}
