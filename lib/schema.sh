#!/bin/zsh

# Schema helpers.
# Expects: SCHEMA_FILE set by caller.

# Get enum values from schema
get_enum() {
  local enum_name="$1"
  jq -r ".enums[\"$enum_name\"][]" "$SCHEMA_FILE"
}

# Get type names from schema (top-level families)
get_type_families() {
  jq -r '.types | keys[]' "$SCHEMA_FILE"
}

# Given a discriminator context, return the frontmatter field name.
# "type" at the top level, otherwise "<parent>-type".
discriminator_name() {
  local parent="$1"
  if [[ -z "$parent" || "$parent" == "type" ]]; then
    echo "type"
  else
    echo "${parent}-type"
  fi
}

# Append a subtype key onto an existing jq getpath array.
append_sub_path() {
  local path_parts="$1" # json array
  local key="$2"
  jq -c --argjson arr "$path_parts" --arg key "$key" '$arr + ["subtypes", $key]' <<< "null"
}

# Check if a given schema node (by getpath array) has subtypes.
has_subtypes() {
  local path_parts="$1" # json array
  jq -e --argjson p "$path_parts" 'getpath($p) | (type=="object") and (has("subtypes") and (.subtypes|length>0))' "$SCHEMA_FILE" >/dev/null
}

# Return subtype keys for a given schema node (by getpath array).
get_subtype_keys() {
  local path_parts="$1" # json array
  jq -r --argjson p "$path_parts" 'getpath($p).subtypes | keys[]' "$SCHEMA_FILE"
}

# Fetch a type definition object by its jq getpath array.
get_type_def_by_path() {
  local path_parts="$1" # JSON array
  jq -c --argjson p "$path_parts" 'getpath($p)' "$SCHEMA_FILE"
}

# Resolve a schema path array from an existing file frontmatter.
# Returns a jq getpath array string, e.g. ["types","objective","subtypes","task"].
resolve_path_from_frontmatter() {
  local frontmatter="$1"
  local type_name=$(echo "$frontmatter" | awk -F': ' '$1=="type"{print $2}')
  [[ -z "$type_name" ]] && return

  local path_parts=$(printf '["types","%s"]' "$type_name")
  local current="$type_name"

  while has_subtypes "$path_parts"; do
    local disc_field=$(discriminator_name "$current")
    local sub_value=$(echo "$frontmatter" | awk -F': ' -v f="$disc_field" '$1==f{$1=""; print substr($0,2)}')
    [[ -z "$sub_value" ]] && break
    path_parts=$(append_sub_path "$path_parts" "$sub_value")
    current="$sub_value"
  done

  echo "$path_parts"
}
