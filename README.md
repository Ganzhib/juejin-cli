# juejin-cli

面向开发者与 AI Agent 的稀土掘金 CLI。用本地 Markdown 管理文章，支持登录、搜索、图片上传、草稿、专栏和发布。TypeScript SDK 与 CLI 共用同一套实现。

## 安装

需要 Node.js **22.16+**。目前为源码版本，尚未发布到 npm。

```bash
git clone https://github.com/Ganzhib/juejin-cli.git
cd juejin-cli
npm ci
npm link
juejin --help
```

`npm ci` 会自动编译 TypeScript。也可以在项目目录使用 `node dist/cli.js`，无需全局链接。

首次浏览器登录前安装 Chromium：

```bash
npx playwright install chromium
juejin auth login
juejin auth status --json
```

登录会打开独立的浏览器窗口，等待人工登录，验证成功后保存会话。默认目录为 `~/.config/juejin-cli/`；可用 `JUEJIN_HOME` 或全局 `--home <directory>` 指定。会话文件以 `0600` 权限保存（POSIX）。

已有 Playwright cookies 数组或 storageState JSON 时，也可以导入：

```bash
juejin auth import --file /path/to/storage-state.json
juejin auth logout
```

## 发布到专栏

先创建专栏或查看已有专栏，再创建文章草稿，最后把已有草稿发布到指定专栏：

```bash
# 新建专栏，可先 --dry-run 检查；封面既支持本地路径，也支持 URL
juejin column create --title "AI 工程实践" --intro "记录 AI 工具与工程化实践" --cover ./cover.png --json

# 列出自己的专栏，包含审核状态；取得 column.column_id
juejin column list --json

# 从本地 Markdown 创建草稿，取得 draft_id
juejin draft create ./examples/article.md --json

# 修改同一份草稿，省略的元数据沿用已有值
juejin draft update <draft-id> ./examples/article.md --json

# 发布已有草稿，并传入专栏 ID。多个 ID 使用逗号分隔
juejin article publish --draft <draft-id> --columns <column-id> --json
```

专栏新建或修改后可能需要审核。发布返回 `status: "submitted"` 表示接口接受提交，文章实际展示情况需通过网页或查询接口核对。

`article publish` 不传 `--columns` 时提交空的 `column_ids`，表示本次不指定专栏。重新发布已有文章时，如需保留其专栏归属，请显式传入原专栏 ID。

专栏的其他命令：

```bash
juejin column get <column-id> --json
juejin column articles <column-id> --limit 20 --cursor 0 --json
juejin column update <column-id> --intro "更新后的简介" --json
juejin column update <column-id> --cover ./new-cover.png --json
juejin column list --user <user-id> --limit 20 --json
```

## Markdown 格式

```markdown
---
title: 我的技术文章
brief: 这里填写五十到一百字的文章摘要，介绍文章要解决的问题、主要实现方法与读者能获得的结果。CLI 会检查摘要长度，并在上传图片或创建草稿之前报告输入问题。
category: 前端
tags:
  - 前端
  - TypeScript
cover: ./images/cover.png
---

# 我的技术文章

正文。

![架构图](./images/architecture.png)
```

- 参数优先级：CLI 参数 → frontmatter → 已有草稿值；新文章缺少标题时从首个一级标题提取。
- 分类支持名称、slug 或 ID；标签支持精确名称或 ID。名称查询会遍历标签接口的服务端分页。
- 摘要使用 50–100 字的输入约束；不会自动改写标题、摘要和正文。
- 本地正文图片和封面在写草稿前上传至掘金 ImageX，图片路径相对于 Markdown 文件。所有本地文件先验证，再开始上传。单张图片上限 5 MiB。
- 支持 Markdown 行内图片和引用式图片。通过语法树定位改写，代码示例和普通文本中的同名路径保持原样。同一文件在一次草稿操作内只上传一次。
- 原始 Markdown 文件不被改写；HTTP(S) 图片 URL 原样保留。HTML `<img>` 不属于本地图片自动上传范围。

创建或更新前可用 `--dry-run` 查看解析后的提交内容和本地图片路径。它会调用分类、标签等读取接口，但不会上传图片、创建草稿或发布。

```bash
juejin draft create ./examples/article.md --dry-run --json
juejin image upload ./images/cover.png --json
```

## 查询命令

```bash
juejin category list --json
juejin tag list --limit 20 --cursor 0 --json
juejin tag search "React" --json
juejin hot --category frontend --limit 10 --json
juejin recommend --limit 10 --cursor 0 --json
juejin article search "TypeScript" --sort newest --limit 10 --json
juejin article get <article-id> --format markdown
juejin article list --page 1 --limit 20 --json
juejin draft list --page 1 --limit 20 --json
juejin draft get <draft-id> --json
```

公开文章、热榜、分类标签和公开专栏查询无需登录。自己的文章、草稿、创作者专栏列表及所有写操作需要登录。

## AI 调用与错误处理

所有命令支持全局 `--json`：成功时 stdout 输出一行 `{"ok":true,"data":...}`；失败时 stderr 输出一行 `{"ok":false,"error":{"code":...,"message":...,"details":...}}`，同时返回非零退出码。默认模式使用缩进 JSON；`article get --format markdown` 在未启用 `--json` 时直接输出正文。

| 退出码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 本地运行错误 |
| 2 | 参数或文件内容错误 |
| 3 | 缺少有效本地会话 |
| 4 | 平台业务错误、HTTP 错误或协议变化 |
| 5 | 网络请求未完成，写操作结果可能未知 |
| 6 | 同一会话目录已有写操作进行中 |

网络和 HTTP 请求**不自动重试**。创建草稿、发布、创建/修改专栏前后，会在会话目录的 `operations.jsonl` 追加操作回执，记录 ID 与阶段。超时或失败时先查询回执及远端状态，再决定是否重试。

```bash
juejin history --limit 20 --json
```

写操作共用本地排他锁；如果进程被强制杀死，确认原进程退出后可手动删除会话目录中的 `write.lock`。该锁只协调使用同一目录的 CLI 进程，网页编辑与其他设备仍需由使用者协调。

SDK 用法见 [AI 与 SDK 使用说明](docs/AI_USAGE.md)。首版交付 CLI 和 SDK，MCP 服务尚未实现。

## 开发与验证

```bash
npm ci
npm run check
npm test
npm run build
npm run smoke
npm pack --dry-run
```

离线测试覆盖协议字段、19 位 ID 精度、写请求不重试、会话权限、并发锁、操作回执、图片上传链路、Markdown 改写和 JSON 输出。`smoke` 额外访问公开接口，不使用登录凭据，也不执行远程写操作。

GitHub Actions 在 Node 22 和 24 上运行类型检查、离线测试与打包检查。登录、真实图片上传、创建草稿、创建/修改专栏和发布需要在自己的账号上进一步验证；离线测试通过不等于这些写入已实测成功。接口依据与验证状态见 [API 记录](docs/API.md)。

## 实现与许可

`src/http.ts` 负责请求及错误边界；`src/client.ts` 封装掘金协议；`src/session.ts` 管理登录和写锁；`src/markdown.ts` 与 `src/drafts.ts` 处理文档及上传计划；`src/imagex.ts` 处理图片上传；`src/cli.ts` 负责命令参数与输出。

本项目使用社区整理及掘金网页当前使用的非官方接口，接口可能变化。会话文件等同账号凭据，请保存在本机，不放入仓库或 AI 对话。

MIT。ImageX 上传与签名参考了 `liuleihang/juejin-skills`，保留其许可及附加声明，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
