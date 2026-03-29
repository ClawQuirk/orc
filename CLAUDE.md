# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This

Orc (Orchestrator) is a self-hosted, LLM-agnostic Personal Knowledge Assistant. The React main panel provides a left sidebar for navigation and Orchestration pages (Dashboard, Projects, Planning, Actions, People, Docs, Memory, Knowledge, Agents, System). The Vue-powered terminal side panel runs an AI coding tool (Claude, Aider, Ollama, etc.) that serves as the LLM "brain" connected via MCP. The terminal IS the chat interface — there is no separate chat panel. The terminal persists across browser refreshes and server restarts.

## Commands

```bash
npm run dev              # Start both frontend + backend (concurrently)
npm run dev:frontend     # Vite dev server only (port 5173)
npm run dev:backend      # Backend terminal server only (port 3001)
npm run dev:backend:watch  # Backend with auto-restart on file changes
npm run mcp              # Start MCP server (stdio transport, for LLM tool use)
```

No test or lint scripts exist yet.

## Architecture

Two services run simultaneously:

1. **Vite frontend (port 5173)** — serves a single page with two framework mount points:
   - `#react-root` — React 19 main panel (`src/App.tsx`) with sidebar navigation
   - `#vue-terminal` — Vue 3 terminal panel (`src/components/TerminalPanel.vue`)
   - Vite loads both `@vitejs/plugin-react` and `@vitejs/plugin-vue`; file extension determines which plugin handles a file (`.tsx` = React, `.vue` = Vue)

2. **Terminal backend (port 3001)** — Node.js server (`server/index.ts`) bound to `127.0.0.1`, managing a persistent PTY, database, vault, plugins, and API routes:
   - **Router** (`server/router.ts`) — Lightweight request router with path params, JSON body parsing, CORS headers, and Origin validation on state-changing requests
   - **PTY** (`server/pty-manager.ts`) — Spawns user's shell, streams I/O over WebSocket, saves scrollback
   - **Database** (`server/db/`) — SQLite via better-sqlite3, WAL mode, versioned migrations (001-initial, 002-projects, 003-journal). Stores at `data/orc.db`
   - **Vault** (`server/vault/`) — AES-256-GCM encrypted credential storage at `data/vault.enc`. Master password required on startup
   - **Plugins** (`server/plugins/`) — Plugin loader with manifest, tools, and lifecycle management. Plugins: google-gmail, google-calendar, google-contacts, projects, journal
   - **MCP Server** (`server/mcp/index.ts`) — Stdio-based MCP server that **proxies** tool calls through the backend's HTTP API (`/api/mcp/tools`, `/api/mcp/execute`). Does NOT access the vault directly — the vault key never touches disk.
   - **Routes** (`server/routes/`) — Modular route files: `projects.ts` (CRUD for projects/epics/tasks/meetings/recommendations), `journal.ts` (CRUD + FTS5 search for journal entries)

3. **Shared types** (`shared/plugin-types.ts`) — TypeScript interfaces shared between server and client (PluginManifest with `toolPrefix` and `connection` fields, ToolDefinition, etc.)

Vite proxies `/ws` and `/api` to the backend.

## UI Layout

The main panel uses a horizontal flex layout:
- **Left sidebar** (`src/components/Sidebar.tsx`, 140px) — Connections section (Google with status dot), Orchestration section (10 navigable pages), and bottom actions (Project folder, Theme, Settings, Lock vault)
- **Main content area** — Renders the active page based on sidebar selection
- **Terminal panel** — Vue-managed, docks left or right, resizable

Page components in `src/components/`:
- `Dashboard.tsx` — Pinnable widget grid
- `ProjectsPage.tsx` + `ProjectDetail.tsx` — Project list and detail with Epic/Task hierarchy, Google Drive links, recommendations
- `PlanningPage.tsx` — Calendar events with contact context linking (birthday → contact card with soft-delete)
- `ActionsPage.tsx` — Quick search for emails and contacts
- `MemoryPage.tsx` — Journal with 25/75 split panel (date-grouped sidebar, markdown content viewer/editor)
- `PeoplePage.tsx`, `DocsPage.tsx`, `KnowledgePage.tsx`, `AgentsPage.tsx`, `SystemPage.tsx` — Placeholder pages

