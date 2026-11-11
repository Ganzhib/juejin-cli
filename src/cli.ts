#!/usr/bin/env node
import { Command, CommanderError, InvalidArgumentError, Option } from 'commander';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { JuejinClient, type Article, type Draft } from './client.js';
import { DraftService, type DraftOptions } from './drafts.js';
import { CliError, exitCode } from './errors.js';
import { JuejinHttp } from './http.js';
import { ImageUploader, validateImage } from './imagex.js';
import { OperationJournal } from './journal.js';
import { localImagePath } from './markdown.js';
import { SessionStore, cookieHeader, defaultHome, login, parseCookies, verifySession } from './session.js';
import { autoInstallSkill, installSkill, skillDirectory, skillStatus, type SkillAgent } from './skills.js';
import { VERSION } from './package.js';
import { installBrowser } from './browser.js';

interface Globals { json?: boolean; home: string }
interface Paging { limit: number; cursor: string; page: number }
interface DraftCommandOptions extends DraftOptions { dryRun?: boolean }

const program = new Command();
program.name('juejin').description('稀土掘金 CLI：文章、草稿、图片与专栏').version(VERSION)
  .option('--json', '输出单行 JSON，错误也使用 JSON')
  .option('--home <directory>', '会话与操作记录目录', defaultHome())
  .showHelpAfterError().exitOverride();
program.configureOutput({ writeErr: text => { if (!process.argv.includes('--json')) process.stderr.write(text); } });

function emit(value: unknown): void {
  const globals = program.opts<Globals>();
  process.stdout.write(JSON.stringify({ ok: true, data: value }, null, globals.json ? undefined : 2) + '\n');
}

function positiveInteger(value: string): number {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1) throw new InvalidArgumentError('必须为正整数。');
  return number;
}

function limit(value: string): number {
  const number = positiveInteger(value);
  if (number > 100) throw new InvalidArgumentError('每页最多 100 条。');
  return number;
}

function id(value: string): string {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError('ID 必须是数字字符串。');
  return value;
}

function commaSeparated(value: string): string[] {
  const values = value.split(',').map(value => value.trim());
  if (values.some(value => value.length === 0)) throw new InvalidArgumentError('列表不能包含空项。');
  return [...new Set(values)];
}

function paging(command: Command): Command {
  return command.option('--limit <number>', '每页条数（1–100）', limit, 20)
    .option('--cursor <cursor>', '服务端分页游标', '0').option('--page <number>', '页码', positiveInteger, 1);
}

function draftOptions(command: Command): Command {
  return command.option('--title <title>', '文章标题').option('--brief <brief>', '50–100 字摘要')
    .option('--category <category>', '分类名称、slug 或 ID').option('--tags <tags>', '逗号分隔的标签名称或 ID', commaSeparated)
    .option('--cover <path-or-url>', '封面图片路径或 URL').option('--dry-run', '解析并验证输入，只调用读取接口，不上传或写入草稿');
}

function store(): SessionStore { return new SessionStore(resolve(program.opts<Globals>().home)); }

async function context(authenticated = false) {
  const session = store();
  const cookies = authenticated ? await session.load() : [];
  const http = new JuejinHttp({ cookie: cookieHeader(cookies) });
  const client = new JuejinClient(http);
  const uploader = new ImageUploader(http);
  return { session, client, uploader, drafts: new DraftService(client, uploader) };
}

function articleSummary(article: Article) {
  const info = article.article_info;
  return {
    article_id: info.article_id, title: info.title, brief: info.brief_content,
    author: article.author_user_info.user_name, views: info.view_count,
    likes: info.digg_count, comments: info.comment_count, url: `https://juejin.cn/post/${info.article_id}`,
  };
}

const auth = program.command('auth').description('管理本地登录会话');
auth.command('setup').description('安装当前 CLI 版本使用的 Chromium').action(async () => {
  await installBrowser(!program.opts<Globals>().json);
  emit({ browser: 'chromium', installed: true });
});
auth.command('login').description('打开浏览器登录（先运行 juejin auth setup）').action(async () => {
  const session = store();
  emit(await session.withWriteLock(() => login(session)));
});
auth.command('status').description('向掘金验证当前会话').action(async () => {
  emit(await verifySession(await store().load()));
});
auth.command('import').description('导入 Playwright Cookie/StorageState JSON 并验证').requiredOption('--file <path>', '会话文件').action(async (options: { file: string }) => {
  const session = store();
  emit(await session.withWriteLock(async () => {
    const cookies = parseCookies(await readFile(options.file, 'utf8'));
    const profile = await verifySession(cookies);
    await session.save(cookies);
    return profile;
  }));
});
auth.command('logout').description('删除本地会话').action(async () => {
  const session = store();
  await session.withWriteLock(() => session.clear());
  emit({ logged_out: true });
});

program.command('category').description('分类').command('list').action(async () => emit(await (await context()).client.categories()));
const tag = program.command('tag').description('标签');
paging(tag.command('list')).action(async (options: Paging) => emit(await (await context()).client.tags(options.cursor, options.limit)));
tag.command('search <keyword>').description('全量分页后按标签名称搜索').action(async (keyword: string) => emit(await (await context()).client.findTags(keyword)));

