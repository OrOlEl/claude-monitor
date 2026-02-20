#!/bin/bash
# Stop Hook: Mark current request as completed (req_end event)
#
# SAFETY: Always outputs valid JSON. Never blocks LLM execution.

EVENTS_FILE="$HOME/.claude-monitor/events.jsonl"
mkdir -p "$(dirname "$EVENTS_FILE")" 2>/dev/null
MONITOR_HOST="${CLAUDE_MONITOR_HOST:-127.0.0.1}"
MONITOR_PORT="${CLAUDE_MONITOR_PORT:-3847}"
MONITOR_URL="${CLAUDE_MONITOR_URL:-http://$MONITOR_HOST:$MONITOR_PORT/health}"

# --- Safety wrapper: guarantee valid JSON output on ANY exit ---
_HOOK_OUTPUT_DONE=0

emit_continue() {
  if [ $_HOOK_OUTPUT_DONE -eq 0 ]; then
    _HOOK_OUTPUT_DONE=1
    printf '{"continue":true}'
  fi
}

trap 'emit_continue' EXIT

# If monitor server is down, skip logging
monitor_alive() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --connect-timeout 0.2 --max-time 0.5 "$MONITOR_URL" >/dev/null 2>&1
    return $?
  fi
  return 0
}
monitor_alive || exit 0

INPUT=$(cat)
# Exit if input is empty or whitespace-only
if [ -z "${INPUT//[[:space:]]/}" ]; then
  exit 0
fi

printf '%s' "$INPUT" | python3 -c "
import json, sys, time, uuid, os

raw = sys.stdin.read()
try:
    data = json.loads(raw)
except:
    sys.exit(0)

session_id = data.get('session_id', '')
cwd = data.get('cwd', os.environ.get('PWD', ''))
project = cwd.rstrip('/').split('/')[-1] if cwd else ''

event = {
    'id': str(uuid.uuid4()),
    'type': 'req_end',
    'timestamp': int(time.time() * 1000),
    'session_id': session_id,
    'project': project,
}

try:
    with open(os.path.expanduser('~/.claude-monitor/events.jsonl'), 'a') as f:
        f.write(json.dumps(event) + '\n')
except:
    pass
" 2>/dev/null

exit 0
