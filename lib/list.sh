#!/bin/zsh

# List helpers for querying vault objects by type.
# Expects: SCHEMA_FILE, VAULT_DIR set by caller.

# ============================================
# Schema Field Validation
# ============================================

# Get all valid frontmatter field names for a type path.
# If the type has subtypes, returns the union of all fields across subtypes.
# Args: type_path (slash-separated)
# Output: newline-separated field names
get_valid_fields_for_type() {
    local type_path="$1"
    local jq_path=$(type_path_to_jq_path "$type_path")
    
    # Build a jq script that collects fields from the type and all subtypes recursively
    jq -r --argjson p "$jq_path" '
        def collect_fields:
            if .frontmatter then (.frontmatter | keys[]) else empty end,
            if .subtypes then (.subtypes | to_entries[] | .value | collect_fields) else empty end;
        getpath($p) | collect_fields
    ' "$SCHEMA_FILE" | sort -u
}

# Get valid enum values for a field in a type.
# Checks the field definition for an enum reference and returns its values.
# Args: type_path, field_name
# Output: newline-separated enum values, or empty if not an enum field
get_enum_values_for_field() {
    local type_path="$1"
    local field_name="$2"
    local jq_path=$(type_path_to_jq_path "$type_path")
    
    # Find the enum name for this field (checking type and all subtypes)
    local enum_name=$(jq -r --argjson p "$jq_path" --arg f "$field_name" '
        def find_enum:
            if .frontmatter[$f].enum then .frontmatter[$f].enum
            elif .subtypes then (.subtypes | to_entries[] | .value | find_enum) // empty
            else empty end;
        getpath($p) | find_enum
    ' "$SCHEMA_FILE")
    
    if [[ -n "$enum_name" && "$enum_name" != "null" ]]; then
        jq -r --arg e "$enum_name" '.enums[$e][]? // empty' "$SCHEMA_FILE"
    fi
}

# Validate that a field name is valid for a type path.
# Args: type_path, field_name
# Returns: 0 if valid, 1 if invalid
# Output (on error): error message to stderr
validate_field_for_type() {
    local type_path="$1"
    local field_name="$2"
    
    local valid_fields=$(get_valid_fields_for_type "$type_path")
    
    if ! echo "$valid_fields" | grep -qx "$field_name"; then
        echo "Error: Unknown field '$field_name' for type '$type_path'" >&2
        echo "Valid fields: $(echo "$valid_fields" | tr '\n' ', ' | sed 's/,$//')" >&2
        return 1
    fi
    return 0
}

# Validate that filter values are valid for a field (if it's an enum field).
# Args: type_path, field_name, comma-separated values
# Returns: 0 if valid (or not an enum), 1 if invalid
# Output (on error): error message to stderr
validate_filter_values() {
    local type_path="$1"
    local field_name="$2"
    local values="$3"
    
    # Empty value is always valid (means "field is missing")
    [[ -z "$values" ]] && return 0
    
    local enum_values=$(get_enum_values_for_field "$type_path" "$field_name")
    
    # If not an enum field, any value is valid
    [[ -z "$enum_values" ]] && return 0
    
    # Check each value in the comma-separated list
    local val_arr=(${(s:,:)values})
    for val in "${val_arr[@]}"; do
        if ! echo "$enum_values" | grep -qx "$val"; then
            echo "Error: Invalid value '$val' for field '$field_name'" >&2
            echo "Valid values: $(echo "$enum_values" | tr '\n' ', ' | sed 's/,$//')" >&2
            return 1
        fi
    done
    return 0
}

# ============================================
# Filter Application
# ============================================

# Check if a single filter condition matches a file's frontmatter value.
# Args: file_value, operator (eq|neq), filter_values (comma-separated)
# Returns: 0 if matches, 1 if not
check_filter_match() {
    local file_value="$1"
    local operator="$2"
    local filter_values="$3"
    
    # Handle empty filter value (checking for missing/empty field)
    if [[ -z "$filter_values" ]]; then
        if [[ "$operator" == "eq" ]]; then
            # --field= : match if field is empty/missing
            [[ -z "$file_value" ]] && return 0 || return 1
        else
            # --field!= : match if field is NOT empty (exists with value)
            [[ -n "$file_value" ]] && return 0 || return 1
        fi
    fi
    
    # Check if file_value is in the comma-separated filter_values
    local found=false
    local val_arr=(${(s:,:)filter_values})
    for val in "${val_arr[@]}"; do
        if [[ "$file_value" == "$val" ]]; then
            found=true
            break
        fi
    done
    
    if [[ "$operator" == "eq" ]]; then
        # --field=val : match if value is in list
        $found && return 0 || return 1
    else
        # --field!=val : match if value is NOT in list
        $found && return 1 || return 0
    fi
}

# Apply filters to a list of files.
# Reads file paths from stdin, outputs filtered file paths.
# Args: filters as "field:op:values" strings (space-separated)
# Output: filtered file paths
apply_filters() {
    local filters=("$@")
    local file
    
    # If no filters, pass through all files
    if [[ ${#filters[@]} -eq 0 ]]; then
        cat
        return
    fi
    
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        
        local matches=true
        
        for filter in "${filters[@]}"; do
            # Parse filter: "field:op:values"
            local field="${filter%%:*}"
            local rest="${filter#*:}"
            local operator="${rest%%:*}"
            local values="${rest#*:}"
            
            # Handle case where values is same as operator (no values after second :)
            [[ "$values" == "$operator" ]] && values=""
            
            # Get the field value from the file's frontmatter
            local file_value=$(extract_frontmatter_field "$file" "$field")
            
            if ! check_filter_match "$file_value" "$operator" "$values"; then
                matches=false
                break
            fi
        done
        
        if $matches; then
            echo "$file"
        fi
    done
}

# ============================================
# Frontmatter Extraction
# ============================================

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
# Args: type_path, show_paths (true/false), fields (comma-separated, optional), filters (array, optional)
# Output: formatted list (names, paths, or table)
list_objects_by_type() {
    local type_path="$1"
    local show_paths="${2:-false}"
    local fields="${3:-}"
    shift 3 2>/dev/null || shift $#
    local filters=("$@")
    
    # Validate type exists
    local jq_path=$(type_path_to_jq_path "$type_path")
    if ! jq -e --argjson p "$jq_path" 'getpath($p) != null' "$SCHEMA_FILE" >/dev/null 2>&1; then
        echo "Error: Unknown type '$type_path'" >&2
        return 1
    fi
    
    # Get files and apply filters
    local files
    if [[ ${#filters[@]} -gt 0 ]]; then
        files=$(list_objects_recursive "$type_path" | apply_filters "${filters[@]}" | sort)
    else
        files=$(list_objects_recursive "$type_path" | sort)
    fi
    
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
