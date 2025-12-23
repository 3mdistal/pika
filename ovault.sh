#!/bin/zsh

# ovault - Schema-driven management for Obsidian vaults
#
# Usage:
#   ovault [--vault=<path>] new [type]  - Create a new object (interactive if no type)
#   ovault [--vault=<path>] edit <file> - Edit an existing file's frontmatter
#   ovault help                          - Show this help
#
# Vault path resolution (in order of precedence):
#   1. --vault=<path> or -v <path> argument
#   2. OVAULT_VAULT environment variable
#   3. Current working directory
#
# The schema file is expected at <vault>/.ovault/schema.json

set -e

SCRIPT_DIR="$(dirname "$(realpath "$0")")"

# --- Parse global options ---
VAULT_DIR=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --vault=*)
            VAULT_DIR="${1#--vault=}"
            shift
            ;;
        -v)
            VAULT_DIR="$2"
            shift 2
            ;;
        *)
            break
            ;;
    esac
done

# Fallback to env var, then cwd
if [[ -z "$VAULT_DIR" ]]; then
    VAULT_DIR="${OVAULT_VAULT:-$(pwd)}"
fi

# Resolve to absolute path
VAULT_DIR="$(realpath "$VAULT_DIR")"

SCHEMA_FILE="$VAULT_DIR/.ovault/schema.json"
# Ensure common Homebrew locations are in PATH for non-interactive shells
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# --- libs ---
LIB_DIR="$SCRIPT_DIR/lib"

if [[ ! -d "$LIB_DIR" ]]; then
    echo "Error: lib directory not found at $LIB_DIR" >&2
    exit 1
fi

# shellcheck source=/dev/null
source "$LIB_DIR/common.sh"
# shellcheck source=/dev/null
source "$LIB_DIR/schema.sh"
# shellcheck source=/dev/null
source "$LIB_DIR/query.sh"
# shellcheck source=/dev/null
source "$LIB_DIR/body.sh"
# shellcheck source=/dev/null
source "$LIB_DIR/list.sh"

# --- Dependency check ---
require_cmd jq "Install with: brew install jq" || exit 1

if [[ ! -f "$SCHEMA_FILE" ]]; then
    die "Error: Schema file not found at $SCHEMA_FILE" || exit 1
fi

