import { Command, Option } from 'commander';
import { join, resolve } from 'node:path';
import { installSkill, skillDirectory, skillStatus, type SkillAgent } from '../../runtime/skills.js';
import type { CommandContext } from '../context.js';

function skillOptions(command: Command): Command {
  return command.addOption(new Option('--agent <agent>', 'shared 适用于 Codex/Cursor，claude 用于 Claude Code').choices(['shared', 'claude', 'cursor']).default('shared'))
    .option('--dir <directory>', '自定义 skills 根目录');
}
function skillTarget(options: { agent: SkillAgent; dir?: string }): string {
  return options.dir ? join(resolve(options.dir), 'juejin-cli') : skillDirectory(options.agent);
}

export function registerSkill(context: CommandContext): void {
  const skill = context.program.command('skill').description('安装随 CLI 分发的 Agent Skill');
  skillOptions(skill.command('install')).action(async (options: { agent: SkillAgent; dir?: string }) => context.emit(await installSkill(skillTarget(options))));
  skillOptions(skill.command('status')).action(async (options: { agent: SkillAgent; dir?: string }) => context.emit(await skillStatus(skillTarget(options))));
}
