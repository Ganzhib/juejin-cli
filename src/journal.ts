import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CliError } from './errors.js';

export class OperationJournal {
  private readonly operationId = randomUUID();
  constructor(private readonly home: string) {}

  private async record(entry: Record<string, unknown>): Promise<void> {
    await mkdir(this.home, { recursive: true, mode: 0o700 });
    const file = await open(join(this.home, 'operations.jsonl'), 'a', 0o600);
    try {
      await file.writeFile(JSON.stringify({ operation_id: this.operationId, time: new Date().toISOString(), ...entry }) + '\n');
      await file.sync();
    } finally { await file.close(); }
  }

  async run<T>(operation: string, context: Record<string, unknown>, action: () => Promise<T>): Promise<T> {
    await this.record({ operation, phase: 'started', ...context });
    let result: T;
    try {
      result = await action();
    } catch (error) {
      await this.record({ operation, phase: 'failed_or_unknown', ...context });
      if (error instanceof CliError) {
        throw new CliError(error.code, error.message, { ...error.details, ...context, operation_id: this.operationId });
      }
      throw error;
    }
    try {
      // Receipts contain IDs only, never article content or account credentials.
      await this.record({ operation, phase: 'succeeded', ...context, result });
    } catch {
      throw new CliError('INTERNAL', '远程操作已成功，但本地回执写入失败；请勿重复执行。', { ...context, result });
    }
    return result;
  }
}
