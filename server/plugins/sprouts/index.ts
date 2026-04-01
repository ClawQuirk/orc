import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { serviceRegistry } from '../../automation/service-registry.js';
import { browserManager } from '../../automation/browser-manager.js';
import { safeNavigate, humanDelay, screenshotOnFailure, retryWithBackoff } from '../../automation/page-helpers.js';
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
  description: 'Browse Sprouts Farmers Market weekly deals and search products',
  version: '0.1.0',
  icon: 'shopping-cart',
  category: 'shopping',
  requiresAuth: false,
  authType: 'browser',
  toolPrefix: 'sprouts',
  connection: 'sprouts',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'sprouts_deals',
    description: 'Get current Sprouts weekly deals. Returns product names, prices, and sale info.',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Max deals to return (default 20)' },
      },
    },
  },
  {
    name: 'sprouts_search',
    description: 'Search Sprouts products by name or keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "organic avocado")' },
        maxResults: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
];

export class SproutsPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;

  async initialize(deps: PluginDependencies): Promise<void> {
    deps.logger('Sprouts plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'sprouts_deals':
          return await this.getWeeklyDeals((args.maxResults as number) ?? 20);
        case 'sprouts_search':
          return await this.searchProducts(
            args.query as string,
            (args.maxResults as number) ?? 10,
          );
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

  private async getWeeklyDeals(maxResults: number): Promise<ToolResult> {
    const page = await browserManager.getPage('sprouts');
    try {
      const ok = await safeNavigate(page, URLS.weeklyAd, { waitUntil: 'networkidle' });
      if (!ok) {
        return { content: [{ type: 'text', text: 'Failed to load Sprouts weekly ad page.' }], isError: true };
      }
      await humanDelay(1000, 2000);

      // Try to extract deal items from the flyer page
      const deals = await retryWithBackoff(async () => {
        return await page.evaluate((sel) => {
          const items: { name: string; price: string; detail: string }[] = [];

          // Strategy 1: Look for flyer items
          const flyerItems = document.querySelectorAll(sel.flyerItem);
          if (flyerItems.length > 0) {
            flyerItems.forEach((item) => {
              const name = item.querySelector(sel.flyerItemName)?.textContent?.trim() ?? '';
              const price = item.querySelector(sel.flyerItemPrice)?.textContent?.trim() ?? '';
              const size = item.querySelector(sel.flyerItemSize)?.textContent?.trim() ?? '';
              if (name) items.push({ name, price, detail: size });
            });
            return items;
          }

          // Strategy 2: Broader search for product-like elements with prices
          const allCards = document.querySelectorAll('[class*="card"], [class*="Card"], [class*="product"], [class*="Product"], [class*="item"], [class*="Item"]');
          allCards.forEach((card) => {
            const nameEl = card.querySelector('h2, h3, h4, [class*="name"], [class*="Name"], [class*="title"], [class*="Title"]');
            const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
            const name = nameEl?.textContent?.trim() ?? '';
            const price = priceEl?.textContent?.trim() ?? '';
            if (name && price && name.length < 100) {
              items.push({ name, price, detail: '' });
            }
          });
          return items;
        }, SELECTORS);
      }, { maxRetries: 2 });

      await page.close();

      if (deals.length === 0) {
        // Take a screenshot for debugging
        const page2 = await browserManager.getPage('sprouts');
        await safeNavigate(page2, URLS.weeklyAd, { waitUntil: 'networkidle' });
        await humanDelay();
        const screenshot = await screenshotOnFailure(page2, 'sprouts', 'weekly-deals');
        await page2.close();
        return {
          content: [{ type: 'text', text: `No deals found on the weekly ad page. The page layout may have changed. Debug screenshot saved: ${screenshot}` }],
          isError: true,
        };
      }

      const limited = deals.slice(0, maxResults);
      const lines = ['**Sprouts Weekly Deals**', ''];
      for (const deal of limited) {
        const detail = deal.detail ? ` (${deal.detail})` : '';
        lines.push(`- **${deal.name}** — ${deal.price}${detail}`);
      }
      lines.push('', `Showing ${limited.length} of ${deals.length} deals`);

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err: any) {
      try { await page.close(); } catch { /* ignore */ }
      throw err;
    }
  }

  private async searchProducts(query: string, maxResults: number): Promise<ToolResult> {
    const page = await browserManager.getPage('sprouts');
    try {
      const searchUrl = URLS.search(query);
      const ok = await safeNavigate(page, searchUrl, { waitUntil: 'networkidle' });
      if (!ok) {
        return { content: [{ type: 'text', text: `Failed to load search results for "${query}".` }], isError: true };
      }
      await humanDelay(1000, 2000);

      const products = await retryWithBackoff(async () => {
        return await page.evaluate((sel) => {
          const items: { name: string; price: string; unit: string }[] = [];
          const cards = document.querySelectorAll(sel.searchResultItem);

          if (cards.length > 0) {
            cards.forEach((card) => {
              const name = card.querySelector(sel.productName)?.textContent?.trim() ?? '';
              const price = card.querySelector(sel.productPrice)?.textContent?.trim() ?? '';
              const unit = card.querySelector(sel.productUnit)?.textContent?.trim() ?? '';
              if (name) items.push({ name, price, unit });
            });
            return items;
          }

          // Fallback: broader product detection
          const allCards = document.querySelectorAll('[class*="product"], [class*="Product"], [class*="item-card"], [class*="ItemCard"]');
          allCards.forEach((card) => {
            const nameEl = card.querySelector('h2, h3, h4, [class*="name"], [class*="Name"], [class*="title"], [class*="Title"]');
            const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
            const name = nameEl?.textContent?.trim() ?? '';
            const price = priceEl?.textContent?.trim() ?? '';
            if (name && name.length < 100) {
              items.push({ name, price, unit: '' });
            }
          });
          return items;
        }, SELECTORS);
      }, { maxRetries: 2 });

      await page.close();

      if (products.length === 0) {
        return { content: [{ type: 'text', text: `No products found for "${query}".` }] };
      }

      const limited = products.slice(0, maxResults);
      const lines = [`**Sprouts Search: "${query}"**`, ''];
      for (const p of limited) {
        const unit = p.unit ? ` (${p.unit})` : '';
        const price = p.price ? ` — ${p.price}` : '';
        lines.push(`- **${p.name}**${price}${unit}`);
      }
      lines.push('', `Showing ${limited.length} of ${products.length} results`);

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err: any) {
      try { await page.close(); } catch { /* ignore */ }
      throw err;
    }
  }
}
