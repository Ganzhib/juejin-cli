export type ErrorCode = 'INPUT' | 'AUTH' | 'API' | 'NETWORK' | 'PROTOCOL' | 'BUSY' | 'INTERNAL';

export class CliError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

// Only local lock acquisition/setup may establish that no write has started.
export class WriteNotStartedError extends CliError {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, { ...details, write_started: false });
  }
}

export function exitCode(error: CliError): number {
  switch (error.code) {
    case 'INPUT': return 2;
    case 'AUTH': return 3;
    case 'API': case 'PROTOCOL': return 4;
    case 'NETWORK': return 5;
    case 'BUSY': return 6;
    case 'INTERNAL': return 1;
  }
}
