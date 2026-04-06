import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import type { ProductResult, MerchantPlugin } from '../../../shared/shopping-types.js';
import { serviceRegistry } from '../../automation/service-registry.js';
import { browserManager } from '../../automation/browser-manager.js';
import { safeNavigate, humanDelay, retryWithBackoff } from '../../automation/page-helpers.js';
import { SELECTORS, URLS } from './selectors.js';

// Register browser config for Sprouts login flow
// SSO goes: shop.sprouts.com/login → Azure B2C → back to storefront
// The 'cu' (customer) cookie only appears after successful authentication
serviceRegistry.register({
  serviceId: 'sprouts',
  loginUrl: URLS.login,
  loginDetection: { type: 'cookie', value: 'cu', timeout: 180_000 },
});

const manifest: PluginManifest = {
  id: 'sprouts',
  name: 'Sprouts',
  description: 'Search Sprouts Farmers Market products with pricing and availability',
  version: '0.2.0',
  icon: 'shopping-cart',
  category: 'shopping',
  requiresAuth: false,
  authType: 'browser',
  toolPrefix: 'sprouts',
  connection: 'sprouts',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'sprouts_search',
    description: 'Search Sprouts products by name or keyword. Returns structured product data including brand, price, size, price-per-unit, and availability.',
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

/** Parse a price string like "$5.49" or "$549" into integer cents. */
function parsePriceCents(raw: string): number {
  // Handle "$599" format (Instacart compact) vs "$5.99"
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (cleaned.includes('.')) {
    return Math.round(parseFloat(cleaned) * 100);
  }
  // No decimal — could be cents already (e.g., "599" = $5.99)
  const val = parseInt(cleaned, 10);
  return isNaN(val) ? 0 : val;
}

export class SproutsPlugin implements ServerPlugin, MerchantPlugin {
  manifest = manifest;
  tools = tools;
  readonly merchantId = 'sprouts' as const;

  async initialize(deps: PluginDependencies): Promise<void> {
    deps.logger('Sprouts plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'sprouts_search': {
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
          content: [{ type: 'text', text: 'Not logged in to Sprouts. Please log in via the Shopping panel in the sidebar.' }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: `Sprouts error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}

  /** Public structured search — used by aggregation plugin directly. */
  async searchProducts(query: string, maxResults: number): Promise<ProductResult[]> {
    const page = await browserManager.getPage('sprouts');
    try {
      const searchUrl = URLS.search(query);
      const ok = await safeNavigate(page, searchUrl, { waitUntil: 'domcontentloaded' });
      if (!ok) return [];
      // Wait for Instacart SPA to render products
      await humanDelay(4000, 6000);

      const rawProducts = await retryWithBackoff(async () => {
        return await page.evaluate((cardSelector: string) => {
          const cards = document.querySelectorAll(cardSelector);
          const items: {
            name: string; brand: string; priceCents: number; size: string;
            imageUrl: string; url: string;
          }[] = [];

          cards.forEach((card) => {
            const text = card.innerText || '';
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            // Instacart card text pattern:
            // "Brand Name", "Current price: $X.XX", "$XXX", ["Original Price: $Y.YY", "$YYY"],
            // "Product Name", "★★★★★", "★★★★★", "(reviews)", "Size"
            if (lines.length < 3) return;

            let brand = '';
            let priceStr = '';
            let name = '';
            let size = '';

            // First line is usually the brand
            if (!lines[0].startsWith('$') && !lines[0].startsWith('Current')) {
              brand = lines[0];
            }

            // Find the first "Current price:" line for the price
            for (const line of lines) {
              if (line.startsWith('Current price:')) {
                priceStr = line.replace('Current price:', '').trim();
                break;
              }
            }
            // Fallback: find first line starting with $
            if (!priceStr) {
              for (const line of lines) {
                if (/^\$\d/.test(line) && line.includes('.')) {
                  priceStr = line;
                  break;
                }
              }
            }

            // Product name: the longest line that's not a price, brand, stars, or size
            const nameCandidate = lines.find(l =>
              l !== brand &&
              !l.startsWith('$') &&
              !l.startsWith('Current') &&
              !l.startsWith('Original') &&
              !l.includes('★') &&
              !/^\(\d+\)$/.test(l) &&
              l.length > 5
            );
            name = nameCandidate || '';

            // Size: last line that looks like a measurement (e.g., "32 oz", "5.3 oz", "6 ct")
            for (let i = lines.length - 1; i >= 0; i--) {
              if (/\d+(\.\d+)?\s*(oz|lb|ct|gal|fl\s*oz|ml|l|kg|g|pack|count)\b/i.test(lines[i])) {
                size = lines[i];
                break;
              }
            }

            // Image
            const imgEl = card.querySelector('[data-testid="item-card-image"]') as HTMLImageElement | null;
            const imageUrl = imgEl?.src || imgEl?.srcset?.split(',')[0]?.trim().split(' ')[0] || '';

            // Link
            const linkEl = card.querySelector('a[role="button"], a[href*="/store/"]') as HTMLAnchorElement | null;
            const url = linkEl?.href || '';

            // Parse price
            const priceMatch = priceStr.match(/\$?([\d.]+)/);
            const priceCents = priceMatch ? Math.round(parseFloat(priceMatch[1]) * 100) : 0;

            if (name && priceCents > 0) {
              items.push({ name, brand, priceCents, size, imageUrl, url });
            }
          });

          return items;
        }, SELECTORS.searchResultItem);
      }, { maxRetries: 2 });

      await page.close();

      return rawProducts.slice(0, maxResults).map((p) => {
        // Parse unit price from size
        const unitInfo = parseSize(p.size);
        const pricePerUnit = unitInfo.amount > 0 ? Math.round(p.priceCents / unitInfo.amount) : 0;

        return {
          merchant: 'sprouts' as const,
          name: p.name,
          brand: p.brand,
          priceCents: p.priceCents,
          quantity: p.size,
          pricePerUnitCents: pricePerUnit,
          unit: (unitInfo.unit || 'each') as ProductResult['unit'],
          url: p.url ? new URL(p.url, URLS.base).href : '',
          imageUrl: p.imageUrl,
          inStock: true,
          deliveryAvailable: true,
          deliveryEstimate: 'Same day',
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
    const lines = [`**Sprouts Search: "${query}"**`, ''];
    for (const p of results) {
      const price = p.priceCents ? ` — $${(p.priceCents / 100).toFixed(2)}` : '';
      const unit = p.pricePerUnitCents ? ` ($${(p.pricePerUnitCents / 100).toFixed(2)}/${p.unit})` : '';
      const brand = p.brand ? ` [${p.brand}]` : '';
      const qty = p.quantity ? ` ${p.quantity}` : '';
      lines.push(`- **${p.name}**${brand}${price}${unit}${qty}`);
    }
    lines.push('', `${results.length} results`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
}

/** Parse a size string like "32 oz" or "6 ct" into amount and unit. */
function parseSize(size: string): { amount: number; unit: string } {
  const match = size.match(/([\d.]+)\s*(oz|fl\s*oz|lb|ct|gal|ml|l|kg|g|pack|count|each)/i);
  if (match) {
    return { amount: parseFloat(match[1]), unit: match[2].toLowerCase().replace(/\s+/g, ' ') };
  }
  return { amount: 0, unit: 'each' };
}
