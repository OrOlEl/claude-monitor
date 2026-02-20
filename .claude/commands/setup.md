# Claude Monitor Setup (Native + tmux)

You are setting up **claude-monitor** with native Node.js + tmux for real-time monitoring and instant browser command injection.

## Important Context

- This project directory is the root of claude-monitor
- Hook scripts run on the HOST machine (not in Docker)
- The server and dashboard run as native Node.js processes
- tmux enables instant command delivery from browser to Claude Code

## Step 0: Check Prerequisites

Run these checks:

```bash
node -v        # Must be 18+
tmux -V        # Must be installed
```

If tmux is not installed, install it:
- macOS: `brew install tmux`
- Ubuntu/Debian: `sudo apt install tmux`
- Fedora: `sudo dnf install tmux`
- Arch: `sudo pacman -S tmux`

**Do not proceed until both Node.js 18+ and tmux are available.**

## Step 1: Install Dependencies

```bash
cd <PROJECT_ROOT>/server && npm install
cd <PROJECT_ROOT>/dashboard && npm install
```

Replace `<PROJECT_ROOT>` with the absolute path to this claude-monitor directory.

## Step 2: Create Data Directory

```bash
mkdir -p ~/.claude-monitor
chmod 700 ~/.claude-monitor
```

## Step 3: Configure Claude Code Hooks

**First, back up the existing config:**
```bash
cp ~/.claude/settings.json ~/.claude/settings.json.backup 2>/dev/null || true
```

Read the user's current `~/.claude/settings.json`. If it exists, **merge** the hooks below into the existing config. Do NOT overwrite other settings or existing hooks. If it doesn't exist, create it.

Get the **absolute path** to this project directory. Use that path in the hook commands below.

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

Replace `<ABSOLUTE_PATH>` with the actual absolute path to this project directory.

**Rules:**
- If `~/.claude/settings.json` already has hooks for these events, **append** to the existing arrays (don't replace)
- If hooks with the same script path already exist, skip them (don't add duplicates)
- Preserve all other settings in the file

## Step 4: Make Scripts Executable

```bash
chmod +x <ABSOLUTE_PATH>/hooks/*.sh <ABSOLUTE_PATH>/collector/*.sh <ABSOLUTE_PATH>/start-with-tmux.sh <ABSOLUTE_PATH>/start-with-tmux-yolo.sh
```

## Step 5: Build Dashboard

```bash
cd <PROJECT_ROOT>/dashboard && npm run build
```

## Step 6: Start Services with tmux

Create a tmux session with 3 windows:

```bash
# Create tmux session
tmux new-session -d -s claude-monitor -n server

# Window 1: Server
tmux send-keys -t claude-monitor:server "cd <PROJECT_ROOT>/server && TMUX_SESSION=claude node src/index.js" Enter

# Window 2: Dashboard
tmux new-window -t claude-monitor -n dashboard
tmux send-keys -t claude-monitor:dashboard "cd <PROJECT_ROOT>/dashboard && npm start" Enter

# Window 3: Claude Code (for the user to use later)
tmux new-window -t claude-monitor -n claude
```

**Important:** Set `TMUX_SESSION=claude` when starting the server so it knows which tmux session to send commands to.

## Step 7: Verify

1. Wait 5 seconds for services to start
2. Health check: `curl -s http://localhost:3847/health` — should return `{"status":"ok",...}`
3. Dashboard: tell the user to open `http://localhost:3848` in a browser

## Step 8: Tell the User

After setup is complete, inform the user:

- **Dashboard**: http://localhost:3848
- **Server**: http://localhost:3847
- **tmux session**: `claude-monitor` (3 windows: server, dashboard, claude)
- To start Claude Code in the tmux session: `tmux send-keys -t claude-monitor:claude "claude" Enter`
- To attach to the tmux session: `tmux attach -t claude-monitor`
- To use Claude Code with instant browser commands, run Claude inside the `claude-monitor:claude` tmux window
- The user's existing Claude Code hooks have been preserved

## Step 9: GitHub Star (Optional)

If the setup completed successfully, ask the user if they'd like to star the repository on GitHub to support the project.

**Ask the user:** "Setup complete! If claude-monitor is useful, would you like to star the GitHub repo to support the project?"

If the user agrees:

1. Check if `gh` CLI is installed and authenticated:
```bash
gh auth status
```

2. If authenticated, star the repo:
```bash
gh repo star OrOlEl/claude-monitor
```

3. If `gh` is not installed or not authenticated, provide the link instead:
   - https://github.com/OrOlEl/claude-monitor

**Rules:**
- Always ask the user for permission before starring
- Never star automatically without explicit consent
- If `gh auth status` fails, just show the GitHub URL and move on

## Troubleshooting

- **Port 3847/3848 already in use**: Kill existing processes with `lsof -ti:3847 | xargs kill` and `lsof -ti:3848 | xargs kill`
- **tmux session already exists**: Kill it with `tmux kill-session -t claude-monitor`
- **Events not appearing**: Check that hook scripts are executable (`ls -la hooks/*.sh collector/*.sh`)
- **macOS file watching issues**: Set `CHOKIDAR_USEPOLLING=1` environment variable for the server
