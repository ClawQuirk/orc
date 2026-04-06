import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import type { ProductResult, MerchantPlugin } from '../../../shared/shopping-types.js';
import { serviceRegistry } from '../../automation/service-registry.js';
import { browserManager } from '../../automation/browser-manager.js';
import { safeNavigate, humanDelay, retryWithBackoff } from '../../automation/page-helpers.js';
import { SELECTORS, URLS } from './selectors.js';

serviceRegistry.register({
  serviceId: 'target',
  loginUrl: URLS.login,
  loginDetection: { type: 'cookie', value: 'accessToken', timeout: 180_000 },
});

const manifest: PluginManifest = {
  id: 'target',
  name: 'Target',
  description: 'Search Target products with pricing, unit costs, and fulfillment options',
  version: '0.1.0',
  icon: 'shopping-cart',
  category: 'shopping',
  requiresAuth: false,
  authType: 'browser',
  toolPrefix: 'target',
  connection: 'target',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'target_search',
    description: 'Search Target products by name or keyword. Returns structured product data including brand, price, size, price-per-unit, and delivery/pickup options. Requires Target login.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "greek yogurt")' },
        maxResults: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
];

export class TargetPlugin implements ServerPlugin, MerchantPlugin {
  manifest = manifest;
  tools = tools;
  readonly merchantId = 'target' as const;

  async initialize(deps: PluginDependencies): Promise<void> {
    deps.logger('Target plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'target_search': {
          const results = await this.searchProducts(
            args.query as string,
            (args.maxResults as number) ?? 10,
          );
          return this.formatResults(args.query as string, results);
        }
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      if (err.message?.includes('No saved session')) {
        return {
          content: [{ type: 'text', text: 'Not logged in to Target. Please log in via the Shopping panel in the sidebar.' }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: `Target error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}

  async searchProducts(query: string, maxResults: number): Promise<ProductResult[]> {
    const page = await browserManager.getPage('target');
    try {
      const ok = await safeNavigate(page, URLS.search(query), { waitUntil: 'domcontentloaded' });
      if (!ok) return [];
      // Wait for React to render product cards
      await humanDelay(4000, 6000);

      const rawProducts = await retryWithBackoff(async () => {
        return await page.evaluate((sel) => {
          const items: {
            name: string; brand: string; price: string; unitPrice: string;
            imageUrl: string; url: string; outOfStock: boolean; fulfillment: string;
          }[] = [];

          const cards = document.querySelectorAll(sel.searchResultItem);
          cards.forEach((card) => {
            const nameEl = card.querySelector(sel.productName);
            const name = nameEl?.textContent?.trim() ?? '';
            if (!name) return;

            const brand = card.querySelector(sel.productBrand)?.textContent?.trim() ?? '';
            const price = card.querySelector(sel.productPrice)?.textContent?.trim() ?? '';
            const unitPrice = card.querySelector(sel.productUnit)?.textContent?.trim() ?? '';
            const imgEl = card.querySelector(sel.productImage) as HTMLImageElement | null;
            const linkEl = card.querySelector(sel.productLink) as HTMLAnchorElement | null;
            const outOfStock = !!card.querySelector(sel.outOfStock);
            const fulfillment = card.querySelector(sel.fulfillment)?.textContent?.trim() ?? '';

            items.push({
              name, brand, price, unitPrice,
              imageUrl: imgEl?.src ?? '',
              url: linkEl?.href ?? '',
              outOfStock, fulfillment,
            });
          });
          return items;
        }, SELECTORS);
      }, { maxRetries: 2 });

      await page.close();

      return rawProducts.slice(0, maxResults).map((p) => {
        const priceCents = parsePriceCents(p.price);
        const parsed = parseUnitPrice(p.unitPrice);
        return {
          merchant: 'target' as const,
          name: p.name,
          brand: p.brand,
          priceCents,
          quantity: extractSize(p.name),
          pricePerUnitCents: parsed.cents,
          unit: (parsed.unit || 'each') as ProductResult['unit'],
          url: p.url ? new URL(p.url, URLS.base).href : '',
          imageUrl: p.imageUrl,
          inStock: !p.outOfStock,
          deliveryAvailable: !!p.fulfillment,
          deliveryEstimate: p.fulfillment,
        };
      });
    } catch (err: any) {
      try { await page.close(); } catch { /* ignore */ }
      throw err;
    }
  }

  private formatResults(query: string, results: ProductResult[]): ToolResult {
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No products found for "${query}".` }] };
    }
    const lines = [`**Target Search: "${query}"**`, ''];
    for (const p of results) {
      const price = p.priceCents ? ` — $${(p.priceCents / 100).toFixed(2)}` : '';
      const unit = p.pricePerUnitCents ? ` ($${(p.pricePerUnitCents / 100).toFixed(2)}/${p.unit})` : '';
      const brand = p.brand ? ` [${p.brand}]` : '';
      const qty = p.quantity ? ` ${p.quantity}` : '';
      const stock = p.inStock ? '' : ' -- Out of stock';
      lines.push(`- **${p.name}**${brand}${price}${unit}${qty}${stock}`);
    }
    lines.push('', `${results.length} results`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
}

/** Parse "$5.99" into integer cents. */
function parsePriceCents(raw: string): number {
  const match = raw.match(/\$?([\d,]+\.?\d*)/);
  if (!match) return 0;
  return Math.round(parseFloat(match[1].replace(/,/g, '')) * 100);
}

/** Parse Target unit price like "($0.23/ounce)" into cents and unit. */
function parseUnitPrice(raw: string): { cents: number; unit: string } {
  const match = raw.match(/\$?([\d.]+)\s*\/\s*(\w+)/);
  if (match) {
    return {
      cents: Math.round(parseFloat(match[1]) * 100),
      unit: normalizeUnit(match[2]),
    };
  }
  return { cents: 0, unit: 'each' };
}

/** Extract product size from name, e.g. "Greek Yogurt - 32oz" → "32oz". */
function extractSize(name: string): string {
  // Match patterns like "32oz", "5.3oz Cups", "6ct", "3 lb", "12g Protein 4ct/5.3oz"
  const match = name.match(/(\d+(?:\.\d+)?\s*(?:oz|fl\s*oz|lb|ct|gal|ml|l|kg|g|pack|count)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:oz|fl\s*oz))?(?:\s+\w+)?)/i);
  return match ? match[1].trim() : '';
}

function normalizeUnit(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === 'ounce' || lower === 'ounces') return 'oz';
  if (lower === 'pound' || lower === 'pounds') return 'lb';
  if (lower === 'count') return 'ct';
  if (lower === 'gallon') return 'gal';
  if (lower === 'liter') return 'l';
  return lower;
}
