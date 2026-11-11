import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandContext } from '../context.js';
import { limit } from '../options.js';

export function registerHistory(context: CommandContext): void {
  context.program.command('history').description('本地写操作回执（含结果未知的操作）').option('--limit <number>', '最近记录条数', limit, 20).action(async (options: { limit: number }) => {
    let content: string;
    try { content = await readFile(join(context.session().home, 'operations.jsonl'), 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      context.emit([]); return;
    }
    context.emit(content.trim().split('\n').filter(Boolean).slice(-options.limit).map(line => JSON.parse(line)));
  });
}
