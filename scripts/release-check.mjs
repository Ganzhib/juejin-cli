import { execFileSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const options = { stdio: 'inherit', env: { ...process.env, JUEJIN_AUTO_INSTALL_SKILL: '0' } };
for (const task of ['check', 'test', 'build']) execFileSync(npm, ['run', task], options);
execFileSync(process.execPath, ['scripts/check-package.mjs', 'release'], options);
execFileSync(npm, ['run', 'build:site'], options);
console.log('Release checks passed. Publish the verified .tgz in release/ after npm login.');
