#!/bin/zsh

# Validate schema.json against schema.schema.json
# Requires: check-jsonschema (pip install check-jsonschema)
#       or: ajv-cli (npm install -g ajv-cli)
#       or: falls back to basic jq validation

set -e

SCRIPT_DIR="$(dirname "$(realpath "$0")")"
SCHEMA_FILE="$SCRIPT_DIR/schema.json"
META_SCHEMA="$SCRIPT_DIR/schema.schema.json"

# Ensure Homebrew paths are available
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

validate_with_check_jsonschema() {
    check-jsonschema --schemafile "$META_SCHEMA" "$SCHEMA_FILE"
}

validate_with_ajv() {
    ajv validate -s "$META_SCHEMA" -d "$SCHEMA_FILE"
}

validate_with_jq() {
    # Basic validation using jq - checks structure but not full JSON Schema compliance
    echo "${YELLOW}Note: Using jq for basic validation. Install check-jsonschema or ajv-cli for full JSON Schema validation.${NC}"
    
    local errors=0
    
    # Check required top-level keys
    if ! jq -e '.enums' "$SCHEMA_FILE" >/dev/null 2>&1; then
        echo "${RED}Error: Missing required 'enums' key${NC}"
        errors=$((errors + 1))
    fi
    
    if ! jq -e '.types' "$SCHEMA_FILE" >/dev/null 2>&1; then
        echo "${RED}Error: Missing required 'types' key${NC}"
        errors=$((errors + 1))
    fi
    
    # Check that enums are non-empty arrays
    local empty_enums=$(jq -r '.enums | to_entries[] | select(.value | length == 0) | .key' "$SCHEMA_FILE")
    if [[ -n "$empty_enums" ]]; then
        echo "${RED}Error: Empty enum(s): $empty_enums${NC}"
        errors=$((errors + 1))
    fi
    
    # Check leaf types have required fields using jq to find all leaves
    # A node with subtypes is valid, a node without subtypes must have output_dir and frontmatter
    local leaf_errors=$(jq -r '
        def check_node(path):
            if has("subtypes") then
                .subtypes | to_entries[] | .value | check_node(path + ".subtypes." + .key) 
            elif has("output_dir") and has("frontmatter") then
                empty
            else
                path + ": missing output_dir or frontmatter"
            end;
        .types | to_entries[] | .value | check_node(".types." + .key)
    ' "$SCHEMA_FILE" 2>/dev/null)
    
    if [[ -n "$leaf_errors" ]]; then
        echo "${RED}Error: $leaf_errors${NC}"
        errors=$((errors + 1))
    fi
    
    # Check dynamic_sources have required dir field
    local source_errors=$(jq -r '
        if .dynamic_sources then
            .dynamic_sources | to_entries[] | select(.value.dir == null) | .key + ": missing dir"
        else
            empty
        end
    ' "$SCHEMA_FILE" 2>/dev/null)
    
    if [[ -n "$source_errors" ]]; then
        echo "${RED}Error in dynamic_sources: $source_errors${NC}"
        errors=$((errors + 1))
    fi
    
    # Check frontmatter field references to enums exist
    local enum_refs=$(jq -r '
        .enums as $enums |
        [.. | objects | select(.enum) | .enum] | unique[] |
        select(. as $e | $enums | has($e) | not)
    ' "$SCHEMA_FILE" 2>/dev/null)
    
    if [[ -n "$enum_refs" ]]; then
        echo "${RED}Error: Referenced enum(s) not defined: $enum_refs${NC}"
        errors=$((errors + 1))
    fi
    
    # Check dynamic source references exist
    local source_refs=$(jq -r '
        .dynamic_sources as $sources |
        [.. | objects | select(.source) | .source] | unique[] |
        select(. as $s | ($sources // {}) | has($s) | not)
    ' "$SCHEMA_FILE" 2>/dev/null)
    
    if [[ -n "$source_refs" ]]; then
        echo "${RED}Error: Referenced dynamic source(s) not defined: $source_refs${NC}"
        errors=$((errors + 1))
    fi
    
    if [[ $errors -gt 0 ]]; then
        return 1
    fi
    
    return 0
}

# Main
echo "Validating: $SCHEMA_FILE"
echo "Against:    $META_SCHEMA"
echo ""

if command -v check-jsonschema &>/dev/null; then
    if validate_with_check_jsonschema; then
        echo "${GREEN}✓ Schema is valid${NC}"
        exit 0
    else
        echo "${RED}✗ Schema validation failed${NC}"
        exit 1
    fi
elif command -v ajv &>/dev/null; then
    if validate_with_ajv; then
        echo "${GREEN}✓ Schema is valid${NC}"
        exit 0
    else
        echo "${RED}✗ Schema validation failed${NC}"
        exit 1
    fi
else
    if validate_with_jq; then
        echo "${GREEN}✓ Basic validation passed${NC}"
        exit 0
    else
        echo "${RED}✗ Validation failed${NC}"
        exit 1
    fi
fi
