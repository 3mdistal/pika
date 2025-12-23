#!/bin/zsh

# List helpers for querying vault objects by type.
# Expects: SCHEMA_FILE, VAULT_DIR set by caller.

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

# List .md files in a directory (basenames without extension).
# Args: directory path
# Output: newline-separated filenames
list_files_in_dir() {
    local dir="$1"
    
    if [[ ! -d "$dir" ]]; then
        return
    fi
    
    for file in "$dir"/*.md(N); do
        [[ -f "$file" ]] && basename "$file" .md
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
# Args: type_path (slash-separated, e.g., "objective" or "objective/task")
# Output: newline-separated object names, sorted
list_objects_by_type() {
    local type_path="$1"
    
    # Validate type exists
    local jq_path=$(type_path_to_jq_path "$type_path")
    if ! jq -e --argjson p "$jq_path" 'getpath($p) != null' "$SCHEMA_FILE" >/dev/null 2>&1; then
        echo "Error: Unknown type '$type_path'" >&2
        return 1
    fi
    
    list_objects_recursive "$type_path" | sort
}
