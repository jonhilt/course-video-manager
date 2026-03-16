#!/bin/bash
set -eo pipefail

SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "Fetching open issues..."
ISSUES=$(gh issue list --state open --json number,title,body,comments --limit 100)

ISSUE_COUNT=$(echo "$ISSUES" | jq 'length')
echo "Found $ISSUE_COUNT open issues."

if [ "$ISSUE_COUNT" -eq 0 ]; then
  echo "No open issues. Nothing to dispatch."
  exit 0
fi

echo "Asking orchestrator to analyze issues and plan tasks..."

RESULT=$(claude -p \
  --output-format json \
  --allowedTools "Read,Grep,Glob" \
  "$(cat "$REPO_ROOT/scripts/dispatch-prompt.md")

## Open Issues

$ISSUES")

# Extract the result field from Claude's JSON output
TASKS=$(echo "$RESULT" | jq -r '.result')

# Validate we got valid JSON array
if ! echo "$TASKS" | jq -e 'type == "array"' > /dev/null 2>&1; then
  echo "Error: Orchestrator did not return a valid JSON array."
  echo "Raw output:"
  echo "$TASKS"
  exit 1
fi

TASK_COUNT=$(echo "$TASKS" | jq 'length')

if [ "$TASK_COUNT" -eq 0 ]; then
  echo "Orchestrator found no tasks to dispatch."
  exit 0
fi

echo ""
echo "Dispatching $TASK_COUNT tasks:"
echo ""

echo "$TASKS" | jq -c '.[]' | while read -r task; do
  BRANCH_NAME=$(echo "$task" | jq -r '.branch_name')
  ISSUE_NUMBERS=$(echo "$task" | jq -c '.issue_numbers')
  PROMPT=$(echo "$task" | jq -r '.prompt')

  echo "  -> $BRANCH_NAME"
  echo "     Issues: $ISSUE_NUMBERS"
  echo "     Prompt: ${PROMPT:0:80}..."
  echo ""

  gh workflow run claude-work.yml \
    -f branch_name="$BRANCH_NAME" \
    -f issue_numbers="$ISSUE_NUMBERS" \
    -f prompt="$PROMPT"
done

echo "All tasks dispatched. Run 'gh run list --workflow=claude-work.yml' to monitor."
