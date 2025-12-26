import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestVault, cleanupTestVault, runCLI } from '../fixtures/setup.js';

// Note: The `new` command uses the `prompts` library which requires a TTY.
// Interactive tests cannot be run via piped stdin.
// This file tests error handling and validation only.
// Full interactive testing would require mocking the prompts module.

describe('new command', () => {
  let vaultDir: string;

  beforeEach(async () => {
    vaultDir = await createTestVault();
  });

  afterEach(async () => {
    await cleanupTestVault(vaultDir);
  });

  describe('type validation', () => {
    it('should error on unknown type', async () => {
      const result = await runCLI(['new', 'nonexistent'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown type');
    });

    it('should error on unknown subtype', async () => {
      const result = await runCLI(['new', 'objective/nonexistent'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown type');
    });

    it('should error on deeply nested invalid path', async () => {
      const result = await runCLI(['new', 'objective/task/invalid'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown type');
    });
  });

  describe('help and usage', () => {
    it('should show help with --help flag', async () => {
      const result = await runCLI(['new', '--help'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Create a new note');
      expect(result.stdout).toContain('Examples:');
    });
  });
});
