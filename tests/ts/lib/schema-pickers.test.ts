import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadSchema } from '../../../src/lib/schema.js';
import {
  inferSchemaEntity,
  getTypesWithOwnField,
} from '../../../src/commands/schema/helpers/pickers.js';
import { createTestVault, cleanupTestVault } from '../fixtures/setup.js';
import type { LoadedSchema } from '../../../src/types/schema.js';

describe('schema pickers helpers', () => {
  let vaultDir: string;
  let schema: LoadedSchema;

  beforeAll(async () => {
    vaultDir = await createTestVault();
    schema = await loadSchema(vaultDir);
  });

  afterAll(async () => {
    await cleanupTestVault(vaultDir);
  });

  describe('inferSchemaEntity', () => {
    it('should return "type" for known type names', () => {
      const result = inferSchemaEntity(schema, 'task');
      expect(result.kind).toBe('type');
    });

    it('should return "type" for parent types', () => {
      const result = inferSchemaEntity(schema, 'objective');
      expect(result.kind).toBe('type');
    });

    it('should return "field" for known field names', () => {
      // 'deadline' is a field on task but not a type name
      const result = inferSchemaEntity(schema, 'deadline');
      expect(result.kind).toBe('field');
    });

    it('should return "field" for fields that exist on multiple types', () => {
      // 'status' exists on task, milestone, idea, project, research
      const result = inferSchemaEntity(schema, 'priority');
      expect(result.kind).toBe('field');
    });

    it('should return "none" for unknown names', () => {
      const result = inferSchemaEntity(schema, 'nonexistent');
      expect(result.kind).toBe('none');
    });

    it('should return "both" when name matches type and field', async () => {
      // Create a schema where a name is both a type and a field
      const tempDir = await mkdtemp(join(tmpdir(), 'bwrb-both-test-'));
      try {
        await mkdir(join(tempDir, '.bwrb'), { recursive: true });
        await writeFile(
          join(tempDir, '.bwrb/schema.json'),
          JSON.stringify({
            version: 2,
            types: {
              // 'status' is a type name
              status: {
                fields: {
                  value: { prompt: 'text' }
                }
              },
              task: {
                fields: {
                  // 'status' is also a field name
                  status: { prompt: 'select', options: ['raw', 'done'] }
                }
              }
            }
          })
        );

        const testSchema = await loadSchema(tempDir);
        const result = inferSchemaEntity(testSchema, 'status');
        expect(result.kind).toBe('both');
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should not match meta type', () => {
      // 'meta' should not be matched as a type for editing
      const result = inferSchemaEntity(schema, 'meta');
      expect(result.kind).toBe('none');
    });
  });

  describe('getTypesWithOwnField', () => {
    it('should return types that define a field', () => {
      // 'status' is defined on task, milestone, idea, project, research
      const types = getTypesWithOwnField(schema, 'status');
      expect(types).toContain('task');
      expect(types).toContain('milestone');
      expect(types).toContain('idea');
    });

    it('should return single type for unique field', () => {
      // 'milestone' field is only defined on task
      const types = getTypesWithOwnField(schema, 'milestone');
      expect(types).toEqual(['task']);
    });

    it('should return types in sorted order for deterministic prompts', () => {
      // 'status' is defined on multiple types - should be sorted alphabetically
      const types = getTypesWithOwnField(schema, 'status');
      const sorted = [...types].sort();
      expect(types).toEqual(sorted);
    });

    it('should return empty array for unknown field', () => {
      const types = getTypesWithOwnField(schema, 'nonexistent');
      expect(types).toEqual([]);
    });

    it('should not return types that only inherit the field', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'bwrb-inherit-test-'));
      try {
        await mkdir(join(tempDir, '.bwrb'), { recursive: true });
        await writeFile(
          join(tempDir, '.bwrb/schema.json'),
          JSON.stringify({
            version: 2,
            types: {
              meta: {
                fields: {
                  created: { prompt: 'date' }
                }
              },
              task: {
                extends: 'meta',
                fields: {
                  status: { prompt: 'text' }
                }
                // task inherits 'created' from meta
              }
            }
          })
        );

        const testSchema = await loadSchema(tempDir);
        
        // 'created' is only defined on meta, not task
        const types = getTypesWithOwnField(testSchema, 'created');
        expect(types).toEqual(['meta']);
        expect(types).not.toContain('task');
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
