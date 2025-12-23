#!/bin/zsh

# List helpers for querying vault objects by type.
# Expects: SCHEMA_FILE, VAULT_DIR set by caller.

# Extract a frontmatter field value from a file.
# Args: file_path, field_name
# Output: field value or empty string
extract_frontmatter_field() {
    local file="$1"
    local field="$2"
    
    awk -F': ' -v f="$field" '
        /^---$/ { if (in_fm) exit; in_fm=1; next }
        in_fm && $1==f { $1=""; print substr($0,2); exit }
    ' "$file"
}

# Print results as a table with columns.
# Args: fields (comma-separated), then file paths via stdin
# Output: formatted table
print_table() {
    local fields="$1"
    local show_paths="$2"
    local field_arr=(${(s:,:)fields})
    local file name row val
    
    # Build header
    local header="NAME"
    [[ "$show_paths" == "true" ]] && header="PATH"
    for f in "${field_arr[@]}"; do
        header+="\t${(U)f}"
    done
    echo "$header"
    
    # Process each file
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        
        if [[ "$show_paths" == "true" ]]; then
            # Path relative to vault
            name="${file#$VAULT_DIR/}"
        else
            name=$(basename "$file" .md)
        fi
        
        row="$name"
        for f in "${field_arr[@]}"; do
            val=$(extract_frontmatter_field "$file" "$f")
            row+="\t${val:-—}"
        done
        echo "$row"
    done | column -t -s $'\t'
}

# Convert a type path (e.g., "objective/task") to a jq getpath array.
# Args: type_path (slash-separated)
# Output: JSON array like ["types","objective","subtypes","task"]
type_path_to_jq_path() {
    local type_path="$1"
    local parts=(${(s:/:)type_path})
    
    local jq_path='["types"'
    for ((i=1; i<=${#parts[@]}; i++)); do
        local part="${parts[$i]}"
        if [[ $i -eq 1 ]]; then
            jq_path+=",\"$part\""
        else
            jq_path+=",\"subtypes\",\"$part\""
        fi
    done
    jq_path+=']'
    
    echo "$jq_path"
}

# Get output_dir for a type path.
# Args: type_path (slash-separated, e.g., "objective/task")
# Output: output_dir string or empty if not found
get_output_dir_for_type() {
    local type_path="$1"
    local jq_path=$(type_path_to_jq_path "$type_path")
    
    jq -r --argjson p "$jq_path" 'getpath($p).output_dir // empty' "$SCHEMA_FILE"
}

# Check if a type path has subtypes.
# Args: type_path (slash-separated)
# Returns: 0 if has subtypes, 1 otherwise
type_has_subtypes() {
    local type_path="$1"
    local jq_path=$(type_path_to_jq_path "$type_path")
    
    jq -e --argjson p "$jq_path" 'getpath($p) | has("subtypes") and (.subtypes | length > 0)' "$SCHEMA_FILE" >/dev/null
}

# Get subtype keys for a type path.
# Args: type_path (slash-separated)
# Output: newline-separated subtype keys
get_subtypes_for_path() {
    local type_path="$1"
    local jq_path=$(type_path_to_jq_path "$type_path")
    
    jq -r --argjson p "$jq_path" 'getpath($p).subtypes | keys[]' "$SCHEMA_FILE"
}

# List .md files in a directory.
# Args: directory path
# Output: newline-separated full paths
list_files_in_dir() {
    local dir="$1"
    
    if [[ ! -d "$dir" ]]; then
        return
    fi
    
    for file in "$dir"/*.md(N); do
        [[ -f "$file" ]] && echo "$file"
    done
}

# Recursively list all objects for a type path.
# If the type has subtypes, recurse into each; otherwise list files from output_dir.
# Args: type_path (slash-separated)
# Output: newline-separated object names
list_objects_recursive() {
    local type_path="$1"
    
    if type_has_subtypes "$type_path"; then
        # Recurse into subtypes
        local subtypes=()
        while IFS= read -r line; do
            [[ -n "$line" ]] && subtypes+=("$line")
        done < <(get_subtypes_for_path "$type_path")
        
        for subtype in "${subtypes[@]}"; do
            list_objects_recursive "$type_path/$subtype"
        done
    else
        # Leaf type - list files from output_dir
        local output_dir=$(get_output_dir_for_type "$type_path")
        if [[ -n "$output_dir" ]]; then
            list_files_in_dir "$VAULT_DIR/$output_dir"
        fi
    fi
}

# Main entry point: list objects by type path.
# Args: type_path, show_paths (true/false), fields (comma-separated, optional)
# Output: formatted list (names, paths, or table)
list_objects_by_type() {
    local type_path="$1"
    local show_paths="${2:-false}"
    local fields="${3:-}"
    
    # Validate type exists
    local jq_path=$(type_path_to_jq_path "$type_path")
    if ! jq -e --argjson p "$jq_path" 'getpath($p) != null' "$SCHEMA_FILE" >/dev/null 2>&1; then
        echo "Error: Unknown type '$type_path'" >&2
        return 1
    fi
    
    local files=$(list_objects_recursive "$type_path" | sort)
    
    # Handle empty results
    if [[ -z "$files" ]]; then
        return 0
    fi
    
    if [[ -n "$fields" ]]; then
        # Table output with fields
        echo "$files" | print_table "$fields" "$show_paths"
    elif [[ "$show_paths" == "true" ]]; then
        # Paths relative to vault
        echo "$files" | while IFS= read -r f; do
            [[ -n "$f" ]] && echo "${f#$VAULT_DIR/}"
        done
    else
        # Default: basenames only
        echo "$files" | while IFS= read -r f; do
            [[ -n "$f" ]] && basename "$f" .md
        done
    fi
}
