# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This

Orc is a self-hosted, LLM-agnostic web app that combines a React main panel with a Vue-powered terminal side panel. The terminal can auto-launch any AI coding tool (or none) and persists across browser refreshes and server restarts.

## Commands

```bash
npm run dev              # Start both frontend + backend (concurrently)
npm run dev:frontend     # Vite dev server only (port 5173)
npm run dev:backend      # Backend terminal server only (port 3001)
npm run dev:backend:watch  # Backend with auto-restart on file changes
```

No test or lint scripts exist yet.

## Architecture

Two services run simultaneously:

1. **Vite frontend (port 5173)** — serves a single page with two framework mount points:
   - `#react-root` — React 19 main panel (`src/App.tsx`)
   - `#vue-terminal` — Vue 3 terminal panel (`src/components/TerminalPanel.vue`)
   - Vite loads both `@vitejs/plugin-react` and `@vitejs/plugin-vue`; file extension determines which plugin handles a file (`.tsx` = React, `.vue` = Vue)

2. **Terminal backend (port 3001)** — Node.js server (`server/index.ts`) managing a single persistent PTY via `node-pty`:
   - Spawns user's chosen shell (auto-detected per OS), conditionally auto-runs a configurable command
   - Streams I/O over WebSocket (JSON protocol, not binary)
   - Saves scrollback to `.terminal-session.json` every 5s (atomic write via temp file + rename)
   - Exposes `GET /api/shells` to list detected available shells
   - Exposes `POST /api/open-folder` to open the project root in the OS file manager

Vite proxies `/ws` and `/api` to the backend.

## Cross-Framework Communication

React and Vue are completely independent DOM trees. They communicate exclusively through `src/lib/event-bus.ts` — a simple pub/sub Map. Events:
- `terminal:toggle` — React button fires, Vue panel listens
- `terminal:visible` — Vue panel fires, React button listens (for label sync)
- `terminal:theme-changed` — React settings fires, Vue terminal listens (live theme update)
- `terminal:font-size-changed` — React settings fires, Vue terminal listens (live font resize)
- `terminal:position-changed` — React settings fires, Vue terminal listens (swap panel side)

## WebSocket Protocol

All messages are JSON strings (no binary frames):

| Direction | Type | Payload | Purpose |
|-----------|------|---------|---------|
| Client→Server | `attach` | `sessionId, cols, rows, autoLaunchCommand?, shell?` | Initial handshake |
| Client→Server | `input` | `data` | User keystrokes |
| Client→Server | `resize` | `cols, rows` | Terminal resized |
| Client→Server | `switch-shell` | `shell` | Request shell change |
| Server→Client | `session` | `sessionId` | Assigns session ID |
| Server→Client | `scrollback` | `data` | Replays saved output |
| Server→Client | `output` | `data` | Live PTY output |
| Server→Client | `shell-switched` | `sessionId` | Shell was changed, terminal cleared |

## Session Persistence

- Session ID stored in browser `localStorage` (key: `clawquirk-session`)
- Server saves scrollback + dimensions to `.terminal-session.json` (capped at 100K chars)
- On server restart: old scrollback is loaded from disk and replayed to reconnecting clients; a new PTY is spawned and the auto-launch command is re-run (if configured)
- The `.terminal-session.json` file is gitignored

## Settings System

User preferences are stored in `localStorage` under a single key `clawquirk-settings` and managed by `src/lib/settings.ts`:
- `theme` — `'dark'` | `'light'` (CSS variable-based, affects both UI and xterm.js)
- `terminalFontSize` — 10-20px (default 14)
- `autoLaunchCommand` — string (default `'claude'`, command to auto-run on PTY spawn; empty = none). Presets in `LAUNCH_PRESETS` (settings.ts) plus a custom free-text option. Changing this restarts the terminal session immediately.
- `terminalPosition` — `'right'` | `'left'` (which side the terminal panel docks to)
- `shell` — shell command string (default `''` = OS default, auto-detected)

Settings are applied via `data-theme` and `data-terminal-position` attributes on `<html>`. Theme is initialized before React renders to prevent flash.

## Shell Detection

`server/shell-detect.ts` auto-detects available shells at startup based on `process.platform`:
- **Windows**: PowerShell 7, Windows PowerShell, CMD, Git Bash
- **macOS**: Zsh, Bash, Fish, PowerShell
- **Linux**: Bash, Zsh, Fish, sh, PowerShell

Users select their preferred shell from the settings panel. Changing shell kills the current PTY and spawns a new one. Shell requests are validated against the detected list to prevent arbitrary command execution.

## Environment

- **Cross-platform** — supports Windows, macOS, and Linux
- `node-pty` requires native compilation (needs VS Build Tools or `windows-build-tools`)
- Backend runs via `tsx` (use `dev:backend:watch` for auto-restart during server development)

## Key Constraints

- Terminal panel default width is 480px (user-resizable, min 300px, max 80% of viewport)
- Ports default to 5173 (frontend) and 3001 (backend), configurable via `PORT` and `BACKEND_PORT` env vars
- Scrollback max is 100K chars in `server/pty-manager.ts` (`MAX_SCROLLBACK`)
- Auto-launch command delay is 2s in `server/pty-manager.ts` (`AUTO_LAUNCH_DELAY_MS`)
- xterm.js is lazily initialized on first panel open (not on page load)
- Keyboard shortcut: `Ctrl + `` toggles the terminal panel
