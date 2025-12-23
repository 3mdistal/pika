#!/bin/zsh

# Test cases for ovault list command
# These are sourced by test_runner.sh

# ============================================
# List Command Basic Tests
# ============================================

test_list_help_without_type() {
    local output
    output=$(run_ovault "" list 2>&1)
    local exit_code=$?
    
    assert_equals "1" "$exit_code" "Should exit with error when no type provided"
    assert_contains "$output" "Usage:" "Should show usage"
    assert_contains "$output" "Available types:" "Should show available types"
}

test_list_unknown_type() {
    local output
    output=$(run_ovault "" list nonexistent 2>&1)
    local exit_code=$?
    
    assert_equals "1" "$exit_code" "Should exit with error for unknown type"
    assert_contains "$output" "Unknown type" "Should report unknown type"
}

# ============================================
# List Leaf Type Tests
# ============================================

test_list_idea_type() {
    # Ideas fixture has "Sample Idea" and "Another Idea"
    local output=$(run_ovault "" list idea)
    
    assert_contains "$output" "Sample Idea" "Should list Sample Idea"
    assert_contains "$output" "Another Idea" "Should list Another Idea"
}

test_list_results_sorted() {
    local output=$(run_ovault "" list idea)
    
    # "Another Idea" should come before "Sample Idea" alphabetically
    local another_line=$(echo "$output" | grep -n "Another Idea" | cut -d: -f1)
    local sample_line=$(echo "$output" | grep -n "Sample Idea" | cut -d: -f1)
    
    [[ $another_line -lt $sample_line ]]
}

# ============================================
# List Subtype Tests
# ============================================

test_list_subtype_task() {
    # Tasks fixture has "Sample Task"
    local output=$(run_ovault "" list objective/task)
    
    assert_contains "$output" "Sample Task" "Should list Sample Task"
}

test_list_subtype_milestone() {
    # Milestones fixture has "Active Milestone" and "Settled Milestone"
    local output=$(run_ovault "" list objective/milestone)
    
    assert_contains "$output" "Active Milestone" "Should list Active Milestone"
    assert_contains "$output" "Settled Milestone" "Should list Settled Milestone"
}

# ============================================
# List Parent Type Tests (includes subtypes)
# ============================================

test_list_parent_type_includes_all_subtypes() {
    # objective should include both tasks and milestones
    local output=$(run_ovault "" list objective)
    
    assert_contains "$output" "Sample Task" "Should include tasks"
    assert_contains "$output" "Active Milestone" "Should include milestones"
    assert_contains "$output" "Settled Milestone" "Should include milestones"
}

test_list_entity_parent_type() {
    # entity has person subtype, but no fixture files exist yet
    # Should return empty (no error)
    local output
    output=$(run_ovault "" list entity)
    local exit_code=$?
    
    assert_equals "0" "$exit_code" "Should succeed even with no files"
}

# ============================================
# List Empty Directory Tests
# ============================================

test_list_empty_type() {
    # entity/person has no fixture files
    local output
    output=$(run_ovault "" list entity/person)
    local exit_code=$?
    
    assert_equals "0" "$exit_code" "Should succeed with empty directory"
    # Output should be empty or whitespace only
    [[ -z "${output// /}" ]]
}

# ============================================
# Type Path Parsing Tests
# ============================================

test_list_deep_subtype_nonexistent() {
    # Test invalid deep path
    local output
    output=$(run_ovault "" list objective/task/invalid 2>&1)
    local exit_code=$?
    
    assert_equals "1" "$exit_code" "Should fail for invalid deep path"
    assert_contains "$output" "Unknown type" "Should report unknown type"
}
