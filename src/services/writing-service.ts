import { JuejinClient } from '../platform/juejin/client.js';
import { ImageUploader, validateImage } from '../platform/juejin/imagex.js';
import { SessionStore } from '../runtime/session.js';
import { OperationJournal } from '../runtime/journal.js';
import { localImagePath } from '../content/markdown.js';
import { CliError } from '../shared/errors.js';
import { DraftService, type DraftOptions } from './draft-service.js';

export interface SaveDraftOptions extends DraftOptions { dryRun?: boolean }
export interface ColumnOptions { title?: string; intro?: string; cover?: string; dryRun?: boolean }
export interface PublishOptions { draft: string; columns?: string[]; dryRun?: boolean }

export class WritingService {
  constructor(
    private readonly client: JuejinClient,
    private readonly uploader: ImageUploader,
    private readonly session: SessionStore,
    private readonly drafts: DraftService,
  ) {}

  async saveDraft(file: string, options: SaveDraftOptions, draftId?: string) {
    if (options.dryRun) {
      const existing = draftId ? await this.client.draft(draftId) : undefined;
      return { ...await this.drafts.prepare(file, options, existing), dry_run: true };
    }
    return this.session.withWriteLock(async () => {
      const existing = draftId ? await this.client.draft(draftId) : undefined;
      const plan = await this.drafts.prepare(file, options, existing);
      const input = await this.drafts.uploadAssets(plan);
      const operation = draftId ? 'draft.update' : 'draft.create';
      return new OperationJournal(this.session.home).run(operation, { draft_id: draftId }, async () => {
        let savedId: string;
        if (draftId) { await this.client.updateDraft(draftId, input); savedId = draftId; }
        else savedId = (await this.client.createDraft(input)).id;
        return { draft_id: savedId, preview_url: `https://juejin.cn/editor/drafts/${savedId}` };
      });
    });
  }

  private async prepareColumn(options: ColumnOptions, columnId?: string) {
    const existing = columnId ? await this.client.column(columnId) : undefined;
    const title = options.title ?? existing?.column_version.title ?? '';
    const content = options.intro ?? existing?.column_version.content ?? '';
    const cover = options.cover ?? existing?.column_version.cover ?? '';
    if (!title.trim() || title.length > 50) throw new CliError('INPUT', '专栏名称必须为 1–50 字。');
    if (!content.trim() || content.length > 150) throw new CliError('INPUT', '专栏简介必须为 1–150 字。');
    const localCover = cover ? localImagePath(cover, process.cwd()) : undefined;
    if (localCover) await validateImage(localCover);
    return { title, content, cover, localCover };
  }

  async saveColumn(options: ColumnOptions, columnId?: string) {
    if (options.dryRun) return { column_id: columnId ?? '0', ...await this.prepareColumn(options, columnId), dry_run: true };
    return this.session.withWriteLock(async () => {
      // Read and merge editable fields under the same lock as the write.
      const { title, content, cover, localCover } = await this.prepareColumn(options, columnId);
      const input = { title, content, cover: localCover ? await this.uploader.upload(localCover) : cover };
      return new OperationJournal(this.session.home).run(columnId ? 'column.update' : 'column.create', { column_id: columnId }, async () => {
        let savedId: string;
        if (columnId) { await this.client.updateColumn(columnId, input); savedId = columnId; }
        else savedId = await this.client.createColumn(input);
        return { column_id: savedId, status: 'submitted', url: `https://juejin.cn/column/${savedId}` };
      });
    });
  }

  async publish(options: PublishOptions) {
    const columnIds = options.columns ?? [];
    if (options.dryRun) {
      const draft = await this.client.draft(options.draft);
      return { draft_id: draft.id, title: draft.title, column_ids: columnIds, dry_run: true };
    }
    return this.session.withWriteLock(async () => {
      await this.client.draft(options.draft);
      return new OperationJournal(this.session.home).run('article.publish', { draft_id: options.draft, column_ids: columnIds }, async () => {
        const published = await this.client.publish(options.draft, columnIds);
        return { article_id: published.article_id, draft_id: options.draft, column_ids: columnIds, status: 'submitted', url: `https://juejin.cn/post/${published.article_id}` };
      });
    });
  }
}
