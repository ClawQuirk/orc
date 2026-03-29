# Orc: Personal Knowledge Assistant - Project Overview

## Vision

Orc (Orchestrator) is a self-hosted, LLM-agnostic Personal Knowledge Assistant that combines a conversational AI chat interface with a dashboard of pinnable widgets, all backed by deep integrations with Google services, financial platforms, shopping sites, and social media. A persistent terminal panel runs an AI coding tool (Claude, Aider, Ollama, etc.) that serves as the "brain" via MCP.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI Paradigm | Chat + Dashboard hybrid | Chat for natural interaction, widgets for at-a-glance data |
| LLM Bridge | MCP Server (stdio) | Standard protocol, terminal LLM calls app tools directly |
| Chat Routing | Through terminal LLM | One LLM, two interfaces (chat + terminal) |
| User Scope | Single user, self-hosted | Simpler auth, SQLite, no login screen |
| Database | SQLite + better-sqlite3 | Zero config, single file, WAL for concurrent access |
| Secrets | AES-256-GCM encrypted file | Master password on startup, no external dependencies |
| Automation | Playwright headless | For services without APIs (Costco, order histories) |
| Vector Search | sqlite-vec (Phase 5) | Native SQLite extension, no separate server |

## Phase Summary

| Phase | Focus | Key Deliverable |
|-------|-------|-----------------|
| 1 | Foundation + Google Suite | Chat UI, plugin system, MCP, vault, Gmail/Calendar/Contacts |
| 2 | Extended Google + Financial | Docs/Sheets/Slides, Plaid/Stripe/PayPal/Coinbase/Robinhood |
| 3 | Shopping + Automation | Playwright framework, Amazon/Costco/Target/Sprouts/Newegg |
| 4 | Social Media | YouTube/Facebook/Instagram/X, unified social feed |
| 5 | Advanced Features | Semantic search, workflows, notifications, daily briefings |

## API Landscape

### Official APIs (straightforward)
- Google Suite (all 6 services) - OAuth 2.0, free, well-documented
- Plaid, Stripe, PayPal, Coinbase - Official SDKs available
- YouTube (Google OAuth), Facebook/Instagram (Graph API), X/Twitter (v2 API)

### Limited/Restricted
- Robinhood - Crypto-only API (no stocks)
- Amazon PA-API - Being sunset April 30, 2026; migrating to Creators API
- Instagram - Requires Business/Creator account for API access
- X/Twitter - Pay-per-use pricing model

### No API (Browser Automation Required)
- Costco - No public API
- Order histories on most shopping sites
- Some social media features restricted from APIs

## File Scale Estimate

| Phase | New Files | Cumulative |
|-------|-----------|------------|
| Current | 13 | 13 |
| Phase 1 | ~50 | ~63 |
| Phase 2 | ~48 | ~111 |
| Phase 3 | ~50 | ~161 |
| Phase 4 | ~33 | ~194 |
| Phase 5 | ~28 | ~222 |
