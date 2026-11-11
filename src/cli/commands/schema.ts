import type { Command } from 'commander';
import { CliError } from '../../shared/errors.js';
import type { CommandContext } from '../context.js';

function describeOptions(command: Command) {
  return command.options.filter(option => !option.hidden).map(option => ({
    flags: option.flags,
    description: option.description,
    required: option.mandatory,
    value_required: option.required,
    value_optional: option.optional,
    default: option.defaultValue as unknown,
    choices: option.argChoices,
  }));
}

interface CommandDescription {
  name: string;
  description: string;
  arguments: { name: string; description: string; required: boolean; variadic: boolean; default: unknown; choices: string[] | undefined }[];
  options: ReturnType<typeof describeOptions>;
  commands: CommandDescription[];
}

export function describeCommand(command: Command): CommandDescription {
  return {
    name: command.name(),
    description: command.description(),
    arguments: command.registeredArguments.map(argument => ({
      name: argument.name(), description: argument.description,
      required: argument.required, variadic: argument.variadic,
      default: argument.defaultValue as unknown, choices: argument.argChoices,
    })),
    options: describeOptions(command),
    commands: command.commands.map(describeCommand),
  };
}

export function registerSchema(context: CommandContext): void {
  context.program.command('schema [path...]').description('查询命令树、参数、选项和枚举值，供 Agent 按需发现能力')
    .action((path: string[] = []) => {
      let command = context.program;
      for (const name of path) {
        const child = command.commands.find(child => child.name() === name);
        if (!child) throw new CliError('INPUT', `找不到命令路径：${path.join(' ')}`);
        command = child;
      }
      context.emit({ command: describeCommand(command), global_options: describeOptions(context.program) });
    });
}
