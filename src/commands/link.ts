/**
 * Link command - generate a wikilink to a note.
 * 
 * Resolves a query to a note and outputs the shortest unambiguous
 * wikilink (basename if unique, else vault-relative path without .md).
 */

import { Command } from 'commander';
import { resolveVaultDir } from '../lib/vault.js';
import { loadSchema } from '../lib/schema.js';
import { printError } from '../lib/prompt.js';
import { printJson, jsonSuccess, jsonError, ExitCodes } from '../lib/output.js';
import {
  buildNoteIndex,
  resolveNoteQuery,
  getShortestWikilinkTarget,
  generateWikilink,
  type ManagedFile,
} from '../lib/navigation.js';
import { pickFile, parsePickerMode, type PickerMode } from '../lib/picker.js';

// ============================================================================
// Types
// ============================================================================

interface LinkOptions {
  picker?: string;
  output?: string;
  bare?: boolean;
}

// ============================================================================
// Command Definition
// ============================================================================

export const linkCommand = new Command('link')
  .description('Generate a wikilink to a note')
  .argument('[query]', 'Note name, basename, or path to link to (omit to browse all)')
  .option('--picker <mode>', 'Selection mode: auto (default), fzf, numbered, none')
  .option('-o, --output <format>', 'Output format: text (default) or json')
  .option('--bare', 'Output just the link target without brackets')
  .addHelpText('after', `
Output:
  By default, outputs [[Target]] format.
  Use --bare to get just the target (without brackets).
  
  Link target uses shortest unambiguous form:
  - Basename if unique across vault (e.g., "My Note")
  - Vault-relative path without .md if not unique (e.g., "Ideas/My Note")

Picker Modes:
  auto        Use fzf if available, else numbered select (default)
  fzf         Force fzf (error if unavailable)
  numbered    Force numbered select
  none        Error on ambiguity (for non-interactive use)

Examples:
  ovault link                              # Browse all notes with picker
  ovault link "My Note"                    # Output: [[My Note]]
  ovault link "My Note" --bare             # Output: My Note
  ovault link "Amb" --picker none --output json  # Scripting mode
  
  # Use with clipboard (macOS)
  ovault link "My Note" | pbcopy
  
  # Use in Neovim (Lua)
  local link = vim.fn.system("ovault link 'My Note' --picker none --bare")`)
  .action(async (query: string | undefined, options: LinkOptions, cmd: Command) => {
    const jsonMode = options.output === 'json';
    const pickerMode = parsePickerMode(options.picker);
    const bare = options.bare ?? false;

    // JSON mode implies non-interactive
    const effectivePickerMode: PickerMode = jsonMode ? 'none' : pickerMode;

    try {
      const parentOpts = cmd.parent?.opts() as { vault?: string } | undefined;
      const vaultDir = resolveVaultDir(parentOpts ?? {});
      const schema = await loadSchema(vaultDir);

      // Build note index
      const index = await buildNoteIndex(schema, vaultDir);

      let targetFile: ManagedFile | null = null;

      if (!query) {
        // No query - show picker with all files
        if (index.allFiles.length === 0) {
          const error = 'No notes found in vault';
          if (jsonMode) {
            printJson(jsonError(error));
            process.exit(ExitCodes.VALIDATION_ERROR);
          }
          printError(error);
          process.exit(1);
        }

        const pickerResult = await pickFile(index.allFiles, {
          mode: effectivePickerMode,
          prompt: 'Select note to link',
        });

        if (pickerResult.error) {
          if (jsonMode) {
            printJson(jsonError(pickerResult.error));
            process.exit(ExitCodes.VALIDATION_ERROR);
          }
          printError(pickerResult.error);
          process.exit(1);
        }

        if (pickerResult.cancelled || !pickerResult.selected) {
          process.exit(0);
        }

        targetFile = pickerResult.selected;
      } else {
        // Query provided - resolve it
        const resolution = resolveNoteQuery(index, query);

        if (resolution.exact) {
          // Unambiguous match
          targetFile = resolution.exact;
        } else if (resolution.candidates.length > 0) {
          // Ambiguous or fuzzy match - use picker
          const pickerResult = await pickFile(resolution.candidates, {
            mode: effectivePickerMode,
            prompt: 'Select note to link',
          });

          if (pickerResult.error) {
            if (jsonMode) {
              const errorDetails = pickerResult.candidates
                ? {
                    errors: pickerResult.candidates.map(c => ({
                      field: 'candidate',
                      value: c.relativePath,
                      message: 'Matching file',
                    })),
                  }
                : {};
              printJson(jsonError(pickerResult.error, errorDetails));
              process.exit(ExitCodes.VALIDATION_ERROR);
            }
            printError(pickerResult.error);
            if (pickerResult.candidates && pickerResult.candidates.length > 0) {
              console.error('\nMatching files:');
              for (const c of pickerResult.candidates) {
                console.error(`  ${c.relativePath}`);
              }
            }
            process.exit(1);
          }

          if (pickerResult.cancelled || !pickerResult.selected) {
            // User cancelled
            process.exit(0);
          }

          targetFile = pickerResult.selected;
        } else {
          // No matches at all
          const error = `No matching notes found for: ${query}`;
          if (jsonMode) {
            printJson(jsonError(error));
            process.exit(ExitCodes.VALIDATION_ERROR);
          }
          printError(error);
          process.exit(1);
        }
      }

      // Generate wikilink
      const linkTarget = getShortestWikilinkTarget(index, targetFile);
      const wikilink = generateWikilink(index, targetFile);

      if (jsonMode) {
        printJson(jsonSuccess({
          data: {
            target: linkTarget,
            wikilink: wikilink,
            relativePath: targetFile.relativePath,
            absolutePath: targetFile.path,
          },
        }));
      } else {
        console.log(bare ? linkTarget : wikilink);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (jsonMode) {
        printJson(jsonError(message));
        process.exit(ExitCodes.VALIDATION_ERROR);
      }
      printError(message);
      process.exit(1);
    }
  });
