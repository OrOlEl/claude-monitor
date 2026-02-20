#!/bin/bash
# UserPromptSubmit Hook: Capture user request as req_start event
# Also notifies monitor server that Claude is now BUSY (for tmux chat)
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

# Detect tmux session for busy tracking
TMUX_SESSION_NAME=""
if [ -n "$TMUX" ]; then
  TMUX_SESSION_NAME=$(tmux display-message -p '#{session_name}' 2>/dev/null)
  export _TMUX_SESSION_NAME="$TMUX_SESSION_NAME"
fi

printf '%s' "$INPUT" | python3 -c "
import json, sys, time, uuid, os

raw = sys.stdin.read()
try:
    data = json.loads(raw)
except:
    sys.exit(0)

session_id = data.get('session_id', '')
prompt = data.get('prompt', '')
if not prompt and not session_id:
    sys.exit(0)

# Summarize prompt for tree display (max 60 chars)
summary = (prompt or 'request')[:60].replace('\n', ' ').strip()
if len(prompt or '') > 60:
    summary += '...'

# Full text for tooltip (max 500 chars)
full_text = (prompt or 'request')[:500].replace('\n', ' ').strip()

cwd = data.get('cwd', os.environ.get('PWD', ''))
project = cwd.rstrip('/').split('/')[-1] if cwd else ''

event = {
    'id': str(uuid.uuid4()),
    'type': 'req_start',
    'timestamp': int(time.time() * 1000),
    'session_id': session_id,
    'summary': summary,
    'full_text': full_text,
    'project': project,
}

# Include tmux session info for busy tracking
tmux_session = os.environ.get('_TMUX_SESSION_NAME', '')
if tmux_session:
    event['tmux_session'] = tmux_session

try:
    with open(os.path.expanduser('~/.claude-monitor/events.jsonl'), 'a') as f:
        f.write(json.dumps(event) + '\n')
except:
    pass
" 2>/dev/null

# Direct HTTP notification to server: Claude is now BUSY
# Only send if we're in a tmux session (this is the tmux Claude)
if [ -n "$TMUX_SESSION_NAME" ]; then
  curl -fsS --connect-timeout 0.3 --max-time 0.5 \
    -X POST "http://$MONITOR_HOST:$MONITOR_PORT/api/tmux-busy" \
    -H 'Content-Type: application/json' \
    -d "{\"session\":\"$TMUX_SESSION_NAME\"}" \
    >/dev/null 2>&1 &
fi

exit 0
