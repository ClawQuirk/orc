import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import type { ProductResult, MerchantPlugin } from '../../../shared/shopping-types.js';
import { serviceRegistry } from '../../automation/service-registry.js';
import { browserManager } from '../../automation/browser-manager.js';
import { safeNavigate, humanDelay, retryWithBackoff } from '../../automation/page-helpers.js';
import { SELECTORS, URLS } from './selectors.js';

serviceRegistry.register({
  serviceId: 'newegg',
  loginUrl: URLS.login,
  loginDetection: { type: 'element', value: '.nav-complex-inner .nav-complex-title', timeout: 180_000 },
});

const manifest: PluginManifest = {
  id: 'newegg',
  name: 'Newegg',
  description: 'Search Newegg products with pricing and shipping info',
  version: '0.1.0',
  icon: 'shopping-cart',
  category: 'shopping',
  requiresAuth: false,
  authType: 'browser',
  toolPrefix: 'newegg',
  connection: 'newegg',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'newegg_search',
    description: 'Search Newegg products by name or keyword. Returns structured product data including brand, price, and shipping info. Requires Newegg login.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "RTX 4080")' },
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

export class NeweggPlugin implements ServerPlugin, MerchantPlugin {
  manifest = manifest;
  tools = tools;
  readonly merchantId = 'newegg' as const;

  async initialize(deps: PluginDependencies): Promise<void> {
    deps.logger('Newegg plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'newegg_search': {
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
          content: [{ type: 'text', text: 'Not logged in to Newegg. Please log in via the Shopping panel in the sidebar.' }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: `Newegg error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}

  async searchProducts(query: string, maxResults: number): Promise<ProductResult[]> {
    const page = await browserManager.getPage('newegg');
    try {
      const ok = await safeNavigate(page, URLS.search(query), { waitUntil: 'domcontentloaded' });
      if (!ok) return [];
      await humanDelay(1000, 2000);

      const rawProducts = await retryWithBackoff(async () => {
        return await page.evaluate((sel) => {
          const items: {
            name: string; brand: string; price: string;
            imageUrl: string; url: string; outOfStock: boolean; shipping: string;
          }[] = [];

          const cards = document.querySelectorAll(sel.searchResultItem);
          cards.forEach((card) => {
            const name = card.querySelector(sel.productName)?.textContent?.trim() ?? '';
            if (!name) return;

            const brandEl = card.querySelector(sel.productBrand) as HTMLImageElement | null;
            const brand = brandEl?.title ?? brandEl?.textContent?.trim() ?? '';
            const price = card.querySelector(sel.productPrice)?.textContent?.trim() ?? '';
            const imgEl = card.querySelector(sel.productImage) as HTMLImageElement | null;
            const linkEl = card.querySelector(sel.productLink) as HTMLAnchorElement | null;
            const outOfStock = !!card.querySelector(sel.outOfStock);
            const shipping = card.querySelector(sel.shippingTag)?.textContent?.trim() ?? '';

            items.push({ name, brand, price, imageUrl: imgEl?.src ?? '', url: linkEl?.href ?? '', outOfStock, shipping });
          });
          return items;
        }, SELECTORS);
      }, { maxRetries: 2 });

      await page.close();

      return rawProducts.slice(0, maxResults).map((p) => {
        const priceCents = parsePriceCents(p.price);
        const isFreeShipping = p.shipping.toLowerCase().includes('free');
        return {
          merchant: 'newegg' as const,
          name: p.name,
          brand: p.brand,
          priceCents,
          quantity: '1',
          pricePerUnitCents: priceCents,  // Electronics: price = price per unit
          unit: 'each' as const,
          url: p.url ? new URL(p.url, URLS.base).href : '',
          imageUrl: p.imageUrl,
          inStock: !p.outOfStock,
          deliveryAvailable: true,
          deliveryEstimate: isFreeShipping ? 'Free shipping' : (p.shipping || ''),
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
    const lines = [`**Newegg Search: "${query}"**`, ''];
    for (const p of results) {
      const price = p.priceCents ? ` — $${(p.priceCents / 100).toFixed(2)}` : '';
      const brand = p.brand ? ` [${p.brand}]` : '';
      const delivery = p.deliveryEstimate ? ` | ${p.deliveryEstimate}` : '';
      const stock = p.inStock ? '' : ' ⚠️ Out of stock';
      lines.push(`- **${p.name}**${brand}${price}${delivery}${stock}`);
    }
    lines.push('', `${results.length} results`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
}
