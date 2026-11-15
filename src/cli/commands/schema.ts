import { InvalidArgumentError, type Command } from 'commander';
import { VERSION } from '../../package.js';
import { CliError } from '../../shared/errors.js';
import type { CommandContext } from '../context.js';

function describeOptions(command: Command) {
  return command.options.filter(option => !option.hidden).map(option => ({
    flags: option.flags,
    name: option.attributeName(),
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
  path: string[];
  aliases: string[];
  description: string;
  arguments: { name: string; description: string; required: boolean; variadic: boolean; default: unknown; choices: string[] | undefined }[];
  options: ReturnType<typeof describeOptions>;
  commands: CommandDescription[];
  has_subcommands: boolean;
}

export function describeCommand(command: Command, depth = Infinity): CommandDescription {
  const path: string[] = [];
  for (let current: Command | null = command; current?.parent; current = current.parent) path.unshift(current.name());
  return {
    name: command.name(),
    path,
    aliases: command.aliases(),
    description: command.description(),
    arguments: command.registeredArguments.map(argument => ({
      name: argument.name(), description: argument.description,
      required: argument.required, variadic: argument.variadic,
      default: argument.defaultValue as unknown, choices: argument.argChoices,
    })),
    options: describeOptions(command),
    commands: depth > 0 ? command.commands.map(child => describeCommand(child, depth - 1)) : [],
    has_subcommands: command.commands.length > 0,
  };
}

export function registerSchema(context: CommandContext): void {
  context.program.command('schema [path...]').description('查询命令树、参数、选项和枚举值，供 Agent 按需发现能力')
    .option('--depth <number>', '子命令展开层数；0 只描述目标命令，默认展开全部', value => {
      const depth = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(depth)) throw new InvalidArgumentError('必须为非负安全整数。');
      return depth;
    })
    .action((path: string[] = [], options: { depth?: number }) => {
      let command = context.program;
      for (const name of path) {
        const child = command.commands.find(child => child.name() === name || child.aliases().includes(name));
        if (!child) throw new CliError('INPUT', `找不到命令路径：${path.join(' ')}`);
        command = child;
      }
      context.emit({ schema_version: 1, cli_version: VERSION, command: describeCommand(command, options.depth), global_options: describeOptions(context.program) });
    });
}
