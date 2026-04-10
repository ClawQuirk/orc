import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3-multiple-ciphers';

const manifest: PluginManifest = {
  id: 'orc-brainstorm',
  name: 'Brainstorm',
  description: 'Visual brainstorming boards with nodes and connections',
  version: '0.1.0',
  icon: 'brainstorm',
  category: 'documents',
  requiresAuth: false,
  authType: 'none',
  toolPrefix: 'brainstorm',
  connection: 'local',
};

const WORKSPACE_PROP = {
  workspaceId: {
    type: 'string',
    description: 'Workspace ID to scope the operation. Defaults to "home" if omitted.',
  },
};

const tools: PluginToolDefinition[] = [
  {
    name: 'brainstorm_boards_list',
    description: 'List brainstorm boards with node/edge counts. Optional status filter.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        status: { type: 'string', enum: ['active', 'archived'], description: 'Filter by status (default: all)' },
      },
    },
  },
  {
    name: 'brainstorm_boards_get',
    description: 'Get a brainstorm board with all its nodes and edges.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        boardId: { type: 'string', description: 'Board ID' },
      },
      required: ['boardId'],
    },
  },
  {
    name: 'brainstorm_boards_create',
    description: 'Create a new brainstorm board in the given workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        name: { type: 'string', description: 'Board name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'brainstorm_boards_update',
    description: 'Rename, archive, or reorder a brainstorm board.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        boardId: { type: 'string', description: 'Board ID' },
        name: { type: 'string', description: 'New name' },
        status: { type: 'string', enum: ['active', 'archived'], description: 'New status' },
        sort_order: { type: 'number', description: 'New sort order' },
      },
      required: ['boardId'],
    },
  },
  {
    name: 'brainstorm_boards_delete',
    description: 'Permanently delete a brainstorm board and all its nodes/edges.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        boardId: { type: 'string', description: 'Board ID' },
      },
      required: ['boardId'],
    },
  },
  {
    name: 'brainstorm_boards_duplicate',
    description: 'Deep-copy a brainstorm board with all nodes and edges.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Board ID to duplicate' },
      },
      required: ['boardId'],
    },
  },
  {
    name: 'brainstorm_nodes_create',
    description: 'Add a node to a brainstorm board.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        boardId: { type: 'string', description: 'Board ID' },
        position_x: { type: 'number', description: 'X position on canvas' },
        position_y: { type: 'number', description: 'Y position on canvas' },
        data: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            content: { type: 'string' },
            color: { type: 'string' },
          },
          description: 'Node data: label, content (markdown), color (hex)',
        },
        width: { type: 'number', description: 'Node width' },
        height: { type: 'number', description: 'Node height' },
      },
      required: ['boardId', 'position_x', 'position_y'],
    },
  },
  {
    name: 'brainstorm_nodes_update',
    description: 'Update a node\'s position, size, or data.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        boardId: { type: 'string', description: 'Board ID' },
        nodeId: { type: 'string', description: 'Node ID' },
        position_x: { type: 'number' },
        position_y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        data: { type: 'object', description: 'Node data: label, content, color' },
      },
      required: ['boardId', 'nodeId'],
    },
  },
  {
    name: 'brainstorm_nodes_delete',
    description: 'Remove a node and its connected edges from a board.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        boardId: { type: 'string', description: 'Board ID' },
        nodeId: { type: 'string', description: 'Node ID' },
      },
      required: ['boardId', 'nodeId'],
    },
  },
  {
    name: 'brainstorm_edges_create',
    description: 'Connect two nodes on a brainstorm board.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        boardId: { type: 'string', description: 'Board ID' },
        source: { type: 'string', description: 'Source node ID' },
        target: { type: 'string', description: 'Target node ID' },
        label: { type: 'string', description: 'Edge label' },
      },
      required: ['boardId', 'source', 'target'],
    },
  },
  {
    name: 'brainstorm_edges_delete',
    description: 'Remove a connection between nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        boardId: { type: 'string', description: 'Board ID' },
        edgeId: { type: 'string', description: 'Edge ID' },
      },
      required: ['boardId', 'edgeId'],
    },
  },
  {
    name: 'brainstorm_edges_list',
    description: 'List all edges for a brainstorm board.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        boardId: { type: 'string', description: 'Board ID' },
      },
      required: ['boardId'],
    },
  },
];

