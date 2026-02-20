#!/bin/bash
# Event Collector: Captures tool/skill/agent events from Claude Code hooks
# PreToolUse: stdin has {tool_name, tool_input} - NO tool_output
# PostToolUse: stdin has {tool_name, tool_input, tool_output} - HAS tool_output
#
# CRITICAL FIX: Data passed via stdin to Python (not sys.argv)
# because PostToolUse tool_output can exceed shell ARG_MAX limit
#
# SAFETY: Always outputs valid JSON. Never blocks LLM execution.

EVENTS_FILE="$HOME/.claude-monitor/events.jsonl"
DEBUG_FILE="$HOME/.claude-monitor/collector-debug.log"
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

# If monitor server is down, skip event collection entirely
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

# Pass data via stdin to Python - avoids ARG_MAX issues with large tool_output
printf '%s' "$INPUT" | python3 -c "
import json, sys, time, uuid, os

raw = sys.stdin.read()
try:
    data = json.loads(raw)
except:
    sys.exit(0)

tool_name = data.get('tool_name', '')
if not tool_name:
    sys.exit(0)

session_id = data.get('session_id', '')
tool_input = data.get('tool_input', data.get('input', {}))
if not isinstance(tool_input, dict):
    tool_input = {}

# Distinguish Pre vs Post using hook_event_name (most reliable)
# Fallback: PostToolUse has 'tool_response' field, PreToolUse does not
data_keys = list(data.keys())
hook_name = data.get('hook_event_name', '')
is_post = hook_name == 'PostToolUse' or 'tool_response' in data or 'tool_output' in data

# Extract project - PWD env var is most reliable
cwd = os.environ.get('PWD', tool_input.get('cwd', ''))
project = ''
if cwd:
    parts = cwd.rstrip('/').split('/')
    project = parts[-1] if parts else ''

# Build detail summary from tool_input
detail = ''
if tool_name == 'Bash':
    detail = (tool_input.get('command', '') or '')[:300]
elif tool_name in ('Read', 'Write'):
    detail = tool_input.get('file_path', '') or ''
elif tool_name == 'Edit':
    fp = tool_input.get('file_path', '') or ''
    old = (tool_input.get('old_string', '') or '')[:100]
    detail = f'{fp}\\n{old}' if old else fp
elif tool_name in ('Grep', 'Glob'):
    pattern = tool_input.get('pattern', '') or ''
    path = tool_input.get('path', '') or ''
    detail = f'{pattern}  {path}'.strip()
elif tool_name == 'Task':
    desc = tool_input.get('description', '') or ''
    agent = tool_input.get('subagent_type', '') or ''
    model = tool_input.get('model', '') or ''
    prompt = (tool_input.get('prompt', '') or '')[:300]
    parts = [p for p in [desc, f'agent: {agent}' if agent else '', f'model: {model}' if model else '', prompt] if p]
    detail = '\n'.join(parts)
elif tool_name == 'Skill':
    skill = tool_input.get('skill', '') or ''
    args = (tool_input.get('args', '') or '')[:200]
    detail = f'{skill} {args}'.strip() if args else skill
elif tool_name == 'WebFetch':
    detail = tool_input.get('url', '') or ''
elif tool_name == 'WebSearch':
    detail = tool_input.get('query', '') or ''
elif tool_name == 'SendMessage':
    msg_t = tool_input.get('type', '')
    recip = tool_input.get('recipient', '')
    summ = (tool_input.get('summary', '') or '')[:80]
    detail = f'{msg_t} -> {recip}: {summ}'.strip()
elif tool_name in ('TeamCreate', 'TeamDelete'):
    tn = tool_input.get('team_name', '')
    desc = (tool_input.get('description', '') or '')[:100]
    detail = f'{tn} {desc}'.strip()
elif tool_name in ('TaskCreate', 'TaskUpdate'):
    subj = (tool_input.get('subject', '') or '')[:100]
    stat = tool_input.get('status', '') or ''
    tid = tool_input.get('taskId', '') or ''
    detail = f'{subj} {stat} {tid}'.strip()
else:
    # Generic: try to get a meaningful field
    for key in ('file_path', 'path', 'pattern', 'query', 'command', 'prompt', 'url'):
        val = tool_input.get(key, '')
        if val:
            detail = str(val)[:200]
            break

# Truncate output for PostToolUse
output_summary = ''
if is_post:
    tool_output = data.get('tool_output', data.get('tool_response', ''))
    if isinstance(tool_output, dict):
        tool_output = str(tool_output)
    output_summary = (str(tool_output) or '')[:300]

