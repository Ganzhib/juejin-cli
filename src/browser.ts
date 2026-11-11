import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { CliError } from './errors.js';

export async function installBrowser(verbose = false): Promise<void> {
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4000);
      if (verbose) process.stderr.write(chunk);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', () => reject(new CliError('INTERNAL', '无法启动 Playwright 浏览器安装程序。')));
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new CliError('INTERNAL', 'Chromium 安装失败。', { exit_code: code, output }));
    });
  });
}