program.command('hot').description('文章热榜').option('--category <category>', '分类名称、slug 或 ID', 'frontend').option('--limit <number>', '最多条数', limit, 20).action(async (options: { category: string; limit: number }) => {
  const { client } = await context();
  const categories = await client.categories();
  const category = categories.find(entry => [entry.category_id, entry.category_name, entry.category_url].includes(options.category));
  if (!category) throw new CliError('INPUT', `找不到分类：${options.category}`);
  emit(await client.hot(category.category_id, options.limit));
});
paging(program.command('recommend').description('首页推荐文章')).action(async (options: Paging) => {
  const page = await (await context()).client.recommend(options.cursor, options.limit);
  emit({ ...page, items: page.items.map(articleSummary) });
});

const article = program.command('article').description('查询与发布文章');
paging(article.command('search <keyword>')).addOption(new Option('--sort <sort>', '排序方式').choices(['relevance', 'newest', 'hottest']).default('relevance')).action(async (keyword: string, options: Paging & { sort: string }) => {
  const sort = ['relevance', 'newest', 'hottest'].indexOf(options.sort);
  const page = await (await context()).client.search(keyword, options.cursor, options.limit, sort);
  emit({ ...page, items: page.items.map(articleSummary) });
});
article.command('get <id>').addOption(new Option('--format <format>').choices(['json', 'markdown']).default('json')).action(async (articleId: string, options: { format: string }) => {
  const result = await (await context()).client.article(id(articleId));
  if (options.format === 'markdown' && !program.opts<Globals>().json) process.stdout.write(result.article_info.mark_content + '\n');
  else emit(result);
});
paging(article.command('list').description('当前用户的文章')).action(async (options: Paging) => {
  const page = await (await context(true)).client.articles(options.page, options.limit);
  emit({ ...page, items: page.items.map(articleSummary) });
});
article.command('publish').description('发布已有草稿，提交后仍可能需要审核')
  .requiredOption('--draft <id>', '已有草稿 ID', id)
  .option('--columns <ids>', '逗号分隔的专栏 ID', commaSeparated)
  .option('--dry-run', '读取草稿并展示发布目标，不提交')
  .action(async (options: { draft: string; columns?: string[]; dryRun?: boolean }) => {
    const { client, session } = await context(true);
    const columnIds = (options.columns ?? []).map(id);
    const draft = await client.draft(options.draft);
    if (options.dryRun) { emit({ draft_id: draft.id, title: draft.title, column_ids: columnIds, dry_run: true }); return; }
    emit(await session.withWriteLock(() => new OperationJournal(session.home).run('article.publish', { draft_id: options.draft, column_ids: columnIds }, async () => {
      const published = await client.publish(options.draft, columnIds);
      return { article_id: published.article_id, draft_id: options.draft, column_ids: columnIds, status: 'submitted', url: `https://juejin.cn/post/${published.article_id}` };
    })));
  });

const draft = program.command('draft').description('草稿管理');
paging(draft.command('list')).action(async (options: Paging) => emit(await (await context(true)).client.drafts(options.page, options.limit)));
draft.command('get <id>').action(async (draftId: string) => emit(await (await context(true)).client.draft(id(draftId))));

async function saveDraft(file: string, options: DraftCommandOptions, draftId?: string): Promise<void> {
  const { client, session, drafts } = await context(!options.dryRun || !!draftId);
  async function prepare(existing?: Draft) { return drafts.prepare(file, options, existing); }
  if (options.dryRun) {
    const existing = draftId ? await client.draft(draftId) : undefined;
    emit({ ...await prepare(existing), dry_run: true });
    return;
  }
  emit(await session.withWriteLock(async () => {
    const existing = draftId ? await client.draft(draftId) : undefined;
    const plan = await prepare(existing);
    const input = await drafts.uploadAssets(plan);
    const operation = draftId ? 'draft.update' : 'draft.create';
    return new OperationJournal(session.home).run(operation, { draft_id: draftId }, async () => {
      let savedId: string;
      if (draftId) { await client.updateDraft(draftId, input); savedId = draftId; }
      else savedId = (await client.createDraft(input)).id;
      return { draft_id: savedId, preview_url: `https://juejin.cn/editor/drafts/${savedId}` };
    });
  }));
}
draftOptions(draft.command('create <file>')).action(async (file: string, options: DraftCommandOptions) => saveDraft(file, options));
draftOptions(draft.command('update <id> <file>')).action(async (draftId: string, file: string, options: DraftCommandOptions) => saveDraft(file, options, id(draftId)));

program.command('image').description('上传图片').command('upload <file>').action(async (file: string) => {
  const { uploader, session } = await context(true);
  emit(await session.withWriteLock(async () => ({ url: await uploader.upload(resolve(file)) })));
});

