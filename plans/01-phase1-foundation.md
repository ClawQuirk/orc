# Phase 1: Foundation + Google Suite

## Status: COMPLETE

## Build Order (dependencies flow downward)

```
1A.1 Router ──────────────────────────────> all API endpoints
  │
1A.2 SQLite ──────────────────────────────> all data storage
  │
1A.3 Credential Vault ───────────────────> all OAuth flows
  │
1A.4 Plugin System ──────────────────────> all plugins
  │
  ├── 1A.5 MCP Server ──┐
  ├── 1A.6 Chat UI ──────┤ (parallel)
  └── 1A.7 Widget System ┘
         │
1B Google OAuth ─────────────────────────> all Google plugins
  │
  ├── 1C.1 Gmail ────┐
  ├── 1C.2 Calendar ──┤ (parallel)
  └── 1C.3 Contacts ──┘
```

---

## 1A.1 - Server Router Refactor

**Problem**: Current `server/index.ts` uses a flat if/else chain for 3 routes. Cannot scale to 50+ endpoints.

**Solution**: Lightweight router class (~150 lines, no Express).

**Files**:
- `server/router.ts` (NEW) - Router class with method+path matching, path params, middleware
- `server/middleware/json-body.ts` (NEW) - Request body parser
- `server/index.ts` (MODIFY) - Use router, move existing handlers

**Interface**:
```typescript
class Router {
  get(path: string, handler: RouteHandler): void;
  post(path: string, handler: RouteHandler): void;
  put(path: string, handler: RouteHandler): void;
  delete(path: string, handler: RouteHandler): void;
  handle(req: IncomingMessage, res: ServerResponse): boolean;
}
type RouteHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => void | Promise<void>;
```

---

## 1A.2 - SQLite Database

**Files**:
- `server/db/index.ts` (NEW) - Database singleton, WAL mode, foreign keys
- `server/db/migrate.ts` (NEW) - Migration runner with version tracking
- `server/db/migrations/001-initial-schema.ts` (NEW) - Initial tables

**Tables**:
- `messages` - Chat history (id, role, content, timestamp, metadata, conversation_id)
- `contacts` - Cached contacts (plugin_id, source_id, name, email, phone, org)
- `emails` - Cached emails (plugin_id, source_id, thread_id, subject, sender, body, labels)
- `calendar_events` - Cached events (plugin_id, source_id, title, start/end, attendees)
- `documents` - Document index (plugin_id, source_id, title, mime_type, content_text)
- `embeddings` - Embedding metadata (source_table, source_id, text_content)
- `sync_state` - Per-plugin sync tokens and timestamps
- `widget_config` - Widget positions, sizes, settings
- `_migrations` - Migration tracking

**Packages**: `better-sqlite3`, `@types/better-sqlite3`

---

## 1A.3 - Credential Vault

**Design**: AES-256-GCM encryption with scrypt key derivation. Encrypted JSON file at `data/vault.enc`.

**Files**:
- `server/vault/crypto.ts` (NEW) - encrypt/decrypt functions, scrypt params
- `server/vault/credential-vault.ts` (NEW) - Vault class (create, unlock, lock, get/set credentials)
- `server/vault/oauth-refresh.ts` (NEW) - Token refresh logic with 5-min buffer
- `server/vault/types.ts` (NEW) - VaultContents, ServiceCredentials interfaces

**API Endpoints**:
- `GET /api/vault/status` -> `{ exists: boolean, unlocked: boolean }`
- `POST /api/vault/create` -> Create with master password
- `POST /api/vault/unlock` -> Unlock for session
- `POST /api/vault/lock` -> Lock (clear from memory)

**Flow**:
1. Server starts -> vault is locked
2. Frontend checks `/api/vault/status`
3. If no vault: show "Create Master Password" form
4. If vault exists: show "Unlock" form
5. After unlock: vault stays open for server lifetime
6. Restart requires re-entering password

**Security**:
- scrypt with N=16384, r=8, p=1 for key derivation
- 32-byte random salt per encryption
- 16-byte random IV per encryption
- Atomic write via temp file + rename

---

## 1A.4 - Plugin System

**Files**:
- `shared/plugin-types.ts` (NEW) - Shared interfaces
- `server/plugins/base-plugin.ts` (NEW) - ServerPlugin interface
- `server/plugins/loader.ts` (NEW) - PluginLoader class
- `src/plugins/registry.ts` (NEW) - Frontend registry

**Server Plugin Interface**:
```typescript
interface ServerPlugin {
  manifest: PluginManifest;
  oauthConfig?: OAuthConfig;
  tools: PluginToolDefinition[];
  initialize(deps: PluginDependencies): Promise<void>;
  shutdown(): Promise<void>;
  executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
}

interface PluginDependencies {
  db: Database;
  vault: CredentialVault;
  logger: (msg: string) => void;
}
```

**Plugin Manifest**:
```typescript
interface PluginManifest {
  id: string;              // 'google-gmail'
  name: string;            // 'Gmail'
  description: string;
  version: string;
  icon: string;
  category: 'email' | 'calendar' | 'documents' | 'contacts' | 'financial' | 'shopping' | 'social' | 'automation';
  requiresAuth: boolean;
  authType?: 'oauth2' | 'api-key' | 'none';
}
```

---

## 1A.5 - MCP Server

**Design**: Stdio-based MCP server, spawned by terminal LLM. Shares SQLite database (WAL allows concurrent readers) and vault with main backend.

**Files**:
- `server/mcp/index.ts` (NEW) - Entry point, registers all plugin tools

**Configuration** (for Claude Code):
```json
{
  "mcpServers": {
    "orc": {
      "command": "npx",
      "args": ["tsx", "server/mcp/index.ts"]
    }
  }
}
```

