# 参与贡献

欢迎提交协议修复、命令改进、文档和离线测试。提交较大功能前，先在 issue 描述使用场景、拟增加的命令及对现有行为的影响。

## 本地开发

需要 Node.js 22.16+。建议使用 Node 24：

```bash
npm ci
npm run check
npm test
npm run dev -- schema article publish --json
```

禁用自动 Skill 安装可设置 `JUEJIN_AUTO_INSTALL_SKILL=0`；需要隔离会话时使用 `--home` 或 `JUEJIN_HOME`。使用虚构凭据编写测试，不提交真实 Cookie、storageState、操作记录或未公开的正文。

## 修改应放在哪里

请先阅读 [架构设计](docs/ARCHITECTURE.md) 和 [开发约定](AGENTS.md)。追踪命令、服务和底层协议的完整调用链，在拥有该职责的层修改。不要在命令层修补 HTTP 行为，也不要在平台客户端写终端输出。

新增命令需要保持现有 JSON 契约和退出码。多步写入使用服务层共享的锁与回执；网络异常不自动重放请求。schema 从 Commander 定义生成，修改命令定义即可更新能力发现。同步维护 README、Skill、场景和协议验证记录。

## 验证和 PR

```bash
npm run release:check
```

这会验证类型、离线测试、构建、真实 tgz 安装与站点构建，不执行掘金写操作或 npm 发布。公开接口验证可选用 `npm run smoke`。真实账号验证需要明确授权，并在 PR 中区分离线验证和线上结果。

PR 描述具体问题、最终行为和验证结果。接口变化请提供脱敏的请求/响应字段与复现过程。分支格式 `ganzhibin/<type>/<english-description>`；提交格式 `<type>(<scope>): <中文描述>`，如 `fix(juejin): 修正专栏详情字段映射`。

本项目使用 MIT。修改图片签名和上传逻辑时，保留 [第三方许可声明](THIRD_PARTY_NOTICES.md)。发布流程见 [发布指南](docs/RELEASING.md)。
