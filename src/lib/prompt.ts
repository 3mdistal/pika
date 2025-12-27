import prompts from 'prompts';
import chalk from 'chalk';
import { numberedSelect } from './numberedSelect.js';

/**
 * Prompt for selection from a list of options.
 * Returns the selected value, or null if user cancels (Ctrl+C/Escape).
 * 
 * Features:
 * - Number keys (1-9, 0) for immediate selection
 * - Arrow keys for navigation (Enter to confirm)
 * - -/+/= for page navigation when > 10 options
 */
export async function promptSelection(
  message: string,
  options: string[]
): Promise<string | null> {
  return numberedSelect(message, options);
}

/**
 * Prompt for text input.
 */
export async function promptInput(
  message: string,
  defaultValue?: string
): Promise<string> {
  const response = await prompts({
    type: 'text',
    name: 'value',
    message,
    initial: defaultValue,
  });

  return (response.value as string) ?? defaultValue ?? '';
}

/**
 * Prompt for required text input (loops until non-empty).
 */
export async function promptRequired(message: string): Promise<string> {
  let value = '';
  while (!value) {
    const response = await prompts({
      type: 'text',
      name: 'value',
      message: `${message} (required)`,
      validate: (v: string) => v.trim() ? true : 'This field is required',
    });

    value = (response.value as string)?.trim() ?? '';
    if (response.value === undefined) {
      // User cancelled
      process.exit(1);
    }
  }
  return value;
}

/**
 * Prompt for multi-line input (comma-separated).
 */
export async function promptMultiInput(message: string): Promise<string[]> {
  const response = await prompts({
    type: 'text',
    name: 'value',
    message: `${message} (comma-separated)`,
  });

  const value = response.value as string;
  if (!value) return [];

  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Prompt for confirmation.
 * Returns true (yes), false (no), or null (cancelled/quit via Ctrl+C).
 */
export async function promptConfirm(message: string): Promise<boolean | null> {
  const response = await prompts({
    type: 'confirm',
    name: 'value',
    message,
    initial: false,
  });

  // prompts returns {} on Ctrl+C, so response.value is undefined
  if (response.value === undefined) {
    return null; // User cancelled - signal quit
  }
  return response.value as boolean;
}

/**
 * Print an error message.
 */
export function printError(message: string): void {
  console.error(chalk.red(message));
}

/**
 * Print a warning message.
 */
export function printWarning(message: string): void {
  console.error(chalk.yellow(message));
}

/**
 * Print a success message.
 */
export function printSuccess(message: string): void {
  console.log(chalk.green(message));
}

/**
 * Print an info message.
 */
export function printInfo(message: string): void {
  console.log(chalk.cyan(message));
}
