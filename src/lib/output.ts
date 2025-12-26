import chalk from 'chalk';

/**
 * Output mode for commands.
 */
export type OutputMode = 'text' | 'json';

/**
 * JSON output wrapper for success results.
 */
export interface JsonSuccess<T = unknown> {
  success: true;
  data?: T;
  path?: string;
  updated?: string[];
  message?: string;
}

/**
 * JSON output wrapper for error results.
 */
export interface JsonError {
  success: false;
  error: string;
  errors?: Array<{
    field: string;
    value?: unknown;
    message: string;
    expected?: string[] | string;
    suggestion?: string;
  }>;
  code?: number;
}

/**
 * Combined JSON result type.
 */
export type JsonResult<T = unknown> = JsonSuccess<T> | JsonError;

/**
 * Exit codes for the CLI.
 */
export const ExitCodes = {
  SUCCESS: 0,
  VALIDATION_ERROR: 1,
  IO_ERROR: 2,
  SCHEMA_ERROR: 3,
} as const;

export type ExitCode = (typeof ExitCodes)[keyof typeof ExitCodes];

/**
 * Print output as JSON.
 */
export function printJson(data: JsonResult): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print a single-line JSON output.
 */
export function printJsonCompact(data: JsonResult): void {
  console.log(JSON.stringify(data));
}

/**
 * Create a success JSON response.
 */
export function jsonSuccess<T = unknown>(
  options: Omit<JsonSuccess<T>, 'success'> = {}
): JsonSuccess<T> {
  return { success: true, ...options };
}

/**
 * Create an error JSON response.
 */
export function jsonError(
  error: string,
  options: Omit<JsonError, 'success' | 'error'> = {}
): JsonError {
  return { success: false, error, ...options };
}

/**
 * Exit with appropriate code and output.
 */
export function exitWithError(
  message: string,
  code: ExitCode = ExitCodes.VALIDATION_ERROR,
  jsonMode: boolean = false
): never {
  if (jsonMode) {
    printJson(jsonError(message, { code }));
  } else {
    console.error(chalk.red(message));
  }
  process.exit(code);
}

/**
 * Exit with success output.
 */
export function exitWithSuccess<T = unknown>(
  result: Omit<JsonSuccess<T>, 'success'>,
  textMessage: string,
  jsonMode: boolean = false
): void {
  if (jsonMode) {
    printJson(jsonSuccess(result));
  } else {
    console.log(chalk.green(textMessage));
  }
}

/**
 * Determine output mode from command options.
 */
export function getOutputMode(options: { output?: string; json?: string }): OutputMode {
  if (options.output === 'json' || options.json !== undefined) {
    return 'json';
  }
  return 'text';
}

/**
 * Check if we're in JSON output mode.
 */
export function isJsonMode(options: { output?: string; json?: string }): boolean {
  return getOutputMode(options) === 'json';
}

/**
 * Strip ANSI color codes from a string.
 */
export function stripColors(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
