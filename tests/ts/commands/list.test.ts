import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestVault, cleanupTestVault, runCLI } from '../fixtures/setup.js';

describe('list command', () => {
  let vaultDir: string;

  beforeAll(async () => {
    vaultDir = await createTestVault();
  });

  afterAll(async () => {
    await cleanupTestVault(vaultDir);
  });

  describe('basic listing', () => {
    it('should list ideas by name', async () => {
      const result = await runCLI(['list', 'idea'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Sample Idea');
      expect(result.stdout).toContain('Another Idea');
    });

    it('should list subtypes with slash notation', async () => {
      const result = await runCLI(['list', 'objective/task'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Sample Task');
    });

    it('should list all subtypes when listing parent type', async () => {
      const result = await runCLI(['list', 'objective'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Sample Task');
      expect(result.stdout).toContain('Active Milestone');
      expect(result.stdout).toContain('Settled Milestone');
    });

    it('should return empty for type with no files', async () => {
      const result = await runCLI(['list', 'objective/milestone', '--status=raw'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
    });

    it('should sort results alphabetically', async () => {
      const result = await runCLI(['list', 'idea'], vaultDir);

      expect(result.exitCode).toBe(0);
      const lines = result.stdout.split('\n');
      const anotherIndex = lines.findIndex(l => l.includes('Another Idea'));
      const sampleIndex = lines.findIndex(l => l.includes('Sample Idea'));
      expect(anotherIndex).toBeLessThan(sampleIndex);
    });
  });

  describe('--paths flag', () => {
    it('should show file paths instead of names', async () => {
      const result = await runCLI(['list', '--paths', 'idea'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Ideas/Sample Idea.md');
      expect(result.stdout).toContain('Ideas/Another Idea.md');
    });

    it('should show nested paths for subtypes', async () => {
      const result = await runCLI(['list', '--paths', 'objective/task'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Objectives/Tasks/Sample Task.md');
    });
  });

  describe('--fields flag', () => {
    it('should show single field in table format', async () => {
      const result = await runCLI(['list', '--fields=status', 'idea'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('NAME');
      expect(result.stdout).toContain('STATUS');
      expect(result.stdout).toContain('raw');
      expect(result.stdout).toContain('backlog');
    });

    it('should show multiple fields', async () => {
      const result = await runCLI(['list', '--fields=status,priority', 'idea'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('STATUS');
      expect(result.stdout).toContain('PRIORITY');
      expect(result.stdout).toContain('medium');
      expect(result.stdout).toContain('high');
    });

    it('should combine --paths with --fields', async () => {
      const result = await runCLI(['list', '--paths', '--fields=status', 'idea'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('PATH');
      expect(result.stdout).toContain('Ideas/');
    });
  });

  describe('simple filters', () => {
    it('should filter by equality', async () => {
      const result = await runCLI(['list', 'idea', '--status=raw'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Sample Idea');
      expect(result.stdout).not.toContain('Another Idea');
    });

    it('should filter by OR values', async () => {
      const result = await runCLI(['list', 'idea', '--status=raw,backlog'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Sample Idea');
      expect(result.stdout).toContain('Another Idea');
    });

    it('should filter by negation', async () => {
      const result = await runCLI(['list', 'objective/milestone', '--status!=settled'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Active Milestone');
      expect(result.stdout).not.toContain('Settled Milestone');
    });
  });

  describe('--where expression filters', () => {
    it('should filter with equality expression', async () => {
      const result = await runCLI(['list', 'idea', '--where', "status == 'raw'"], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Sample Idea');
      expect(result.stdout).not.toContain('Another Idea');
    });

    it('should filter with comparison expression', async () => {
      const result = await runCLI(['list', 'idea', '--where', "priority == 'high'"], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Another Idea');
      expect(result.stdout).not.toContain('Sample Idea');
    });

    it('should support multiple --where (AND logic)', async () => {
      const result = await runCLI(
        ['list', 'idea', '--where', "status == 'backlog'", '--where', "priority == 'high'"],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Another Idea');
      expect(result.stdout).not.toContain('Sample Idea');
    });
  });

  describe('error handling', () => {
    it('should error on unknown type', async () => {
      const result = await runCLI(['list', 'nonexistent'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown type');
    });

    it('should error on invalid filter field', async () => {
      const result = await runCLI(['list', 'idea', '--nonexistent=value'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown field');
    });

    it('should error on invalid enum value', async () => {
      const result = await runCLI(['list', 'idea', '--status=invalid'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid value');
    });

    it('should show usage when no type provided', async () => {
      const result = await runCLI(['list'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Available types:');
    });
  });
});
