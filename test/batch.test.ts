import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WritingService } from '../src/services/writing-service.js';
import { DraftService } from '../src/services/draft-service.js';
import { JuejinClient } from '../src/platform/juejin/client.js';
import { JuejinHttp } from '../src/platform/juejin/http.js';
import { ImageUploader } from '../src/platform/juejin/imagex.js';
import { SessionStore } from '../src/runtime/session.js';
import { WriteNotStartedError } from '../src/shared/errors.js';

test('failed account locks can be retried without recreating a saved draft', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'juejin-batch-lock-'));
  const home = join(directory, 'profile');
  let creates = 0, publishes = 0;
  const http = new JuejinHttp({ fetch: async url => {
    if (String(url).endsWith('/article_draft/create')) {
      creates++; return Response.json({ err_no: 0, data: { id: '123' } });
    }
    if (String(url).endsWith('/article_draft/detail')) return Response.json({ err_no: 0, data: { article_draft: { id: '123', title: 'Test title', mark_content: 'A real article about command line publishing.' } } });
    publishes++; return Response.json({ err_no: 0, data: { article_id: '456' } });
  } });
  const client = new JuejinClient(http);
  const uploader = new ImageUploader(http);
  const drafts = new DraftService(client, uploader);
  drafts.prepare = async () => ({ input: { title: 'Test title', brief_content: 'Test brief', category_id: '1', tag_ids: ['2'], cover_image: '', mark_content: 'A real article about command line publishing.' }, directory, localImages: [] });
  const session = new SessionStore(home);
  const service = new WritingService(client, uploader, session, drafts);
  const checkpoint = async () => JSON.parse(await readFile(join(directory, '.juejin-batch.json'), 'utf8'));
  try {
    await writeFile(join(directory, 'article.md'), 'Content');
    // A file in place of the profile directory reproduces a local setup failure.
    await writeFile(home, 'not a directory');
    await assert.rejects(service.publishDirectory(directory, { column: '9' }), error => error instanceof WriteNotStartedError && error.code === 'INPUT');
    assert.deepEqual((await checkpoint()).items, []);
    assert.equal(creates, 0);
    await rm(home);
    await session.withWriteLock(async () => {
      await assert.rejects(service.publishDirectory(directory, { column: '9' }), error => error instanceof WriteNotStartedError && error.code === 'BUSY');
    });
    assert.deepEqual((await checkpoint()).items, []);
    const publish = service.publish.bind(service);
    service.publish = async options => session.withWriteLock(() => publish(options));
    await assert.rejects(service.publishDirectory(directory, { column: '9' }), error => error instanceof WriteNotStartedError);
    assert.equal(creates, 1);
    assert.equal(publishes, 0);
    assert.equal((await checkpoint()).items[0].phase, 'draft');
    assert.equal((await checkpoint()).items[0].draft_id, '123');
    service.publish = publish;
    await service.publishDirectory(directory, { column: '9' });
    assert.equal(creates, 1);
    assert.equal(publishes, 1);
    await service.publishDirectory(directory, { column: '9' });
    assert.equal(publishes, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('batch preflights all files, resumes completed work and refuses unknown writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'juejin-batch-'));
  const http = new JuejinHttp();
  const client = new JuejinClient(http);
  const uploader = new ImageUploader(http);
  const drafts = new DraftService(client, uploader);
  const service = new WritingService(client, uploader, new SessionStore(directory), drafts);
  let invalid = true;
  let writes = 0;
  drafts.prepare = async file => {
    if (invalid && file.endsWith('b.md')) throw new Error('bad input');
    return { input: { title: 'test', brief_content: 'test', category_id: '1', tag_ids: ['2'], cover_image: '', mark_content: 'test' }, directory, localImages: [] };
  };
  service.saveDraft = async () => { writes++; return { draft_id: String(writes), preview_url: '' }; };
  service.publish = async options => { writes++; return { article_id: String(writes), draft_id: options.draft, column_ids: ['9'], status: 'submitted', url: '' }; };
  try {
    await writeFile(join(directory, 'a.md'), 'A');
    await writeFile(join(directory, 'b.md'), 'B');
    await assert.rejects(service.publishDirectory(directory, { column: '9' }), /bad input/);
    assert.equal(writes, 0);
    invalid = false;
    await service.publishDirectory(directory, { column: '9' });
    assert.equal(writes, 4);
    await service.publishDirectory(directory, { column: '9' });
    assert.equal(writes, 4);
    await rm(join(directory, '.juejin-batch.json'));
    service.publish = async () => { writes++; throw new Error('timeout'); };
    await assert.rejects(service.publishDirectory(directory, { column: '9' }), /timeout/);
    const before = writes;
    await assert.rejects(service.publishDirectory(directory, { column: '9' }), /尚未确认/);
    assert.equal(writes, before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
