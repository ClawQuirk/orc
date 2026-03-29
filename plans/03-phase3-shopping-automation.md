# Phase 3: Shopping + Browser Automation

## Status: NOT STARTED
## Depends on: Phase 1 complete (Phase 2 independent)

---

## 3A: Playwright Automation Framework

### 3A.1 - Browser Manager
- `server/automation/browser-manager.ts` - Singleton Playwright browser
  - Lazy launch (only when needed)
  - Per-service browser contexts (isolated cookies/storage)
  - Persistent context storage at `data/browser-contexts/` (logins survive restarts)
  - Headless by default, headed for manual login flows
  - Graceful shutdown
- `server/automation/page-helpers.ts` - Reusable utilities
  - `waitForLogin(page, successUrl)` - Open headed browser for manual login
  - `extractTable(page, selector)` - Generic table scraping
  - `retryWithBackoff(fn, maxRetries)` - Retry for flaky selectors
  - `screenshotOnFailure(page, name)` - Debug aid
- `server/automation/types.ts` - Automation result types

**API Endpoints**:
- `POST /api/automation/login/:service` - Open headed browser for manual login
- `GET /api/automation/status/:service` - Check login status (cookie validity)
- `POST /api/automation/logout/:service` - Clear service context

**Package**: `playwright` (install Chromium only: `npx playwright install chromium`)
**Disk**: ~400MB for Chromium binary
**Files**: 4-5 new

---

## 3B: Shopping Plugins

### 3B.1 - Amazon
**Approach**: Dual - PA-API for product search + Playwright for order history/wishlists
- Amazon Creators API (replacing PA-API deprecated April 30, 2026) for product search
- Playwright for order history, wishlists (no API available)
- Each plugin has `selectors.ts` centralizing all CSS/XPath selectors

**Methods**: searchProducts, getProduct, getOrderHistory, getWishlists, getWishlistItems
**MCP Tools**: amazon_search, amazon_orders, amazon_wishlist
**Widget**: Recent orders + wishlist preview
**Risk**: Anti-bot detection on order history pages
**Mitigation**: Persistent browser contexts, human-like delays, manual login
**Files**: 6-7 new

### 3B.2 - Costco (Playwright Only)
**Approach**: Entirely browser automation (no API exists)
- Login via headed browser (manual)
- Scrape order history, current deals, product search

**Methods**: getOrderHistory, getCurrentDeals, searchProducts
**MCP Tools**: costco_orders, costco_deals, costco_search
**Widget**: Current deals + recent orders
**Risk**: Heavy JS rendering, occasional CAPTCHAs
**Mitigation**: Playwright handles JS natively; persistent login avoids repeated CAPTCHAs
**Files**: 6 new

### 3B.3 - Target (Playwright)
**Methods**: searchProducts, getCurrentDeals, getOrderHistory, getCircleOffers
**MCP Tools**: target_search, target_deals, target_orders
**Widget**: Deals + recent orders
**Files**: 6 new

### 3B.4 - Sprouts (Playwright)
**Methods**: getWeeklyDeals, searchProducts, getStoreInfo
**MCP Tools**: sprouts_deals, sprouts_search
**Widget**: Weekly deals
**Files**: 5-6 new

### 3B.5 - Newegg (API + Playwright)
**Approach**: Marketplace API for seller operations + Playwright for consumer features
**Methods**: searchProducts, getProduct, getOrderHistory, getDailyDeals
**MCP Tools**: newegg_search, newegg_orders, newegg_deals
**Widget**: Deals + order history
**Files**: 6 new

### 3B.6 - Purchase Aggregation
- Meta-plugin combining all shopping data
- `server/plugins/purchases/categorizer.ts` - Rule-based merchant->category mapping
- `server/plugins/purchases/receipt-parser.ts` - Parse receipt emails via Gmail plugin
- Cross-service spending analysis: by category, by store, by time period

**MCP Tools**: purchases_search, purchases_spending, purchases_recent
**Widget**: Spending breakdown across all services
**Files**: 5-6 new

---

## Selector Maintenance Strategy

Each Playwright-based plugin has a `selectors.ts` file:
```typescript
// server/plugins/costco/selectors.ts
export const SELECTORS = {
  orderHistory: {
    orderRow: '.order-item-row',
    orderDate: '.order-date',
    orderTotal: '.order-total',
    // ...
  },
  deals: {
    dealCard: '.product-tile',
    dealPrice: '.price',
    // ...
  },
};
```

When selectors break (site redesign), only this one file needs updating per plugin.

---

## Phase 3 Completion Criteria

- [ ] Playwright browser manager launches/shuts down cleanly
- [ ] Manual login flow works (headed browser -> detect success)
- [ ] Amazon: product search + order history viewable
- [ ] Costco: deals + order history viewable
- [ ] Target: deals + orders viewable
- [ ] Sprouts: weekly deals viewable
- [ ] Newegg: product search + deals viewable
- [ ] Purchase aggregator: "How much on groceries this year?" works across stores
- [ ] Receipt parsing extracts purchase data from Gmail
