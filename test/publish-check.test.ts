import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePublishContent } from '../src/content/publish-check.js';

test('publish rejects placeholder, empty prose and damaged text while permitting multilingual technical content', () => {
  assert.throws(() => validatePublishContent('CLI 自动化验收记录', '# 标题\n\n此文章用于真实流程验收。'), /占位/);
  assert.throws(() => validatePublishContent('标题', '# 标题\n\n![image](x.png)'), /说明文字/);
  assert.throws(() => validatePublishContent('标题', '坏\uFFFD文字'), /编码/);
  assert.throws(() => validatePublishContent('标题', '请替换为你的实现步骤与代码。'), /占位/);
  assert.doesNotThrow(() => validatePublishContent('Unicode 实践', 'TypeScript、中文、English、日本語可共同出现在技术文中。\n\n```js\nconst replacement = "�";\n```'));
});
