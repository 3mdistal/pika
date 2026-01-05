# Problem Statement
The `ovault list` command currently outputs only file names (basename without `.md`), one per line. The user wants richer output options: paths, YAML frontmatter metadata in a table format.
# Current State
* `list.sh` contains `list_objects_by_type()` which calls `list_objects_recursive()`, which calls `list_files_in_dir()` to get basenames only
* Frontmatter extraction already exists in `query.sh` (the `awk` pattern on line 55) and is also used in `ovault.sh` edit mode
* No output formatting options exist; output is plain sorted basenames
# Proposed Changes
## 1. Add `--paths` Flag
Print the full path (relative to vault) instead of just basenames.
* Modify `list_files_in_dir()` to optionally emit paths
* Add flag parsing in `list_type()` function in `ovault.sh`
## 2. Add `--fields` Flag for Metadata Display
Allow specifying frontmatter fields to display, e.g. `--fields=status,priority`.
* Extract frontmatter from each file (reuse existing awk pattern)
* Display as a simple table with column headers
## 3. Add `--format` Flag
Support different output formats:
* `plain` (default): current behavior - names only
* `paths`: equivalent to `--paths`
* `table`: tabular output with fields (requires `--fields`)
## Implementation Details
### Flag parsing in `list_type()`
```warp-runnable-command
local format="plain"
local fields=""
local show_paths=false
while [[ "$1" == --* ]]; do
    case "$1" in
        --paths) show_paths=true; shift ;;
        --fields=*) fields="${1#--fields=}"; shift ;;
        --format=*) format="${1#--format=}"; shift ;;
        *) shift ;;
    esac
done
```
### New function: `extract_frontmatter_field()`
Extract a single field value from a file's frontmatter.
### New function: `print_table()`
Print results in aligned columns using `column` or `printf`.
### Modify `list_files_in_dir()` and `list_objects_recursive()`
Return full paths instead of basenames, let caller decide formatting.
## Files to Modify
* `lib/list.sh`: Core listing logic, add path support and field extraction
* `ovault.sh`: Add flag parsing in `list_type()` function
## Testing
* Add test cases in `tests/test_list.sh` for new flags
* Test: `--paths`, `--fields=status`, combination of both
