import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3-multiple-ciphers';

const manifest: PluginManifest = {
  id: 'orc-journal',
  name: 'Journal',
  description: 'Personal journal with full-text search and context-aware retrieval',
  version: '0.1.0',
  icon: 'memory',
  category: 'documents',
  requiresAuth: false,
  authType: 'none',
  toolPrefix: 'journal',
  connection: 'local',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'journal_index',
    description: 'List journal entries by date range. Returns Tier 1: dates, titles, and tags only (very low context cost). Default: last 7 days.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look back (default 7)' },
        from: { type: 'string', description: 'Start date (YYYY-MM-DD). Overrides days.' },
        to: { type: 'string', description: 'End date (YYYY-MM-DD).' },
      },
    },
  },
  {
    name: 'journal_recent',
    description: 'Get summaries of the most recent journal entries (Tier 2). Good for quick context on recent activity.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of entries (default 5, max 20)' },
      },
    },
  },
  {
    name: 'journal_read',
    description: 'Read the full content of a specific journal entry by ID (Tier 3). Use journal_index or journal_search to find the ID first.',
    inputSchema: {
      type: 'object',
      properties: {
        entryId: { type: 'string', description: 'Journal entry ID' },
      },
      required: ['entryId'],
    },
  },
  {
    name: 'journal_search',
    description: 'Full-text search across all journal entries. Returns summaries and match snippets (Tier 2).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'journal_add',
    description: 'Add a journal entry. Use this to record noteworthy events, decisions, learnings, and insights. If an entry for today with the same title exists, appends to it instead of creating a duplicate.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Entry title (concise)' },
        content: { type: 'string', description: 'Entry content (markdown, 2-5 sentences with context and reasoning)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags like ["decision", "bug-fix", "preference", "milestone", "learning"]' },
        summary: { type: 'string', description: 'One-sentence summary for quick reference' },
      },
      required: ['title', 'content', 'tags', 'summary'],
    },
  },
  {
    name: 'journal_summarize_day',
    description: 'Get all entry summaries for a specific date. Useful for daily review.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date (YYYY-MM-DD). Default: today.' },
      },
    },
  },
];

