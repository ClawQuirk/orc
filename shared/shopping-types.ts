/**
 * Shopping types shared between server plugins and frontend.
 * All prices are integer cents (USD). Never use floating point for money.
 */

/** Merchant identifiers for all shopping plugins. */
export type MerchantId = 'sprouts' | 'costco' | 'target' | 'amazon' | 'newegg';

/** Standardized unit types for price-per-unit comparison. */
export type StandardUnit = 'oz' | 'fl oz' | 'lb' | 'ct' | 'each' | 'gal' | 'ml' | 'l' | 'kg' | 'g';

/** Normalized product result returned by every merchant search plugin. */
export interface ProductResult {
  merchant: MerchantId;
  name: string;
  brand: string;
  priceCents: number;
  quantity: string;          // Display string: "32 oz", "6 ct", "3 lb"
  pricePerUnitCents: number; // Cents per standard unit (e.g., 17 = $0.17/oz)
  unit: StandardUnit;
  url: string;
  imageUrl: string;
  inStock: boolean;
  deliveryAvailable: boolean;
  deliveryEstimate: string;  // "Same day", "2-day", "" if unknown
}

/** Aggregated results for one shopping list item across all merchants. */
export interface AggregatedItemResult {
  query: string;
  results: ProductResult[];
  bestPrice: ProductResult | null;
  bestValue: ProductResult | null;     // Lowest pricePerUnitCents
  searchedMerchants: MerchantId[];
  failedMerchants: MerchantId[];
}

/** Full aggregated shopping list response. */
export interface ShoppingListResult {
  items: AggregatedItemResult[];
  totalEstimatedCents: number;  // Sum of bestPrice for each item
  searchedAt: string;           // ISO timestamp
}

/** A shopping learning entry (preference, tip, observation). */
export interface ShoppingLearning {
  id: string;
  title: string;
  content: string;
  tags: string[];
  merchant: MerchantId | null;
  category: ShoppingCategory | null;
  createdAt: string;
  updatedAt: string;
}

/** Product categories for organizing learnings. */
export type ShoppingCategory =
  | 'dairy'
  | 'produce'
  | 'meat'
  | 'pantry'
  | 'frozen'
  | 'beverages'
  | 'snacks'
  | 'household'
  | 'electronics'
  | 'general';

/** Interface that all merchant plugins must implement for aggregation. */
export interface MerchantPlugin {
  readonly merchantId: MerchantId;
  searchProducts(query: string, maxResults: number): Promise<ProductResult[]>;
}
