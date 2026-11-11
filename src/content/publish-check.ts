import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Nodes } from 'mdast';
import { CliError } from '../shared/errors.js';

// Local quality checks, not a prediction or replacement of platform moderation.
export function validatePublishContent(title: string, markdown: string): void {
  const text: string[] = [];
  function walk(node: Nodes): void {
    if (['code', 'inlineCode', 'heading', 'html'].includes(node.type)) return;
    if (node.type === 'text') text.push(node.value);
    if ('children' in node) node.children.forEach(walk);
  }
  walk(fromMarkdown(markdown));
  const prose = text.join(' ').trim();
  if (!prose) throw new CliError('INPUT', '正文缺少说明文字，请补充完整内容后发布；草稿仍可保存。');
  if (prose.includes('\uFFFD')) throw new CliError('INPUT', '正文存在 Unicode 替换字符，请检查文件编码或补全损坏文字。');
  if (/^CLI 自动化验收/.test(title) && prose.length < 300) throw new CliError('INPUT', '检测到内部验收占位文章，请仅保存草稿，正式发布应使用完整技术文章。');
  if (text.some(value => /^(文章正文。|请替换为你的实现步骤与代码。|请说明你遇到的问题、目标和使用环境。)$/.test(value.trim()))) throw new CliError('INPUT', '正文仍包含模板占位文字，请填写实际内容后发布。');
}
