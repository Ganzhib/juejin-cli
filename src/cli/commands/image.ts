import { resolve } from 'node:path';
import type { CommandContext } from '../context.js';

export function registerImage(context: CommandContext): void {
  const image = context.program.command('image').description('上传图片与查询已上传图片地址');
  image.command('resolve <uri>').description('只查询已上传图片地址，不重新上传').action(async (uri: string) => {
    context.emit({ url: await (await context.services(true)).uploader.resolveUrl(uri) });
  });
  image.command('upload <file>').description('上传本地图片并返回可引用的 URL').action(async (file: string) => {
    const { uploader, session } = await context.services(true);
    context.emit(await session.withWriteLock(async () => ({ url: await uploader.upload(resolve(file)) })));
  });
}
