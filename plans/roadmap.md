# ovault Roadmap

> Schema-driven management for Obsidian vaults — evolving into a comprehensive CLI for structured note management, auditing, and agentic workflows.

---

## Current State (v1)

**Implemented:**
- `ovault new [type]` — Interactive note creation with schema-driven frontmatter
- `ovault edit <file>` — Edit existing frontmatter fields
- `ovault list [options] <type>` — List/filter objects with table output
- `ovault help` — Usage documentation
- Hierarchical type/subtype navigation
- Dynamic sources for field queries (e.g., active milestones)
- Multi-vault support via `--vault` flag and `OVAULT_VAULT` env var
- Schema validation (`validate_schema.sh`)

---

## Planned Features

### Tier 1: Low-Hanging Fruit

#### Open in Obsidian
Add ability to open notes directly in Obsidian from the CLI.

```bash
ovault open <file>                    # Open file in Obsidian
ovault new idea --open                # Create and open
ovault edit Tasks/My\ Task.md --open  # Edit and open
ovault list idea | fzf | xargs ovault open  # Fuzzy find and open
```

Implementation: Use Obsidian's URI scheme `open "obsidian://open?vault=NAME&file=PATH"`.

#### Shared Fields (Global Frontmatter)

Currently, fields like `status` are defined separately in each type, leading to duplication and inconsistency (e.g., `entity/person` has no status). We need a way to define **shared fields** that apply to all notes.

**Required shared fields:**
- `status` — Every note should have a status (enum)
- `scopes` — Every note should have scopes (array of strings)

**Proposed schema structure:**

```json
{
  "shared_fields": {
    "status": {
      "prompt": "select",
      "enum": "status",
      "default": "inbox",
      "required": true
    },
    "scopes": {
      "prompt": "multi-input",
      "label": "Scopes (comma-separated)",
      "list_format": "yaml-array",
      "default": []
    }
  },
  "enums": {
    "status": ["inbox", "backlog", "planned", "in-progress", "done", "cancelled"]
  },
  "types": { ... }
}
```

**Behavior:**
- Shared fields are automatically included in every type's frontmatter
- Type-specific fields can override shared field defaults
- `frontmatter_order` in types can position shared fields (or they appear first by default)
- Audit will check shared fields across all notes

**Implementation changes needed:**
1. Update `schema.schema.json` to allow `shared_fields` at root level
2. Modify `create_new()` to merge shared fields with type-specific fields
3. Modify `edit_existing()` to include shared fields
4. Update `list.sh` validation to recognize shared fields
5. Audit should verify shared fields exist on all managed notes

**Example with shared fields:**

```json
{
  "shared_fields": {
    "status": { "prompt": "select", "enum": "status", "default": "inbox" },
    "scopes": { "prompt": "multi-input", "list_format": "yaml-array" }
  },
  "types": {
    "idea": {
      "output_dir": "Ideas",
      "frontmatter": {
        "type": { "value": "idea" },
        "priority": { "prompt": "select", "enum": "priority" }
      },
      "frontmatter_order": ["type", "status", "scopes", "priority"]
    }
  }
}
```

Generated frontmatter for a new idea:
```yaml
---
type: idea
status: inbox
scopes:
  - personal
  - q1-2025
priority: medium
---
```

**Migration path:**
1. Add `shared_fields` to schema
2. Run `ovault audit` to find notes missing `status` or `scopes`
3. Run `ovault bulk --set status=inbox --where status=` to backfill
4. Run `ovault bulk --set scopes=[] --where scopes=` to add empty arrays

---

#### Task Field Improvements
Schema changes to improve task management:

| Change | From | To |
|--------|------|-----|
| Rename status values | `raw`, `in-flight` | `inbox`, `in-progress` |
| Add completion tracking | — | `completion-date` field |
| Add scoping | — | `scope` enum (day, week, sprint, quarter, year) |
| Add nesting | — | `parent-task` dynamic source |

```json
{
  "enums": {
    "status": ["inbox", "backlog", "planned", "in-progress", "done", "cancelled"],
    "scope": ["day", "week", "sprint", "quarter", "year"]
  }
}
```

---

### Tier 2: Audit & Bulk Operations

#### `ovault audit` Command

Validate files against schema and surface mismatches.

```bash
ovault audit                      # Check all files
ovault audit objective/task       # Check specific type
ovault audit --fix                # Interactive repair mode
ovault audit --fix --auto         # Automatic fixes where unambiguous
ovault audit --strict             # Error on unknown fields
```

**Mismatch Types Detected:**