Settings panel opens as a fixed-position popover anchored to the sidebar's settings button via `DOMRect`.

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

## Database

SQLite database at `data/orc.db` with WAL mode for concurrent access.

**Migration 001 (initial):**
- `messages` — Chat history
- `contacts` — Cached contacts from plugins
- `emails` — Cached emails
- `calendar_events` — Cached calendar events
- `documents` — Document index
- `embeddings` — Embedding metadata (Phase 5)
- `sync_state` — Per-plugin sync tracking
- `widget_config` — Dashboard widget layout/settings

**Migration 002 (projects):**
- `projects` — Project metadata, status, google_links (JSON), effort_estimate
- `epics` — Epic cards within projects (title, status, sort_order, effort_estimate)
- `tasks` — Tasks within epics (title, status, sort_order, effort_estimate)
- `project_meetings` — Links projects to calendar events
- `project_recommendations` — AI recommendations (pending/accepted/declined)

**Migration 003 (journal):**
- `journal_entries` — Journal entries with date, title, summary (Tier 2), content (Tier 3), tags (JSON), source (manual/auto/mcp), mood
- `journal_fts` — FTS5 virtual table over title, summary, content, tags with INSERT/UPDATE/DELETE sync triggers

**Migration 004 (financial):**
- `financial_accounts` — Linked accounts across all financial services (mask last 4 only, balance as integer cents)
- `financial_transactions` — Normalized transactions (amount_cents INTEGER, category, merchant, transaction_type). UNIQUE(plugin_id, source_transaction_id)
- `financial_sync_state` — Incremental polling cursors per plugin/account

Migrations in `server/db/migrations/`. Run automatically on server start.

## Credential Vault

AES-256-GCM encrypted file at `data/vault.enc`. On first run, user creates a master password. On subsequent runs, must unlock with the password. Vault stores OAuth tokens, API keys, and secrets per plugin. **The vault key is NEVER stored on disk** — not in `.env`, not in config files.

API: `GET /api/vault/status`, `POST /api/vault/create`, `POST /api/vault/unlock` (rate-limited: 5 attempts/minute), `POST /api/vault/lock`

## Security

- **Server binds to `127.0.0.1`** — not accessible from LAN (prevents the default `0.0.0.0` binding)
- **CORS headers** — `Access-Control-Allow-Origin` restricted to the frontend's localhost port
- **Origin validation** — POST/PUT/DELETE requests with an Origin header not matching the frontend are rejected with 403. Requests with no Origin (same-origin browser requests, Node.js `fetch` from MCP server) are allowed.
- **Vault brute-force protection** — Rate limiting on `/api/vault/unlock` (5 attempts per minute, then exponential backoff)
- **TLS not needed for localhost** — Traffic never leaves the kernel loopback. Real threats are CSRF and DNS rebinding, addressed by CORS/Origin validation.

## Plugin System

Plugins live in `server/plugins/<name>/` and implement the `ServerPlugin` interface from `server/plugins/base-plugin.ts`. Each plugin declares a manifest (with `toolPrefix` and `connection` fields for grouping), optional OAuth config, and MCP tool definitions.

