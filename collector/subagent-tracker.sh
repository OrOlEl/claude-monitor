#!/bin/bash
# Subagent Tracker: Captures SubagentStart/SubagentStop events for monitoring
# Native Claude Code hook
#
# SAFETY: Always outputs valid JSON. Never blocks LLM execution.

EVENTS_FILE="$HOME/.claude-monitor/events.jsonl"
MONITOR_HOST="${CLAUDE_MONITOR_HOST:-127.0.0.1}"
MONITOR_PORT="${CLAUDE_MONITOR_PORT:-3847}"
MONITOR_URL="${CLAUDE_MONITOR_URL:-http://$MONITOR_HOST:$MONITOR_PORT/health}"

mkdir -p "$(dirname "$EVENTS_FILE")" 2>/dev/null

# --- Safety wrapper: guarantee valid JSON output on ANY exit ---
_HOOK_OUTPUT_DONE=0

emit_continue() {
  if [ $_HOOK_OUTPUT_DONE -eq 0 ]; then
    _HOOK_OUTPUT_DONE=1
    printf '{"continue":true}'
  fi
}

trap 'emit_continue' EXIT

# If monitor server is down, skip
monitor_alive() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --connect-timeout 0.2 --max-time 0.5 "$MONITOR_URL" >/dev/null 2>&1
    return $?
  fi
  return 0
}
monitor_alive || exit 0

INPUT=$(cat)
[ -z "$INPUT" ] && exit 0

printf '%s' "$INPUT" | python3 -c "
import json, sys, time, uuid, os

raw = sys.stdin.read()
try:
    data = json.loads(raw)
except:
    sys.exit(0)

session_id = data.get('session_id', '')
hook_name = data.get('hook_event_name', '')
agent_name = data.get('agent_name', data.get('subagent_type', ''))
agent_type = data.get('subagent_type', data.get('agent_type', ''))
model = data.get('model', '')
team_name = data.get('team_name', '')

if not agent_name and not agent_type:
    sys.exit(0)

# Determine event type
if hook_name == 'SubagentStop':
    event_type = 'agent_end'
else:
    event_type = 'agent_start'

# Extract project from PWD
cwd = os.environ.get('PWD', '')
project = ''
if cwd:
    parts = cwd.rstrip('/').split('/')
    project = parts[-1] if parts else ''

# Extract flags from prompt if available
prompt_text = data.get('prompt', '')
detected_flags = []
for flag in ['--ultrathink', '--verbose', '--aggressive', '--safe-mode', '--loop', '--interactive', '--all-mcp']:
    if flag in prompt_text:
        detected_flags.append(flag)

# Build detail
detail_parts = []
if agent_type:
    detail_parts.append(f'type: {agent_type}')
if model:
    detail_parts.append(f'model: {model}')
if team_name:
    detail_parts.append(f'team: {team_name}')
if detected_flags:
    detail_parts.append(f'flags: {",".join(detected_flags)}')
detail = ', '.join(detail_parts)

event = {
    'id': str(uuid.uuid4()),
    'type': event_type,
    'timestamp': int(time.time() * 1000),
    'session_id': session_id,
    'agent_type': agent_type or agent_name,
    'model': model,
    'project': project,
    'detail': detail,
    'source': 'subagent_hook',
}
if team_name:
    event['team_name'] = team_name
if detected_flags:
    event['flags'] = ','.join(detected_flags)

try:
    events_file = os.path.expanduser('~/.claude-monitor/events.jsonl')
    with open(events_file, 'a') as f:
        f.write(json.dumps(event) + '\n')
except:
    pass
" 2>/dev/null

exit 0
