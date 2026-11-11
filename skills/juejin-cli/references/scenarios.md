# 场景与提示词

## 可复制的文章模板

复制 [TypeScript 文章模板](../templates/typescript-article.md) 为自己的 `article.md`，替换标题、摘要和正文。摘要保持 50–100 字。模板使用已验证的 TypeScript 标签 ID（按字符串保存），省去标签名称分页查找；其他主题请先用 `juejin tag search` 查询相应标签。分类仍会验证。

只存草稿：

```bash
juejin auth status --json
juejin draft create ./article.md --dry-run --json
juejin draft create ./article.md --json
```

保存返回的 `draft_id`。之后修改同一篇文章时使用 `draft update`；只有实际要求公开发布时执行最后的发布命令。将下面的 ID 占位符替换为实际返回值：

```bash
juejin draft update DRAFT_ID ./article.md --json
juejin article publish --draft DRAFT_ID --columns COLUMN_ID --dry-run --json
juejin article publish --draft DRAFT_ID --columns COLUMN_ID --json
```

`submitted` 表示平台接受提交，审核或索引期间详情可能不可见。写入失败后运行 `juejin history --json` 核对回执，保留已有 ID，再决定是否重试。

## 保存现有文章

使用 juejin-cli，将 ./article.md 保存为掘金草稿。先核对登录账号，检查 frontmatter、分类、标签和本地图片；缺少必要信息时告诉我具体缺什么。创建成功后返回 draft_id 和预览链接，暂不发布。

## 写入已有专栏

使用 juejin-cli，将 ./article.md 发布到我指定的掘金专栏。先列出我的专栏供我选择，复用已有草稿 ID（如有），检查摘要与图片。确定目标后发布，返回文章 ID、链接和提交状态。不要把接口接受提交当成已经审核通过。

## 修改已有草稿

使用 juejin-cli，读取我给出的草稿 ID，把 ./article.md 的内容更新到同一份草稿，保留未指定的元数据。先展示 dry-run 结果，保存后返回同一个草稿 ID 和预览链接，暂不发布。

## 从热点到选题

使用 juejin-cli，查询掘金前端热榜和最近的 TypeScript 文章，整理 5 个适合技术博客的选题，给出对应来源链接和写作角度。只做查询和选题，不创建草稿或发布。