**Registered plugins:**
- `google-gmail` (toolPrefix: `gmail`, connection: `google`) — 5 tools: search, read, send, draft, labels
- `google-calendar` (toolPrefix: `calendar`, connection: `google`) — 4 tools: upcoming, search, create, update
- `google-contacts` (toolPrefix: `contacts`, connection: `google`) — 4 tools: search, get, create, soft_delete
- `google-docs` (toolPrefix: `docs`, connection: `google`) — 5 tools: search, read, create, append, replace
- `google-sheets` (toolPrefix: `sheets`, connection: `google`) — 6 tools: search, info, read, write, append, create
- `google-slides` (toolPrefix: `slides`, connection: `google`) — 3 tools: search, read, info (read-only)
- `stripe` (toolPrefix: `stripe`, connection: `stripe`) — 4 tools: balance, charges, invoices, payouts
- `paypal` (toolPrefix: `paypal`, connection: `paypal`) — 3 tools: balance, transactions, transaction_detail
- `coinbase` (toolPrefix: `coinbase`, connection: `coinbase`) — 4 tools: accounts, portfolio, transactions, prices
- `robinhood` (toolPrefix: `robinhood`, connection: `robinhood`) — 3 tools: crypto_holdings, crypto_prices, crypto_history
- `plaid` (toolPrefix: `plaid`, connection: `plaid`) — 4 tools: accounts, transactions, balances, sync
- `financial-overview` (toolPrefix: `financial`, connection: `local`) — 4 tools: spending, merchants, net_worth, recent
- `orc-projects` (toolPrefix: `projects`, connection: `local`) — 7 tools: list, get, create, add_epic, add_task, update_status, recommend
- `orc-journal` (toolPrefix: `journal`, connection: `local`) — 6 tools: index, recent, read, search, add, summarize_day

## MCP Server

`server/mcp/index.ts` runs as a separate process (stdio transport) that **proxies all tool calls through the running backend** at `http://127.0.0.1:{BACKEND_PORT}`. It does NOT access the vault, database, or plugins directly.

- `GET /api/mcp/tools` — Discovers available tools from the backend
- `POST /api/mcp/execute` — Executes a tool by name with args

Uses the low-level `Server` class from `@modelcontextprotocol/sdk` (not `McpServer`) because raw JSON schemas from the API aren't Zod objects.

Configured in `.mcp.json` (project root):
```json
{ "mcpServers": { "orc": { "command": "node_modules/.bin/tsx.cmd", "args": ["server/mcp/index.ts"] } } }
```

**Note:** On Windows, use `tsx.cmd` (not `npx` — stdin piping breaks through `cmd /c`).

## Auto-Approve System

MCP tool permissions are managed via `.claude/settings.local.json`. The backend reads/writes this file through `GET/POST /api/settings/auto-approve`.

- Per-plugin toggles in the Google Auth panel (Gmail, Calendar, Contacts)
- Connection-level master toggle that flips all child plugins
- When all plugins enabled: collapses to blanket `mcp__orc__*` wildcard
- When individual plugins toggled off: expands to per-prefix rules (`mcp__orc__gmail_*`, etc.)

## Google Services

Google OAuth managed by `server/plugins/google/google-auth.ts`. Scopes: gmail.modify, gmail.send, calendar, contacts, contacts.readonly, drive.readonly.

**Endpoints:**
- `GET /api/auth/google/status` — Client configured? Authorized? Scopes?
- `POST /api/auth/google/client` — Save client ID + secret
- `POST /api/auth/google/init` — Start OAuth flow
- `GET /api/auth/google/callback` — OAuth redirect handler
- `POST /api/auth/google/revoke` — Disconnect

**Google Drive API:**
- `GET /api/drive/search?q=...` — Server-side Drive file search (Docs, Sheets, Slides). OAuth token stays on backend. Used by the project links "Browse Drive" picker.

**Contacts soft-delete:** `contacts_soft_delete` tool moves contacts to an "Orc Deletion" contact group (created on first use) instead of permanently deleting. The group is cached after first lookup.

## Financial Services

Five financial service integrations with security-first design. All credentials in the encrypted vault. Monetary amounts stored as integers in smallest currency unit (cents/satoshis) — never floating point. Account numbers masked to last 4 digits. Log sanitization via `sanitizeForLog()` strips 16+ sensitive key patterns.

