import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createTestVault, cleanupTestVault, runCLI } from '../fixtures/setup.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

describe('link command', () => {
  let vaultDir: string;

  beforeAll(async () => {
    vaultDir = await createTestVault();
  });

  afterAll(async () => {
    await cleanupTestVault(vaultDir);
  });

  describe('wikilink generation', () => {
    it('should generate wikilink for unique basename', async () => {
      const result = await runCLI(['link', 'Sample Idea'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('[[Sample Idea]]');
    });

    it('should generate bare link target with --bare', async () => {
      const result = await runCLI(['link', 'Sample Idea', '--bare'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('Sample Idea');
    });

    it('should resolve case-insensitive', async () => {
      const result = await runCLI(['link', 'sample idea'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('[[Sample Idea]]');
    });

    it('should resolve by path', async () => {
      const result = await runCLI(['link', 'Ideas/Sample Idea'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('[[Sample Idea]]');
    });
  });

  describe('ambiguous basenames', () => {
    let tempVaultDir: string;

    beforeEach(async () => {
      tempVaultDir = await createTestVault();
      
      // Create duplicate basenames in different directories
      await writeFile(join(tempVaultDir, 'Ideas', 'Duplicate.md'), `---
type: idea
status: raw
---
`);
      await writeFile(join(tempVaultDir, 'Objectives/Tasks', 'Duplicate.md'), `---
type: objective
objective-type: task
status: backlog
---
`);
    });

    afterEach(async () => {
      await cleanupTestVault(tempVaultDir);
    });

    it('should use full path for non-unique basename', async () => {
      // Query by full path to get unambiguous match
      const result = await runCLI(['link', 'Ideas/Duplicate.md', '--picker', 'none'], tempVaultDir);

      expect(result.exitCode).toBe(0);
      // Should use path since basename is not unique
      expect(result.stdout.trim()).toBe('[[Ideas/Duplicate]]');
    });

    it('should error on ambiguous basename in non-interactive mode', async () => {
      const result = await runCLI(['link', 'Duplicate', '--picker', 'none'], tempVaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Ambiguous');
    });
  });

  describe('error handling', () => {
    it('should error on no matching notes', async () => {
      const result = await runCLI(['link', 'nonexistent-note-xyz', '--picker', 'none'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('No matching notes found');
    });

    it('should show picker prompt when no query (requires TTY)', async () => {
      // Without a TTY, should error about needing interactive mode
      const result = await runCLI(['link'], vaultDir);

      expect(result.exitCode).toBe(1);
      // In non-TTY context, it errors about needing a terminal
      expect(result.stderr).toContain('terminal');
    });
  });

  describe('JSON output', () => {
    it('should output JSON on success', async () => {
      const result = await runCLI(['link', 'Sample Idea', '--output', 'json'], vaultDir);

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);
      expect(json.data.target).toBe('Sample Idea');
      expect(json.data.wikilink).toBe('[[Sample Idea]]');
      expect(json.data.relativePath).toBe('Ideas/Sample Idea.md');
    });

    it('should output JSON error on no match', async () => {
      const result = await runCLI(['link', 'nonexistent-xyz', '--output', 'json'], vaultDir);

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.error).toContain('No matching notes found');
    });

    it('should output JSON with candidates on ambiguity', async () => {
      // JSON mode implies --picker none
      const result = await runCLI(['link', 'Idea', '--output', 'json'], vaultDir);

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Ambiguous');
      expect(json.errors).toBeDefined();
      expect(json.errors.length).toBeGreaterThan(0);
    });
  });

  describe('help and usage', () => {
    it('should show help with --help flag', async () => {
      const result = await runCLI(['link', '--help'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Generate a wikilink');
      expect(result.stdout).toContain('Picker Modes');
      expect(result.stdout).toContain('--bare');
    });
  });

  describe('no query (browse all)', () => {
    it('should error in non-interactive mode with no query', async () => {
      const result = await runCLI(['link', '--picker', 'none'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr.length).toBeGreaterThan(0);
    });

    it('should output JSON error with --output json and no query', async () => {
      const result = await runCLI(['link', '--output', 'json'], vaultDir);

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
    });
  });
});
