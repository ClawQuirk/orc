# Phase 5: Advanced Features

## Status: NOT STARTED
## Depends on: Phases 1-4 substantially complete

---

## 5A: Semantic Search

### 5A.1 - Embedding Pipeline
- `server/search/embedding-service.ts` - Local embeddings via `@xenova/transformers`
  - Default model: all-MiniLM-L6-v2 (384 dimensions, ~80MB, runs in Node.js)
  - Optional: OpenAI text-embedding-3-small (1536 dims) if API key in vault
  - Batch embedding for initial index, incremental for new content
- `server/search/indexer.ts` - Background indexer across all plugins
  - Emails: subject + body + sender
  - Calendar events: title + description + attendees
  - Contacts: name + email + notes
  - Documents: title + body text
  - Transactions: merchant + amount + category
  - Social posts: content + author
- `server/db/migrations/003-vector-search.ts` - sqlite-vec virtual table setup

**Packages**: `sqlite-vec`, `@xenova/transformers`

### 5A.2 - Search UI
- `src/components/SearchPanel.tsx` - Universal search bar, results grouped by source
- `src/components/SearchResult.tsx` - Source icon, title, snippet, actions
- Hybrid search: semantic (sqlite-vec) + keyword (FTS5)
- API: `GET /api/search?q=...&sources=...&from=...&to=...`

---

## 5B: Cross-Service Workflows

### 5B.1 - Workflow Engine
- `server/workflows/workflow-engine.ts` - Multi-step, multi-service workflows
  - Step sequencing with variable interpolation
  - Confirmation gates before destructive actions
  - Error handling with partial rollback
- `server/workflows/builtin-workflows.ts` - Pre-built templates:
  - "Schedule meeting with contact about email" -> Contacts + Calendar + Gmail
  - "Summarize spending this month" -> Plaid + PayPal + Stripe -> categorize
  - "Daily briefing" -> Calendar + Gmail + transactions -> formatted summary
  - "Share document with contact" -> Contacts + Docs + Gmail

---

## 5C: Proactive Intelligence

### 5C.1 - Notification System
- `server/notifications/notification-service.ts` - Background polling per plugin
  - New emails from important contacts
  - Upcoming calendar events (15min warning)
  - Large transactions
  - Social mentions
- `src/components/NotificationPanel.tsx` - Bell icon + slide-out drawer
- WebSocket push via `/ws/notifications`
- API: GET /api/notifications, PUT /api/notifications/:id/read

### 5C.2 - Daily Briefing
- `server/briefing/briefing-service.ts` - Aggregated morning summary
  - Today's calendar, unread email count, spending alerts, social highlights
  - Formatted as structured markdown
  - Optionally sent to LLM for natural language summarization
- MCP tool: daily_briefing
- Widget: BriefingWidget

### 5C.3 - Smart Categorization
- `server/categorization/auto-categorizer.ts` - Embedding-based categorization
  - Purchases into spending categories (beyond rule-based)
  - Emails into priority levels
  - Contacts into groups
  - Learns from user corrections (category_overrides table)

### 5C.4 - Natural Language Query Engine
- `server/nlq/query-interpreter.ts` - Structured fallbacks for common patterns
  - "How much at restaurants last month?" -> transactions query
  - "Next meeting with Sarah?" -> calendar query with attendee filter
  - "Emails from boss about project" -> gmail search
  - Primarily LLM-powered via MCP, with structured fallbacks when LLM unavailable

---

## Phase 5 Completion Criteria

- [ ] Semantic search finds relevant results across all data sources
- [ ] Hybrid search combines vector + keyword matching
- [ ] Cross-service workflows execute multi-step operations
- [ ] Notifications push to frontend for important events
- [ ] Daily briefing summarizes all services
- [ ] Smart categorization improves with user corrections
- [ ] NL queries work for common patterns without LLM
