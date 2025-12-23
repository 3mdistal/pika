#!/bin/zsh

# Query helpers.
# Expects: SCHEMA_FILE, VAULT_DIR set by caller.

# Format value for frontmatter based on format type
format_value() {
  local value="$1"
  local format="$2"

  if [[ -z "$value" ]]; then
    echo ""
    return
  fi

  case "$format" in
    wikilink)
      echo "[[$value]]"
      ;;
    quoted-wikilink)
      echo "\"[[$value]]\""
      ;;
    *)
      echo "$value"
      ;;
  esac
}

# Query dynamic source (e.g., active milestones)
query_dynamic_source() {
  local source_name="$1"
  local source_def=$(jq -c ".dynamic_sources[\"$source_name\"]" "$SCHEMA_FILE")

  if [[ "$source_def" == "null" ]]; then
    return
  fi

  local dir=$(echo "$source_def" | jq -r '.dir')
  local filter=$(echo "$source_def" | jq -c '.filter // {}')
  local full_dir="$VAULT_DIR/$dir"

  if [[ ! -d "$full_dir" ]]; then
    return
  fi

  local results=()
  for file in "$full_dir"/*.md; do
    [[ -f "$file" ]] || continue

    local matches=true

    # Apply filters
    if [[ "$filter" != "{}" ]]; then
      # Extract frontmatter and check filters
      local frontmatter=$(awk '/^---$/{p=1; next} p && /^---$/{exit} p{print}' "$file")

      # Check each filter condition
      for field in $(echo "$filter" | jq -r 'keys[]'); do
        local condition=$(echo "$filter" | jq -c ".[\"$field\"]")
        local file_value=$(echo "$frontmatter" | awk -F': ' -v f="$field" '$1==f{print $2}')

        # Check not_in condition
        local not_in=$(echo "$condition" | jq -r '.not_in[]? // empty')
        if [[ -n "$not_in" ]]; then
          for excluded in $(echo "$condition" | jq -r '.not_in[]'); do
            if [[ "$file_value" == "$excluded" ]]; then
              matches=false
              break
            fi
          done
        fi
      done
    fi

    if [[ "$matches" == "true" ]]; then
      local name=$(basename "$file" .md)
      results+=("$name")
    fi
  done

  printf '%s\n' "${results[@]}"
}
