import { readdir } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { parseNote } from './frontmatter.js';
import { TemplateFrontmatterSchema, type Template } from '../types/schema.js';

/**
 * Template Discovery and Parsing
 * ==============================
 * 
 * Templates are markdown files stored in Templates/{type}/{subtype}/*.md
 * They provide defaults, body structure, and filename patterns for note creation.
 * 
 * Key design decisions:
 * - Strict matching: Templates ONLY apply to their exact type path (no inheritance)
 * - default.md: If present, used automatically when no --template flag specified
 * - Multiple templates: User prompted to select (with "No template" option)
 */

// ============================================================================
// Template Directory Resolution
// ============================================================================

/**
 * Get the template directory for a type path.
 * Templates are stored at Templates/{type}/{subtype}/...
 * 
 * @example
 * getTemplateDir('/vault', 'objective/task') => '/vault/Templates/objective/task'
 * getTemplateDir('/vault', 'idea') => '/vault/Templates/idea'
 */
export function getTemplateDir(vaultDir: string, typePath: string): string {
  const segments = typePath.split('/').filter(Boolean);
  return join(vaultDir, 'Templates', ...segments);
}

// ============================================================================
// Template Parsing
// ============================================================================

/**
 * Parse a template file and validate its frontmatter.
 * Returns null if the file is not a valid template.
 * 
 * A valid template must have:
 * - type: "template"
 * - template-for: type path string
 */
export async function parseTemplate(filePath: string): Promise<Template | null> {
  try {
    const { frontmatter, body } = await parseNote(filePath);
    
    // Validate frontmatter against template schema
    const result = TemplateFrontmatterSchema.safeParse(frontmatter);
    if (!result.success) {
      return null;
    }
    
    const data = result.data;
    const name = basename(filePath, '.md');
    
    const template: Template = {
      path: filePath,
      name,
      templateFor: data['template-for'],
      body: body.trim(),
    };
    
    // Only add optional properties if they have values
    if (data.description !== undefined) {
      template.description = data.description;
    }
    if (data.defaults !== undefined) {
      template.defaults = data.defaults;
    }
    if (data['prompt-fields'] !== undefined) {
      template.promptFields = data['prompt-fields'];
    }
    if (data['filename-pattern'] !== undefined) {
      template.filenamePattern = data['filename-pattern'];
    }
    
    return template;
  } catch {
    // File doesn't exist or can't be parsed
    return null;
  }
}

// ============================================================================
// Template Discovery
// ============================================================================

/**
 * Find all templates for a specific type path.
 * Only searches the exact template directory for the type (no inheritance).
 * 
 * @example
 * findTemplates('/vault', 'objective/task')
 * // Searches ONLY Templates/objective/task/*.md
 * // Does NOT search Templates/objective/*.md
 */
export async function findTemplates(
  vaultDir: string,
  typePath: string
): Promise<Template[]> {
  const templateDir = getTemplateDir(vaultDir, typePath);
  
  if (!existsSync(templateDir)) {
    return [];
  }
  
  const templates: Template[] = [];
  
  try {
    const entries = await readdir(templateDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }
      
      const filePath = join(templateDir, entry.name);
      const template = await parseTemplate(filePath);
      
      // Only include templates that match the requested type path
      if (template && template.templateFor === typePath) {
        templates.push(template);
      }
    }
  } catch {
    // Directory read error - return empty array
    return [];
  }
  
  // Sort alphabetically by name, but put "default" first
  templates.sort((a, b) => {
    if (a.name === 'default') return -1;
    if (b.name === 'default') return 1;
    return a.name.localeCompare(b.name);
  });
  
  return templates;
}

/**
 * Find the default template (default.md) for a type path.
 * Returns null if no default template exists.
 */
export async function findDefaultTemplate(
  vaultDir: string,
  typePath: string
): Promise<Template | null> {
  const templateDir = getTemplateDir(vaultDir, typePath);
  const defaultPath = join(templateDir, 'default.md');
  
  if (!existsSync(defaultPath)) {
    return null;
  }
  
  const template = await parseTemplate(defaultPath);
  
  // Verify it's actually for this type path
  if (template && template.templateFor === typePath) {
    return template;
  }
  
  return null;
}

/**
 * Find a specific template by name for a type path.
 * Returns null if the template doesn't exist or doesn't match the type path.
 */
