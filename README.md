# Orc (Orchestrator)

A self-hosted, LLM-agnostic Personal Knowledge Assistant. Orc aggregates your email, calendar, contacts, documents, finances, and projects into a single interface powered by an AI coding tool running in an integrated terminal.

Built on [ClawQuirk Canvas](https://github.com/ClawQuirk/clawquirk-canvas).

## Features

**Google Suite Integration** -- Gmail, Calendar, Contacts, Docs, Sheets, Slides (27 MCP tools)

**Financial Services** -- Stripe, PayPal, Coinbase, Robinhood, Plaid with cross-service spending aggregation (22 MCP tools)

**Project Management** -- Epic/Task hierarchy with auto-generated markdown context for LLM consumption

**Journal** -- FTS5 full-text search with tiered context (index, summaries, full content) to manage LLM context windows

**Brainstorm** -- ReactFlow infinite canvas for visual concept mapping with tabbed boards, rich-text nodes, color coding, resize, copy/paste, and 12 MCP tools for LLM-driven brainstorming

**Shopping** -- Cross-merchant price comparison across Sprouts, Costco, Target, Amazon, and Newegg with purchase learning (9 MCP tools)

**Dashboard** -- Pinnable widget grid with Gmail, Calendar, and Contacts widgets

**Security** -- AES-256-GCM encrypted credential vault, 127.0.0.1-only binding, CORS/Origin validation, vault brute-force protection

**MCP Proxy** -- Stdio-based MCP server that proxies tool calls through the backend. The vault key never touches disk.

## Architecture

Two services run concurrently:

- **Vite frontend (React + Vue)** -- React main panel with sidebar navigation and 11 orchestration pages. Vue terminal panel runs your AI tool of choice (Claude, Aider, Ollama, etc.)
- **Node.js backend** -- PTY manager, SQLite database (WAL mode), encrypted vault, plugin system, MCP server, and API routes

The terminal _is_ the chat interface -- there is no separate chat panel. It persists across browser refreshes and server restarts.

## Getting Started

### Prerequisites

- Node.js 18+
- Native compilation tools for `node-pty` (VS Build Tools on Windows, Xcode CLI on macOS)
- Chromium (auto-installed via `npx playwright install chromium` for shopping automation)

### Install and Run

```bash
# Check prerequisites and install dependencies
npm run setup

# Start both frontend and backend
npm run dev
```

On first run, you'll be prompted to create a master password for the credential vault.

### Custom Ports

Create a `.env` file in the project root:

```
PORT=5180
BACKEND_PORT=3002
```

Or pass inline:

```bash
PORT=8080 BACKEND_PORT=4001 npm run dev
```

### Windows Quick Start

Double-click `start-orc.bat` to launch both services in the background and open the browser. Use `stop-orc.bat` to shut down.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend + backend concurrently |
| `npm run dev:frontend` | Vite dev server only |
| `npm run dev:backend` | Backend server only |
| `npm run dev:backend:watch` | Backend with auto-restart on file changes |
| `npm run mcp` | Start MCP server (stdio transport) |

## Plugin System

Plugins live in `server/plugins/` and expose tools via MCP. Each plugin declares a manifest with a tool prefix and connection grouping.

| Connection | Plugins | Tools |
|------------|---------|-------|
| Google | Gmail, Calendar, Contacts, Docs, Sheets, Slides | 27 |
| Stripe | Stripe | 4 |
| PayPal | PayPal | 3 |
| Coinbase | Coinbase | 4 |
| Robinhood | Robinhood | 3 |
| Plaid | Plaid | 4 |
| Sprouts, Costco, Target, Amazon, Newegg | Shopping merchants | 5 |
| Local | Financial Overview, Projects, Journal, Shopping Aggregate, Shopping Learning, Brainstorm | 32 |

## Security

- Server binds to `127.0.0.1` only -- not accessible from LAN
- Credentials encrypted at rest with AES-256-GCM (scrypt key derivation)
- Master password is never stored on disk
- CORS and Origin validation on all state-changing requests
- Vault brute-force protection with rate limiting and exponential backoff
- Financial data stored as integer cents; account numbers masked to last 4 digits

## License

[MIT](LICENSE)
