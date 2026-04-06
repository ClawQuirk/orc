// Centralized CSS selectors for Target (target.com).
// Target uses data-test attributes extensively — these are the most stable selectors.
// Discovered via DOM inspection on 2026-03-31.
// When Target redesigns, update only this file.

export const SELECTORS = {
  // Product card container
  searchResultItem: '[data-test="@web/site-top-of-funnel/ProductCardWrapper"]',

  // Inside each card:
  productName: '[data-test="@web/ProductCard/title"]',
  productBrand: '[data-test="@web/ProductCard/ProductCardBrandAndRibbonMessage/brand"]',
  productPrice: '[data-test="current-price"]',
  productUnit: '[data-test="unit-price"]',
  productImage: '[data-test="@web/ProductCard/ProductCardImage/primary"] img',
  productLink: '[data-test="@web/ProductCard/title"]',  // This is an <a> tag
  outOfStock: '[data-test="out-of-stock-text"]',
  fulfillment: '[data-test="ProductCardFulfillmentSection"]',
};

export const URLS = {
  base: 'https://www.target.com',
  login: 'https://www.target.com/login',
  search: (query: string) => `https://www.target.com/s?searchTerm=${encodeURIComponent(query)}`,
};