function autoSummary(content: string): string {
  const clean = content.replace(/[#*_`\[\]]/g, '').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  let summary = '';
  for (const s of sentences) {
    if ((summary + s).length > 200) break;
    summary += s;
  }
  return (summary || clean.slice(0, 200)).trim();
}

export class JournalPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private db: Database.Database | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    this.db = deps.db;
    deps.logger('Journal plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.db) return { content: [{ type: 'text', text: 'Database not initialized' }], isError: true };
    const db = this.db;

    try {
      switch (toolName) {
        case 'journal_index': {
          const days = (args.days as number) ?? 7;
          const from = (args.from as string) ?? new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
          const to = (args.to as string) ?? new Date().toISOString().split('T')[0];

          const rows = db.prepare(
            'SELECT id, date, title, tags, source FROM journal_entries WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC'
          ).all(from, to) as any[];

          if (rows.length === 0) return { content: [{ type: 'text', text: `No journal entries from ${from} to ${to}.` }] };

          const text = rows.map((r) => {
            const tags = JSON.parse(r.tags || '[]').join(', ');
            return `- **${r.date}** | ${r.title}${tags ? ` [${tags}]` : ''} (${r.source}) [ID: ${r.id}]`;
          }).join('\n');

          return { content: [{ type: 'text', text: `Journal entries (${from} to ${to}):\n\n${text}` }] };
        }

        case 'journal_recent': {
          const count = Math.min((args.count as number) ?? 5, 20);
          const rows = db.prepare(
            'SELECT id, date, title, summary, tags, source FROM journal_entries ORDER BY date DESC, created_at DESC LIMIT ?'
          ).all(count) as any[];

          if (rows.length === 0) return { content: [{ type: 'text', text: 'No journal entries yet.' }] };

          const text = rows.map((r) => {
            const tags = JSON.parse(r.tags || '[]').join(', ');
            return `**${r.title}** (${r.date})\n${r.summary || '(no summary)'}${tags ? `\nTags: ${tags}` : ''}\n[ID: ${r.id}]`;
          }).join('\n\n---\n\n');

          return { content: [{ type: 'text', text }] };
        }

        case 'journal_read': {
          const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(args.entryId) as any;
          if (!entry) return { content: [{ type: 'text', text: 'Entry not found.' }], isError: true };

          const tags = JSON.parse(entry.tags || '[]').join(', ');
          const text = [
            `# ${entry.title}`,
            `**Date:** ${entry.date} | **Source:** ${entry.source}${entry.mood ? ` | **Mood:** ${entry.mood}` : ''}`,
            tags ? `**Tags:** ${tags}` : '',
            '',
            entry.content,
          ].filter((l) => l !== '').join('\n');

          return { content: [{ type: 'text', text }] };
        }

        case 'journal_search': {
          const limit = Math.min((args.limit as number) ?? 10, 30);
          const rows = db.prepare(`
            SELECT je.id, je.date, je.title, je.summary, je.tags,
                   snippet(journal_fts, 2, '<mark>', '</mark>', '...', 40) as snippet
            FROM journal_fts
            JOIN journal_entries je ON je.rowid = journal_fts.rowid
            WHERE journal_fts MATCH ?
            ORDER BY rank
            LIMIT ?
          `).all(args.query, limit) as any[];

          if (rows.length === 0) return { content: [{ type: 'text', text: `No journal entries matching "${args.query}".` }] };

          const text = rows.map((r) => {
            return `**${r.title}** (${r.date})\n${r.summary || ''}\nMatch: ${r.snippet}\n[ID: ${r.id}]`;
          }).join('\n\n---\n\n');

          return { content: [{ type: 'text', text }] };
        }

        case 'journal_add': {
          const today = new Date().toISOString().split('T')[0];
          const title = args.title as string;
          const content = args.content as string;
          const tags = JSON.stringify(args.tags || []);
          const summary = (args.summary as string) || autoSummary(content);

          // Check for existing entry with same title today (append instead of duplicate)
          const existing = db.prepare(
            'SELECT id, content FROM journal_entries WHERE date = ? AND title = ?'
          ).get(today, title) as any;

          if (existing) {
            const newContent = existing.content + '\n\n---\n\n' + content;
            const newSummary = autoSummary(newContent);
            db.prepare('UPDATE journal_entries SET content = ?, summary = ?, tags = ?, updated_at = ? WHERE id = ?')
              .run(newContent, newSummary, tags, new Date().toISOString(), existing.id);
            return { content: [{ type: 'text', text: `Appended to existing entry: "${title}" [ID: ${existing.id}]` }] };
          }

          const id = randomUUID();
          db.prepare(
            `INSERT INTO journal_entries (id, date, title, summary, content, tags, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'mcp', ?, ?)`
          ).run(id, today, title, summary, content, tags, new Date().toISOString(), new Date().toISOString());

          return { content: [{ type: 'text', text: `Journal entry created: "${title}" [ID: ${id}]` }] };
        }

        case 'journal_summarize_day': {
          const date = (args.date as string) ?? new Date().toISOString().split('T')[0];
          const rows = db.prepare(
            'SELECT title, summary, tags, source FROM journal_entries WHERE date = ? ORDER BY created_at'
          ).all(date) as any[];

          if (rows.length === 0) return { content: [{ type: 'text', text: `No journal entries for ${date}.` }] };

          const text = rows.map((r) => {
            const tags = JSON.parse(r.tags || '[]').join(', ');
            return `- **${r.title}** (${r.source}): ${r.summary || '(no summary)'}${tags ? ` [${tags}]` : ''}`;
          }).join('\n');

          return { content: [{ type: 'text', text: `Journal for ${date}:\n\n${text}` }] };
        }

        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Journal error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}
}
