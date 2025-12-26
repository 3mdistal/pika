import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestVault, cleanupTestVault, runCLI } from '../fixtures/setup.js';

// Note: We can't test actually opening Obsidian as it requires the app.
// This file tests error handling and validation only.
// The actual URI building is tested via unit tests.

describe('open command', () => {
  let vaultDir: string;

  beforeAll(async () => {
    vaultDir = await createTestVault();
  });

  afterAll(async () => {
    await cleanupTestVault(vaultDir);
  });

  describe('error handling', () => {
    it('should error on file not found', async () => {
      const result = await runCLI(['open', 'nonexistent.md'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('File not found');
    });

    it('should error on nonexistent nested path', async () => {
      const result = await runCLI(['open', 'Ideas/Does Not Exist.md'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('File not found');
    });

    it('should require a file argument', async () => {
      const result = await runCLI(['open'], vaultDir);

      expect(result.exitCode).toBe(1);
      // Commander shows usage error for missing required argument
      expect(result.stderr).toContain('required');
    });
  });

  describe('help and usage', () => {
    it('should show help with --help flag', async () => {
      const result = await runCLI(['open', '--help'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Open a note in Obsidian');
      expect(result.stdout).toContain('Examples:');
    });
  });
});
