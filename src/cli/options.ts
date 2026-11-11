import { Command, InvalidArgumentError } from 'commander';

export interface Globals { json?: boolean; home: string }
export interface Paging { limit: number; cursor: string; page: number }

export function positiveInteger(value: string): number {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1) throw new InvalidArgumentError('必须为正整数。');
  return number;
}

export function limit(value: string): number {
  const number = positiveInteger(value);
  if (number > 100) throw new InvalidArgumentError('每页最多 100 条。');
  return number;
}

export function id(value: string): string {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError('ID 必须是数字字符串。');
  return value;
}

export function commaSeparated(value: string): string[] {
  const values = value.split(',').map(value => value.trim());
  if (values.some(value => value.length === 0)) throw new InvalidArgumentError('列表不能包含空项。');
  return [...new Set(values)];
}

export function paging(command: Command): Command {
  return command.option('--limit <number>', '每页条数（1–100）', limit, 20)
    .option('--cursor <cursor>', '服务端分页游标', '0').option('--page <number>', '页码', positiveInteger, 1);
}

export function draftOptions(command: Command): Command {
  return command.option('--title <title>', '文章标题').option('--brief <brief>', '50–100 字摘要')
    .option('--category <category>', '分类名称、slug 或 ID').option('--tags <tags>', '逗号分隔的标签名称或 ID', commaSeparated)
    .option('--cover <path-or-url>', '封面图片路径或 URL').option('--dry-run', '解析并验证输入，只调用读取接口，不上传或写入草稿');
}
