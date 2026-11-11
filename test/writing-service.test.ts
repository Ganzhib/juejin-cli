import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JuejinClient } from '../src/platform/juejin/client.js';
import { JuejinHttp } from '../src/platform/juejin/http.js';
import { ImageUploader } from '../src/platform/juejin/imagex.js';
import { SessionStore } from '../src/runtime/session.js';
import { DraftService } from '../src/services/draft-service.js';
import { WritingService } from '../src/services/writing-service.js';
import { CliError } from '../src/shared/errors.js';

function writing(home: string, fetch: typeof globalThis.fetch) {
  const http = new JuejinHttp({ fetch });
  const client = new JuejinClient(http);
  const uploader = new ImageUploader(http);
  return new WritingService(client, uploader, new SessionStore(home), new DraftService(client, uploader));
}

test('column updates merge editable metadata under the write lock and preserve the ID', async () => {
  const home = await mkdtemp(join(tmpdir(), 'juejin-writing-'));
  const requests: unknown[] = [];
  try {
    const service = writing(home, async (_url, init) => {
      await readFile(join(home, 'write.lock')); // Both read and write run under the same account lock.
      if (!init?.body) return Response.json({ err_no: 0, data: { column_version: { title: '旧标题', content: '保留简介', cover: 'https://example.com/cover.png' } } });
      requests.push(JSON.parse(init.body as string));
      return Response.json({ err_no: 0, data: null });
    });
    const result = await service.saveColumn({ title: '新标题' }, '123');
    assert.equal(result.column_id, '123');
    assert.deepEqual(requests, [{ column_id: '123', title: '新标题', content: '保留简介', cover: 'https://example.com/cover.png' }]);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('publish dry run only reads; a failed publish retains target IDs without replay', async () => {
  const home = await mkdtemp(join(tmpdir(), 'juejin-writing-'));
  let publishes = 0;
  try {
    const service = writing(home, async url => {
      if (String(url).endsWith('/article_draft/detail')) return Response.json({ err_no: 0, data: { article_draft: { id: '123', title: '待发布文章' } } });
      publishes++;
      throw new TypeError('socket closed');
    });
    assert.deepEqual(await service.publish({ draft: '123', columns: ['456'], dryRun: true }), { draft_id: '123', title: '待发布文章', column_ids: ['456'], dry_run: true });
    assert.equal(publishes, 0);
    await assert.rejects(() => readFile(join(home, 'operations.jsonl')), { code: 'ENOENT' });
    await assert.rejects(() => service.publish({ draft: '123', columns: ['456'] }), (error: CliError) => {
      assert.equal(error.code, 'NETWORK');
      assert.equal(error.details?.draft_id, '123');
      assert.deepEqual(error.details?.column_ids, ['456']);
      return true;
    });
    assert.equal(publishes, 1);
    const receipts = (await readFile(join(home, 'operations.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(receipts.map(receipt => receipt.phase), ['started', 'failed_or_unknown']);
  } finally { await rm(home, { recursive: true, force: true }); }
});
