#!/bin/zsh

# Body generation helpers.

# Generate heading prefix based on level
heading_prefix() {
  local level="$1"
  printf '%0.s#' $(seq 1 "$level")
}

# Recursively generate body sections
generate_body_sections() {
  local sections_json="$1"
  local content=""

  local count=$(echo "$sections_json" | jq 'length')
  for ((i=0; i<count; i++)); do
    local section=$(echo "$sections_json" | jq -c ".[$i]")
    local title=$(echo "$section" | jq -r '.title')
    local level=$(echo "$section" | jq -r '.level // 2')
    local content_type=$(echo "$section" | jq -r '.content_type // "none"')
    local children=$(echo "$section" | jq -c '.children // []')

    local prefix=$(heading_prefix "$level")
    content+="$prefix $title\n"

    # Add placeholder based on content type
    case "$content_type" in
      paragraphs)
        content+="\n"
        ;;
      bullets)
        content+="- \n"
        ;;
      checkboxes)
        content+="- [ ] \n"
        ;;
      *)
        content+="\n"
        ;;
    esac

    # Recursively add children
    if [[ $(echo "$children" | jq 'length') -gt 0 ]]; then
      content+=$(generate_body_sections "$children")
    fi
  done

  echo -e "$content"
}

# Prompt for body section content during creation
# Expects: prompt_input from lib/common.sh
prompt_body_sections() {
  local sections_json="$1"
  local content=""

  local count=$(echo "$sections_json" | jq 'length')
  for ((i=0; i<count; i++)); do
    local section=$(echo "$sections_json" | jq -c ".[$i]")
    local title=$(echo "$section" | jq -r '.title')
    local level=$(echo "$section" | jq -r '.level // 2')
    local content_type=$(echo "$section" | jq -r '.content_type // "none"')
    local prompt_type=$(echo "$section" | jq -r '.prompt // "none"')
    local prompt_label=$(echo "$section" | jq -r '.prompt_label // ""')
    local children=$(echo "$section" | jq -c '.children // []')

    local prefix=$(heading_prefix "$level")
    content+="$prefix $title\n"

    # Check if this section should prompt for content
    if [[ "$prompt_type" == "multi-input" && -n "$prompt_label" ]]; then
      local items_input=$(prompt_input "$prompt_label")
      if [[ -n "$items_input" ]]; then
        IFS=',' read -rA items_array <<< "$items_input"
        for item in "${items_array[@]}"; do
          item="${item## }"
          item="${item%% }"
          if [[ -n "$item" ]]; then
            case "$content_type" in
              checkboxes)
                content+="- [ ] $item\n"
                ;;
              bullets)
                content+="- $item\n"
                ;;
              *)
                content+="$item\n"
                ;;
            esac
          fi
        done
      fi
      content+="\n"
    else
      # Add placeholder based on content type
      content+="\n"
    fi

    # Recursively add children (no prompting for nested sections)
    if [[ $(echo "$children" | jq 'length') -gt 0 ]]; then
      content+=$(generate_body_sections "$children")
    fi
  done

  echo -e "$content"
}
