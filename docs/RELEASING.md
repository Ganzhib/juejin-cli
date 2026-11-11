# 发布指南

仓库默认分支是 `main`。推送或合并到 `main` 后，`.github/workflows/npm-release.yml` 自动检查并发布 npm；无需手动打 tag，也无需每次手动修改版本号。

## 自动发布流程

1. 查询 npm 已发布版本，按提交 SHA 判断本次是否已发布。相同提交重跑会跳过。
2. 如果源码 `package.json` 版本大于所有已发布稳定版本，使用该版本；否则自动递增最高稳定版本的 patch。例如当前最新为 `0.2.9`，下一次为 `0.2.10`。
3. 在 runner 内同步 `package.json`、lockfile 版本与 `gitHead`，运行类型检查、离线测试、干净构建、归档安装验收和官网构建。
4. 保留通过验收的确切 `.tgz` 为 Actions artifact，用 npm trusted publishing 发布该文件。
5. 只读轮询 npm，确认 `latest` 版本及来源提交；不在超时后自动重放发布。

自动生成的 patch 版本不回写分支，避免机器人提交循环。npm 版本及 `gitHead` 是发版结果，Actions 保留对应归档。需要主动发布 minor/major 时，在源码提高版本即可。GitHub 并发队列可能合并连续的待运行任务，最终发布最新提交包含的完整改动。

官网安装命令显式使用 `@latest`，页面的版本号和安装包下载地址实时读取 npm `latest`；官网更新与 npm 发布的先后顺序不会把未发布版本显示给用户。

## 一次性 npm 授权

在该 npm 包的 Settings → Trusted Publisher 添加：

- Provider：GitHub Actions
- Organization or user：`Ganzhib`
- Repository：`juejin-cli`
- Workflow filename：`npm-release.yml`
- Environment：留空
- Allowed actions：仅启用 `npm publish`

工作流仅允许本仓库 `main`，使用 GitHub 托管 runner、Node 24、`id-token: write`。无需把长期 npm token 放进仓库。工作流的代码权限是只读，不创建机器人回写提交。

## 本机验证与应急手动发布

使用 Node.js 22.16+，建议 Node 24：

```bash
npm ci
npm run release:check
npm whoami --registry=https://registry.npmjs.org/
```

`release:check` 不登录、不发布，会在 `release/` 生成通过验收的归档。应急手动发布前，先确认自动流程没有发布过同一版本，再发布确切文件（不要用通配符）：

```bash
npm publish ./release/ganzhibin-juejin-cli-0.2.1.tgz --access public --registry=https://registry.npmjs.org/
npm view @ganzhibin/juejin-cli version --registry=https://registry.npmjs.org/
npx --yes @ganzhibin/juejin-cli@latest --version
```

按实际待发布版本替换文件名。npm 不允许覆盖已有版本。网络超时或发布已接受但尚未可见时，先查询版本，不盲目重新发布。

## CLI 自动更新

从 0.2.1 起，已安装的 CLI 在业务命令开始前向 npm 官方源检查稳定最新版，检查最多等待 1.5 秒。发现更新后下载到用户缓存 `~/.cache/juejin-cli/versions/`，完整安装后才切换。无需管理员权限，也不覆盖正在运行的全局安装。

成功检查结果复用 1 分钟，连续多条命令直接使用已核验的完整版本；过期后重新查询 npm。断网仍能工作；下载失败继续使用已有版本。业务命令一旦启动，失败、超时或中断都不会触发旧版重放。JSON 模式不输出更新杂讯。原始命令参数保持原样传给 Node 子进程，不经过 shell 拼接。

源码运行、CI、npx 显式版本和 `JUEJIN_AUTO_UPDATE=0` 不自动切换。npx 用户使用 `@latest` 获取最新版；希望固定版本的脚本可关闭更新。旧版 0.1/0.2.0 没有更新器，需要先执行一次 `npm install -g @ganzhibin/juejin-cli@latest`。

官方依据：[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)、[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)。
