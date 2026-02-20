# Claude Monitor

Real-time monitoring dashboard for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Captures every request, tool call, agent spawn, and model thinking event via Claude Code's hook system and visualizes them as an interactive Argo CD-style execution tree.

![Architecture: Hooks → JSONL → Server → WebSocket → Dashboard](https://img.shields.io/badge/stack-Next.js_|_Express_|_Socket.IO-blue)

---

## Quick Start (AI Assistant)

> Tell your AI coding assistant (Claude Code, Cursor, etc.) one of these:
> - **"Set up this project with Docker"**
> - **"이 프로젝트 도커로 셋팅해줘"**
>
> The assistant will read the instructions below and do everything automatically.

<details>
<summary><b>LLM Setup Instructions (click to expand)</b></summary>

### For AI Assistants: Claude Monitor Docker Setup

You are setting up **claude-monitor**, a real-time monitoring dashboard for Claude Code.
Read these instructions carefully and execute all steps.

#### Architecture Understanding

```
HOST (user's machine)                    DOCKER
├── Claude Code                          ├── server container (:3847)
│   └── fires hooks ─────────────────┐   │   └── watches files via volume mount
├── hooks/*.sh, collector/*.sh       │   ├── dashboard container (:3848)
│   └── write to ~/.claude-monitor/  │   │   └── connects to server via WS
└── ~/.claude-monitor/               │   └── volumes:
    ├── events.jsonl  ◄──────────────┘       ├── ~/.claude-monitor → /home/node/.claude-monitor
    └── commands.jsonl                       └── ~/.claude (ro) → /home/node/.claude
```

**Critical constraint:** Hook scripts run on the HOST (not in Docker) because Claude Code invokes them directly. Only the server and dashboard run in containers.

#### Step 1: Create Docker Files

**Create `server/Dockerfile`:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src/ ./src/
ENV HOME=/home/node
ENV HOST=0.0.0.0
USER node
EXPOSE 3847
CMD ["node", "src/index.js"]
```

Note: `HOST=0.0.0.0` is required inside Docker so the container can accept connections from the host. In non-Docker mode, the server binds to `127.0.0.1` by default.

**Create `dashboard/Dockerfile`:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV HOME=/home/node
USER node
EXPOSE 3848
CMD ["npm", "start"]
```

**Create `docker-compose.yml` in the project root:**
```yaml
services:
  server:
    build: ./server
    ports:
      - "127.0.0.1:3847:3847"
    volumes:
      - ${HOME}/.claude-monitor:/home/node/.claude-monitor
      - ${HOME}/.claude:/home/node/.claude:ro
    environment:
      - HOST=0.0.0.0
      - ALLOWED_ORIGINS=http://localhost:3848
    restart: unless-stopped

  dashboard:
    build: ./dashboard
    ports:
      - "127.0.0.1:3848:3848"
    environment:
      - NEXT_PUBLIC_WS_URL=http://localhost:3847
    depends_on:
      - server
    restart: unless-stopped
```

**Create `dashboard/.dockerignore`:**
```
node_modules
.next
```

**Create `server/.dockerignore`:**
```
node_modules
```

#### Step 2: Create Data Directory

```bash
mkdir -p ~/.claude-monitor
chmod 700 ~/.claude-monitor
```

#### Step 3: Configure Claude Code Hooks

**First, back up the existing config:**
```bash
cp ~/.claude/settings.json ~/.claude/settings.json.backup 2>/dev/null || true
```

Read the user's current `~/.claude/settings.json`. If it exists, **merge** the hooks below into the existing config — do NOT overwrite other settings or existing hooks. If it doesn't exist, create it.

Get the **absolute path** to the cloned repository. Use that path in the hook commands below.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "<ABSOLUTE_PATH>/hooks/prompt-inject.sh"
      },
      {
        "type": "command",
        "command": "<ABSOLUTE_PATH>/hooks/req-tracker.sh"
      }
    ],
    "PreToolUse": [
      {
        "type": "command",
        "command": "<ABSOLUTE_PATH>/collector/collector.sh"
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "<ABSOLUTE_PATH>/collector/collector.sh"
      }
    ],
    "SubagentStart": [
      {
        "type": "command",
        "command": "<ABSOLUTE_PATH>/collector/subagent-tracker.sh"
      }
    ],
    "SubagentStop": [
      {
        "type": "command",
        "command": "<ABSOLUTE_PATH>/collector/subagent-tracker.sh"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "<ABSOLUTE_PATH>/hooks/req-end.sh"
      }
    ]
  }
}
```

Replace `<ABSOLUTE_PATH>` with the actual path (e.g., `/Users/john/claude-monitor`).

**Important:** If `~/.claude/settings.json` already has hooks for these events, append to the existing arrays rather than replacing them.

#### Step 4: Ensure Hook Scripts Are Executable

```bash
chmod +x <ABSOLUTE_PATH>/hooks/*.sh <ABSOLUTE_PATH>/collector/*.sh
```

#### Step 5: Start Services

```bash
cd <PROJECT_ROOT>
docker compose up -d --build
```

#### Step 6: Verify

1. Check containers are running: `docker compose ps`
2. Health check: `curl http://localhost:3847/health` — should return `{"status":"ok",...}`
3. Open `http://localhost:3848` in a browser
4. Use Claude Code normally — events should appear in the dashboard in real time

#### Troubleshooting Notes for LLMs

- **macOS file watching:** If events don't appear, add `CHOKIDAR_USEPOLLING=1` to the server environment in docker-compose.yml.
- **Permission errors on volume mounts:** Run `chmod 700 ~/.claude-monitor` to ensure proper access.
- **Dashboard can't connect to server:** The dashboard's `NEXT_PUBLIC_WS_URL` is used client-side (in the browser), so `http://localhost:3847` is correct since the browser runs on the host.

</details>

---

## Docker Setup (Manual)

### 1. Clone

```bash
git clone https://github.com/OrOlEl/claude-monitor.git
cd claude-monitor
```

### 2. Configure Hooks

Back up and merge into `~/.claude/settings.json`:

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.backup 2>/dev/null || true
```

```jsonc
{
  "hooks": {
    "UserPromptSubmit": [
      { "type": "command", "command": "/path/to/claude-monitor/hooks/prompt-inject.sh" },
      { "type": "command", "command": "/path/to/claude-monitor/hooks/req-tracker.sh" }
    ],
    "PreToolUse": [
      { "type": "command", "command": "/path/to/claude-monitor/collector/collector.sh" }
    ],
    "PostToolUse": [
      { "type": "command", "command": "/path/to/claude-monitor/collector/collector.sh" }
    ],
    "SubagentStart": [
      { "type": "command", "command": "/path/to/claude-monitor/collector/subagent-tracker.sh" }
    ],
    "SubagentStop": [
      { "type": "command", "command": "/path/to/claude-monitor/collector/subagent-tracker.sh" }
    ],
    "Stop": [
      { "type": "command", "command": "/path/to/claude-monitor/hooks/req-end.sh" }
    ]
  }
}
```

Replace `/path/to/claude-monitor` with your actual path, then:

```bash
chmod +x hooks/*.sh collector/*.sh
mkdir -p ~/.claude-monitor && chmod 700 ~/.claude-monitor
```

### 3. Start

```bash
docker compose up -d --build
```

### 4. Verify

- Server health: `curl http://localhost:3847/health`
- Dashboard: open `http://localhost:3848`
- Use Claude Code as usual — events appear in real time

---

## Architecture

```
Claude Code Hooks (bash)
  │
  ├─ req-tracker.sh        ← UserPromptSubmit
  ├─ req-end.sh            ← Stop
  ├─ collector.sh           ← PreToolUse / PostToolUse
  ├─ subagent-tracker.sh    ← SubagentStart / SubagentStop
  └─ prompt-inject.sh       ← UserPromptSubmit (command injection)
  │
  ▼
~/.claude-monitor/events.jsonl   (append-only event log)
~/.claude-monitor/commands.jsonl (dashboard → agent command queue)
  │
  ▼
Server (Express + Socket.IO, :3847)
  │  - watches JSONL files via chokidar
  │  - parses transcript files for thinking/response
  │  - watches ~/.claude/teams/ and ~/.claude/tasks/
  │
  ▼
Dashboard (Next.js + Zustand, :3848)
     - Argo CD-style horizontal execution tree
     - Session/project grid view
     - Conversation panel with tool call details
     - Team & task monitoring
```

## Features

- **Execution Tree** — Horizontal L→R tree showing the full call hierarchy: request → task → agent → skill → tool
- **Live Status** — Running nodes pulse with animation and a real-time timer
- **Thinking Viewer** — Peek into the model's extended thinking blocks
- **Session Grid** — Track multiple Claude Code sessions across projects
- **Team Monitor** — Visualize Agent Teams structure, members, and task progress
- **Command Injection** — Send commands from the dashboard that get injected into the next prompt
- **Conversation Panel** — Browse message history with inline tool call expansion

## Project Structure

```
claude-monitor/
├── server/              # Node.js event relay server
│   └── src/index.js     # Express + Socket.IO + file watchers
├── dashboard/           # Next.js monitoring UI
│   ├── app/             # Next.js app router
│   ├── components/      # React components
│   │   ├── HorizontalTree.js    # Main execution tree
│   │   ├── ConversationPanel.js # Message history
│   │   ├── ProjectsGrid.js     # Session/project overview
│   │   ├── LiveStatusBar.js    # Top status indicators
│   │   └── ...
│   ├── stores/          # Zustand state management
│   │   ├── eventStore.js    # Event processing & tree builder
│   │   └── sessionStore.js  # Session/project tracking
│   └── hooks/           # React hooks (useSocket)
├── hooks/               # Claude Code hook scripts
│   ├── prompt-inject.sh # Command injection via UserPromptSubmit
│   ├── req-tracker.sh   # Request start tracking
│   └── req-end.sh       # Request end tracking
└── collector/           # Event collector scripts
    ├── collector.sh         # Tool use event capture
    └── subagent-tracker.sh  # Agent lifecycle tracking
```

## Event Types

| Event | Source Hook | Description |
|-------|-----------|-------------|
| `req_start` / `req_end` | UserPromptSubmit / Stop | User request lifecycle |
| `tool_start` / `tool_end` | PreToolUse / PostToolUse | Tool invocations (Read, Edit, Bash, etc.) |
| `agent_start` / `agent_end` | SubagentStart / SubagentStop | Sub-agent spawns (Task tool) |
| `skill_start` / `skill_end` | PreToolUse / PostToolUse | Skill invocations |
| `thinking` | Transcript parsing | Model's extended thinking |
| `response_text` | Transcript parsing | Model's response output |
| `routing` | req-tracker.sh | Natural language intent routing |
| `compaction` | Transcript parsing | Context window compaction |
| `task_plan` | collector.sh | Task create/update events |
| `team_lifecycle` | Server file watcher | Team create/delete |

## How It Works

1. **Hooks capture events** — Claude Code fires hooks at each lifecycle point. The bash scripts extract relevant data from `stdin` (JSON context) and append a structured event to `~/.claude-monitor/events.jsonl`.

2. **Server relays in real time** — The Node.js server watches the JSONL file with chokidar. New lines are parsed, validated, and broadcast to all connected dashboards via Socket.IO.

3. **Dashboard rebuilds the tree** — The Zustand event store maintains open/close stacks and reconstructs a hierarchical tree (session → request → task → skill → agent → tool) from the flat event stream. The React components render this as an interactive horizontal tree.

4. **Command injection loop** — Commands typed in the dashboard are written to `commands.jsonl`. On the next `UserPromptSubmit`, `prompt-inject.sh` reads pending commands and injects them as additional context into the prompt.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3847` | Server port |
| `HOST` | `127.0.0.1` | Server bind address |
| `ALLOWED_ORIGINS` | `http://localhost:3848` | Comma-separated CORS origins |
| `EVENTS_FILE` | `~/.claude-monitor/events.jsonl` | Event log path |
| `COMMANDS_FILE` | `~/.claude-monitor/commands.jsonl` | Command queue path |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:3847` | Server URL for dashboard |

## Hook Safety

All hook scripts use a safety wrapper to guarantee valid JSON output on any exit path, preventing Claude Code API errors:

```bash
_HOOK_OUTPUT_DONE=0
emit_continue() {
  if [ $_HOOK_OUTPUT_DONE -eq 0 ]; then
    _HOOK_OUTPUT_DONE=1
    printf '{"continue":true}'
  fi
}
trap 'emit_continue' EXIT
```

If the monitor server is down, hooks exit cleanly without blocking Claude Code.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Dashboard | Next.js 14, React 18, Zustand, Tailwind CSS, Lucide Icons |
| Server | Node.js, Express, Socket.IO, chokidar |
| Data | JSONL (JSON Lines), append-only |
| Integration | Claude Code hooks (bash) |

## Uninstall / Rollback

> Tell your AI assistant: **"claude-monitor 제거해줘"** or **"Uninstall claude-monitor"**

<details>
<summary><b>LLM Uninstall Instructions (click to expand)</b></summary>

### For AI Assistants: Claude Monitor Removal Guide

You are removing **claude-monitor**. Follow these steps carefully. Do NOT delete any file without confirming the path first.

#### Step 1: Stop Docker Containers

```bash
cd <PROJECT_ROOT>
docker compose down --rmi local
```

If docker-compose.yml doesn't exist, skip this step.

#### Step 2: Remove Claude Monitor Hooks

Read `~/.claude/settings.json` and remove **only** the hook entries that contain `claude-monitor` in their command path. Keep all other hooks and settings intact.

The entries to remove are those whose `command` field contains any of:
- `claude-monitor/hooks/prompt-inject.sh`
- `claude-monitor/hooks/req-tracker.sh`
- `claude-monitor/hooks/req-end.sh`
- `claude-monitor/collector/collector.sh`
- `claude-monitor/collector/subagent-tracker.sh`

**Rules:**
- Do NOT delete `~/.claude/settings.json` — only edit it
- Do NOT remove hooks that don't reference `claude-monitor`
- If a hook event array (e.g., `UserPromptSubmit`) becomes empty after removal, remove the empty array key too
- If the entire `hooks` object becomes empty, remove it but keep other top-level settings

**Important:** Do NOT restore from backup — the user may have added other hooks after installing claude-monitor. Always surgically remove only claude-monitor entries.

#### Step 3: Clean Up Data (Optional)

The event log directory. Only delete if the user confirms:
```bash
rm -rf ~/.claude-monitor/
```

#### Step 4: Remove Project Directory (Optional)

```bash
rm -rf <PROJECT_ROOT>
```

</details>

### Manual Uninstall

```bash
# 1. Stop containers
cd /path/to/claude-monitor && docker compose down --rmi local

# 2. Edit ~/.claude/settings.json
#    Remove all hook entries whose "command" contains "claude-monitor"
#    Keep everything else

# 3. (Optional) Remove event data
rm -rf ~/.claude-monitor/

# 4. (Optional) Remove project
rm -rf /path/to/claude-monitor

# 5. (Optional) Remove backup
rm -f ~/.claude/settings.json.backup
```

## License

MIT
