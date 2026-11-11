# 发布指南

当前包名为 `@ganzhibin/juejin-cli`，当前版本为 `0.2.0`。npm 发布由维护者在自己的电脑完成。仓库已经部署 [GitHub Pages 安装与场景指南](https://ganzhib.github.io/juejin-cli/)。

## 首次手动发布

使用 Node.js 22.16+，建议 Node 24。在项目根目录执行：

```bash
npm ci
npm run release:check
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

确认账号有 `@ganzhibin` scope 的发布权限。`release:check` 依次运行类型检查、离线测试、干净构建、真实归档安装验证及站点构建。它不会登录或发布。通过后发布该次验证生成的确切文件：

```bash
npm publish ./release/ganzhibin-juejin-cli-0.2.0.tgz --access public --registry=https://registry.npmjs.org/
npm view @ganzhibin/juejin-cli version --registry=https://registry.npmjs.org/
npx --yes @ganzhibin/juejin-cli@0.2.0 --version
```

按 npm 提示完成浏览器登录与二次验证。版本号更新后改用新版本的归档文件名；不要用通配符选择本地 `release/` 中多个历史版本。不要把登录凭据提交到仓库。

发布成功后删除 README 和站点中的“首版待发布”说明，再提交文档更新。首次手动发布不需要传 `--provenance`；后续 GitHub Actions 的 OIDC 发布会附带 provenance。

## 复用 resume 项目的经验

可以复用同一个 npm 账号、发布步骤和工作流模式。已经登录的本人电脑也可以继续使用其 npm 登录状态。旧包的 trusted publisher 授权绑定具体包、仓库和工作流，不能直接当作本项目授权。

新包首次创建后，在 npm 的该包设置中添加 GitHub Actions trusted publisher：

- Organization or user：`Ganzhib`
- Repository：`juejin-cli`
- Workflow filename：`npm-release.yml`
- Environment：留空，当前工作流未使用 GitHub Environment
- Allowed actions：启用直接 `npm publish`，当前工作流不使用 staged publishing

当前仓库已提供 [npm-release.yml](../.github/workflows/npm-release.yml)，使用 GitHub 托管 runner、Node 24、`id-token: write`，不保存 npm token。配置完成后，下个新版本可由匹配 `package.json` 版本的 `vX.Y.Z` tag 触发。不要在手动发布 `0.1.0` 后再用同版本 tag 重复发布；npm 不允许覆盖已有版本。

仓库修改应继续使用维护者选择的 GitHub 连接器；本指南的 shell 命令仅用于本机 npm 安装、验证和发布。后续创建 release tag 前，确认 CI 通过、版本与 lockfile 一致，并已更新发布说明。

官方依据：[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)、[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)。
