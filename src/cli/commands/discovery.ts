import { CliError } from '../../shared/errors.js';
import type { CommandContext } from '../context.js';
import { limit, paging, type Paging } from '../options.js';
import { articleSummary } from '../presentation.js';

export function registerDiscovery(context: CommandContext): void {
  const program = context.program;
  program.command('category').description('分类').command('list').action(async () => context.emit(await (await context.services()).client.categories()));
  const tag = program.command('tag').description('标签');
  paging(tag.command('list')).action(async (options: Paging) => context.emit(await (await context.services()).client.tags(options.cursor, options.limit)));
  tag.command('search <keyword>').description('全量分页后按标签名称搜索').action(async (keyword: string) => context.emit(await (await context.services()).client.findTags(keyword)));
  program.command('hot').description('文章热榜').option('--category <category>', '分类名称、slug 或 ID', 'frontend').option('--limit <number>', '最多条数', limit, 20).action(async (options: { category: string; limit: number }) => {
    const { client } = await context.services();
    const categories = await client.categories();
    const category = categories.find(entry => [entry.category_id, entry.category_name, entry.category_url].includes(options.category));
    if (!category) throw new CliError('INPUT', `找不到分类：${options.category}`);
    context.emit(await client.hot(category.category_id, options.limit));
  });
  paging(program.command('recommend').description('首页推荐文章')).action(async (options: Paging) => {
    const page = await (await context.services()).client.recommend(options.cursor, options.limit);
    context.emit({ ...page, items: page.items.map(articleSummary) });
  });
}