# --- Create mode ---
create_new() {
    local type_name="$1"

    # Detect legacy flat schemas and fail loudly
    if jq -e '.types | keys[] | select(.=="task")' "$SCHEMA_FILE" >/dev/null; then
        echo "${RED}Schema format is legacy (flat types). Migrate schema.json to nested form first.${NC}"
        exit 1
    fi
    
    # If no type specified, prompt for top-level family
    if [[ -z "$type_name" ]]; then
        local families=()
        while IFS= read -r line; do
            families+=("$line")
        done < <(get_type_families)
        
        type_name=$(prompt_selection "What would you like to create?" "${families[@]}")
        
        if [[ -z "$type_name" ]]; then
            echo "${RED}No type selected. Exiting.${NC}"
            exit 1
        fi
    fi
    
    local path_parts=$(printf '["types","%s"]' "$type_name")
    local current="$type_name"

    # Walk subtypes hierarchically
    while has_subtypes "$path_parts"; do
        local options=()
        while IFS= read -r line; do
            options+=("$line")
        done < <(get_subtype_keys "$path_parts")

        local disc_label=$(discriminator_name "$current")
        local choice=$(prompt_selection "Select ${current} subtype (${disc_label}):" "${options[@]}")
        if [[ -z "$choice" ]]; then
            echo "${RED}No subtype selected. Exiting.${NC}"
            exit 1
        fi
        path_parts=$(append_sub_path "$path_parts" "$choice")
        current="$choice"
    done
    
    local type_def=$(get_type_def_by_path "$path_parts")
    
    if [[ "$type_def" == "null" ]]; then
        echo "${RED}Unknown type selection.${NC}"
        exit 1
    fi
    
    echo "\n${GREEN}=== New ${type_name} ===${NC}"
    
    # Get output directory
    local output_dir=$(echo "$type_def" | jq -r '.output_dir')
    local full_output_dir="$VAULT_DIR/$output_dir"
    
    # Prompt for name
    local name_field=$(echo "$type_def" | jq -r '.name_field // "Name"')
    local item_name=$(prompt_required "$name_field")
    
    # Build frontmatter
    local frontmatter="---\n"
    local frontmatter_def=$(echo "$type_def" | jq -c '.frontmatter')
    
    # Read frontmatter order into array
    local frontmatter_order=()
    while IFS= read -r line; do
        [[ -n "$line" ]] && frontmatter_order+=("$line")
    done < <(echo "$type_def" | jq -r '.frontmatter_order[]? // empty')
    
    # If no order specified, use keys
    if [[ ${#frontmatter_order[@]} -eq 0 ]]; then
        while IFS= read -r line; do
            [[ -n "$line" ]] && frontmatter_order+=("$line")
        done < <(echo "$frontmatter_def" | jq -r 'keys[]')
    fi
    
    for field in "${frontmatter_order[@]}"; do
        local field_def=$(echo "$frontmatter_def" | jq -c ".[\"$field\"]")
        local value=""
        
        # Check for static value
        local static_value=$(echo "$field_def" | jq -r '.value // empty')
        if [[ -n "$static_value" ]]; then
            case "$static_value" in
                '$NOW')
                    value=$(date "+%Y-%m-%d %H:%M")
                    ;;
                '$TODAY')
                    value=$(date "+%Y-%m-%d")
                    ;;
                *)
                    value="$static_value"
                    ;;
            esac
        else
            # Handle prompts
            local prompt_type=$(echo "$field_def" | jq -r '.prompt // empty')
            local label=$(echo "$field_def" | jq -r '.label // empty')
            local default=$(echo "$field_def" | jq -r '.default // empty')
            local format=$(echo "$field_def" | jq -r '.format // "plain"')
            local required=$(echo "$field_def" | jq -r '.required // false')
            
            case "$prompt_type" in
                select)
                    local enum_name=$(echo "$field_def" | jq -r '.enum')
                    local options=()
                    while IFS= read -r line; do
                        options+=("$line")
                    done < <(get_enum "$enum_name")
                    
                    value=$(prompt_selection "Select $field:" "${options[@]}")
                    value="${value:-$default}"
                    ;;
                dynamic)
                    local source=$(echo "$field_def" | jq -r '.source')
                    local options=()
                    while IFS= read -r line; do
                        [[ -n "$line" ]] && options+=("$line")
                    done < <(query_dynamic_source "$source")
                    
                    if [[ ${#options[@]} -gt 0 ]]; then
                        local selected=$(prompt_selection "Select $field:" "${options[@]}")
                        value=$(format_value "$selected" "$format")
                    else
                        echo "\n${YELLOW}No options available for $field${NC}" >&2
                        value=""
                    fi
                    ;;
                input)
                    if [[ "$required" == "true" ]]; then
                        value=$(prompt_required "${label:-$field}")
                    else
                        value=$(prompt_input "${label:-$field}" "$default")
                    fi
                    ;;
                *)
                    value="$default"
                    ;;
            esac
        fi
        
        frontmatter+="$field: $value\n"
    done
    
    frontmatter+="---"
    
    # Build body sections
    local body_sections=$(echo "$type_def" | jq -c '.body_sections // []')
    local body=""
    if [[ $(echo "$body_sections" | jq 'length') -gt 0 ]]; then
        body=$(prompt_body_sections "$body_sections")
    fi
    
    # Create file
    mkdir -p "$full_output_dir"
    local file_path="$full_output_dir/$item_name.md"
    
    if [[ -f "$file_path" ]]; then
        echo "\n${YELLOW}Warning: File already exists: $file_path${NC}"
        read -r "overwrite?Overwrite? (y/N): "
        if [[ "$overwrite" != "y" && "$overwrite" != "Y" ]]; then
            echo "Aborted."
            exit 1
        fi
    fi
    
    printf '%b\n%s' "$frontmatter" "$body" > "$file_path"
    
    echo "\n${GREEN}✓ Created: $file_path${NC}"
}

