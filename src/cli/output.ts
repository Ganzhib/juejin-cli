import { CommanderError } from 'commander';
import { CliError, exitCode } from '../shared/errors.js';

export interface CliStreams {
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
}

export class CliOutput {
  constructor(readonly streams: CliStreams) {}

  success(value: unknown, json: boolean): void {
    this.streams.stdout.write(JSON.stringify({ ok: true, data: value }, null, json ? undefined : 2) + '\n');
  }

  text(content: string): void { this.streams.stdout.write(content); }

  failure(error: unknown, json: boolean): number {
    if (error instanceof CommanderError && error.exitCode === 0) return 0;
    let failure: CliError;
    if (error instanceof CliError) failure = error;
    else if (error instanceof CommanderError) failure = new CliError('INPUT', error.message);
    else if (error instanceof Error) failure = new CliError('INTERNAL', error.message);
    else failure = new CliError('INTERNAL', String(error));
    if (json) {
      this.streams.stderr.write(JSON.stringify({ ok: false, error: { code: failure.code, message: failure.message, details: failure.details } }) + '\n');
    } else this.streams.stderr.write(`${failure.code}: ${failure.message}\n`);
    return exitCode(failure);
  }
}
