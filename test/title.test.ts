import { test } from 'node:test';
import assert from 'node:assert/strict';
import { omitRepeatedTitle } from '../src/content/markdown.js';

test('removes only the leading H1 matching the platform title and preserves source formatting', () => {
  assert.equal(omitRepeatedTitle('# CLI **设计**\n\n正文\n\n## 分节\n', 'CLI 设计'), '正文\n\n## 分节\n');
  assert.equal(omitRepeatedTitle('CLI 设计\n===\n\n正文', 'CLI 设计'), '正文');
  for (const content of ['# 其他标题\n正文', '## CLI 设计\n正文', '开场\n\n# CLI 设计', '```md\n# CLI 设计\n```']) {
    assert.equal(omitRepeatedTitle(content, 'CLI 设计'), content);
  }
});