| Issue | Example | Correction |
|-------|---------|------------|
| Invalid enum value | `status: wip` | Prompt to select valid value |
| Missing required field | No `milestone` | Prompt to fill or set default |
| Wrong directory | Task in `Ideas/` | Move file |
| Unknown field | `foo: bar` | Warn (error in `--strict` mode) |
| Type mismatch | `type: taks` | Prompt to correct |
| Orphan file | No `type` field | Assign type or ignore |
| Format violation | Missing wikilink brackets | Reformat automatically |
| Stale reference | Link to deleted file | Prompt to update or clear |

**Behavior:**
- Default: Report only (no changes)
- `--fix`: Interactive, walk through each issue
- `--fix --auto`: Apply unambiguous fixes automatically
- `--strict`: Unknown fields (not in schema) are errors

**Unknown Fields Handling:**
- Default: Warn but don't error
- Obsidian-native fields (`tags`, `aliases`, `cssclasses`, `publish`) always allowed
- Schema can define additional allowed fields:
  ```json
  { "allowed_extra_fields": ["custom-field"] }
  ```

#### `ovault bulk` Command

User-driven mass changes across filtered file sets.

```bash
# Set field value
ovault bulk objective/task --set status=in-progress --where status=wip

# Clear field
ovault bulk objective/task --set deadline= --where status=settled

# Move files
ovault bulk idea --move Archive/Ideas --where status=settled

# Rename field (for migrations)
ovault bulk objective --rename old-field=new-field

# Multiple conditions
ovault bulk objective/task --set status=done --where status=in-progress --where scope=day
```

**Operations:**

| Operation | Syntax | Notes |
|-----------|--------|-------|
| Set field | `--set field=value` | Overwrites or adds |
| Clear field | `--set field=` | Removes field entirely |
| Rename field | `--rename old=new` | For schema migrations |
| Delete field | `--delete field` | Explicit removal |
| Move file | `--move path/` | Relocate + update references |
| Append to list | `--append tags=newtag` | For list-type fields |
| Remove from list | `--remove tags=oldtag` | For list-type fields |

**Safety Features:**

1. **Dry-run by default**
   ```bash
   ovault bulk objective/task --set status=done --where status=in-progress
   # Would affect 12 files:
   #   Objectives/Tasks/Task A.md
   #   Objectives/Tasks/Task B.md
   #   ...
   # Run with --execute to apply changes.
   ```

2. **Backup option**
   ```bash
   ovault bulk ... --execute --backup
   # Creates .ovault/backups/2024-01-15T10:30:00/
   ```

3. **Git awareness**
   ```
   Warning: You have uncommitted changes. Bulk edit will modify files.
   Continue? [y/N]
   ```

4. **Limit flag**
   ```bash
   ovault bulk ... --execute --limit=5
   ```

#### Wikilink Auto-Update on File Move

When `bulk --move` relocates files, automatically update all references:

```bash
ovault bulk idea --move Archive/Ideas --where status=settled --execute
# Moving 5 files...
# Updating 12 wikilinks across 8 files...
# Done.
```

**Implementation:**
- Ripgrep for `[[filename]]` and `[[filename|alias]]` patterns
- Regex: `\[\[([^\]|]+)(\|[^\]]+)?\]\]`
- Replace only the link portion, preserve aliases
- Handle variations: `[[File]]`, `[[File|Alias]]`, `[[File#Heading]]`, `[[File#Heading|Alias]]`

---

### Tier 3: Schema Management

#### `ovault schema` Command

Interactive schema exploration and manipulation.

```bash
# Exploration
ovault schema show                    # Tree view of all types
ovault schema show objective/task     # Show specific type definition
ovault schema validate                # Validate schema.json structure

# Manipulation
ovault schema add-type writing        # Interactive type creation
ovault schema add-field deadline task # Add field to existing type
ovault schema add-enum priority       # Create new enum
ovault schema edit-enum status --add archived
ovault schema edit-enum status --rename in-flight=in-progress
ovault schema edit-enum status --remove deprecated-value
```

**Benefits:**
- Avoid manual JSON editing (error-prone)
- Guided prompts for field configuration
- Automatic schema validation after changes

---

### Tier 4: Templates & Recurrence

#### Task Templating

Store reusable templates for common task types:

```
.ovault/
  templates/
    weekly-review.json
    blog-post.json
    bug-report.json
```

```bash
ovault new --template blog-post
ovault new --template weekly-review --set title="Week 23 Review"
```

Template format:
```json
{
  "type": "objective/task",
  "defaults": {
    "status": "inbox",
    "scope": "week",
    "tags": ["review"]
  },
  "body_preset": "## Wins\n\n## Challenges\n\n## Next Week\n"
}
```