# Determine event type
if tool_name == 'Task':
    subagent = tool_input.get('subagent_type', tool_input.get('description', ''))
    model = tool_input.get('model', '')
    team_name = tool_input.get('team_name', '')
    agent_name = tool_input.get('name', '')
    # Extract flags from prompt for team agents
    prompt_text = tool_input.get('prompt', '')
    prompt_flags = []
    for flag in ['--ultrathink', '--verbose', '--aggressive', '--safe-mode', '--loop', '--interactive', '--all-mcp']:
        if flag in prompt_text:
            prompt_flags.append(flag)
    event = {
        'id': str(uuid.uuid4()),
        'type': 'agent_end' if is_post else 'agent_start',
        'timestamp': int(time.time() * 1000),
        'session_id': session_id,
        'agent_type': subagent,
        'model': model,
        'project': project,
        'detail': detail,
    }
    if team_name:
        event['team_name'] = team_name
    if agent_name:
        event['agent_name'] = agent_name
    if prompt_flags:
        event['flags'] = ','.join(prompt_flags)
    if output_summary:
        event['output'] = output_summary
elif tool_name == 'Skill':
    skill_name = tool_input.get('skill', tool_input.get('name', ''))
    event = {
        'id': str(uuid.uuid4()),
        'type': 'skill_end' if is_post else 'skill_start',
        'timestamp': int(time.time() * 1000),
        'session_id': session_id,
        'skill_name': skill_name,
        'project': project,
        'detail': detail,
    }
    if output_summary:
        event['output'] = output_summary
else:
    event = {
        'id': str(uuid.uuid4()),
        'type': 'tool_end' if is_post else 'tool_start',
        'timestamp': int(time.time() * 1000),
        'session_id': session_id,
        'tool_name': tool_name,
        'project': project,
        'detail': detail,
    }
    if output_summary:
        event['output'] = output_summary

try:
    events_path = os.path.expanduser('~/.claude-monitor/events.jsonl')
    with open(events_path, 'a') as f:
        f.write(json.dumps(event) + '\n')
except:
    pass

# Team lifecycle tracking: emit team events for TeamCreate/TeamDelete/SendMessage
if tool_name in ('TeamCreate', 'TeamDelete') and not is_post:
    team_event = {
        'id': str(uuid.uuid4()),
        'type': 'team_lifecycle',
        'timestamp': int(time.time() * 1000),
        'session_id': session_id,
        'project': project,
        'action': 'create' if tool_name == 'TeamCreate' else 'delete',
        'team_name': tool_input.get('team_name', ''),
        'description': (tool_input.get('description', '') or '')[:200],
    }
    try:
        with open(events_path, 'a') as f:
            f.write(json.dumps(team_event) + '\n')
    except:
        pass

if tool_name == 'SendMessage' and not is_post:
    msg_type = tool_input.get('type', '')
    if msg_type in ('message', 'broadcast', 'shutdown_request'):
        team_msg_event = {
            'id': str(uuid.uuid4()),
            'type': 'team_message',
            'timestamp': int(time.time() * 1000),
            'session_id': session_id,
            'project': project,
            'msg_type': msg_type,
            'recipient': tool_input.get('recipient', ''),
            'summary': (tool_input.get('summary', '') or '')[:100],
            'content': (tool_input.get('content', '') or '')[:300],
            'sender': tool_input.get('sender', ''),
        }
        try:
            with open(events_path, 'a') as f:
                f.write(json.dumps(team_msg_event) + '\n')
        except:
            pass

# Task Plan tracking: emit additional task_plan events for TaskCreate/TaskUpdate
if tool_name in ('TaskCreate', 'TaskUpdate', 'TaskList') and not is_post:
    task_event = {
        'id': str(uuid.uuid4()),
        'type': 'task_plan',
        'timestamp': int(time.time() * 1000),
        'session_id': session_id,
        'project': project,
    }
    if tool_name == 'TaskCreate':
        task_event['action'] = 'create'
        task_event['subject'] = (tool_input.get('subject', '') or '')[:200]
        task_event['description'] = (tool_input.get('description', '') or '')[:300]
        task_event['activeForm'] = tool_input.get('activeForm', '') or ''
    elif tool_name == 'TaskUpdate':
        task_event['action'] = 'update'
        task_event['taskId'] = str(tool_input.get('taskId', ''))
        task_event['status'] = tool_input.get('status', '') or ''
        task_event['subject'] = tool_input.get('subject', '') or ''
        task_event['owner'] = tool_input.get('owner', '') or ''
    elif tool_name == 'TaskList':
        task_event['action'] = 'list'

    try:
        with open(events_path, 'a') as f:
            f.write(json.dumps(task_event) + '\n')
    except:
        pass

# Debug log
try:
    debug_path = os.path.expanduser('~/.claude-monitor/collector-debug.log')
    with open(debug_path, 'a') as f:
        f.write(f'[{event[\"type\"]}] {tool_name} is_post={is_post} keys={data_keys} input_len={len(raw)}\n')
except:
    pass
" 2>/dev/null

exit 0