export class BrainstormPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private db: Database.Database | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    this.db = deps.db;
    deps.logger('Brainstorm plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.db) return { content: [{ type: 'text', text: 'Database not initialized' }], isError: true };
    const db = this.db;
    const wsId = (args.workspaceId as string) || 'home';

    // Verify a board belongs to the current workspace
    const ownsBoard = (boardId: string): boolean => {
      const row = db.prepare('SELECT workspace_id FROM brainstorm_boards WHERE id = ?').get(boardId) as any;
      return row && row.workspace_id === wsId;
    };

    try {
      switch (toolName) {
        case 'brainstorm_boards_list': {
          let sql = 'SELECT b.*, (SELECT COUNT(*) FROM brainstorm_nodes WHERE board_id = b.id) as node_count, (SELECT COUNT(*) FROM brainstorm_edges WHERE board_id = b.id) as edge_count FROM brainstorm_boards b WHERE b.workspace_id = ?';
          const binds: unknown[] = [wsId];
          if (args.status) { sql += ' AND b.status = ?'; binds.push(args.status); }
          sql += ' ORDER BY b.sort_order, b.created_at';
          const boards = db.prepare(sql).all(...binds) as any[];

          if (boards.length === 0) return { content: [{ type: 'text', text: 'No brainstorm boards found.' }] };

          const text = boards.map((b) =>
            `- **${b.name}** (${b.status}) — ${b.node_count} nodes, ${b.edge_count} edges [ID: ${b.id}]`
          ).join('\n');
          return { content: [{ type: 'text', text: `Brainstorm boards:\n\n${text}` }] };
        }

        case 'brainstorm_boards_get': {
          if (!ownsBoard(args.boardId as string)) {
            return { content: [{ type: 'text', text: 'Board not found in this workspace.' }], isError: true };
          }
          const board = db.prepare('SELECT * FROM brainstorm_boards WHERE id = ?').get(args.boardId) as any;
          if (!board) return { content: [{ type: 'text', text: 'Board not found.' }], isError: true };

          const nodes = db.prepare('SELECT * FROM brainstorm_nodes WHERE board_id = ?').all(args.boardId) as any[];
          const edges = db.prepare('SELECT * FROM brainstorm_edges WHERE board_id = ?').all(args.boardId) as any[];

          let text = `# ${board.name}\n**Status:** ${board.status} | **Nodes:** ${nodes.length} | **Edges:** ${edges.length}\n\n`;

          if (nodes.length > 0) {
            text += '## Nodes\n';
            for (const n of nodes) {
              const data = JSON.parse(n.data || '{}');
              text += `- **${data.label || '(untitled)'}** at (${Math.round(n.position_x)}, ${Math.round(n.position_y)})${data.content ? `: ${data.content.slice(0, 100)}` : ''} [ID: ${n.id}]\n`;
            }
          }

          if (edges.length > 0) {
            text += '\n## Connections\n';
            for (const e of edges) {
              text += `- ${e.source} → ${e.target}${e.label ? ` (${e.label})` : ''} [ID: ${e.id}]\n`;
            }
          }

          return { content: [{ type: 'text', text }] };
        }

        case 'brainstorm_boards_create': {
          const id = randomUUID();
          const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM brainstorm_boards WHERE workspace_id = ?').get(wsId) as any;
          const sortOrder = (maxOrder?.m ?? -1) + 1;
          const ts = new Date().toISOString();
          db.prepare('INSERT INTO brainstorm_boards (id, workspace_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, wsId, args.name, sortOrder, ts, ts);
          return { content: [{ type: 'text', text: `Board created: "${args.name}" [ID: ${id}]` }] };
        }

        case 'brainstorm_boards_update': {
          if (!ownsBoard(args.boardId as string)) {
            return { content: [{ type: 'text', text: 'Board not found in this workspace.' }], isError: true };
          }
          const fields: string[] = [];
          const values: unknown[] = [];
          if (args.name) { fields.push('name = ?'); values.push(args.name); }
          if (args.status) { fields.push('status = ?'); values.push(args.status); }
          if (args.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(args.sort_order); }
          if (fields.length === 0) return { content: [{ type: 'text', text: 'No fields to update.' }], isError: true };
          fields.push('updated_at = ?');
          values.push(new Date().toISOString());
          values.push(args.boardId);
          db.prepare(`UPDATE brainstorm_boards SET ${fields.join(', ')} WHERE id = ?`).run(...values);
          return { content: [{ type: 'text', text: `Board updated.` }] };
        }

        case 'brainstorm_boards_delete': {
          if (!ownsBoard(args.boardId as string)) {
            return { content: [{ type: 'text', text: 'Board not found in this workspace.' }], isError: true };
          }
          db.prepare('DELETE FROM brainstorm_boards WHERE id = ?').run(args.boardId);
          return { content: [{ type: 'text', text: 'Board deleted.' }] };
        }

        case 'brainstorm_boards_duplicate': {
          if (!ownsBoard(args.boardId as string)) {
            return { content: [{ type: 'text', text: 'Board not found in this workspace.' }], isError: true };
          }
          const board = db.prepare('SELECT * FROM brainstorm_boards WHERE id = ?').get(args.boardId) as any;
          if (!board) return { content: [{ type: 'text', text: 'Board not found.' }], isError: true };

          const newBoardId = randomUUID();
          const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM brainstorm_boards WHERE workspace_id = ?').get(wsId) as any;
          const sortOrder = (maxOrder?.m ?? -1) + 1;
          const ts = new Date().toISOString();
          const nodes = db.prepare('SELECT * FROM brainstorm_nodes WHERE board_id = ?').all(args.boardId) as any[];
          const edges = db.prepare('SELECT * FROM brainstorm_edges WHERE board_id = ?').all(args.boardId) as any[];
          const nodeIdMap = new Map<string, string>();
          for (const n of nodes) nodeIdMap.set(n.id, randomUUID());

          db.transaction(() => {
            db.prepare('INSERT INTO brainstorm_boards (id, workspace_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(newBoardId, wsId, `${board.name} (copy)`, sortOrder, ts, ts);
            for (const n of nodes) {
              db.prepare('INSERT INTO brainstorm_nodes (id, board_id, type, position_x, position_y, width, height, data, style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(nodeIdMap.get(n.id), newBoardId, n.type, n.position_x, n.position_y, n.width, n.height, n.data, n.style, ts, ts);
            }
            for (const e of edges) {
              const ns = nodeIdMap.get(e.source);
              const nt = nodeIdMap.get(e.target);
              if (ns && nt) {
                db.prepare('INSERT INTO brainstorm_edges (id, board_id, source, target, source_handle, target_handle, type, label, data, style, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), newBoardId, ns, nt, e.source_handle, e.target_handle, e.type, e.label, e.data, e.style, ts);
              }
            }
          })();
          return { content: [{ type: 'text', text: `Board duplicated: "${board.name} (copy)" [ID: ${newBoardId}]` }] };
        }

        case 'brainstorm_nodes_create': {
          if (!ownsBoard(args.boardId as string)) {
            return { content: [{ type: 'text', text: 'Board not found in this workspace.' }], isError: true };
          }
          const id = randomUUID();
          const ts = new Date().toISOString();
          const data = args.data ? JSON.stringify(args.data) : '{}';
          db.prepare('INSERT INTO brainstorm_nodes (id, board_id, type, position_x, position_y, width, height, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, args.boardId, 'custom', args.position_x, args.position_y, args.width ?? null, args.height ?? null, data, ts, ts);
          return { content: [{ type: 'text', text: `Node created [ID: ${id}]` }] };
        }

        case 'brainstorm_nodes_update': {
          if (!ownsBoard(args.boardId as string)) {
            return { content: [{ type: 'text', text: 'Board not found in this workspace.' }], isError: true };
          }
          const fields: string[] = [];
          const values: unknown[] = [];
          for (const key of ['position_x', 'position_y', 'width', 'height']) {
            if (args[key] !== undefined) { fields.push(`${key} = ?`); values.push(args[key]); }
          }
          if (args.data) { fields.push('data = ?'); values.push(JSON.stringify(args.data)); }
          if (fields.length === 0) return { content: [{ type: 'text', text: 'No fields to update.' }], isError: true };
          fields.push('updated_at = ?');
          values.push(new Date().toISOString());
          values.push(args.nodeId);
          db.prepare(`UPDATE brainstorm_nodes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
          return { content: [{ type: 'text', text: 'Node updated.' }] };
        }

        case 'brainstorm_nodes_delete': {
          if (!ownsBoard(args.boardId as string)) {
            return { content: [{ type: 'text', text: 'Board not found in this workspace.' }], isError: true };
          }
          db.prepare('DELETE FROM brainstorm_nodes WHERE id = ?').run(args.nodeId);
          return { content: [{ type: 'text', text: 'Node deleted.' }] };
        }

        case 'brainstorm_edges_create': {
          if (!ownsBoard(args.boardId as string)) {
            return { content: [{ type: 'text', text: 'Board not found in this workspace.' }], isError: true };
          }
          const id = randomUUID();
          db.prepare('INSERT INTO brainstorm_edges (id, board_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, args.boardId, args.source, args.target, args.label ?? null, new Date().toISOString());
          return { content: [{ type: 'text', text: `Edge created [ID: ${id}]` }] };
        }

        case 'brainstorm_edges_delete': {
          if (!ownsBoard(args.boardId as string)) {
            return { content: [{ type: 'text', text: 'Board not found in this workspace.' }], isError: true };
          }
          db.prepare('DELETE FROM brainstorm_edges WHERE id = ?').run(args.edgeId);
          return { content: [{ type: 'text', text: 'Edge deleted.' }] };
        }

        case 'brainstorm_edges_list': {
          if (!ownsBoard(args.boardId as string)) {
            return { content: [{ type: 'text', text: 'Board not found in this workspace.' }], isError: true };
          }
          const edges = db.prepare('SELECT * FROM brainstorm_edges WHERE board_id = ?').all(args.boardId) as any[];
          if (edges.length === 0) return { content: [{ type: 'text', text: 'No edges on this board.' }] };
          const text = edges.map((e) => `- ${e.source} → ${e.target}${e.label ? ` (${e.label})` : ''} [ID: ${e.id}]`).join('\n');
          return { content: [{ type: 'text', text: `Edges:\n\n${text}` }] };
        }

        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Brainstorm error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}
}
