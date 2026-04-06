import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import type { ProductResult, MerchantPlugin, MerchantId, AggregatedItemResult, ShoppingListResult } from '../../../shared/shopping-types.js';
import type Database from 'better-sqlite3-multiple-ciphers';
import { browserManager } from '../../automation/browser-manager.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_CLEANUP_AGE_MS = 60 * 60 * 1000; // 1 hour

const manifest: PluginManifest = {
  id: 'shopping-aggregate',
  name: 'Shopping',
  description: 'Cross-merchant product search, list comparison, and cart optimization',
  version: '0.1.0',
  icon: 'shopping-cart',
  category: 'shopping',
  requiresAuth: false,
  authType: 'none',
  toolPrefix: 'shopping',
  connection: 'local',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'shopping_search',
    description: 'Search for a product across ALL logged-in merchants (Sprouts, Costco, Target, Amazon, Newegg). Returns normalized results grouped by merchant with price comparison. Use this when the user asks about a specific product.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product search query' },
        maxPerMerchant: { type: 'number', description: 'Max results per merchant (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'shopping_list',
    description: 'Search for multiple items across ALL logged-in merchants. Takes a shopping list and returns results per item with best price and best value highlighted. Use when the user shares a grocery or shopping list.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of items to search for (e.g., ["organic greek yogurt", "avocados", "chicken breast"])',
        },
        maxPerMerchant: { type: 'number', description: 'Max results per merchant per item (default 3)' },
      },
      required: ['items'],
    },
  },
  {
    name: 'shopping_compare',
    description: 'Compare a product across all merchants in a table format. Shows brand, price, quantity, price/unit side by side. Best for answering "Where should I buy X?"',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product to compare' },
      },
      required: ['query'],
    },
  },
];

