/**
 * System-managed or built-in frontmatter fields.
 *
 * Keep these sets small and explicit to avoid hiding schema errors.
 */

/**
 * Fields written by bwrb that should not be treated as schema-unknown.
 */
export const BWRB_BUILTIN_FRONTMATTER_FIELDS = new Set(['id', 'name']);

/**
 * Fields that are reserved/system-managed (immutability semantics).
 */
export const BWRB_RESERVED_FRONTMATTER_FIELDS = new Set(['id']);
