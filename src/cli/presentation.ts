import type { Article } from '../platform/juejin/types.js';

export function articleSummary(article: Article) {
  const info = article.article_info;
  return {
    article_id: info.article_id, title: info.title, brief: info.brief_content,
    author: article.author_user_info.user_name, views: info.view_count,
    likes: info.digg_count, comments: info.comment_count, url: `https://juejin.cn/post/${info.article_id}`,
  };
}