#### Recurrence

Define recurring task rules:

```json
{
  "name": "weekly-review",
  "template": "weekly-review",
  "schedule": "0 9 * * 1",
  "title_pattern": "Weekly Review - {date:YYYY-MM-DD}"
}
```

```bash
ovault recur list                 # Show configured recurrences
ovault recur spawn                # Create due instances
ovault recur spawn --dry-run      # Preview what would be created
```

---

### Tier 5: Query & Base Generation

#### Base Generation

Generate Obsidian Dataview/DB Folder queries from CLI filters:

```bash
ovault base objective/task --where status=in-progress --where scope=week
```

Output:
```dataview
TABLE status, scope, deadline
FROM "Objectives/Tasks"
WHERE status = "in-progress" AND scope = "week"
SORT deadline ASC
```

```bash
ovault base idea --where status!=settled --format=db-folder
```

**Use cases:**
- Generate dashboard queries
- Create filtered views without learning Dataview syntax
- Keep dashboards read-only (queries managed via CLI)

#### Additional Output Formats

```bash
ovault list objective/task --format=json
ovault list objective/task --format=csv
ovault list objective/task --format=dataview
```

---

### Tier 6: Writing Management

New type family for structured writing projects:

```json
{
  "types": {
    "writing": {
      "subtypes": {
        "draft": {
          "output_dir": "Writing/{project}",
          "frontmatter": {
            "type": { "value": "writing" },
            "writing-type": { "value": "draft" },
            "project": { "prompt": "input", "required": true },
            "status": { "prompt": "select", "enum": "writing-status" }
          },
          "body_sections": [
            { "title": "Outline", "level": 2 },
            { "title": "Draft", "level": 2 }
          ]
        },
        "notes": { ... },
        "research": { ... },
        "proposal": { ... }
      }
    }
  },
  "enums": {
    "writing-status": ["idea", "outlining", "drafting", "revising", "editing", "complete"]
  }
}
```

```bash
ovault new writing/draft --set project="Q1 Blog Post"
# Creates: Writing/Q1 Blog Post/Draft.md

ovault new writing/research --set project="Q1 Blog Post"
# Creates: Writing/Q1 Blog Post/Research.md
```

---

### Tier 7: Agentic Workflows

#### Architecture

ovault as a **harness** for AI agents, not an agent itself:

```
┌─────────────────────────────────────────────────┐
│                  Obsidian Vault                 │
│  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │  Prompts/  │  │  Workflows │  │  Results  │  │
│  │   Agents   │  │            │  │           │  │
│  └────────────┘  └────────────┘  └───────────┘  │
└─────────────────────────────────────────────────┘
           │                │              ▲
           ▼                ▼              │
┌─────────────────────────────────────────────────┐
│                    ovault                        │
│  • Reads workflow definitions                   │
│  • Manages execution state                      │
│  • Writes results back to vault                 │
└─────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────┐
│            OpenCode / LLM Providers             │
│  • Actually executes prompts                    │
│  • Returns structured results                   │
└─────────────────────────────────────────────────┘
```

#### Prompt & Agent Storage

Schema types for managing AI assets:

```json
{
  "types": {
    "prompt": {
      "output_dir": ".ovault/prompts",
      "frontmatter": {
        "type": { "value": "prompt" },
        "model": { "prompt": "select", "enum": "models" },
        "temperature": { "prompt": "input", "default": "0.7" }
      }
    },
    "agent": {
      "output_dir": ".ovault/agents",
      "frontmatter": {
        "type": { "value": "agent" },
        "tools": { "prompt": "input" },
        "system-prompt": { "prompt": "dynamic", "source": "prompts" }
      }
    }
  }
}
```

#### Workflow Execution

Workflow file format (stored in vault):

```yaml
---
type: workflow
workflow-type: research
status: ready
---
# Blog Research: {{topic}}

## Steps
1. [[.ovault/prompts/web-search]] → sources
2. [[.ovault/prompts/summarize]] → summary  
3. [[.ovault/prompts/outline]] → outline

## Config
model: claude-sonnet-4
max-cost: $0.50
```

```bash
ovault run Workflows/blog-research.md --topic="AI agents"
ovault run Workflows/blog-research.md --topic="AI agents" --dry-run
ovault run --status  # Show running/completed workflows
```

**Execution:**
1. Parse workflow file
2. Execute each step via OpenCode or direct API calls
3. Track costs and state
4. Write results to new file or update workflow

#### OpenCode Integration

Short-term approach using OpenCode as the execution engine:

```bash
ovault run --via=opencode Workflows/research.md
# Shells out to: opencode --task "..." --output-format json
# Parses results, writes to vault
```

**Benefits:**
- Leverages OpenCode's existing capabilities
- Task lists stay in vault (visible, trackable)
- Works across branches (solves sync problem)

#### Cost Management

```bash
ovault costs                      # Show spending summary
ovault costs --period=week        # This week's usage
ovault costs --workflow=research  # By workflow type
```

Track in `.ovault/logs/costs.json`.

---

### Tier 8: Future Considerations

#### `ovault lint` Command

Broader markdown hygiene (separate from schema audit):

```bash
ovault lint                   # Check all files
ovault lint --fix             # Auto-fix where possible
```

**Checks:**
- Broken wikilinks
- Orphan files (no inbound links)
- Duplicate file names
- Missing alt text on images
- Heading hierarchy issues
- Inconsistent formatting

#### Personal Assistant Integrations

**Recommendation:** Keep out of ovault core. Instead:
- Use MCP servers for calendar, mail, reminders
- Let Warp/OpenCode orchestrate between tools
- ovault stays focused on vault management

If needed, a separate `ovault-integrations` package could bridge external data into vault notes.

---

## Implementation Priority

### Phase 1: Core CLI Polish
- [ ] Shared fields support (`shared_fields` in schema)
- [ ] `ovault open <file>` command
- [ ] `--open` flag for new/edit
- [ ] `ovault audit` (report only)
- [ ] `ovault schema show`

### Phase 2: Audit & Bulk
- [ ] `ovault audit --fix` (interactive)
- [ ] `ovault audit --strict`
- [ ] `ovault bulk` command (dry-run + execute)
- [ ] Wikilink auto-update on move

### Phase 3: Schema Management
- [ ] `ovault schema add-type`
- [ ] `ovault schema add-field`
- [ ] `ovault schema edit-enum`
- [ ] Template system

### Phase 4: Query Power
- [ ] `ovault base` (Dataview generation)
- [ ] JSON/CSV output formats
- [ ] Recurrence system

### Phase 5: Agentic Foundation
- [ ] Prompt/agent schema types
- [ ] Workflow file format spec
- [ ] `ovault run` command
- [ ] Cost tracking

---

## Technical Notes

**Strengths of current architecture:**
- Clean `lib/` module separation
- Schema-driven (new types = config, not code)
- `jq` handles complex JSON traversal
- Filter/query logic in `list.sh` is extensible

**Considerations:**
- Shell script limits for complex agentic logic — may need Python/TS eventually
- Obsidian URI scheme has cross-platform quirks
- Dataview syntax is complex to generate correctly
- Frontmatter write-back needs to preserve field order and body content
- Shared fields must merge cleanly with type-specific fields (order, overrides)

**Dependencies to consider:**
- `yq` for robust YAML parsing/writing (alternative to awk)
- `rg` (ripgrep) for fast wikilink searching

**Shared Fields Implementation Notes:**

The `shared_fields` feature requires changes across multiple files:

| File | Changes |
|------|---------|
| `schema.schema.json` | Add `shared_fields` property at root level |
| `lib/schema.sh` | New `get_shared_fields()` function |
| `ovault.sh` | Merge shared fields in `create_new()` and `edit_existing()` |
| `lib/list.sh` | Update `get_valid_fields_for_type()` to include shared fields |

Field merge order:
1. Start with `shared_fields`
2. Overlay type-specific `frontmatter` (type fields win on conflict)
3. Apply `frontmatter_order` from type (or default: shared first, then type-specific)

Array fields like `scopes`:
- Schema already supports `list_format: "yaml-array"` 
- Output as proper YAML arrays, not comma-separated strings
- `multi-input` prompt type already exists for collecting multiple values

---

## Migration Examples

### Renaming Enum Values

```bash
# 1. Check current usage
ovault list objective --fields=status --where status=in-flight
# Shows 8 tasks with status=in-flight

# 2. Bulk update before schema change
ovault bulk objective --set status=in-progress --where status=in-flight
# Would affect 8 files. Run with --execute to apply.

ovault bulk objective --set status=in-progress --where status=in-flight --execute
# ✓ Updated 8 files

# 3. Update schema
ovault schema edit-enum status --rename in-flight=in-progress
# Or edit schema.json manually

# 4. Verify
ovault audit
# ✓ No issues found
```

### Moving Files to New Structure

```bash
# Archive all settled ideas
ovault bulk idea --move Archive/Ideas --where status=settled --execute
# Moving 15 files...
# Updating 23 wikilinks across 12 files...
# ✓ Done

# Verify no broken links
ovault audit
```
