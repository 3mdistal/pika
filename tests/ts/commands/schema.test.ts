import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { createTestVault, cleanupTestVault, runCLI } from '../fixtures/setup.js';

describe('schema command', () => {
  let vaultDir: string;

  beforeAll(async () => {
    vaultDir = await createTestVault();
  });

  afterAll(async () => {
    await cleanupTestVault(vaultDir);
  });

  describe('schema show (all types)', () => {
    it('should show schema tree', async () => {
      const result = await runCLI(['schema', 'show'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Schema Types');
      expect(result.stdout).toContain('Types:');
    });

    it('should list all type families', async () => {
      const result = await runCLI(['schema', 'show'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('objective');
      expect(result.stdout).toContain('idea');
    });

    it('should show subtypes', async () => {
      const result = await runCLI(['schema', 'show'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('task');
      expect(result.stdout).toContain('milestone');
    });

    it('should show enums if defined', async () => {
      const result = await runCLI(['schema', 'show'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Enums:');
      expect(result.stdout).toContain('status');
    });

    it('should show enums when defined', async () => {
      // Note: shared_fields is a v1 feature that gets resolved into individual types
      // in the v2 model, so we no longer display a separate "Shared Fields:" section.
      // Instead we verify the schema display works correctly with enums.
      const result = await runCLI(['schema', 'show'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Enums:');
      expect(result.stdout).toContain('Types:');
    });
  });

  describe('schema show <type>', () => {
    it('should show type details for leaf type', async () => {
      const result = await runCLI(['schema', 'show', 'idea'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Type: idea');
      expect(result.stdout).toContain('Output Dir:');
      expect(result.stdout).toContain('Ideas');
      expect(result.stdout).toContain('Own fields:');
    });

    it('should show fields for type', async () => {
      const result = await runCLI(['schema', 'show', 'idea'], vaultDir);

      expect(result.exitCode).toBe(0);
      // Note: 'type' is not shown as a field since it's auto-injected in the new model
      expect(result.stdout).toContain('status');
      expect(result.stdout).toContain('priority');
    });

    it('should show subtype details with slash notation', async () => {
      const result = await runCLI(['schema', 'show', 'objective/task'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Type: objective/task');
      expect(result.stdout).toContain('Objectives/Tasks');
    });

    it('should show subtypes for parent type', async () => {
      const result = await runCLI(['schema', 'show', 'objective'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Subtypes:');
      expect(result.stdout).toContain('task');
      expect(result.stdout).toContain('milestone');
    });

    it('should show body sections if defined', async () => {
      const result = await runCLI(['schema', 'show', 'objective/task'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Body Sections:');
      expect(result.stdout).toContain('Steps');
      expect(result.stdout).toContain('Notes');
    });

    it('should error on unknown type', async () => {
      const result = await runCLI(['schema', 'show', 'nonexistent'], vaultDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown type');
    });

    it('should show "(none)" when type has no own fields', async () => {
      // Create a v2 schema with a type that has no own fields
      const tempVaultDir = await mkdtemp(join(tmpdir(), 'pika-noownfields-'));
      await mkdir(join(tempVaultDir, '.pika'), { recursive: true });
      await writeFile(
        join(tempVaultDir, '.pika', 'schema.json'),
        JSON.stringify({
          version: 2,
          types: {
            meta: {
              fields: {
                created: { prompt: 'date', required: true }
              }
            },
            note: {
              extends: 'meta'
              // No own fields - inherits only from meta
            }
          }
        })
      );

      try {
        const result = await runCLI(['schema', 'show', 'note'], tempVaultDir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Own fields:');
        expect(result.stdout).toContain('(none)');
        expect(result.stdout).toContain('Inherited fields (from meta):');
        expect(result.stdout).toContain('created');
      } finally {
        await rm(tempVaultDir, { recursive: true, force: true });
      }
    });

    it('should show "(none)" when type has no inherited fields', async () => {
      // meta type has no parent, so no inherited fields
      const tempVaultDir = await mkdtemp(join(tmpdir(), 'pika-noinherited-'));
      await mkdir(join(tempVaultDir, '.pika'), { recursive: true });
      await writeFile(
        join(tempVaultDir, '.pika', 'schema.json'),
        JSON.stringify({
          version: 2,
          types: {
            meta: {
              fields: {
                created: { prompt: 'date', required: true }
              }
            }
          }
        })
      );

      try {
        const result = await runCLI(['schema', 'show', 'meta'], tempVaultDir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Own fields:');
        expect(result.stdout).toContain('created');
        expect(result.stdout).toContain('Inherited fields:');
        expect(result.stdout).toMatch(/Inherited fields:\s*\n\s*\(none\)/);
      } finally {
        await rm(tempVaultDir, { recursive: true, force: true });
      }
    });

    it('should group inherited fields by origin type', async () => {
      // Create a v2 schema with a 3-level inheritance chain
      const tempVaultDir = await mkdtemp(join(tmpdir(), 'pika-inheritance-'));
      await mkdir(join(tempVaultDir, '.pika'), { recursive: true });
      await writeFile(
        join(tempVaultDir, '.pika', 'schema.json'),
        JSON.stringify({
          version: 2,
          enums: { status: ['raw', 'done'] },
          types: {
            meta: {
              fields: {
                created: { prompt: 'date', required: true }
              }
            },
            objective: {
              extends: 'meta',
              fields: {
                status: { prompt: 'select', enum: 'status' }
              }
            },
            task: {
              extends: 'objective',
              fields: {
                deadline: { prompt: 'input' }
              }
            }
          }
        })
      );

      try {
        const result = await runCLI(['schema', 'show', 'task'], tempVaultDir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Own fields:');
        expect(result.stdout).toContain('deadline');
        expect(result.stdout).toContain('Inherited fields (from objective):');
        expect(result.stdout).toContain('status');
        expect(result.stdout).toContain('Inherited fields (from meta):');
        expect(result.stdout).toContain('created');
      } finally {
        await rm(tempVaultDir, { recursive: true, force: true });
      }
    });
  });

  describe('schema show <type> --output json', () => {
    it('should include own_fields and inherited_fields in JSON output', async () => {
      // Create a v2 schema with inheritance
      const tempVaultDir = await mkdtemp(join(tmpdir(), 'pika-json-'));
      await mkdir(join(tempVaultDir, '.pika'), { recursive: true });
      await writeFile(
        join(tempVaultDir, '.pika', 'schema.json'),
        JSON.stringify({
          version: 2,
          enums: { status: ['raw', 'done'] },
          types: {
            meta: {
              fields: {
                created: { prompt: 'date', required: true }
              }
            },
            task: {
              extends: 'meta',
              fields: {
                status: { prompt: 'select', enum: 'status' }
              }
            }
          }
        })
      );

      try {
        const result = await runCLI(['schema', 'show', 'task', '-o', 'json'], tempVaultDir);

        expect(result.exitCode).toBe(0);
        const json = JSON.parse(result.stdout);
        
        // Should have own_fields
        expect(json.own_fields).toBeDefined();
        expect(json.own_fields.status).toBeDefined();
        expect(json.own_fields.status.type).toBe('select');
        
        // Should have inherited_fields grouped by origin
        expect(json.inherited_fields).toBeDefined();
        expect(json.inherited_fields.meta).toBeDefined();
        expect(json.inherited_fields.meta.created).toBeDefined();
        expect(json.inherited_fields.meta.created.type).toBe('date');
        expect(json.inherited_fields.meta.created.required).toBe(true);
        
        // Should also have fields (backwards compatible merged fields)
        expect(json.fields).toBeDefined();
        expect(json.fields.status).toBeDefined();
        expect(json.fields.created).toBeDefined();
        
        // Should have extends
        expect(json.extends).toBe('meta');
      } finally {
        await rm(tempVaultDir, { recursive: true, force: true });
      }
    });

    it('should omit inherited_fields when empty', async () => {
      // Create a v2 schema where meta has no parent
      const tempVaultDir = await mkdtemp(join(tmpdir(), 'pika-json-noinherit-'));
      await mkdir(join(tempVaultDir, '.pika'), { recursive: true });
      await writeFile(
        join(tempVaultDir, '.pika', 'schema.json'),
        JSON.stringify({
          version: 2,
          types: {
            meta: {
              fields: {
                created: { prompt: 'date' }
              }
            }
          }
        })
      );

      try {
        const result = await runCLI(['schema', 'show', 'meta', '-o', 'json'], tempVaultDir);

        expect(result.exitCode).toBe(0);
        const json = JSON.parse(result.stdout);
        
        // Should have own_fields
        expect(json.own_fields).toBeDefined();
        expect(json.own_fields.created).toBeDefined();
        
        // Should NOT have inherited_fields (since empty)
        expect(json.inherited_fields).toBeUndefined();
      } finally {
        await rm(tempVaultDir, { recursive: true, force: true });
      }
    });

    it('should include extends field in JSON output', async () => {
      const result = await runCLI(['schema', 'show', 'idea', '-o', 'json'], vaultDir);

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      
      // Extends should be present (meta in this case, from v1 conversion)
      expect(json.extends).toBe('meta');
    });
  });

  describe('schema validate', () => {
    it('should validate valid schema', async () => {
      const result = await runCLI(['schema', 'validate'], vaultDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Schema is valid');
    });

    it('should error on invalid schema', async () => {
      // Create a vault with invalid schema
      const invalidVaultDir = await mkdtemp(join(tmpdir(), 'pika-invalid-'));
      await mkdir(join(invalidVaultDir, '.pika'), { recursive: true });
      await writeFile(
        join(invalidVaultDir, '.pika', 'schema.json'),
        JSON.stringify({ invalid: 'schema' })
      );

      try {
        const result = await runCLI(['schema', 'validate'], invalidVaultDir);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Schema validation failed');
      } finally {
        await rm(invalidVaultDir, { recursive: true, force: true });
      }
    });

    it('should error when schema file is missing', async () => {
      // Create a vault with no schema
      const noSchemaVaultDir = await mkdtemp(join(tmpdir(), 'pika-noschema-'));

      try {
        const result = await runCLI(['schema', 'validate'], noSchemaVaultDir);

        expect(result.exitCode).toBe(1);
      } finally {
        await rm(noSchemaVaultDir, { recursive: true, force: true });
      }
    });

    it('should error on malformed JSON', async () => {
      // Create a vault with malformed JSON
      const malformedVaultDir = await mkdtemp(join(tmpdir(), 'pika-malformed-'));
      await mkdir(join(malformedVaultDir, '.pika'), { recursive: true });
      await writeFile(
        join(malformedVaultDir, '.pika', 'schema.json'),
        '{ invalid json'
      );

      try {
        const result = await runCLI(['schema', 'validate'], malformedVaultDir);

        expect(result.exitCode).toBe(1);
      } finally {
        await rm(malformedVaultDir, { recursive: true, force: true });
      }
    });
  });
});
