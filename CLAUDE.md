# Claude Monitor - AI Assistant Guide

## Setup

If the user asks to set up, install, or configure this project:
1. Read `README.md` — the "LLM Setup Instructions" section inside the `<details>` block
2. Follow all 6 steps exactly as described
3. The setup creates Docker containers for server + dashboard, and configures Claude Code hooks on the host

## Project Overview

This is a real-time monitoring dashboard for Claude Code. It consists of:
- **server/** — Node.js event relay (Express + Socket.IO, port 3847)
- **dashboard/** — Next.js monitoring UI (port 3848)
- **hooks/** — Claude Code hook scripts (bash, run on host)
- **collector/** — Event collector scripts (bash, run on host)

## Key Architecture Rules

- Hook scripts MUST run on the host (not in Docker) — Claude Code invokes them directly
- Server and dashboard run in Docker containers with volume mounts to host directories
- Server binds to `127.0.0.1` by default (use `HOST=0.0.0.0` inside Docker)
- CORS is restricted to `http://localhost:3848` by default (configurable via `ALLOWED_ORIGINS`)

## When Modifying Code

- Server code: `server/src/index.js`
- Dashboard components: `dashboard/components/`
- State management: `dashboard/stores/`
- Hook scripts: `hooks/`, `collector/`
- All hooks must use the safety wrapper pattern (see README "Hook Safety" section)
