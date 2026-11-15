import type { SaveDraftOptions } from '../../services/writing-service.js';
import type { CommandContext } from '../context.js';
import { draftOptions, id, paging, type Paging } from '../options.js';

export function registerDraft(context: CommandContext): void {
  const draft = context.program.command('draft').description('草稿管理');
  paging(draft.command('list').description('列出当前账号的草稿')).action(async (options: Paging) => context.emit(await (await context.services(true)).client.drafts(options.page, options.limit)));
  draft.command('get <id>').description('读取已有草稿及其元数据').action(async (draftId: string) => context.emit(await (await context.services(true)).client.draft(id(draftId))));
  draftOptions(draft.command('create <file>').description('从本地 Markdown 创建草稿，不发布文章')).action(async (file: string, options: SaveDraftOptions) => {
    const { writing } = await context.services(!options.dryRun);
    context.emit(await writing.saveDraft(file, options));
  });
  draftOptions(draft.command('update <id> <file>').description('用本地 Markdown 更新已有草稿，省略的元数据沿用原值')).action(async (draftId: string, file: string, options: SaveDraftOptions) => {
    const { writing } = await context.services(true);
    context.emit(await writing.saveDraft(file, options, id(draftId)));
  });
}
