/**
 * PTY-based integration tests for bulk command confirmation prompts.
 *
 * Tests the confirmation prompt for cross-type operations and large operations.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  withTempVault,
  Keys,
  TEST_VAULT_PATH,
  TempVaultFile,
  shouldSkipPtyTests,
  readVaultFile,
} from '../lib/pty-helpers.js';
import { existsSync } from 'fs';

// Skip PTY tests if running in CI without TTY support or node-pty is incompatible
const describePty = shouldSkipPtyTests()
  ? describe.skip
  : describe;

// Test files for cross-type operations
const CROSS_TYPE_FILES: TempVaultFile[] = [
  {
    path: 'Ideas/Test Idea.md',
    content: `---
type: idea
status: raw
---

Test idea content.
`,
  },
  {
    path: 'Objectives/Tasks/Test Task.md',
    content: `---
type: task
status: active
scope: day
---

Test task content.
`,
  },
];

describePty('bulk command confirmation PTY tests', () => {
  beforeAll(() => {
    expect(existsSync(TEST_VAULT_PATH)).toBe(true);
  });

  describe('cross-type operation confirmation', () => {
    it('should prompt for confirmation on cross-type --execute and accept y', async () => {
      await withTempVault(
        ['bulk', '--all', '--set', 'custom-field=test', '--execute'],
        async (proc, vaultPath) => {
          // Should show confirmation prompt with type breakdown
          await proc.waitFor('This will modify', 10000);
          await proc.waitFor('files across all types', 5000);
          await proc.waitFor('Are you sure', 5000);

          // Confirm with y
          proc.write('y');
          proc.write(Keys.ENTER);

          // Wait for completion
          await proc.waitForStable(200);
          await proc.waitFor('Updated', 5000);

          // Verify files were modified
          const ideaContent = await readVaultFile(vaultPath, 'Ideas/Test Idea.md');
          expect(ideaContent).toContain('custom-field: test');

          const taskContent = await readVaultFile(vaultPath, 'Objectives/Tasks/Test Task.md');
          expect(taskContent).toContain('custom-field: test');
        },
        { files: CROSS_TYPE_FILES }
      );
    }, 30000);

    it('should abort on n during confirmation', async () => {
      await withTempVault(
        ['bulk', '--all', '--set', 'custom-field=test', '--execute'],
        async (proc, vaultPath) => {
          // Should show confirmation prompt
          await proc.waitFor('This will modify', 10000);
          await proc.waitFor('Are you sure', 5000);

          // Decline with n
          proc.write('n');
          proc.write(Keys.ENTER);

          // Wait for exit
          await proc.waitForStable(200);
          await proc.waitFor('cancelled', 5000);

          // Verify files were NOT modified
          const ideaContent = await readVaultFile(vaultPath, 'Ideas/Test Idea.md');
          expect(ideaContent).not.toContain('custom-field');
        },
        { files: CROSS_TYPE_FILES }
      );
    }, 30000);

    it('should abort on Ctrl+C during confirmation', async () => {
      await withTempVault(
        ['bulk', '--all', '--set', 'custom-field=test', '--execute'],
        async (proc, vaultPath) => {
          // Should show confirmation prompt
          await proc.waitFor('This will modify', 10000);
          await proc.waitFor('Are you sure', 5000);

          // Cancel with Ctrl+C
          proc.write(Keys.CTRL_C);

          // Wait for exit
          await proc.waitForExit(5000);

          // Verify files were NOT modified
          const ideaContent = await readVaultFile(vaultPath, 'Ideas/Test Idea.md');
          expect(ideaContent).not.toContain('custom-field');
        },
        { files: CROSS_TYPE_FILES }
      );
    }, 30000);

    it('should skip confirmation with --force flag', async () => {
      await withTempVault(
        ['bulk', '--all', '--set', 'custom-field=test', '--execute', '--force'],
        async (proc, vaultPath) => {
          // Should NOT show confirmation prompt, go straight to execution
          await proc.waitFor('Updated', 10000);

          // Verify files were modified
          const ideaContent = await readVaultFile(vaultPath, 'Ideas/Test Idea.md');
          expect(ideaContent).toContain('custom-field: test');
        },
        { files: CROSS_TYPE_FILES }
      );
    }, 30000);

    it('should show type breakdown in confirmation message', async () => {
      await withTempVault(
        ['bulk', '--all', '--set', 'custom-field=test', '--execute'],
        async (proc) => {
          // Should show confirmation with type counts
          await proc.waitFor('This will modify', 10000);
          
          // Should show the types in the breakdown
          const output = proc.getOutput();
          
          // Wait for the full message to appear
          await proc.waitFor('Are you sure', 5000);
          
          const fullOutput = proc.getOutput();
          // Should include type names in the breakdown
          expect(fullOutput).toMatch(/\d+\s+(idea|task)/);

          // Cancel to clean up
          proc.write('n');
          proc.write(Keys.ENTER);
          await proc.waitForExit(5000);
        },
        { files: CROSS_TYPE_FILES }
      );
    }, 30000);

    it('should not prompt for dry-run (no --execute)', async () => {
      await withTempVault(
        ['bulk', '--all', '--set', 'custom-field=test'],
        async (proc) => {
          // Should show dry-run output without confirmation
          await proc.waitFor('Dry run', 10000);
          await proc.waitFor('Would affect', 5000);
          
          // Should complete without prompting
          await proc.waitFor('--execute', 5000);
          
          // Should NOT have shown confirmation prompt
          const output = proc.getOutput();
          expect(output).not.toContain('Are you sure');
        },
        { files: CROSS_TYPE_FILES }
      );
    }, 30000);
  });

  describe('single-type operations (no confirmation needed)', () => {
    it('should not prompt for confirmation when type is specified', async () => {
      await withTempVault(
        ['bulk', '--type', 'idea', '--all', '--set', 'custom-field=test', '--execute'],
        async (proc, vaultPath) => {
          // Should NOT show confirmation prompt (specific type, not cross-type)
          await proc.waitFor('Updated', 10000);
          
          const output = proc.getOutput();
          expect(output).not.toContain('Are you sure');

          // Verify only idea was modified
          const ideaContent = await readVaultFile(vaultPath, 'Ideas/Test Idea.md');
          expect(ideaContent).toContain('custom-field: test');

          const taskContent = await readVaultFile(vaultPath, 'Objectives/Tasks/Test Task.md');
          expect(taskContent).not.toContain('custom-field');
        },
        { files: CROSS_TYPE_FILES }
      );
    }, 30000);
  });
});
