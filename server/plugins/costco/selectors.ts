// Centralized CSS selectors for Costco (costco.com).
// When Costco redesigns, update only this file.

export const SELECTORS = {
  // Product search results
  searchResultItem: '[class*="product-tile"], [class*="ProductTile"], [data-testid*="product"], .product-list .product',
  productName: '[class*="description"], [class*="product-title"], h3.product-name, a[class*="product-name"]',
  productBrand: '[class*="brand"], [class*="Brand"]',
  productPrice: '[class*="price"], [data-testid*="price"]',
  productUnit: '[class*="unit-price"], [class*="UnitPrice"], [class*="price-per"]',
  productImage: 'img.product-image, img[class*="product-img"], img[data-testid="product-image"]',
  productLink: 'a[href*="/product."], a[href*=".product."]',
  outOfStock: '[class*="out-of-stock"], [class*="OutOfStock"], [class*="sold-out"]',
  deliveryTag: '[class*="delivery"], [class*="shipping"], [class*="Delivery"], [class*="warehouse-only"]',
};

export const URLS = {
  base: 'https://www.costco.com',
  login: 'https://www.costco.com/LogonForm',
  search: (query: string) => `https://www.costco.com/CatalogSearch?dept=All&keyword=${encodeURIComponent(query)}`,
};
