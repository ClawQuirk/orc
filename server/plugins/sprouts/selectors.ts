// Centralized CSS selectors for Sprouts (shop.sprouts.com / Instacart platform).
// Sprouts uses Instacart's React app. Product cards are <li> inside a <ul>,
// each containing a div[role="group"] with brand, price, name, and size as text nodes.
// When Sprouts redesigns, update only this file.

export const SELECTORS = {
  // Product search results — Instacart card structure
  // The card container is a div with role="group" inside each <li>
  searchResultItem: 'div[role="group"]',

  // Product image carries the product name in its alt attribute
  productImage: '[data-testid="item-card-image"]',

  // Instacart doesn't use distinct data-testid for name/brand/price/unit.
  // All text is extracted from the card's innerText which follows this pattern:
  //   "Brand Name | Current price: $X.XX | $XXX | [Original Price: $Y.YY | $YYY |] | Product Name | ★... | (reviews) | Size"
  // Parsing is done in the plugin's page.evaluate(), not via selectors.

  // Login detection
  accountButton: '[data-testid="account-button"], [aria-label="Account"]',
  signInLink: 'a[href*="sign-in"], a[href*="auth"]',
};

export const URLS = {
  base: 'https://shop.sprouts.com',
  login: 'https://shop.sprouts.com/rest/sso/auth/sprouts/init',
  search: (query: string) => `https://shop.sprouts.com/store/sprouts/search/${encodeURIComponent(query)}`,
};
