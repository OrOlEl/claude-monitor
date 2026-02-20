#!/bin/bash
# UserPromptSubmit Hook: Inject pending browser commands into user's message
# This fires BEFORE the user's message is sent to Claude
# Much more reliable than Stop hook - no timing/subagent issues
#
# SAFETY: This script MUST always output valid JSON to stdout.
# Any failure path must produce {"continue":true} at minimum.

QUEUE_FILE="$HOME/.claude-monitor/commands.jsonl"
LOCK_FILE="$HOME/.claude-monitor/prompt-inject.lock"
MONITOR_HOST="${CLAUDE_MONITOR_HOST:-127.0.0.1}"
MONITOR_PORT="${CLAUDE_MONITOR_PORT:-3847}"
MONITOR_URL="${CLAUDE_MONITOR_URL:-http://$MONITOR_HOST:$MONITOR_PORT/health}"

mkdir -p "$(dirname "$QUEUE_FILE")" 2>/dev/null

# --- Safety wrapper: guarantee valid JSON output on ANY exit ---
_HOOK_OUTPUT_DONE=0

_emit_json() {
  if [ $_HOOK_OUTPUT_DONE -eq 0 ]; then
    _HOOK_OUTPUT_DONE=1
    printf '%s' "$1"
  fi
}

emit_continue() {
  _emit_json '{"continue":true}'
}

# Trap: if script exits for ANY reason without output, emit continue
trap 'emit_continue' EXIT

# If monitor server is down, skip injection (do not block LLM)
monitor_alive() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --connect-timeout 0.2 --max-time 0.5 "$MONITOR_URL" >/dev/null 2>&1
    return $?
  fi
  return 0
}
monitor_alive || exit 0

# No queue file = nothing to inject
[ ! -f "$QUEUE_FILE" ] && exit 0

# Quick check for any pending commands (fast path)
grep -q '"status":"pending"' "$QUEUE_FILE" 2>/dev/null || exit 0

# Clean stale lock
if [ -d "$LOCK_FILE" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0) ))
  [ "$LOCK_AGE" -gt 10 ] && rm -rf "$LOCK_FILE"
fi

# Acquire lock
TRIES=0
while ! mkdir "$LOCK_FILE" 2>/dev/null; do
  sleep 0.05
  TRIES=$((TRIES + 1))
  [ $TRIES -ge 40 ] && exit 0
done
trap 'rm -rf "$LOCK_FILE"; emit_continue' EXIT

# Get all pending commands (newest first)
PENDING_CMDS=$(grep '"status":"pending"' "$QUEUE_FILE" 2>/dev/null)
[ -z "$PENDING_CMDS" ] && exit 0

# Extract command texts via stdin (NOT argv - avoids shell escaping issues)
CMD_TEXTS=$(echo "$PENDING_CMDS" | python3 -c "
import json, sys
cmds = []
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
        cmd = (obj.get('command', '') or '').strip()
        if cmd:
            cmds.append(cmd)
    except:
        pass
if cmds:
    print('\n---\n'.join(cmds))
" 2>/dev/null)

# Validate: must have non-whitespace content
if [ -z "${CMD_TEXTS//[[:space:]]/}" ]; then
  exit 0
fi

# Mark all pending as delivered
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TEMP_FILE=$(mktemp)
python3 -c "
import json, sys
with open('$QUEUE_FILE', 'r') as f:
    lines = f.readlines()
result = []
for line in lines:
    line = line.strip()
    if not line: continue
    try:
        obj = json.loads(line)
        if obj.get('status') == 'pending':
            obj['status'] = 'delivered'
            obj['delivered_at'] = '$TIMESTAMP'
            obj['delivered_via'] = 'prompt_inject'
        result.append(json.dumps(obj))
    except:
        result.append(line)
with open('$TEMP_FILE', 'w') as f:
    f.write('\n'.join(result) + '\n')
" 2>/dev/null

if [ -s "$TEMP_FILE" ]; then
  mv "$TEMP_FILE" "$QUEUE_FILE"
else
  rm -f "$TEMP_FILE"
fi

# Output: additionalContext injected into user's prompt
# CRITICAL: Use stdin (not argv) to pass CMD_TEXTS to Python
# This avoids crashes from special characters, multiline strings, etc.
RESULT=$(printf '%s' "$CMD_TEXTS" | python3 -c "
import json, sys
cmds = sys.stdin.read().strip()
if not cmds:
    print(json.dumps({'continue': True}))
    sys.exit(0)
output = {
    'continue': True,
    'hookSpecificOutput': {
        'hookEventName': 'UserPromptSubmit',
        'additionalContext': '[Browser Dashboard Commands]\n\nThe user also sent these commands from the monitoring dashboard:\n\n' + cmds + '\n\nPlease process these along with the current request.'
    }
}
print(json.dumps(output))
" 2>/dev/null)

# Validate Python output before emitting
if [ -n "$RESULT" ] && echo "$RESULT" | python3 -c "import json,sys; json.loads(sys.stdin.read())" 2>/dev/null; then
  _emit_json "$RESULT"
else
  # Python failed - just continue without injection
  emit_continue
fi

exit 0
