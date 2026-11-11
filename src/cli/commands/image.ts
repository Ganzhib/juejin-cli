import { resolve } from 'node:path';
import type { CommandContext } from '../context.js';

export function registerImage(context: CommandContext): void {
  context.program.command('image').description('上传图片').command('upload <file>').action(async (file: string) => {
    const { uploader, session } = await context.services(true);
    context.emit(await session.withWriteLock(async () => ({ url: await uploader.upload(resolve(file)) })));
  });
}
