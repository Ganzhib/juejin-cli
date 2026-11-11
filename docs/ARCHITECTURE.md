# 架构设计

## 目标与参考

本项目服务两类使用者：在终端管理文章的开发者，以及通过命令行调用工具的 AI Agent。两者共用业务能力、参数契约和错误码。保持单 npm 包，同时发布 CLI、TypeScript SDK 和与版本匹配的 Skill。

结构参考 [飞书官方 CLI](https://github.com/larksuite/cli) 的职责划分：

| 飞书源码中的设计 | 本项目的取舍 |
| --- | --- |
| [`main.go`](https://github.com/larksuite/cli/blob/main/main.go) 的薄入口、[`cmd/root.go`](https://github.com/larksuite/cli/blob/main/cmd/root.go) 的统一装配 | `cli.ts` 仅调用 `runCli`；`program.ts` 注册命令，`context.ts` 构造依赖 |
| 业务命令与共享运行时分离 | `cli/commands/` 按领域组织，`runtime/` 统一管理本机生命周期 |
| [`internal/output/envelope.go`](https://github.com/larksuite/cli/blob/main/internal/output/envelope.go) 的结构化输出 | 保留本项目既有的 `{ok,data}` / `{ok,error}` 契约，由 `CliOutput` 统一输出 |
| schema 能力发现、随工具分发的领域 Skill | 从 Commander 命令定义生成 `schema`，Skill 与 npm 包绑定版本 |
| [`extension/README.md`](https://github.com/larksuite/cli/blob/main/extension/README.md) 的凭据、传输及分发边界 | 保留清晰边界，当前不引入插件协议、代码生成框架或多包工作区 |

飞书拥有官方平台协议和更大的业务面。本项目使用掘金网页接口，目前只需要显式类型、协议适配器和可测试的工作流。协议变化集中在一个平台目录处理。

## 目录

```text
src/
  cli.ts                         # 可执行入口，设置退出码
  index.ts                       # SDK 公共导出
  package.ts                     # 包名、版本、资源根目录
  cli/
    program.ts                   # 创建独立命令树，统一启动和错误出口
    context.ts                   # 依赖装配、会话与服务工厂
    output.ts                    # 成功/失败输出和退出码
    options.ts                   # 共享参数解析、分页与输入约束
    presentation.ts              # CLI 文章摘要视图
    commands/
      auth.ts                    # 登录和会话命令
      discovery.ts               # 分类、标签、推荐、热榜
      article.ts                 # 文章查询和发布
      draft.ts                   # 草稿查询、新建与更新
      column.ts                  # 专栏管理入口
      image.ts                   # 图片上传入口
      history.ts                 # 操作回执查询
      skill.ts                   # Skill 安装与状态
      schema.ts                  # 从命令定义生成能力描述
  services/
    draft-service.ts             # 文档、分类标签、图片上传计划
    writing-service.ts           # 草稿/专栏/发布的完整写作流程
  platform/juejin/
    types.ts                     # 掘金协议类型
    client.ts                    # 端点、请求字段和结果映射
    http.ts                      # HTTP、业务码、大整数和错误边界
    imagex.ts                    # STS、签名与图片上传链路
  runtime/
    session.ts                   # Cookie、登录、持久化和账户写锁
    browser.ts                   # 对应 Playwright 版本的 Chromium 安装
    journal.ts                   # 持久化写操作阶段与 ID
    skills.ts                    # Skill 安装、更新和用户修改保护
  content/markdown.ts             # frontmatter、语法树和图片路径替换
  shared/errors.ts               # 各层共享的错误及退出码
skills/juejin-cli/                # SKILL.md、Agent 元数据与场景
site/                            # GitHub Pages 源文件
docs/                            # API 验证记录、架构、SDK、发布
examples/                        # 可直接使用的 Markdown 示例
scripts/                         # 干净构建、归档验证、只读 smoke、站点构建
test/                            # 离线协议、流程和进程级验证
.github/workflows/               # Node 22/24 CI、Pages、npm 发布
```

## 依赖和职责

业务调用方向为 `cli/commands → services → platform/juejin → HTTP`。公开查询可以从命令直接调用平台客户端。`runtime` 提供凭据、锁、回执与资源安装；`content` 处理本地文档，不依赖命令或终端输出。底层模块不导入 CLI 层。

命令负责参数和展示，服务返回数据而不写 stdout。`CommandContext` 是装配点：读取需要的会话，构造同一个客户端、上传器及写作服务。`createProgram` 每次创建独立命令树，允许注入服务工厂和输出流，测试和未来嵌入式使用不依赖全局 Commander 单例。

平台客户端只封装掘金协议，不负责本机账户的锁和回执。SDK 使用者直接调用 `JuejinClient` 时自行管理生命周期；需要 CLI 相同的完整流程时，复用 `WritingService`。成功协议按 TypeScript 类型消费，在 HTTP 边界处理业务状态和协议明确可空的 `data`，输入边界验证用户文件及参数。

## 写操作的生命周期

以更新专栏为例：

1. 命令解析参数并获取认证服务。
2. `WritingService` 持有账户目录的排他写锁，读取远端已有字段，合并本次修改。
3. 验证输入及本地图片，上传必要图片。
4. `OperationJournal` 持久化 `started`，记录已有 ID 和目标。
5. 平台客户端只提交一次请求；成功写入 `succeeded`，异常写入 `failed_or_unknown`。
6. 返回回执并释放锁，由 CLI 输出结果。

草稿和文章发布复用同样的生命周期。锁覆盖读取、合并和写入，避免同一目录内进程并发丢失更新；它不协调网页或另一台设备。`--dry-run` 走准备分支，不上传、不提交、不写操作回执。图片上传发生在内容提交前，内容提交失败时已经上传的图片不会回滚。

HTTP 和服务均不自动重放写请求。网络异常意味着结果可能未知，错误和本地记录保留原草稿/专栏 ID，用户先查询远端再决定是否重试。各层不重复实现重试机制。

## Agent 契约

- `--json`：成功 stdout 一行 `{ok:true,data:...}`，失败 stderr 一行 `{ok:false,error:...}`，以退出码区分错误类别。`--help` 和 `--version` 保留常规 CLI 文本行为。
- `schema [path...] --json`：查询命令树、参数、必填选项、默认值及枚举。例如 `schema article publish --json`。数据直接读取 Commander 定义，避免手写第二份 schema 漂移；这不是平台返回值的 JSON Schema。
- Skill：说明工作流、授权范围和异常恢复。随 npm 包下载，不额外拉取远端最新内容；安装与首次运行均可安装，已有用户修改会保留。
- `package.ts` 统一定位包资源，目录分层不影响 Skill 路径。CLI、SDK、Skill 共用版本与发布归档。

## 扩展方式

新增平台能力先在 `types.ts` 和 `client.ts` 明确真实协议，补协议测试。需要多步流程、资源上传、写锁或回执时放入 `services`。随后在对应领域命令文件注册，更新 Skill、README 和 API 验证记录。schema 会自动反映新命令；不复制一份配置。

未来增加 MCP 时，在独立适配层调用服务，复用会话、平台协议和写作流程，不通过 shell 拼接 CLI 输出。只有当 MCP 有独立依赖与发布节奏时再考虑多包工作区。新增平台或插件体系也以实际需求为前提。

## 验证与交付

离线测试覆盖协议字段、ID 精度、上传链路、文档改写、会话/写锁、操作回执、服务流程、schema 和输出隔离。公开网络 smoke 单独运行，不读取账户凭据或执行写操作。

构建先清理 `dist/`，避免模块移动后把旧代码一起发布。归档检查实际安装 tgz、运行其二进制、验证 Skill 和 schema；验证结果对应发布的同一个文件。`release:check` 额外生成站点并把已验证的归档留在 `release/`。

GitHub Actions 在 Node 22 和 24 验证；Pages 独立部署；npm 发布只由匹配版本的 tag 触发，使用该包绑定的 OIDC trusted publisher。真实账户写入验证状态记录在 [API.md](API.md)，贡献者不能把离线通过描述为线上发布成功。
