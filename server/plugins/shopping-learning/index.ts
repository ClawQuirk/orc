import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import type { ShoppingLearning, ShoppingCategory, MerchantId } from '../../../shared/shopping-types.js';
import type Database from 'better-sqlite3-multiple-ciphers';
import { randomUUID } from 'node:crypto';
import { writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const LEARNING_DIR = path.join(process.cwd(), 'data', 'shopping-learning');

const manifest: PluginManifest = {
  id: 'shopping-learning',
  name: 'Shopping Learning',
  description: 'Record and recall shopping preferences, brand tips, and value observations',
  version: '0.1.0',
  icon: 'memory',
  category: 'shopping',
  requiresAuth: false,
  authType: 'none',
  toolPrefix: 'shopping',
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
    name: 'shopping_learn',
    description: 'Record a shopping preference, tip, or observation. Examples: "Fage Greek Yogurt: Costco 3-pack is best value at $0.12/oz", "Organic eggs: Sprouts often cheapest". Proactively use this when: price comparisons reveal a clear value winner (>20% cheaper), user expresses a brand preference, or user mentions size preferences.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        title: { type: 'string', description: 'Short title (e.g., "Greek Yogurt preference")' },
        content: { type: 'string', description: 'Detailed learning (markdown, 1-3 sentences)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags like ["dairy", "preference", "value-tip", "brand"]' },
        merchant: { type: 'string', description: 'Primary merchant if applicable (sprouts, costco, target, amazon, newegg)' },
        category: { type: 'string', description: 'Product category: dairy, produce, meat, pantry, frozen, beverages, snacks, household, electronics, general' },
      },
      required: ['title', 'content', 'tags'],
    },
  },
  {
    name: 'shopping_recall',
    description: 'Search shopping learnings by keyword. Use before making product recommendations to check for user preferences.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        query: { type: 'string', description: 'Search query (e.g., "yogurt", "costco", "organic")' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'shopping_recommend',
    description: 'Given a list of shopping items, check learnings for relevant preferences, brand recommendations, or value tips. Use BEFORE running shopping_list to personalize results.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        items: {
          type: 'array',
          items: { type: 'string' },
          description: 'Shopping list items to check learnings against',
        },
      },
      required: ['items'],
    },
  },
];

export class ShoppingLearningPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private db: Database.Database | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    this.db = deps.db;
    deps.logger('Shopping learning plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const wsId = (args.workspaceId as string) || 'home';
    switch (toolName) {
      case 'shopping_learn':
        return this.learn({ ...(args as any), workspaceId: wsId });
      case 'shopping_recall':
        return this.recallTool(args.query as string, (args.limit as number) ?? 10, wsId);
      case 'shopping_recommend':
        return this.recommend(args.items as string[], wsId);
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}

  /** Add a learning. Called by MCP tool and can be called directly. */
  private async learn(args: {
    title: string; content: string; tags: string[];
    merchant?: string; category?: string; workspaceId?: string;
  }): Promise<ToolResult> {
    if (!this.db) return { content: [{ type: 'text', text: 'Database not initialized' }], isError: true };

    const id = randomUUID();
    const category = (args.category || 'general') as ShoppingCategory;
    const merchant = (args.merchant || null) as MerchantId | null;
    const tags = JSON.stringify(args.tags);
    const wsId = args.workspaceId || 'home';

    this.db.prepare(`
      INSERT INTO shopping_learning (id, workspace_id, title, content, tags, merchant, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, wsId, args.title, args.content, tags, merchant, category);

    // Write markdown file
    this.writeMarkdown(id, args.title, args.content, args.tags, merchant, category);

    return {
      content: [{ type: 'text', text: `Saved learning: "${args.title}" [${category}]` }],
    };
  }

  /** Search learnings via FTS5 scoped to a workspace. Returns structured results for direct use. */
  async recall(query: string, limit: number, workspaceId: string = 'home'): Promise<ShoppingLearning[]> {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(`
        SELECT sl.id, sl.title, sl.content, sl.tags, sl.merchant, sl.category,
               sl.created_at, sl.updated_at
        FROM shopping_learning_fts
        JOIN shopping_learning sl ON sl.rowid = shopping_learning_fts.rowid
        WHERE shopping_learning_fts MATCH ? AND sl.workspace_id = ?
        ORDER BY rank
        LIMIT ?
      `).all(query, workspaceId, limit) as any[];

      return rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        tags: JSON.parse(r.tags || '[]'),
        merchant: r.merchant,
        category: r.category,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch {
      return [];
    }
  }

  /** Get recent learnings scoped to a workspace. */
  async recent(limit: number, workspaceId: string = 'home'): Promise<ShoppingLearning[]> {
    if (!this.db) return [];
    const rows = this.db.prepare(`
      SELECT id, title, content, tags, merchant, category, created_at, updated_at
      FROM shopping_learning
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(workspaceId, limit) as any[];

    return rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      tags: JSON.parse(r.tags || '[]'),
      merchant: r.merchant,
      category: r.category,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  private recallTool(query: string, limit: number, workspaceId: string): Promise<ToolResult> {
    return this.recall(query, limit, workspaceId).then((learnings) => {
      if (learnings.length === 0) {
        return { content: [{ type: 'text', text: `No learnings found for "${query}".` }] };
      }
      const lines = [`**Shopping Learnings: "${query}"**`, ''];
      for (const l of learnings) {
        const merchant = l.merchant ? ` [${l.merchant}]` : '';
        lines.push(`### ${l.title}${merchant}`);
        lines.push(l.content);
        lines.push(`Tags: ${l.tags.join(', ')} | ${l.createdAt}`);
        lines.push('');
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    });
  }

  private async recommend(items: string[], workspaceId: string): Promise<ToolResult> {
    const lines = ['**Shopping Recommendations**', ''];
    let foundAny = false;

    for (const item of items) {
      const learnings = await this.recall(item, 3, workspaceId);
      if (learnings.length > 0) {
        foundAny = true;
        lines.push(`### ${item}`);
        for (const l of learnings) {
          lines.push(`- **${l.title}:** ${l.content}`);
        }
        lines.push('');
      }
    }

    if (!foundAny) {
      lines.push('No relevant learnings found for these items. Results will be based on current merchant data.');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  private writeMarkdown(
    id: string, title: string, content: string,
    tags: string[], merchant: string | null, category: string,
  ): void {
    const dir = path.join(LEARNING_DIR, category);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    const filePath = path.join(dir, `${slug}.md`);
    const tmpPath = filePath + '.tmp';

    const frontmatter = [
      '---',
      `id: ${id}`,
      `title: ${title}`,
      `tags: [${tags.join(', ')}]`,
      merchant ? `merchant: ${merchant}` : null,
      `category: ${category}`,
      `created_at: ${new Date().toISOString()}`,
      '---',
    ].filter(Boolean).join('\n');

    const fullContent = `${frontmatter}\n\n${content}\n`;

    writeFileSync(tmpPath, fullContent, 'utf-8');
    renameSync(tmpPath, filePath);
  }
}
