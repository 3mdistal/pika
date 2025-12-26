import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createTestVault, cleanupTestVault, runCLI } from '../fixtures/setup.js';

describe('JSON I/O', () => {
  let vaultDir: string;

  beforeEach(async () => {
    vaultDir = await createTestVault();
  });

  afterEach(async () => {
    await cleanupTestVault(vaultDir);
  });

  describe('ovault new --json', () => {
    it('should create a note with JSON frontmatter', async () => {
      const result = await runCLI(
        ['new', 'idea', '--json', '{"Idea name": "Test Idea", "status": "raw", "priority": "high"}'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);
      expect(json.path).toContain('Ideas/Test Idea.md');

      // Verify file exists
      const filePath = join(vaultDir, json.path);
      expect(existsSync(filePath)).toBe(true);

      // Verify content
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('status: raw');
      expect(content).toContain('priority: high');
    });

    it('should error on missing required name field', async () => {
      const result = await runCLI(
        ['new', 'idea', '--json', '{"status": "raw"}'],  // missing 'Idea name'
        vaultDir
      );

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.error).toContain('name');
    });

    it('should error on invalid enum value', async () => {
      const result = await runCLI(
        ['new', 'idea', '--json', '{"Idea name": "Bad Idea", "status": "invalid-status"}'],
        vaultDir
      );

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.errors).toBeDefined();
      expect(json.errors[0].field).toBe('status');
    });

    it('should provide suggestions for typos', async () => {
      const result = await runCLI(
        ['new', 'idea', '--json', '{"Idea name": "Typo Idea", "status": "rae"}'],
        vaultDir
      );

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.errors[0].suggestion).toContain('raw');
    });

    it('should apply defaults for missing optional fields', async () => {
      const result = await runCLI(
        ['new', 'idea', '--json', '{"Idea name": "Minimal Idea"}'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);

      const filePath = join(vaultDir, json.path);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('status: raw'); // default value
    });

    it('should error on unknown type', async () => {
      const result = await runCLI(
        ['new', 'unknown-type', '--json', '{"Idea name": "Test"}'],
        vaultDir
      );

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unknown type');
    });

    it('should error on invalid JSON', async () => {
      const result = await runCLI(
        ['new', 'idea', '--json', '{invalid json}'],
        vaultDir
      );

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid JSON');
    });

    it('should require type in JSON mode', async () => {
      const result = await runCLI(
        ['new', '--json', '{"Idea name": "No Type"}'],
        vaultDir
      );

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.error).toContain('required');
    });
  });

  describe('ovault edit --json', () => {
    it('should update a note with JSON patch', async () => {
      const result = await runCLI(
        ['edit', 'Ideas/Sample Idea.md', '--json', '{"status": "backlog"}'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);
      expect(json.updated).toContain('status');

      // Verify file was updated
      const content = await readFile(join(vaultDir, 'Ideas/Sample Idea.md'), 'utf-8');
      expect(content).toContain('status: backlog');
    });

    it('should preserve existing fields not in patch', async () => {
      const result = await runCLI(
        ['edit', 'Ideas/Sample Idea.md', '--json', '{"status": "backlog"}'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);

      const content = await readFile(join(vaultDir, 'Ideas/Sample Idea.md'), 'utf-8');
      expect(content).toContain('status: backlog');
      expect(content).toContain('type: idea'); // preserved
      expect(content).toContain('priority: medium'); // preserved
    });

    it('should remove field with null value', async () => {
      const result = await runCLI(
        ['edit', 'Ideas/Sample Idea.md', '--json', '{"priority": null}'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);

      const content = await readFile(join(vaultDir, 'Ideas/Sample Idea.md'), 'utf-8');
      expect(content).not.toContain('priority:');
    });

    it('should validate merged result', async () => {
      const result = await runCLI(
        ['edit', 'Ideas/Sample Idea.md', '--json', '{"status": "invalid-status"}'],
        vaultDir
      );

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.errors[0].field).toBe('status');
    });

    it('should error on file not found', async () => {
      const result = await runCLI(
        ['edit', 'Ideas/Nonexistent.md', '--json', '{"status": "raw"}'],
        vaultDir
      );

      expect(result.exitCode).toBe(2);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.error).toContain('not found');
    });
  });

  describe('ovault list --output json', () => {
    it('should output list as JSON array', async () => {
      const result = await runCLI(
        ['list', 'idea', '--output', 'json'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(2);
      expect(json[0]._path).toBeDefined();
      expect(json[0]._name).toBeDefined();
      expect(json[0].type).toBe('idea');
    });

    it('should include all frontmatter fields', async () => {
      const result = await runCLI(
        ['list', 'idea', '--output', 'json'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      const idea = json.find((i: Record<string, unknown>) => i._name === 'Sample Idea');
      expect(idea.status).toBe('raw');
      expect(idea.priority).toBe('medium');
    });

    it('should return empty array for no matches', async () => {
      const result = await runCLI(
        ['list', 'idea', '--status=settled', '--output', 'json'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json).toEqual([]);
    });

    it('should apply filters in JSON mode', async () => {
      const result = await runCLI(
        ['list', 'idea', '--status=raw', '--output', 'json'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.length).toBe(1);
      expect(json[0]._name).toBe('Sample Idea');
    });

    it('should error on unknown type in JSON mode', async () => {
      const result = await runCLI(
        ['list', 'unknown-type', '--output', 'json'],
        vaultDir
      );

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unknown type');
    });
  });

  describe('ovault schema show --output json', () => {
    it('should output type details as JSON', async () => {
      const result = await runCLI(
        ['schema', 'show', 'idea', '--output', 'json'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.type_path).toBe('idea');
      expect(json.output_dir).toBe('Ideas');
      expect(json.fields).toBeDefined();
    });

    it('should include resolved enum values', async () => {
      const result = await runCLI(
        ['schema', 'show', 'idea', '--output', 'json'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.fields.status.values).toContain('raw');
      expect(json.fields.status.values).toContain('backlog');
    });

    it('should output full schema as JSON', async () => {
      const result = await runCLI(
        ['schema', 'show', '--output', 'json'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.types).toBeDefined();
      expect(json.enums).toBeDefined();
    });

    it('should error on unknown type in JSON mode', async () => {
      const result = await runCLI(
        ['schema', 'show', 'unknown-type', '--output', 'json'],
        vaultDir
      );

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unknown type');
    });
  });

  describe('ovault schema validate --output json', () => {
    it('should return success for valid schema', async () => {
      const result = await runCLI(
        ['schema', 'validate', '--output', 'json'],
        vaultDir
      );

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);
    });
  });
});
