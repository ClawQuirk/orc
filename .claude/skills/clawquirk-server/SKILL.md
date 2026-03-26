---
name: clawquirk-server
description: ClawQuirk backend development guide covering the HTTP/WebSocket server, PTY lifecycle management, session persistence, shell detection, and API endpoints. Use this skill when modifying server code, adding new API endpoints or WebSocket message types, working with the PTY process, changing session persistence, or debugging backend issues. Especially important when the change involves the WebSocket protocol or PTY lifecycle.
user-invocable: false
paths: "server/**"
---

# ClawQuirk Backend Guide

## Server Files

| File | Purpose |
|------|---------|
| `server/index.ts` | HTTP server + WebSocket setup on port 3001 |
| `server/pty-manager.ts` | PTY lifecycle, scrollback buffer, auto-launch logic |
| `server/session-store.ts` | Atomic write of session data to `.terminal-session.json` |
| `server/shell-detect.ts` | Platform-specific shell detection and validation |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check, returns `{ status: 'ok' }` |
| `GET` | `/api/shells` | List detected available shells |
| `POST` | `/api/open-folder` | Open project root (`process.cwd()`) in OS file manager |

### Adding a new endpoint

Add a new `else if` branch in the HTTP request handler in `server/index.ts`. Follow the existing pattern:
```typescript
} else if (req.url === '/api/your-endpoint' && req.method === 'GET') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ /* response */ }));
}
```

Vite proxies `/api/*` to port 3001 automatically (configured in `vite.config.ts`).

## WebSocket Protocol

All messages are JSON strings (no binary frames). Connection path: `/ws`

| Direction | Type | Payload | Purpose |
|-----------|------|---------|---------|
| Client -> Server | `attach` | `sessionId, cols, rows, autoLaunchCommand?, shell?` | Initial handshake |
| Client -> Server | `input` | `data` | User keystrokes |
| Client -> Server | `resize` | `cols, rows` | Terminal resized |
| Client -> Server | `restart-session` | `autoLaunchCommand?` | Kill PTY and start fresh |
| Client -> Server | `switch-shell` | `shell` | Request shell change |
| Server -> Client | `session` | `sessionId` | Assigns session ID |
| Server -> Client | `scrollback` | `data` | Replays saved output on reconnect |
| Server -> Client | `output` | `data` | Live PTY output |
| Server -> Client | `shell-switched` | `sessionId` | Shell was changed, terminal cleared |

### Adding a new message type

1. Add the handler case in `PtyManager.handleClientConnect()` (`server/pty-manager.ts`)
2. Add the sender in `TerminalPanel.vue` (`ws.send(JSON.stringify({ type: '...', ... }))`)
3. If server->client: add the handler in `ws.onmessage` switch in `TerminalPanel.vue`
4. Update this protocol table

## PTY Management (`server/pty-manager.ts`)

### Lifecycle

- **Spawn**: `pty.spawn(shell, [], { cwd: process.cwd(), env: process.env })` with `xterm-256color` term type
- **Auto-launch**: If `autoLaunchCommand` is set, writes it to PTY after a 2s delay (`AUTO_LAUNCH_DELAY_MS`). The `commandLaunched` flag ensures it only runs once per session.
- **Shell switch**: Kill current PTY, reset scrollback, generate new session ID, spawn new PTY, notify all clients
- **Restart**: Same as switch but re-runs the auto-launch command
- **Shutdown**: Save session, kill PTY, clear intervals

### Key constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_SCROLLBACK` | 100,000 chars | Scrollback buffer cap |
| `SAVE_INTERVAL_MS` | 5,000 ms | Session save frequency |
| `AUTO_LAUNCH_DELAY_MS` | 2,000 ms | Delay before auto-launching command |

### Scrollback buffer

- All PTY output is appended to `this.scrollback`
- Trimmed to `MAX_SCROLLBACK` from the end when it exceeds the limit
- Replayed to newly connecting clients via `scrollback` message
- Saved to disk every 5s

## Session Persistence (`server/session-store.ts`)

- File: `.terminal-session.json` in project root (gitignored)
- Written atomically: write to temp file, then rename
- Contains: `sessionId`, `scrollback`, `cols`, `rows`, `createdAt`, `lastActive`
- Client stores session ID in `localStorage` key `clawquirk-session`
- On server restart: scrollback loaded from disk and replayed; new PTY spawned

## Shell Detection (`server/shell-detect.ts`)

| Platform | Shells detected |
|----------|----------------|
| Windows | PowerShell 7, Windows PowerShell, CMD, Git Bash |
| macOS | Zsh, Bash, Fish, PowerShell |
| Linux | Bash, Zsh, Fish, sh, PowerShell |

- `detectAvailableShells()` runs at server startup
- `isValidShell(shell)` validates against the detected list before spawning (security: prevents arbitrary command execution)
- `getDefaultShell()` returns the first detected shell

## Development Notes

- Use `npm run dev:backend` (stable mode) — `dev:backend:watch` uses tsx watch which kills the terminal session on restart
- Backend port 3001 is hardcoded in both `server/index.ts` and `vite.config.ts`
- The server uses raw `node:http` (not Express) for minimal overhead