const column = program.command('column').description('专栏查询、新建、修改与文章列表');
paging(column.command('list')).option('--user <id>', '查询指定用户的公开专栏；省略则查询自己的创作者列表', id).action(async (options: Paging & { user?: string }) => {
  const { client } = await context(!options.user);
  if (options.user) emit(await client.userColumns(options.user, options.cursor, options.limit));
  else emit(await client.columns(options.page, options.limit));
});
column.command('get <id>').action(async (columnId: string) => emit(await (await context()).client.column(id(columnId))));
paging(column.command('articles <id>')).action(async (columnId: string, options: Paging) => {
  const page = await (await context()).client.columnArticles(id(columnId), options.cursor, options.limit);
  emit({ ...page, items: page.items.map(articleSummary) });
});

interface ColumnOptions { title?: string; intro?: string; cover?: string; dryRun?: boolean }
function columnOptions(command: Command): Command {
  return command.option('--title <title>', '专栏名称（1–50 字）')
    .option('--intro <intro>', '专栏简介（1–150 字）').option('--cover <path-or-url>', '封面图片路径或 URL')
    .option('--dry-run', '验证并展示提交内容，不上传或提交');
}
async function saveColumn(options: ColumnOptions, columnId?: string): Promise<void> {
  const { client, session, uploader } = await context(!options.dryRun || !!columnId);
  async function prepare() {
    const existing = columnId ? await client.column(columnId) : undefined;
    const title = options.title ?? existing?.column_version.title ?? '';
    const content = options.intro ?? existing?.column_version.content ?? '';
    const cover = options.cover ?? existing?.column_version.cover ?? '';
    if (!title.trim() || title.length > 50) throw new CliError('INPUT', '专栏名称必须为 1–50 字。');
    if (!content.trim() || content.length > 150) throw new CliError('INPUT', '专栏简介必须为 1–150 字。');
    const localCover = cover ? localImagePath(cover, process.cwd()) : undefined;
    if (localCover) await validateImage(localCover);
    return { title, content, cover, localCover };
  }
  if (options.dryRun) { emit({ column_id: columnId ?? '0', ...await prepare(), dry_run: true }); return; }
  emit(await session.withWriteLock(async () => {
    // Read and merge editable fields while holding the same lock as the write.
    const { title, content, cover, localCover } = await prepare();
    const input = { title, content, cover: localCover ? await uploader.upload(localCover) : cover };
    return new OperationJournal(session.home).run(columnId ? 'column.update' : 'column.create', { column_id: columnId }, async () => {
      let savedId: string;
      if (columnId) { await client.updateColumn(columnId, input); savedId = columnId; }
      else savedId = await client.createColumn(input);
      return { column_id: savedId, status: 'submitted', url: `https://juejin.cn/column/${savedId}` };
    });
  }));
}
columnOptions(column.command('create')).action(async (options: ColumnOptions) => saveColumn(options));
columnOptions(column.command('update <id>')).action(async (columnId: string, options: ColumnOptions) => saveColumn(options, id(columnId)));

program.command('history').description('本地写操作回执（含结果未知的操作）').option('--limit <number>', '最近记录条数', limit, 20).action(async (options: { limit: number }) => {
  let content: string;
  try { content = await readFile(join(store().home, 'operations.jsonl'), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    emit([]); return;
  }
  emit(content.trim().split('\n').filter(Boolean).slice(-options.limit).map(line => JSON.parse(line)));
});

const skill = program.command('skill').description('安装随 CLI 分发的 Agent Skill');
function skillOptions(command: Command): Command {
  return command.addOption(new Option('--agent <agent>', 'shared 适用于 Codex/Cursor，claude 用于 Claude Code').choices(['shared', 'claude', 'cursor']).default('shared'))
    .option('--dir <directory>', '自定义 skills 根目录');
}
function skillTarget(options: { agent: SkillAgent; dir?: string }): string {
  return options.dir ? join(resolve(options.dir), 'juejin-cli') : skillDirectory(options.agent);
}
skillOptions(skill.command('install')).action(async (options: { agent: SkillAgent; dir?: string }) => emit(await installSkill(skillTarget(options))));
skillOptions(skill.command('status')).action(async (options: { agent: SkillAgent; dir?: string }) => emit(await skillStatus(skillTarget(options))));

try {
  // Also works with npx and --ignore-scripts installs; never pollute JSON diagnostics.
  if (!process.argv.includes('skill')) await autoInstallSkill({ quiet: process.argv.includes('--json') });
  await program.parseAsync();
} catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0) process.exitCode = 0;
  else {
    let failure: CliError;
    if (error instanceof CliError) failure = error;
    else if (error instanceof CommanderError) failure = new CliError('INPUT', error.message);
    else if (error instanceof Error) failure = new CliError('INTERNAL', error.message);
    else failure = new CliError('INTERNAL', String(error));
    const json = process.argv.includes('--json');
    if (json) process.stderr.write(JSON.stringify({ ok: false, error: { code: failure.code, message: failure.message, details: failure.details } }) + '\n');
    else process.stderr.write(`${failure.code}: ${failure.message}\n`);
    process.exitCode = exitCode(failure);
  }
}
