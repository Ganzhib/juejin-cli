import { InvalidArgumentError } from 'commander';
import type { CommandContext, CommandServices } from '../context.js';
import { id, positiveInteger } from '../options.js';

function drawCount(value: string): 1 | 10 {
  if (value !== '1' && value !== '10') throw new InvalidArgumentError('抽奖次数只能为 1 或 10。');
  return value === '1' ? 1 : 10;
}

export function registerLottery(context: CommandContext): void {
  const growth = <T>(action: (services: CommandServices) => Promise<T>) => context.growth(action, 'lottery');
  const lottery = context.program.command('lottery').description('抽奖配置、记录、幸运值与抽奖');
  lottery.command('status').description('免费次数、单次矿石成本、奖池、余额与幸运值').action(async () => {
    context.emit(await growth(async services => ({
      ...await services.client.lotteryConfig(), balance: await services.client.points(), lucky: await services.client.lotteryLucky(),
    })));
  });
  lottery.command('draw').description('单抽或十连抽；单抽由平台优先使用免费次数，否则扣除矿石')
    .option('--count <number>', '1 或 10', drawCount, 1)
    .option('--allow-spend', '允许平台按当前规则扣除矿石（免费次数可能被其他客户端消耗）')
    .option('--dry-run', '查询免费次数、余额与预计消耗，不抽奖')
    .action(async (options: { count: 1 | 10; allowSpend?: boolean; dryRun?: boolean }) =>
      context.emit(await growth(services => services.writing.drawLottery(options))));
  lottery.command('history').description('我的中奖记录，不输出收件信息')
    .option('--page <number>', '页码', positiveInteger, 1)
    .action(async (options: { page: number }) => context.emit(await (await context.services(true)).client.lotteryHistory(options.page)));
  lottery.command('lucky').description('查询幸运值').action(async () => context.emit(await (await context.services(true)).client.lotteryLucky()));
  lottery.command('dip <history-id>').description('对指定中奖记录沾喜气，使用平台的当日次数')
    .action(async (historyId: string) => context.emit(await growth(services => services.writing.dipLottery(id(historyId)))));
  lottery.command('lucky-draw').description('使用已积累幸运值执行幸运抽奖')
    .option('--dry-run', '只查询当前幸运值，不抽奖')
    .action(async (options: { dryRun?: boolean }) => context.emit(await growth(services => services.writing.drawLuckyLottery(options))));
  lottery.command('rules').description('读取平台当前抽奖规则').action(async () => context.emit(await (await context.services()).client.lotteryRules()));
}
