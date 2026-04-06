import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import type { ProductResult, MerchantPlugin } from '../../../shared/shopping-types.js';
import { serviceRegistry } from '../../automation/service-registry.js';
import { browserManager } from '../../automation/browser-manager.js';
import { safeNavigate, humanDelay, retryWithBackoff } from '../../automation/page-helpers.js';
import { SELECTORS, URLS } from './selectors.js';

// Element-based detection: the signed-in account menu only shows when logged in
serviceRegistry.register({
  serviceId: 'amazon',
  loginUrl: URLS.login,
  loginDetection: { type: 'element', value: '#nav-link-accountList[data-nav-ref="nav_youraccount_btn"]', timeout: 180_000 },
});

const manifest: PluginManifest = {
  id: 'amazon',
  name: 'Amazon',
  description: 'Search Amazon products with pricing, Prime status, and delivery estimates',
  version: '0.1.0',
  icon: 'shopping-cart',
  category: 'shopping',
  requiresAuth: false,
  authType: 'browser',
  toolPrefix: 'amazon',
  connection: 'amazon',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'amazon_search',
    description: 'Search Amazon products by name or keyword. Returns structured product data including brand, price, size, price-per-unit, Prime eligibility, and delivery estimates. Requires Amazon login.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "organic greek yogurt")' },
        maxResults: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
];

function parsePriceCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : Math.round(val * 100);
}

function parseUnitPrice(raw: string): { cents: number; unit: string } {
  const match = raw.match(/\$?([\d.]+)\s*\/\s*(\w+)/);
  if (match) return { cents: Math.round(parseFloat(match[1]) * 100), unit: match[2].toLowerCase() };
  return { cents: 0, unit: 'each' };
}

export class AmazonPlugin implements ServerPlugin, MerchantPlugin {
  manifest = manifest;
  tools = tools;
  readonly merchantId = 'amazon' as const;

  async initialize(deps: PluginDependencies): Promise<void> {
    deps.logger('Amazon plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'amazon_search': {
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
          content: [{ type: 'text', text: 'Not logged in to Amazon. Please log in via the Shopping panel in the sidebar.' }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: `Amazon error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}

  async searchProducts(query: string, maxResults: number): Promise<ProductResult[]> {
    const page = await browserManager.getPage('amazon');
    try {
      const ok = await safeNavigate(page, URLS.search(query), { waitUntil: 'domcontentloaded' });
      if (!ok) return [];
      // Amazon is aggressive about bot detection — longer delays
      await humanDelay(4000, 6000);

      const rawProducts = await retryWithBackoff(async () => {
        return await page.evaluate((sel) => {
          const items: {
            name: string; brand: string; price: string; unitPrice: string;
            imageUrl: string; url: string; outOfStock: boolean; delivery: string; isPrime: boolean;
          }[] = [];

          const cards = document.querySelectorAll(sel.searchResultItem);
          cards.forEach((card) => {
            // Skip sponsored/ad results without product data
            const name = card.querySelector(sel.productName)?.textContent?.trim() ?? '';
            if (!name || name.length > 200) return;

            const brand = card.querySelector(sel.productBrand)?.textContent?.trim() ?? '';
            const priceEl = card.querySelector(sel.productPrice);
            const price = priceEl?.textContent?.trim() ?? '';
            const unitPrice = card.querySelector(sel.productUnit)?.textContent?.trim() ?? '';
            const imgEl = card.querySelector(sel.productImage) as HTMLImageElement | null;
            const linkEl = card.querySelector(sel.productLink) as HTMLAnchorElement | null;
            const deliveryEl = card.querySelector(sel.deliveryTag);
            const delivery = deliveryEl?.textContent?.trim() ?? '';
            const isPrime = !!card.querySelector(sel.primeTag);

            items.push({
              name, brand, price, unitPrice,
              imageUrl: imgEl?.src ?? '',
              url: linkEl?.href ?? '',
              outOfStock: false,
              delivery, isPrime,
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
          merchant: 'amazon' as const,
          name: p.name,
          brand: p.brand || extractBrand(p.name),
          priceCents,
          quantity: extractSize(p.name),
          pricePerUnitCents: parsed.cents,
          unit: (parsed.unit || 'each') as ProductResult['unit'],
          url: p.url ? new URL(p.url, URLS.base).href : '',
          imageUrl: p.imageUrl,
          inStock: !p.outOfStock,
          deliveryAvailable: true,
          deliveryEstimate: p.isPrime ? 'Prime' : (p.delivery || ''),
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
    const lines = [`**Amazon Search: "${query}"**`, ''];
    for (const p of results) {
      const price = p.priceCents ? ` — $${(p.priceCents / 100).toFixed(2)}` : '';
      const unit = p.pricePerUnitCents ? ` ($${(p.pricePerUnitCents / 100).toFixed(2)}/${p.unit})` : '';
      const brand = p.brand ? ` [${p.brand}]` : '';
      const delivery = p.deliveryEstimate ? ` | ${p.deliveryEstimate}` : '';
      const stock = p.inStock ? '' : ' ⚠️ Out of stock';
      lines.push(`- **${p.name}**${brand}${price}${unit}${delivery}${stock}`);
    }
    lines.push('', `${results.length} results`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
}

function extractBrand(name: string): string {
  const words = name.split(/\s+/);
  if (words.length >= 2) {
    const commonAdj = /^(organic|natural|fresh|pure|whole|low|non|free|sugar|gluten|vegan|plant)/i;
    if (!commonAdj.test(words[0])) return words[0];
  }
  return '';
}

function extractSize(name: string): string {
  const match = name.match(/(\d+(?:\.\d+)?\s*(?:oz|fl\s*oz|lb|ct|gal|ml|l|kg|g|pack|count)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:oz|fl\s*oz))?)/i);
  return match ? match[1].trim() : '';
}
