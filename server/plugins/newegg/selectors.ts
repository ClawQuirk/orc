// Centralized CSS selectors for Newegg (newegg.com).
// When Newegg redesigns, update only this file.

export const SELECTORS = {
  // Product search results
  searchResultItem: '.item-cell, .item-container, [class*="item-cell"]',
  productName: '.item-title, a.item-title, [class*="item-title"]',
  productBrand: '.item-branding img[title], [class*="item-brand"]',
  productPrice: '.price-current, [class*="price-current"]',
  productUnit: '[class*="price-per"], [class*="unit-price"]',
  productImage: '.item-img img, a.item-img img',
  productLink: 'a.item-title, a.item-img',
  outOfStock: '[class*="item-out-of-stock"], .btn-message',
  shippingTag: '.price-ship, [class*="shipping"]',
};

export const URLS = {
  base: 'https://www.newegg.com',
  login: 'https://secure.newegg.com/identity/signin',
  search: (query: string) => `https://www.newegg.com/p/pl?d=${encodeURIComponent(query)}`,
};
