import type { Router } from '../router.js';
import { sendJson, readJsonBody, getQueryParams } from '../router.js';
import type { ShoppingAggregatePlugin } from '../plugins/shopping-aggregate/index.js';
import type { ShoppingLearningPlugin } from '../plugins/shopping-learning/index.js';
import { browserManager } from '../automation/browser-manager.js';
import { serviceRegistry } from '../automation/service-registry.js';

const SHOPPING_MERCHANTS = ['sprouts', 'costco', 'target', 'amazon', 'newegg'];

export function registerShoppingRoutes(
  router: Router,
  aggregatePlugin: ShoppingAggregatePlugin,
  learningPlugin: ShoppingLearningPlugin,
): void {

  // Which merchants are logged in?
  router.get('/api/shopping/merchants', (_req, res) => {
    const merchants = SHOPPING_MERCHANTS
      .filter(id => serviceRegistry.has(id))
      .map(id => {
        const info = browserManager.getSessionInfo(id);
        return {
          id,
          name: id.charAt(0).toUpperCase() + id.slice(1),
          loggedIn: info.contextExists,
          lastUsed: info.lastUsed,
        };
      });
    sendJson(res, 200, { merchants });
  });

  // Search all merchants for a single item
  router.get('/api/shopping/search', async (_req, res) => {
    const params = getQueryParams(_req);
    const query = params.get('q');
    if (!query) {
      sendJson(res, 400, { error: 'q parameter required' });
      return;
    }
    try {
      const result = await aggregatePlugin.searchAll(query, 5);
      sendJson(res, 200, result);
    } catch (err: any) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // Search all merchants for a list of items
  router.post('/api/shopping/search-list', async (req, res) => {
    const body = await readJsonBody<{ items: string[]; maxPerMerchant?: number }>(req);
    if (!body.items?.length) {
      sendJson(res, 400, { error: 'items array required' });
      return;
    }
    try {
      const result = await aggregatePlugin.searchList(body.items, body.maxPerMerchant ?? 3);
      sendJson(res, 200, result);
    } catch (err: any) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // Get recent learnings or search learnings
  router.get('/api/shopping/learnings', async (_req, res) => {
    const params = getQueryParams(_req);
    const query = params.get('q');
    try {
      const learnings = query
        ? await learningPlugin.recall(query, 10)
        : await learningPlugin.recent(10);
      sendJson(res, 200, { learnings });
    } catch (err: any) {
      sendJson(res, 500, { error: err.message });
    }
  });
}
