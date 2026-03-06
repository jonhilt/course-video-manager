#!/bin/bash
# Block commands that execute npx tsc, suggest npm run typecheck instead.
# Only blocks when npx is the actual command being run (first word),
# not when "npx tsc" appears in text arguments like commit messages.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
FIRST_WORD=$(echo "$COMMAND" | awk '{print $1}')

if [ "$FIRST_WORD" = "npx" ] && echo "$COMMAND" | head -1 | grep -qE 'npx\s+tsc(\s|$)'; then
  echo 'Use `npm run typecheck` instead of `npx tsc`' >&2
  exit 2
fi
