// Centralized CSS selectors for Sprouts (shop.sprouts.com / Instacart platform).
// When Sprouts redesigns, update only this file.

export const SELECTORS = {
  // Login detection
  accountButton: '[data-testid="account-button"], [aria-label="Account"]',
  signInLink: 'a[href*="sign-in"], a[href*="auth"]',

  // Weekly deals / flyer
  flyerContainer: '[class*="flyer"], [class*="Flyer"], [data-testid*="flyer"]',
  flyerItem: '[class*="flyer-item"], [class*="FlyerItem"], [class*="deal-card"]',
  flyerItemName: '[class*="item-name"], [class*="ItemName"], [class*="product-name"], h3, h4',
  flyerItemPrice: '[class*="item-price"], [class*="ItemPrice"], [class*="price"], [class*="Price"]',
  flyerItemSize: '[class*="item-size"], [class*="ItemSize"], [class*="unit"]',

  // Product search results
  searchInput: 'input[type="search"], input[placeholder*="Search"], [data-testid="search-input"]',
  searchResultItem: '[class*="ProductCard"], [class*="product-card"], [data-testid*="product"]',
  productName: '[class*="product-name"], [class*="ProductName"], [class*="item-title"], h2, h3',
  productPrice: '[class*="product-price"], [class*="ProductPrice"], [class*="price"]',
  productUnit: '[class*="product-unit"], [class*="ProductUnit"], [class*="unit-price"]',
  productImage: 'img[class*="product"], img[class*="Product"]',

  // Navigation
  categoriesNav: '[class*="categories"], [class*="Categories"]',
  categoryLink: 'a[href*="/collections/"]',
};

export const URLS = {
  base: 'https://shop.sprouts.com',
  login: 'https://shop.sprouts.com/rest/sso/auth/sprouts/init',
  weeklyAd: 'https://shop.sprouts.com/store/sprouts/flyers/weekly',
  search: (query: string) => `https://shop.sprouts.com/store/sprouts/search/${encodeURIComponent(query)}`,
  collection: (id: string) => `https://shop.sprouts.com/store/sprouts/collections/${id}`,
};
