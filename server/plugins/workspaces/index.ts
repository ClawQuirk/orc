import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3-multiple-ciphers';
import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { invalidateWorkspaceCache } from '../../routes/workspace-helper.js';

const manifest: PluginManifest = {
  id: 'orc-workspaces',
  name: 'Workspaces',
  description: 'Manage Home and Business workspaces that scope projects, journal, and brainstorm boards',
  version: '0.1.0',
  icon: 'workspace',
  category: 'documents',
  requiresAuth: false,
  authType: 'none',
  toolPrefix: 'workspaces',
  connection: 'local',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'workspaces_list',
    description: 'List all active workspaces (Home + businesses).',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'archived'], description: 'Filter by status (default: active)' },
      },
    },
  },
  {
    name: 'workspaces_get',
    description: 'Get a workspace with counts of scoped data (projects, journal entries, brainstorm boards).',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'workspaces_create',
    description: 'Create a new business workspace. Returns the new workspace ID for use in other scoped tools.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Business name' },
        description: { type: 'string', description: 'Optional description' },
        icon: { type: 'string', description: 'Optional icon identifier' },
        color: { type: 'string', description: 'Optional hex color' },
      },
      required: ['name'],
    },
  },
  {
    name: 'workspaces_update',
    description: 'Update a workspace name, description, icon, color, or sort order.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID' },
        name: { type: 'string' },
        description: { type: 'string' },
        icon: { type: 'string' },
        color: { type: 'string' },
        sort_order: { type: 'number' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'workspaces_delete',
    description: 'Archive a business workspace (soft delete). The Home workspace cannot be deleted.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID' },
      },
      required: ['workspaceId'],
    },
  },
];

function shortId(): string {
  return randomBytes(6).toString('hex');
}

export class WorkspacesPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private db: Database.Database | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    this.db = deps.db;
    deps.logger('Workspaces plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.db) return { content: [{ type: 'text', text: 'Database not initialized' }], isError: true };
    const db = this.db;
    const now = () => new Date().toISOString();

    try {
      switch (toolName) {
        case 'workspaces_list': {
          const status = (args.status as string) ?? 'active';
          const rows = db
            .prepare(
              `SELECT * FROM workspaces WHERE status = ?
               ORDER BY CASE type WHEN 'home' THEN 0 ELSE 1 END, sort_order, created_at`
            )
            .all(status) as any[];
          if (rows.length === 0) {
            return { content: [{ type: 'text', text: 'No workspaces found.' }] };
          }
          const text = rows
            .map((w) => `- **${w.name}** (${w.type}) — [ID: ${w.id}]${w.description ? ` — ${w.description}` : ''}`)
            .join('\n');
          return { content: [{ type: 'text', text: `Workspaces:\n\n${text}` }] };
        }

        case 'workspaces_get': {
          const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(args.workspaceId) as any;
          if (!row) return { content: [{ type: 'text', text: 'Workspace not found.' }], isError: true };
          const projectCount = (db.prepare('SELECT COUNT(*) as c FROM projects WHERE workspace_id = ?').get(args.workspaceId) as any).c;
          const journalCount = (db.prepare('SELECT COUNT(*) as c FROM journal_entries WHERE workspace_id = ?').get(args.workspaceId) as any).c;
          const boardCount = (db.prepare('SELECT COUNT(*) as c FROM brainstorm_boards WHERE workspace_id = ?').get(args.workspaceId) as any).c;
          const text =
            `# ${row.name} (${row.type})\n` +
            `**ID:** ${row.id} | **Status:** ${row.status}\n` +
            (row.description ? `\n${row.description}\n` : '') +
            `\n## Scoped data\n` +
            `- Projects: ${projectCount}\n` +
            `- Journal entries: ${journalCount}\n` +
            `- Brainstorm boards: ${boardCount}\n`;
          return { content: [{ type: 'text', text }] };
        }

        case 'workspaces_create': {
          const name = typeof args.name === 'string' ? args.name.trim() : '';
          if (!name) return { content: [{ type: 'text', text: 'name is required' }], isError: true };
          const existing = db
            .prepare(`SELECT id FROM workspaces WHERE lower(name) = lower(?) AND status = 'active'`)
            .get(name);
          if (existing) {
            return { content: [{ type: 'text', text: `A workspace named "${name}" already exists.` }], isError: true };
          }
          const id = shortId();
          const maxOrder = db
            .prepare(`SELECT MAX(sort_order) as m FROM workspaces WHERE type = 'business'`)
            .get() as any;
          const sortOrder = (maxOrder?.m ?? -1) + 1;
          const ts = now();
          db.prepare(
            `INSERT INTO workspaces (id, name, type, description, icon, color, sort_order, status, created_at, updated_at)
             VALUES (?, ?, 'business', ?, ?, ?, ?, 'active', ?, ?)`
          ).run(
            id,
            name,
            (args.description as string) ?? null,
            (args.icon as string) ?? null,
            (args.color as string) ?? null,
            sortOrder,
            ts,
            ts
          );
          invalidateWorkspaceCache();
          return { content: [{ type: 'text', text: `Workspace created: "${name}" [ID: ${id}]` }] };
        }

        case 'workspaces_update': {
          const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(args.workspaceId) as any;
          if (!row) return { content: [{ type: 'text', text: 'Workspace not found.' }], isError: true };
          const fields: string[] = [];
          const values: unknown[] = [];
          for (const key of ['name', 'description', 'icon', 'color', 'sort_order']) {
            if (args[key] !== undefined) {
              fields.push(`${key} = ?`);
              values.push(args[key]);
            }
          }
          if (fields.length === 0) {
            return { content: [{ type: 'text', text: 'No fields to update.' }], isError: true };
          }
          fields.push('updated_at = ?');
          values.push(now());
          values.push(args.workspaceId);
          db.prepare(`UPDATE workspaces SET ${fields.join(', ')} WHERE id = ?`).run(...values);
          invalidateWorkspaceCache();
          return { content: [{ type: 'text', text: 'Workspace updated.' }] };
        }

        case 'workspaces_delete': {
          if (args.workspaceId === 'home') {
            return { content: [{ type: 'text', text: 'Cannot delete the Home workspace.' }], isError: true };
          }
          const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(args.workspaceId) as any;
          if (!row) return { content: [{ type: 'text', text: 'Workspace not found.' }], isError: true };
          db.prepare(`UPDATE workspaces SET status = 'archived', updated_at = ? WHERE id = ?`).run(
            now(),
            args.workspaceId
          );
          invalidateWorkspaceCache();
          return { content: [{ type: 'text', text: `Workspace archived: "${row.name}"` }] };
        }

        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Workspaces error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}
}