export async function findTemplateByName(
  vaultDir: string,
  typePath: string,
  templateName: string
): Promise<Template | null> {
  const templateDir = getTemplateDir(vaultDir, typePath);
  
  // Normalize name - add .md if not present
  const fileName = templateName.endsWith('.md') ? templateName : `${templateName}.md`;
  const filePath = join(templateDir, fileName);
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  const template = await parseTemplate(filePath);
  
  // Verify it's actually for this type path
  if (template && template.templateFor === typePath) {
    return template;
  }
  
  return null;
}

// ============================================================================
// Template Body Processing
// ============================================================================

/**
 * Process template body, substituting variables with frontmatter values.
 * 
 * Supported variables:
 * - {fieldName} - Replaced with frontmatter[fieldName]
 * - {date} - Replaced with today's date (YYYY-MM-DD)
 * - {date:FORMAT} - Replaced with formatted date
 * 
 * @example
 * processTemplateBody("# {title}\n\nCreated: {date}", { title: "My Note" })
 * // => "# My Note\n\nCreated: 2025-01-15"
 */
export function processTemplateBody(
  body: string,
  frontmatter: Record<string, unknown>
): string {
  let result = body;
  
  // Replace {date:format} patterns first (more specific)
  const now = new Date();
  result = result.replace(/{date:([^}]+)}/g, (_, format: string) => {
    return formatDate(now, format);
  });
  
  // Replace {date} with today's date
  result = result.replace(/{date}/g, now.toISOString().slice(0, 10));
  
  // Replace {fieldName} with frontmatter values
  for (const [key, value] of Object.entries(frontmatter)) {
    const placeholder = `{${key}}`;
    if (result.includes(placeholder)) {
      const stringValue = formatValueForBody(value);
      result = result.split(placeholder).join(stringValue);
    }
  }
  
  return result;
}

/**
 * Format a frontmatter value for body substitution.
 */
function formatValueForBody(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
}

/**
 * Format a date with a simple format string.
 * Supports: YYYY, MM, DD, HH, mm
 */
function formatDate(date: Date, format: string): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  return format
    .replace('YYYY', date.getFullYear().toString())
    .replace('MM', pad(date.getMonth() + 1))
    .replace('DD', pad(date.getDate()))
    .replace('HH', pad(date.getHours()))
    .replace('mm', pad(date.getMinutes()));
}

// ============================================================================
// Template Selection Helpers
// ============================================================================

/**
 * Result of template resolution for the new command.
 */
export interface TemplateResolutionResult {
  /** The selected template, or null if no template should be used */
  template: Template | null;
  /** Whether the user should be prompted to select */
  shouldPrompt: boolean;
  /** Available templates for prompting */
  availableTemplates: Template[];
}

/**
 * Resolve which template to use based on CLI flags and available templates.
 * 
 * Logic:
 * - --no-template: Return null template, no prompt
 * - --template <name>: Find and return that template (error if not found)
 * - --default: Find and return default.md (error if not found)
 * - No flags:
 *   - If default.md exists: Use it automatically
 *   - If multiple templates: Prompt user to select
 *   - If no templates: No template, no prompt
 */
export async function resolveTemplate(
  vaultDir: string,
  typePath: string,
  options: {
    noTemplate?: boolean;
    templateName?: string;
    useDefault?: boolean;
  }
): Promise<TemplateResolutionResult> {
  // --no-template: Skip template system entirely
  if (options.noTemplate) {
    return { template: null, shouldPrompt: false, availableTemplates: [] };
  }
  
  // --template <name>: Find specific template
  if (options.templateName) {
    const template = await findTemplateByName(vaultDir, typePath, options.templateName);
    // Note: Caller should handle null case as an error
    return { template, shouldPrompt: false, availableTemplates: [] };
  }
  
  // --default: Find default.md
  if (options.useDefault) {
    const template = await findDefaultTemplate(vaultDir, typePath);
    // Note: Caller should handle null case as an error
    return { template, shouldPrompt: false, availableTemplates: [] };
  }
  
  // No flags: Auto-discover templates
  const templates = await findTemplates(vaultDir, typePath);
  
  if (templates.length === 0) {
    // No templates available
    return { template: null, shouldPrompt: false, availableTemplates: [] };
  }
  
  // Check for default.md
  const defaultTemplate = templates.find(t => t.name === 'default');
  if (defaultTemplate) {
    // Auto-use default.md
    return { template: defaultTemplate, shouldPrompt: false, availableTemplates: templates };
  }
  
  // Multiple templates, no default - need to prompt
  return { template: null, shouldPrompt: true, availableTemplates: templates };
}
