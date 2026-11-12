# AI 与 SDK 使用说明

## CLI 工作流

CLI 直接读取本地 Markdown，AI 无需把完整正文复制到命令参数。

先调用 `juejin schema --json` 查看命令树；目标命令可用 `juejin schema article publish --json` 按需查询。元数据与命令实现来自同一份 Commander 注册定义，包含参数、必填选项、默认值和枚举。

1. 用 `juejin auth status --json` 核对当前用户；未登录时由用户完成 `auth login` 浏览器操作。
2. 用 `category list`、`tag search` 确认分类和标签。专栏写作先用 `column list --json` 选定专栏 ID，或显式创建专栏。
3. 用 `draft create article.md --dry-run --json` 检查标题、摘要、分类、标签和本地图片。
4. 用户要求保存时执行 `draft create article.md --json`，保存返回的 `draft_id`；后续修改使用 `draft update <draft-id> article.md`。
5. 用户要求发布时执行 `article publish --draft <draft-id> --columns <column-id> --json`。直接发布已有草稿，避免重新创建一份。
6. 依据返回的文章 ID 查询详情或查看网页，核对审核与展示情况。

使用参数数组调用进程，或正确引用 shell 参数。不要把 Cookie 放进命令行、日志或模型上下文。不要在网络失败后盲目再次执行写操作；`juejin history --json` 可恢复已记录的草稿和专栏 ID。

`--json` 成功结果位于 stdout，错误结果位于 stderr。先检查退出码，再解析对应流。协议错误中的 `details.err_no` 是平台原始业务码，不代表所有业务错误都是会话过期。

## TypeScript SDK

```typescript
import { JuejinClient, JuejinHttp, SessionStore, cookieHeader } from '@ganzhibin/juejin-cli';

const session = new SessionStore();
const cookies = await session.load();
const client = new JuejinClient(new JuejinHttp({ cookie: cookieHeader(cookies) }));

const columns = await client.columns();
const draft = await client.draft('你的草稿ID');
const article = await client.publish(draft.id, [columns.items[0].column.column_id]);
console.log(article.article_id);
```

直接调用 `JuejinClient` 不会自动保存操作回执或获取写锁。调用方需要按自己的应用生命周期处理并发及结果未知的写操作；CLI 通过 `WritingService` 统一完成这些处理。需要相同的完整写作流程时，可组合 `SessionStore`、`ImageUploader`、`DraftService` 和 `WritingService`，具体依赖关系见 [架构设计](ARCHITECTURE.md)。

公开读取不需要会话：

```typescript
const publicClient = new JuejinClient(new JuejinHttp());
const result = await publicClient.search('TypeScript', '0', 10);
console.log(result.items);
```

所有 ID 使用字符串。HTTP 层保留响应中的大整数 ID，避免 JavaScript 的数字精度损失。

## 签到与系统任务

先用 `schema checkin --json` 和 `schema lottery --json` 发现当前命令。用户只问状态时运行 `checkin status`；明确要求签到时运行 `checkin run`。用户要求每日定时签到时，确认需要的本地时间与任务名后调用 `checkin schedule enable --at HH:mm --name NAME`；已有明确时间时直接执行。用 `schedule status` 核对启用结果，`disable` 移除任务。安装在电脑上，不是云端任务；会话过期需要人工重新登录。

补签要有具体日期，抽奖要有明确的执行授权；单抽与十连抽都需要 `--allow-spend`，不要把用户要求签到扩展成抽奖或消耗补签卡。定时任务只签到。

SDK 需要受保护网页接口时，使用带关闭生命周期的传输：

```typescript
import { JuejinClient, SessionStore, withBrowserHttp } from '@ganzhibin/juejin-cli';

await withBrowserHttp(new SessionStore(), async http => {
  const config = await new JuejinClient(http).lotteryConfig();
  console.log(config.free_count);
}, 'lottery');
```

需要与 CLI 相同的锁和回执时，在 callback 中组合 WritingService。普通余额、状态和记录查询可继续使用 Cookie HTTP 客户端。CLI history 仅包含本工具操作回执；lottery history 才是平台中奖记录。
