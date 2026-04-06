// Centralized CSS selectors for Amazon (amazon.com).
// Amazon uses data-component-type attributes on search results.
// When Amazon redesigns, update only this file.

export const SELECTORS = {
  // Product search results
  searchResultItem: '[data-component-type="s-search-result"], [data-asin]',
  productName: 'h2 a span, [data-cy="title-recipe"] span',
  productBrand: '[class*="a-row"] .a-size-base-plus, .a-row .s-label-popover-default span',
  productPrice: '.a-price .a-offscreen, [data-a-color="price"] .a-offscreen',
  productUnit: '[class*="a-price-per-unit"], .a-price + .a-size-base',
  productImage: 'img.s-image',
  productLink: 'h2 a.a-link-normal, a[class*="a-link-normal s-"]',
  outOfStock: '[class*="a-color-price"] .a-text-bold',
  deliveryTag: '[data-cy="delivery-recipe"], [class*="a-color-base s-align-children-center"]',
  primeTag: '[class*="a-icon-prime"], i[class*="a-icon-prime"]',
};

export const URLS = {
  base: 'https://www.amazon.com',
  login: 'https://www.amazon.com/ap/signin',
  search: (query: string) => `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
};
