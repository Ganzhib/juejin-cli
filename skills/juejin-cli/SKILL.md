---
name: juejin-cli
description: 使用 juejin CLI 查询稀土掘金文章、管理 Markdown 草稿和图片、创建或修改专栏，并将已有草稿发布到指定专栏。用户提到掘金、juejin、掘金专栏写作或发布时使用。
---

# 掘金 CLI

需要从原稿整理技术文章、识别适合的文章结构或自动补齐发布配置时，先读 [技术写作与发布指南](references/technical-writing.md)。固定 frontmatter 可复用 [TypeScript 模板](templates/typescript-article.md)，其他主题需查询对应标签，不能直接套用 TypeScript 标签。

通过本机 `juejin` 命令操作掘金。先用 `juejin schema --json` 查看命令树，再用 `juejin schema article publish --json` 等查询目标命令的参数、必填项与枚举。调用时使用 `--json`。成功结果在 stdout 的 `data` 中；失败结果在 stderr 的 `error` 中，并返回非零退出码。

## 读取内容

```bash
juejin article search "TypeScript" --sort newest --limit 10 --json
juejin article get ARTICLE_ID --format markdown
juejin hot --category frontend --limit 10 --json
juejin category list --json
juejin tag search "React" --json
juejin column list --json
juejin column articles COLUMN_ID --json
```

公开读取无需登录；自己的草稿、文章和创作者专栏列表需要会话。需要写入时运行 `juejin auth status --json` 核对账号。未登录则运行 `juejin auth login`，由用户在浏览器完成登录。不要读取、展示或复制 Cookie。

## 从 Markdown 到专栏文章

正文通过文件传入 CLI，不把整篇文章拼入 shell 参数。文件 frontmatter 支持 `title`、`brief`、`category`、`tags`、`cover`；摘要需要 50–100 字，标签支持名称或 ID。本地封面和 Markdown 图片路径相对于文章文件。

```bash
juejin draft create article.md --dry-run --json
juejin draft create article.md --json
juejin draft update DRAFT_ID article.md --json
juejin article publish --draft DRAFT_ID --columns COLUMN_ID --json
```

保存返回的 `draft_id`。后续修改和发布沿用这份草稿，避免重复创建。`--dry-run` 可以调用读取接口验证分类标签，但不会上传图片或写入草稿。正文和封面自动上传，源 Markdown 不会被改写。

按用户请求的范围执行：存草稿的请求止于草稿；用户已明确要求发布并指定了文章与目标时执行发布，不重复索要同一授权。返回 `submitted` 表示接口接受提交，可能仍需审核。

## 专栏

```bash
juejin column create --title "AI 工程实践" --intro "记录工具、方法与实践" --json
juejin column update COLUMN_ID --intro "更新后的简介" --json
juejin column get COLUMN_ID --json
```

专栏标题最多 50 字、简介最多 150 字，`--cover` 支持路径或 URL。专栏新建或修改可能需要审核。发布文章时显式传 `--columns`；重新发布已有文章时也传入需要保留的专栏 ID。ID 始终作为字符串传递。

## 失败与恢复

网络失败不代表写入失败。遇到超时或 HTTP 错误，先运行 `juejin history --json`，再查询已有草稿或专栏，确认远端状态后决定是否重试。不要自动重放写请求。保留错误中的平台 `err_no`，不要把所有业务错误都解释成登录失效。

额外场景和可复制提示词见随包的 [场景示例](references/scenarios.md)。