export class ShoppingAggregatePlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private merchants: MerchantPlugin[] = [];
  private db: Database.Database | null = null;

  setMerchantPlugins(merchants: MerchantPlugin[]): void {
    this.merchants = merchants;
  }

  async initialize(deps: PluginDependencies): Promise<void> {
    this.db = deps.db;
    // Clean up stale cache entries on init
    this.cleanupCache();
    deps.logger('Shopping aggregate plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case 'shopping_search': {
        const result = await this.searchAll(args.query as string, (args.maxPerMerchant as number) ?? 5);
        return this.formatAggregatedItem(result);
      }
      case 'shopping_list': {
        const items = args.items as string[];
        const result = await this.searchList(items, (args.maxPerMerchant as number) ?? 3);
        return this.formatShoppingList(result);
      }
      case 'shopping_compare': {
        const result = await this.searchAll(args.query as string, 5);
        return this.formatComparisonTable(result);
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}

  /** Search all logged-in merchants for a single query. */
  async searchAll(query: string, maxPerMerchant: number): Promise<AggregatedItemResult> {
    const loggedIn = this.getLoggedInMerchants();
    const searched: MerchantId[] = [];
    const failed: MerchantId[] = [];
    const allResults: ProductResult[] = [];

    const promises = loggedIn.map(async (merchant) => {
      try {
        // Check cache first
        const cached = this.getCachedResults(query, merchant.merchantId);
        if (cached) {
          searched.push(merchant.merchantId);
          return cached.slice(0, maxPerMerchant);
        }

        const results = await merchant.searchProducts(query, maxPerMerchant);
        searched.push(merchant.merchantId);
        // Cache the results
        this.cacheResults(query, merchant.merchantId, results);
        return results;
      } catch {
        failed.push(merchant.merchantId);
        return [];
      }
    });

    const settled = await Promise.allSettled(promises);
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      }
    }

    const bestPrice = allResults.length > 0
      ? allResults.reduce((min, p) => (p.priceCents > 0 && p.priceCents < min.priceCents) ? p : min, allResults.filter(p => p.priceCents > 0)[0] ?? null)
      : null;

    const bestValue = allResults.length > 0
      ? allResults.reduce((min, p) => (p.pricePerUnitCents > 0 && p.pricePerUnitCents < min.pricePerUnitCents) ? p : min, allResults.filter(p => p.pricePerUnitCents > 0)[0] ?? null)
      : null;

    return { query, results: allResults, bestPrice, bestValue, searchedMerchants: searched, failedMerchants: failed };
  }

  /** Search all merchants for a list of items. */
  async searchList(items: string[], maxPerMerchant: number): Promise<ShoppingListResult> {
    const itemResults: AggregatedItemResult[] = [];

    // Search items sequentially to avoid overwhelming merchants with parallel requests
    for (const item of items) {
      const result = await this.searchAll(item, maxPerMerchant);
      itemResults.push(result);
    }

    const totalEstimatedCents = itemResults.reduce((sum, item) => {
      return sum + (item.bestPrice?.priceCents ?? 0);
    }, 0);

    return {
      items: itemResults,
      totalEstimatedCents,
      searchedAt: new Date().toISOString(),
    };
  }

  private getLoggedInMerchants(): MerchantPlugin[] {
    return this.merchants.filter((m) => {
      try {
        const sessions = browserManager.listSessions();
        return sessions.some(s => s.serviceId === m.merchantId && s.contextExists);
      } catch {
        return false;
      }
    });
  }

  private getCachedResults(query: string, merchant: MerchantId): ProductResult[] | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(
        `SELECT results, fetched_at FROM shopping_cache WHERE query = ? AND merchant = ?`
      ).get(query.toLowerCase(), merchant) as { results: string; fetched_at: string } | undefined;

      if (!row) return null;
      const age = Date.now() - new Date(row.fetched_at + 'Z').getTime();
      if (age > CACHE_TTL_MS) return null;
      return JSON.parse(row.results);
    } catch {
      return null;
    }
  }

  private cacheResults(query: string, merchant: MerchantId, results: ProductResult[]): void {
    if (!this.db) return;
    try {
      this.db.prepare(
        `INSERT OR REPLACE INTO shopping_cache (query, merchant, results, fetched_at) VALUES (?, ?, ?, datetime('now'))`
      ).run(query.toLowerCase(), merchant, JSON.stringify(results));
    } catch { /* cache is best-effort */ }
  }

  private cleanupCache(): void {
    if (!this.db) return;
    try {
      const cutoff = new Date(Date.now() - CACHE_CLEANUP_AGE_MS).toISOString();
      this.db.prepare(`DELETE FROM shopping_cache WHERE fetched_at < ?`).run(cutoff);
    } catch { /* cleanup is best-effort */ }
  }

  private formatAggregatedItem(item: AggregatedItemResult): ToolResult {
    const lines = [`**Shopping Search: "${item.query}"**`, ''];

    if (item.results.length === 0) {
      lines.push('No products found across any merchant.');
      if (item.failedMerchants.length > 0) {
        lines.push(`Failed merchants: ${item.failedMerchants.join(', ')}`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    if (item.bestPrice) {
      lines.push(`Best price: **$${(item.bestPrice.priceCents / 100).toFixed(2)}** at ${item.bestPrice.merchant} — ${item.bestPrice.name}`);
    }
    if (item.bestValue && item.bestValue !== item.bestPrice) {
      lines.push(`Best value: **$${(item.bestValue.pricePerUnitCents / 100).toFixed(2)}/${item.bestValue.unit}** at ${item.bestValue.merchant} — ${item.bestValue.name}`);
    }
    lines.push('');

    // Group by merchant
    const byMerchant = new Map<string, ProductResult[]>();
    for (const r of item.results) {
      const list = byMerchant.get(r.merchant) ?? [];
      list.push(r);
      byMerchant.set(r.merchant, list);
    }

    for (const [merchant, products] of byMerchant) {
      lines.push(`**${merchant.charAt(0).toUpperCase() + merchant.slice(1)}:**`);
      for (const p of products) {
        const price = p.priceCents ? `$${(p.priceCents / 100).toFixed(2)}` : 'N/A';
        const unit = p.pricePerUnitCents ? ` ($${(p.pricePerUnitCents / 100).toFixed(2)}/${p.unit})` : '';
        const brand = p.brand ? ` [${p.brand}]` : '';
        const stock = p.inStock ? '' : ' ⚠️ Out of stock';
        lines.push(`  - ${p.name}${brand} — ${price}${unit}${stock}`);
      }
    }

    lines.push('');
    lines.push(`Searched: ${item.searchedMerchants.join(', ')}`);
    if (item.failedMerchants.length > 0) {
      lines.push(`Failed: ${item.failedMerchants.join(', ')}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  private formatShoppingList(list: ShoppingListResult): ToolResult {
    const lines = ['**Shopping List Results**', ''];

    for (const item of list.items) {
      const best = item.bestPrice;
      const value = item.bestValue;
      const bestStr = best ? `$${(best.priceCents / 100).toFixed(2)} at ${best.merchant}` : 'N/A';
      const valueStr = value ? `$${(value.pricePerUnitCents / 100).toFixed(2)}/${value.unit} at ${value.merchant}` : '';
      lines.push(`### ${item.query}`);
      lines.push(`Best price: ${bestStr}${valueStr ? ` | Best value: ${valueStr}` : ''}`);
      lines.push(`${item.results.length} options across ${item.searchedMerchants.join(', ')}`);
      lines.push('');
    }

    lines.push(`**Estimated total: $${(list.totalEstimatedCents / 100).toFixed(2)}** (${list.items.length} items, best price per item)`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  private formatComparisonTable(item: AggregatedItemResult): ToolResult {
    const lines = [`**Comparison: "${item.query}"**`, ''];

    if (item.results.length === 0) {
      lines.push('No products found.');
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    lines.push('| Merchant | Brand | Price | Qty | $/Unit | Delivery | Stock |');
    lines.push('|----------|-------|-------|-----|--------|----------|-------|');

    // Sort by price per unit
    const sorted = [...item.results].sort((a, b) => {
      if (a.pricePerUnitCents === 0) return 1;
      if (b.pricePerUnitCents === 0) return -1;
      return a.pricePerUnitCents - b.pricePerUnitCents;
    });

    for (const p of sorted) {
      const merchant = p.merchant.charAt(0).toUpperCase() + p.merchant.slice(1);
      const price = p.priceCents ? `$${(p.priceCents / 100).toFixed(2)}` : 'N/A';
      const unit = p.pricePerUnitCents ? `$${(p.pricePerUnitCents / 100).toFixed(2)}/${p.unit}` : 'N/A';
      const stock = p.inStock ? 'In stock' : 'Out';
      const delivery = p.deliveryEstimate || (p.deliveryAvailable ? 'Yes' : 'No');
      lines.push(`| ${merchant} | ${p.brand || '-'} | ${price} | ${p.quantity || '-'} | ${unit} | ${delivery} | ${stock} |`);
    }

    lines.push('');
    lines.push(`Searched: ${item.searchedMerchants.join(', ')}`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
}
