import { Option } from 'commander';
import type { PublishOptions } from '../../services/writing-service.js';
import type { CommandContext } from '../context.js';
import { commaSeparated, id, paging, type Paging } from '../options.js';
import { articleSummary } from '../presentation.js';

export function registerArticle(context: CommandContext): void {
  const article = context.program.command('article').description('查询与发布文章');
  paging(article.command('search <keyword>')).addOption(new Option('--sort <sort>', '排序方式').choices(['relevance', 'newest', 'hottest']).default('relevance')).action(async (keyword: string, options: Paging & { sort: string }) => {
    const sort = ['relevance', 'newest', 'hottest'].indexOf(options.sort);
    const page = await (await context.services()).client.search(keyword, options.cursor, options.limit, sort);
    context.emit({ ...page, items: page.items.map(articleSummary) });
  });
  article.command('get <id>').addOption(new Option('--format <format>').choices(['json', 'markdown']).default('json')).action(async (articleId: string, options: { format: string }) => {
    const result = await (await context.services()).client.article(id(articleId));
    if (options.format === 'markdown' && !context.globals().json) context.output.text(result.article_info.mark_content + '\n');
    else context.emit(result);
  });
  paging(article.command('list').description('当前用户的文章')).action(async (options: Paging) => {
    const page = await (await context.services(true)).client.articles(options.page, options.limit);
    context.emit({ ...page, items: page.items.map(articleSummary) });
  });
  article.command('publish').description('发布已有草稿，提交后仍可能需要审核')
    .requiredOption('--draft <id>', '已有草稿 ID', id)
    .option('--columns <ids>', '逗号分隔的专栏 ID', commaSeparated)
    .option('--dry-run', '读取草稿并展示发布目标，不提交')
    .action(async (options: PublishOptions) => {
      const columns = (options.columns ?? []).map(id);
      context.emit(await (await context.services(true)).writing.publish({ ...options, columns }));
    });
}
