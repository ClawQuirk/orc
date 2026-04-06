import type { ProductResult, AggregatedItemResult, ShoppingListResult, ShoppingLearning } from '../../shared/shopping-types.js';

export type { ProductResult, AggregatedItemResult, ShoppingListResult, ShoppingLearning };

export interface MerchantStatus {
  id: string;
  name: string;
  loggedIn: boolean;
  lastUsed: string | null;
}

const json = (r: Response) => r.json();
const headers = { 'Content-Type': 'application/json' };

export const shoppingApi = {
  merchants: (): Promise<{ merchants: MerchantStatus[] }> =>
    fetch('/api/shopping/merchants').then(json),

  searchSingle: (query: string): Promise<AggregatedItemResult> =>
    fetch(`/api/shopping/search?q=${encodeURIComponent(query)}`).then(json),

  searchList: (items: string[], maxPerMerchant?: number): Promise<ShoppingListResult> =>
    fetch('/api/shopping/search-list', {
      method: 'POST',
      headers,
      body: JSON.stringify({ items, maxPerMerchant }),
    }).then(json),

  learnings: (query?: string): Promise<{ learnings: ShoppingLearning[] }> =>
    fetch(`/api/shopping/learnings${query ? `?q=${encodeURIComponent(query)}` : ''}`).then(json),
};
