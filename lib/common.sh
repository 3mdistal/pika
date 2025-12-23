#!/bin/zsh

# Common helpers for Obsidian vault scripts.
# Intended to be sourced.

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

die() {
  local msg="$1"
  echo "${RED}${msg}${NC}" >&2
  return 1
}

require_cmd() {
  local cmd="$1"
  local install_hint="$2"
  if ! command -v "$cmd" &> /dev/null; then
    echo "${RED}Error: ${cmd} is required but not installed.${NC}" >&2
    [[ -n "$install_hint" ]] && echo "$install_hint" >&2
    return 1
  fi
}

# Prompt for selection from array
# Args: prompt_text, options...
# Returns: selected value (empty if skipped)
prompt_selection() {
  local prompt="$1"
  shift
  local options=("$@")

  echo "\n${CYAN}$prompt${NC}" >&2
  echo "(Enter number, or press Enter to skip)\n" >&2

  local i=1
  for opt in "${options[@]}"; do
    echo "  $i) $opt" >&2
    ((i++))
  done

  echo "" >&2
  read -r "choice?> "

  if [[ -z "$choice" ]]; then
    echo ""
    return
  fi

  if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
    echo "${options[$choice]}"
  else
    echo ""
  fi
}

# Prompt for text input
# Args: prompt_text, default_value (optional)
prompt_input() {
  local prompt="$1"
  local default="$2"
  local value

  if [[ -n "$default" ]]; then
    printf '%b%s%b [%s]: ' "$CYAN" "$prompt" "$NC" "$default" >&2
    read -r value
    echo "${value:-$default}"
  else
    printf '%b%s%b: ' "$CYAN" "$prompt" "$NC" >&2
    read -r value
    echo "$value"
  fi
}

# Prompt for required input (loops until non-empty)
prompt_required() {
  local prompt="$1"
  local value=""
  while [[ -z "$value" ]]; do
    value=$(prompt_input "$prompt (required)")
  done
  echo "$value"
}