**Database** (migration 004): `financial_accounts`, `financial_transactions` (normalized), `financial_sync_state` (incremental polling cursors).

**Services:**
- **Stripe** — Restricted API key auth. Read-only charges, invoices, payouts, balance.
- **PayPal** — OAuth 2.0 client credentials. Access token in memory only (never persisted). 31-day range auto-chunking.
- **Coinbase** — CDP API key with ES256 JWT signing. View-only crypto portfolio, accounts, prices, transactions.
- **Robinhood** — ED25519 key pair request signing. Crypto-only (no stocks). Official API.
- **Plaid** — Proprietary Link Token flow. User NEVER enters bank creds in Orc (Plaid Link handles bank login). `/transactions/sync` for incremental polling. Access tokens per-item in vault.

**Aggregation plugin** (`financial-overview`): Cross-service spending by category, top merchants, net worth, recent transactions.

**Routes** in `server/routes/financial.ts`: `GET /api/financial/status`, per-service connect/disconnect, Plaid-specific link-token/exchange/items endpoints.

**Frontend** `FinancialSetup.tsx`: Tabbed modal for all 5 services with setup instructions. Plaid tab uses `react-plaid-link` component.

**Normalization** in `server/plugins/financial/normalize.ts`: `toCents()`, `fromCents()`, `normalizeCategory()`, `normalizeMerchant()`, `maskAccountNumber()`, `sanitizeForLog()`.

## Projects

Full project management with Epic/Task hierarchy. Data stored in SQLite (structured queries) + auto-generated markdown at `data/projects/{id}.md` (for LLM context).

**API routes** in `server/routes/projects.ts` — CRUD for projects, epics, tasks, meetings, recommendations (16 endpoints). Every mutation regenerates the markdown file via `server/projects/markdown-gen.ts`.

**Frontend:** `ProjectsPage.tsx` (list + create) → `ProjectDetail.tsx` (header, summary, links with Drive picker, recommendations, expandable epics with nested tasks).

## Journal

FTS5-indexed journal entries with tiered context to avoid context window flooding:
- **Tier 1 (Index):** dates + titles + tags — `journal_index` tool, very cheap
- **Tier 2 (Summaries):** 1-2 sentence auto-generated summaries — `journal_recent`, `journal_search` tools
- **Tier 3 (Full content):** complete markdown — `journal_read` tool, only for specific entries

**API routes** in `server/routes/journal.ts` — dates, list, summaries, get, create, update, delete, FTS5 search.

**Frontend:** `MemoryPage.tsx` with 25/75 split panel — left sidebar (date-grouped entry listing with search) and right content (markdown viewer/editor). Both scroll independently.

**Auto-journal skill** at `~/.claude/skills/auto-journal/skill.md` teaches the LLM when to journal: significant decisions, bug fixes, new patterns, user preferences, milestones, learnings.

## Key Constraints

- Terminal panel default width is 480px (user-resizable, min 300px, max 80% of viewport)
- Ports configured in `.env` file (`PORT` for frontend, `BACKEND_PORT` for backend). Defaults: 5173/3001. Vite uses `strictPort: true` — it will error instead of auto-incrementing if the port is taken. Backend loads `.env` via `dotenv/config`. All port references (proxy targets, OAuth redirect URIs) read from these env vars.
- Scrollback max is 100K chars in `server/pty-manager.ts` (`MAX_SCROLLBACK`)
- Auto-launch command delay is 2s in `server/pty-manager.ts` (`AUTO_LAUNCH_DELAY_MS`)
- xterm.js is lazily initialized on first panel open (not on page load)
- Keyboard shortcut: `Ctrl + `` toggles the terminal panel
- Vault unlock screen centers in main panel (inline style override for flex centering since main-panel is `flex-direction: row` for sidebar layout)
- On Windows, killing background server processes requires `taskkill //F //PID` — the bash `kill` command may not work with Windows PIDs from `netstat`
