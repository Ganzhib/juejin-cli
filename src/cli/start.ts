import { runUpdatedCli } from '../runtime/update.js';
import { CliOutput } from './output.js';
import { runCli } from './program.js';

export async function startCli(args: string[]): Promise<number> {
  const json = args.includes('--json');
  let progress: ReturnType<typeof setInterval> | undefined;
  try {
    const updated = await runUpdatedCli(args, { notice: (event, version) => {
      if (json) return;
      if (progress) { clearInterval(progress); progress = undefined; }
      if (event === 'install') {
        process.stderr.write(`发现新版 ${version}，正在更新，完成后继续当前操作…\n`);
        progress = setInterval(() => process.stderr.write('仍在下载更新，当前文章操作尚未开始…\n'), 5000);
      } else if (event === 'ready') process.stderr.write(`使用 juejin-cli ${version}\n`);
      else process.stderr.write(`暂时无法更新，继续使用 ${version}。\n`);
    } });
    return updated ?? await runCli(args);
  } catch (error) { return new CliOutput(process).failure(error, json); }
  finally { if (progress) clearInterval(progress); }
}
