/**
 * Schema entity picker prompts and inference helpers.
 */

import { promptSelection } from '../../../lib/prompt.js';
import { getTypeNames, getAllOwnFieldNames } from '../../../lib/schema.js';
import type { LoadedSchema } from '../../../types/schema.js';

export type SchemaEntityType = 'type' | 'field';

/**
 * Result of inferring what a name refers to in the schema.
 */
export type SchemaEntityMatch =
  | { kind: 'type' }
  | { kind: 'field' }
  | { kind: 'both' }  // Name matches both a type and a field
  | { kind: 'none' }; // Name doesn't match anything

/**
 * Infer whether a name refers to a type or field in the schema.
 * Used by schema edit/delete commands to skip the "type or field?" prompt
 * when the name unambiguously identifies one or the other.
 */
export function inferSchemaEntity(
  schema: LoadedSchema,
  name: string
): SchemaEntityMatch {
  const typeNames = getTypeNames(schema).filter(t => t !== 'meta');
  const fieldNames = getAllOwnFieldNames(schema);

  const isType = typeNames.includes(name);
  const isField = fieldNames.includes(name);

  if (isType && isField) return { kind: 'both' };
  if (isType) return { kind: 'type' };
  if (isField) return { kind: 'field' };
  return { kind: 'none' };
}

/**
 * Prompt user to select what kind of schema entity to work with.
 */
export async function promptSchemaEntityType(action: string): Promise<SchemaEntityType | null> {
  const result = await promptSelection(`What do you want to ${action}?`, [
    'type',
    'field',
  ]);
  if (result === null) return null;
  return result as SchemaEntityType;
}

/**
 * Prompt for type selection from available types.
 */
export async function promptTypePicker(schema: LoadedSchema, message: string = 'Select type'): Promise<string | null> {
  const typeNames = getTypeNames(schema).filter(t => t !== 'meta');
  if (typeNames.length === 0) {
    throw new Error('No types defined in schema');
  }
  return promptSelection(message, typeNames);
}

/**
 * Prompt for field selection from a type's own fields.
 */
export async function promptFieldPicker(
  schema: LoadedSchema, 
  typeName: string, 
  message: string = 'Select field'
): Promise<string | null> {
  const typeEntry = schema.raw.types[typeName];
  if (!typeEntry?.fields || Object.keys(typeEntry.fields).length === 0) {
    throw new Error(`Type "${typeName}" has no own fields to select`);
  }
  const fieldNames = Object.keys(typeEntry.fields);
  return promptSelection(message, fieldNames);
}

/**
 * Get all types that define a specific field as an own field.
 * Returns type names where the field is defined directly (not inherited).
 * Results are sorted alphabetically for deterministic ordering in prompts.
 */
export function getTypesWithOwnField(schema: LoadedSchema, fieldName: string): string[] {
  const types: string[] = [];
  
  for (const [typeName, typeDef] of Object.entries(schema.raw.types)) {
    if (typeDef.fields && Object.hasOwn(typeDef.fields, fieldName)) {
      types.push(typeName);
    }
  }
  
  return types.sort();
}