# --- Edit mode ---
edit_existing() {
    local file_path="$1"
    
    # Resolve relative path
    if [[ ! "$file_path" = /* ]]; then
        file_path="$VAULT_DIR/$file_path"
    fi
    
    if [[ ! -f "$file_path" ]]; then
        echo "${RED}File not found: $file_path${NC}"
        exit 1
    fi
    
    echo "\n${GREEN}=== Editing: $(basename "$file_path") ===${NC}"
    
    # Extract current frontmatter
    local frontmatter=$(awk '/^---$/{p=1; next} p && /^---$/{exit} p{print}' "$file_path")
    
    # Detect type from frontmatter
    local file_type=$(echo "$frontmatter" | awk -F': ' '$1=="type"{print $2}')
    local file_subtype=""
    
    case "$file_type" in
        objective)
            file_subtype=$(echo "$frontmatter" | awk -F': ' '$1=="objective-type"{print $2}')
            ;;
        entity)
            file_subtype=$(echo "$frontmatter" | awk -F': ' '$1=="entity-type"{print $2}')
            ;;
        *)
            file_subtype="$file_type"
            ;;
    esac
    
    local path_parts=$(resolve_path_from_frontmatter "$frontmatter")
    local type_def=""
    if [[ -n "$path_parts" ]]; then
        type_def=$(get_type_def_by_path "$path_parts")
    fi
    
    if [[ -z "$type_def" || "$type_def" == "null" ]]; then
        echo "${YELLOW}Warning: Unknown type path, showing raw frontmatter edit${NC}"
        echo "Current frontmatter:"
        echo "$frontmatter"
        return
    fi
    
    echo "Type path: ${CYAN}$path_parts${NC}\n"
    
    # Get body content (everything after second ---)
    local body=$(awk 'BEGIN{p=0; c=0} /^---$/{c++; if(c==2){p=1; next}} p{print}' "$file_path")
    
    # Edit frontmatter fields
    local new_frontmatter="---\n"
    local frontmatter_def=$(echo "$type_def" | jq -c '.frontmatter')
    
    # Read frontmatter order into array
    local frontmatter_order=()
    while IFS= read -r line; do
        [[ -n "$line" ]] && frontmatter_order+=("$line")
    done < <(echo "$type_def" | jq -r '.frontmatter_order[]? // empty')
    
    # If no order specified, use keys
    if [[ ${#frontmatter_order[@]} -eq 0 ]]; then
        while IFS= read -r line; do
            [[ -n "$line" ]] && frontmatter_order+=("$line")
        done < <(echo "$frontmatter_def" | jq -r 'keys[]')
    fi
    
    for field in "${frontmatter_order[@]}"; do
        local field_def=$(echo "$frontmatter_def" | jq -c ".[\"$field\"]")
        local current_value=$(echo "$frontmatter" | awk -F': ' -v f="$field" '$1==f{$1=""; print substr($0,2)}')
        local value=""
        
        # Check for static value (don't prompt, keep current or use static)
        local static_value=$(echo "$field_def" | jq -r '.value // empty')
        if [[ -n "$static_value" ]]; then
            # For static fields, keep current value or use static default
            if [[ -n "$current_value" ]]; then
                value="$current_value"
            else
                case "$static_value" in
                    '$NOW')
                        value=$(date "+%Y-%m-%d %H:%M")
                        ;;
                    '$TODAY')
                        value=$(date "+%Y-%m-%d")
                        ;;
                    *)
                        value="$static_value"
                        ;;
                esac
            fi
        else
            # Handle prompts - show current value as default
            local prompt_type=$(echo "$field_def" | jq -r '.prompt // empty')
            local label=$(echo "$field_def" | jq -r '.label // empty')
            local format=$(echo "$field_def" | jq -r '.format // "plain"')
            
            echo "Current $field: ${YELLOW}${current_value:-<empty>}${NC}"
            
            case "$prompt_type" in
                select)
                    local enum_name=$(echo "$field_def" | jq -r '.enum')
                    local options=()
                    while IFS= read -r line; do
                        options+=("$line")
                    done < <(get_enum "$enum_name")
                    
                    local selected=$(prompt_selection "New $field (or Enter to keep):" "${options[@]}")
                    value="${selected:-$current_value}"
                    ;;
                dynamic)
                    local source=$(echo "$field_def" | jq -r '.source')
                    local options=()
                    while IFS= read -r line; do
                        [[ -n "$line" ]] && options+=("$line")
                    done < <(query_dynamic_source "$source")
                    
                    if [[ ${#options[@]} -gt 0 ]]; then
                        local selected=$(prompt_selection "New $field (or Enter to keep):" "${options[@]}")
                        if [[ -n "$selected" ]]; then
                            value=$(format_value "$selected" "$format")
                        else
                            value="$current_value"
                        fi
                    else
                        value="$current_value"
                    fi
                    ;;
                input)
                    value=$(prompt_input "New ${label:-$field} (or Enter to keep)" "$current_value")
                    ;;
                *)
                    value="$current_value"
                    ;;
            esac
        fi
        
        new_frontmatter+="$field: $value\n"
    done
    
    new_frontmatter+="---"
    
    # Check for missing sections in body
    local body_sections=$(echo "$type_def" | jq -c '.body_sections // []')
    local section_count=$(echo "$body_sections" | jq 'length')
    
    if [[ $section_count -gt 0 ]]; then
        echo "\n${CYAN}Check for missing sections?${NC}"
        read -r "add_sections?(y/N): "
        
        if [[ "$add_sections" == "y" || "$add_sections" == "Y" ]]; then
            for ((i=0; i<section_count; i++)); do
                local section=$(echo "$body_sections" | jq -c ".[$i]")
                local title=$(echo "$section" | jq -r '.title')
                local level=$(echo "$section" | jq -r '.level // 2')
                local prefix=$(heading_prefix "$level")
                
                # Check if section exists in body
                if ! echo "$body" | grep -q "^$prefix $title"; then
                    echo "${YELLOW}Missing section: $title${NC}"
                    read -r "add_it?Add it? (y/N): "
                    if [[ "$add_it" == "y" || "$add_it" == "Y" ]]; then
                        local new_section=$(generate_body_sections "[$section]")
                        body+="\n$new_section"
                    fi
                fi
            done
        fi
    fi
    
    # Write updated file
    printf '%b\n%s' "$new_frontmatter" "$body" > "$file_path"
    
    echo "\n${GREEN}✓ Updated: $file_path${NC}"
}

# --- List mode ---
list_type() {
    local show_paths=false
    local fields=""
    
    # Parse flags
    while [[ "${1:-}" == --* ]]; do
        case "$1" in
            --paths)
                show_paths=true
                shift
                ;;
            --fields=*)
                fields="${1#--fields=}"
                shift
                ;;
            *)
                echo "${RED}Unknown option: $1${NC}"
                exit 1
                ;;
        esac
    done
    
    local type_path="$1"
    
    if [[ -z "$type_path" ]]; then
        echo "${RED}Usage: ovault list [options] <type>[/<subtype>]${NC}"
        echo ""
        echo "${GREEN}Options:${NC}"
        echo "  --paths              Show file paths instead of names"
        echo "  --fields=f1,f2,...   Show frontmatter fields in a table"
        echo ""
        echo "${GREEN}Available types:${NC}"
        get_type_families | sed 's/^/  /'
        exit 1
    fi
    
    list_objects_by_type "$type_path" "$show_paths" "$fields"
}

# --- Help ---
show_help() {
    echo "${CYAN}ovault${NC} - Schema-driven management for Obsidian vaults"
    echo ""
    echo "${GREEN}Usage:${NC}"
    echo "  ovault new [type]              Create a new object (interactive if no type)"
    echo "  ovault edit <file>             Edit an existing file's frontmatter"
  echo "  ovault list [options] <type>   List objects of a given type"
    echo "  ovault help                    Show this help"
    echo ""
    echo "${GREEN}Available types:${NC}"
    get_type_families | sed 's/^/  /'
    echo ""
    echo "${GREEN}Examples:${NC}"
    echo "  ovault new              # Interactive type selection"
    echo "  ovault new idea         # Create idea directly"
    echo "  ovault new objective    # Then select subtype (task/milestone/...)"
    echo "  ovault edit Ideas/My\\ Idea.md"
    echo "  ovault list idea        # List all ideas"
    echo "  ovault list objective   # List all objectives (tasks, milestones, etc.)"
    echo "  ovault list objective/task  # List only tasks"
    echo "  ovault list --paths idea    # Show file paths"
    echo "  ovault list --fields=status,priority idea  # Show as table"
}

# --- Main ---
case "${1:-}" in
    new)
        create_new "${2:-}"
        ;;
    edit)
        if [[ -z "${2:-}" ]]; then
            echo "${RED}Usage: ovault edit <file>${NC}"
            exit 1
        fi
        edit_existing "$2"
        ;;
    list)
        shift
        list_type "$@"
        ;;
    help|-h|--help)
        show_help
        ;;
    "")
        show_help
        ;;
    *)
        echo "${RED}Unknown command: $1${NC}"
        echo "Run 'ovault help' for usage."
        exit 1
        ;;
esac
