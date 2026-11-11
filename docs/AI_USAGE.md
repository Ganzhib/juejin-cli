# AI 与 SDK 使用说明

## CLI 工作流

CLI 直接读取本地 Markdown，AI 无需把完整正文复制到命令参数。

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

SDK 不会自动保存操作回执或获取写锁。调用方需要按自己的应用生命周期处理并发及结果未知的写操作；CLI 已统一完成这些处理。

公开读取不需要会话：

```typescript
const publicClient = new JuejinClient(new JuejinHttp());
const result = await publicClient.search('TypeScript', '0', 10);
console.log(result.items);
```

所有 ID 使用字符串。HTTP 层保留响应中的大整数 ID，避免 JavaScript 的数字精度损失。
