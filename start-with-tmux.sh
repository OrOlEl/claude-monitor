#!/bin/bash
# Start Claude Code in a tmux session for browser command injection
# Usage: ./start-with-tmux.sh [session-name]

set -e

SESSION="${1:-${TMUX_SESSION:-claude}}"

# Check dependencies
if ! command -v tmux >/dev/null 2>&1; then
  echo "Error: tmux is not installed."
  echo ""
  echo "Install tmux:"
  echo "  macOS:        brew install tmux"
  echo "  Ubuntu/Debian: sudo apt install tmux"
  echo "  Fedora/RHEL:  sudo dnf install tmux"
  echo "  Arch:         sudo pacman -S tmux"
  echo "  Windows:      Install inside WSL (sudo apt install tmux)"
  exit 1
fi

# Kill existing session if exists
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create tmux session with Claude Code
tmux new-session -d -s "$SESSION" -n claude
tmux send-keys -t "$SESSION:claude" "claude" Enter
echo "Started Claude Code in tmux session: $SESSION"

# Attach
tmux attach-session -t "$SESSION"