**Package**: `@modelcontextprotocol/sdk`

---

## 1A.6 - Chat UI

**Frontend Files**:
- `src/components/ChatPanel.tsx` (NEW) - Message list + input, auto-scroll, markdown
- `src/components/ChatMessage.tsx` (NEW) - Role-based bubbles, timestamps, copy
- `src/components/ChatInput.tsx` (NEW) - Multi-line, Enter=send, Shift+Enter=newline

**Backend Files**:
- `server/chat/bridge.ts` (NEW) - ChatBridge class, state machine (idle -> waiting -> streaming)
- `server/chat/response-parser.ts` (NEW) - Prompt pattern detection
- `server/chat/types.ts` (NEW) - ChatMessage, ChatRequest, ChatStreamChunk

**Modifications**:
- `server/pty-manager.ts` - Add `outputObservers` set, `onOutput()` method, `writeToStdin()` method
- `src/App.tsx` - Replace placeholder with ChatPanel
- `src/App.css` - Chat styles

**WebSocket Protocol Extensions**:
| Direction | Type | Payload | Purpose |
|-----------|------|---------|---------|
| Client->Server | `chat:send` | `{ messageId, content }` | Send message to LLM |
| Server->Client | `chat:chunk` | `{ messageId, type, content? }` | Stream response |
| Server->Client | `chat:done` | `{ messageId }` | Response complete |
| Server->Client | `chat:error` | `{ messageId, error }` | Error |

**Response Detection**: Heuristic prompt patterns:
- Claude Code: `/\n>\s*$/`
- Aider: `/\naider>\s*$/`
- Shell: `/\n\$\s*$/`
- Configurable in settings

**Packages**: `react-markdown`, `remark-gfm`

---

## 1A.7 - Widget/Dashboard System

**Files**:
- `src/components/Dashboard.tsx` (NEW) - CSS Grid container
- `src/components/DashboardWidget.tsx` (NEW) - Widget chrome (title, pin/unpin, minimize)
- `src/App.tsx` (MODIFY) - Chat + widget split layout

**Widget Interface**:
```typescript
interface WidgetProps {
  widgetId: string;
  pluginId: string;
  settings: Record<string, unknown>;
  onSettingsChange: (settings: Record<string, unknown>) => void;
}

interface WidgetManifest {
  id: string;
  pluginId: string;
  title: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  refreshIntervalMs: number;
}
```

---

## 1B - Google OAuth Foundation

**Files**:
- `server/plugins/google/google-auth.ts` (NEW) - OAuth 2.0 + PKCE, scope union, code exchange
- `server/plugins/google/google-client.ts` (NEW) - googleapis wrapper with auto-token-refresh
- `src/components/GoogleAuthSetup.tsx` (NEW) - Client ID/secret input, OAuth initiation, scope display

**API Endpoints**:
- `POST /api/auth/google/init` -> Returns authorization URL
- `GET /api/auth/google/callback` -> Handles OAuth callback, stores tokens
- `GET /api/auth/google/status` -> `{ authorized: boolean, scopes: string[] }`
- `POST /api/auth/google/revoke` -> Revoke tokens

**Scopes (Phase 1)**:
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/contacts`
- `https://www.googleapis.com/auth/contacts.readonly`

**Package**: `googleapis`

---

## 1C.1 - Gmail Plugin

**Server Files**: `server/plugins/google-gmail/index.ts`, `api-client.ts`, `mcp-tools.ts`
**Frontend Files**: `src/plugins/google-gmail/index.ts`, `GmailWidget.tsx`

**Service Methods**: searchEmails, readEmail, sendEmail, createDraft, listLabels, modifyLabels, markRead/Unread, archive, trash

**MCP Tools**: gmail_search, gmail_read, gmail_send, gmail_draft, gmail_labels

**API Routes**: GET /api/gmail/messages, GET /api/gmail/messages/:id, POST /api/gmail/messages/send, POST /api/gmail/drafts, GET /api/gmail/labels

---

## 1C.2 - Google Calendar Plugin

**Server Files**: `server/plugins/google-calendar/index.ts`, `api-client.ts`, `mcp-tools.ts`
**Frontend Files**: `src/plugins/google-calendar/index.ts`, `CalendarWidget.tsx`

**Service Methods**: listEvents, getEvent, createEvent, updateEvent, deleteEvent, listCalendars, getUpcoming

**MCP Tools**: calendar_upcoming, calendar_search, calendar_create, calendar_update

---

## 1C.3 - Google Contacts Plugin

**Server Files**: `server/plugins/google-contacts/index.ts`, `api-client.ts`, `mcp-tools.ts`
**Frontend Files**: `src/plugins/google-contacts/index.ts`, `ContactsWidget.tsx`

**Service Methods**: searchContacts, getContact, createContact, updateContact, listGroups

**MCP Tools**: contacts_search, contacts_get, contacts_create

---

## Phase 1 Completion Criteria

- [ ] Router handles all new + existing endpoints
- [ ] SQLite database creates and migrates on startup
- [ ] Vault encrypts/decrypts credentials, survives restarts
- [ ] Plugin loader registers Gmail, Calendar, Contacts plugins
- [ ] MCP server exposes all plugin tools, terminal LLM can call them
- [ ] Chat UI sends messages, receives streamed LLM responses
- [ ] Dashboard renders pinned widgets in a grid
- [ ] Google OAuth authorizes, tokens auto-refresh
- [ ] Gmail: search/read/send via chat and widget
- [ ] Calendar: view/create events via chat and widget
- [ ] Contacts: search/view via chat and widget
