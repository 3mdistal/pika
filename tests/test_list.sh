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

# ============================================
# List --paths Flag Tests
# ============================================

test_list_paths_flag() {
    local output=$(run_ovault "" list --paths idea)
    
    assert_contains "$output" "Ideas/Sample Idea.md" "Should show full path for Sample Idea"
    assert_contains "$output" "Ideas/Another Idea.md" "Should show full path for Another Idea"
}

test_list_paths_with_subtype() {
    local output=$(run_ovault "" list --paths objective/task)
    
    assert_contains "$output" "Objectives/Tasks/Sample Task.md" "Should show full path for task"
}

# ============================================
# List --fields Flag Tests
# ============================================

test_list_fields_single() {
    local output=$(run_ovault "" list --fields=status idea)
    
    assert_contains "$output" "NAME" "Should have NAME header"
    assert_contains "$output" "STATUS" "Should have STATUS header"
    assert_contains "$output" "raw" "Should show status value"
}

test_list_fields_multiple() {
    local output=$(run_ovault "" list --fields=type,status objective/task)
    
    assert_contains "$output" "NAME" "Should have NAME header"
    assert_contains "$output" "TYPE" "Should have TYPE header"
    assert_contains "$output" "STATUS" "Should have STATUS header"
    assert_contains "$output" "objective" "Should show type value"
    assert_contains "$output" "in-flight" "Should show status value"
}

test_list_fields_with_paths() {
    local output=$(run_ovault "" list --paths --fields=status idea)
    
    assert_contains "$output" "PATH" "Should have PATH header instead of NAME"
    assert_contains "$output" "Ideas/" "Should show path"
}

test_list_fields_missing_value() {
    # Ideas don't have 'deadline' field, should show placeholder
    local output=$(run_ovault "" list --fields=deadline idea)
    
    assert_contains "$output" "DEADLINE" "Should have DEADLINE header"
    # Should have placeholder character for missing values
    assert_contains "$output" "—" "Should show placeholder for missing field"
}
