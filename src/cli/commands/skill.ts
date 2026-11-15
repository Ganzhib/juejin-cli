import { Command, Option } from 'commander';
import { join, resolve } from 'node:path';
import { installSkill, readSkill, skillDirectory, skillStatus, type SkillAgent, type BundledSkillName } from '../../runtime/skills.js';
import { dirname } from 'node:path';
import type { CommandContext } from '../context.js';

function skillOptions(command: Command): Command {
  return command.addOption(new Option('--agent <agent>', 'shared 适用于 Codex/Cursor，claude 用于 Claude Code').choices(['shared', 'claude', 'cursor']).default('shared'))
    .addOption(new Option('--name <name>', '兼容旧版独立技能安装；默认使用统一入口').choices(['juejin-cli', 'drawio-skill']).default('juejin-cli').hideHelp())
    .option('--dir <directory>', '自定义 skills 根目录');
}
type SkillOptions = { agent: SkillAgent; dir?: string; name: BundledSkillName };
function skillTarget(options: SkillOptions): string {
  return join(options.dir ? resolve(options.dir) : dirname(skillDirectory(options.agent)), options.name);
}

export function registerSkill(context: CommandContext): void {
  const skill = context.program.command('skill').description('安装随 CLI 分发的 Agent Skill');
  skill.command('show').description('读取当前 CLI 内置的统一 Skill 入口，无需安装或登录').action(async () => {
    const entry = await readSkill();
    if (context.globals().json) context.emit(entry);
    else context.output.text(entry.content);
  });
  skillOptions(skill.command('install').description('安装或更新统一 Skill，保留用户修改')).action(async (options: SkillOptions) => context.emit(await installSkill(skillTarget(options), options.name)));
  skillOptions(skill.command('status').description('检查本地 Skill 安装版本及修改状态')).action(async (options: SkillOptions) => context.emit(await skillStatus(skillTarget(options))));
}
