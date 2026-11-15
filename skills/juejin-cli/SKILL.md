---
name: juejin-cli
description: 使用 juejin CLI 查询稀土掘金文章、管理 Markdown 草稿和图片、创建或修改专栏，将已有草稿发布到指定专栏，以及管理签到、抽奖和每日签到定时任务。用户提到掘金、juejin、掘金专栏写作或发布时使用。
---

# 掘金 CLI

这是掘金工作流的唯一入口。只加载当前任务需要的资料：

| 当前任务 | 按需读取 |
| --- | --- |
| 查询、草稿、专栏、发布与恢复 | 本入口及目标命令的 `schema` |
| 整理技术文章、补齐发布配置或批量发布 | [技术写作与发布指南](references/technical-writing.md)、[写作原则](references/editorial-principles.md) |
| 创建文章文件 | [空白元数据骨架](templates/article.md)，按内容组织正文 |
| 架构图或流程图 | [绘图指南](assets/drawio/GUIDE.md)，只读对应任务的参考文件 |
| 具体场景与提示词 | [场景示例](references/scenarios.md) |

绘图工具随本入口安装，无需发现或安装第二个 Skill。在 `assets/drawio/` 下运行指南中的命令，或使用脚本绝对路径。保留 `.drawio` 图源，导出 PNG 并检查后上传。脚本需要 Python 3，原生图片导出需要 draw.io Desktop。

## 发现与调用

通过本机 `juejin` 操作掘金。目标命令已知时直接查询 `juejin schema article publish --json`；未知时先用 `juejin schema --depth 1 --json` 查看入口，再逐级查询。不要每次加载完整命令树。元数据来自实际命令定义，以当前版本为准。

未安装 Skill 时，用 `juejin skill show --json` 读取本入口，按返回的 `directory` 解析相对资源路径。调用业务命令时使用 `--json`，先检查退出码，再解析对应流：成功为 stdout 的 `{ok:true,data:...}`；失败为 stderr 的 `{ok:false,error:{code,message,details?}}`。人类帮助与版本查询使用 `--help`、`--version`，不要将其当作 JSON 数据接口。

用参数数组启动进程；正文走文件，ID 始终作为字符串。需要固定执行版本时设置 `JUEJIN_AUTO_UPDATE=0`。无需安装 Skill 时可设置 `JUEJIN_AUTO_INSTALL_SKILL=0`。

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

## 签到、抽奖与定时任务

```bash
juejin checkin status --json
juejin checkin run --json
juejin checkin stats --json
juejin checkin calendar --previous-month --json
juejin checkin balance --json
juejin checkin cards --json
juejin checkin supplement YYYY-MM-DD --dry-run --json
juejin checkin schedule enable --at 09:00 --name daily --json
juejin checkin schedule status --name daily --json
juejin checkin schedule disable --name daily --json
juejin lottery status --json
juejin lottery draw --dry-run --json
juejin lottery draw --count 1 --allow-spend --json
juejin lottery history --page 1 --json
juejin lottery lucky --json
juejin lottery dip HISTORY_ID --json
juejin lottery lucky-draw --dry-run --json
```

需要先完成 `auth setup` 与登录。受保护请求在后台官网页面执行，平台要求人工验证时重新登录，不绕过验证。问“签到了吗”只查询；要求签到才执行 `run`，返回 `already_checked_in` 表示跳过。

定时任务是可选的。用户明确要求创建每日任务后，使用给定的电脑本地时间和任务名；缺少时间时再询问。同一会话目录下同名任务更新而不重复创建。安装后核对系统 status，告知本地时区、执行日志路径和电脑联网/用户环境要求；关闭时调用 disable。任务只运行签到，不抽奖、不补签。

补签需要具体日期，只接受北京时间最近 30 天且不含今天。单抽可能在免费次数被另一端消费后扣矿石，所以实际抽奖需显式 `--allow-spend`；不要自动补上该选项。十连抽、沾喜气、幸运抽奖分别按用户授权执行。规则与费用以平台当前返回为准，`checkin rules` 和 `lottery rules` 可查询。失败先查本地 history、今日状态或平台中奖历史，不自动重放。

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

图片错误若返回 `upload_status: committed` 和 `uri`，使用 `juejin image resolve URI --json` 只查询已有图片地址，不重新上传。更新公开文章时检查图片是否可由未登录读者访问；项目官网托管的公开图片可直接引用。

额外场景和可复制提示词见随包的 [场景示例](references/scenarios.md)。
