/**
 * Financial normalization utilities.
 * SECURITY: All monetary operations use integers. No floating point for money.
 */

// Currency minor unit factors (how many smallest units per 1 major unit)
const CURRENCY_FACTORS: Record<string, number> = {
  USD: 100, EUR: 100, GBP: 100, CAD: 100, AUD: 100,
  JPY: 1,   KRW: 1,
  BTC: 100_000_000,  // satoshis
  ETH: 1_000_000_000_000_000_000, // wei (but we use gwei: 1e9)
};

/**
 * Convert a decimal amount to integer cents/satoshis.
 * NEVER store the decimal form — always convert to integer first.
 */
export function toCents(amount: number, currency: string): number {
  const factor = CURRENCY_FACTORS[currency.toUpperCase()] ?? 100;
  return Math.round(amount * factor);
}

/**
 * Format integer cents to a display string. For display only, never for computation.
 */
export function fromCents(cents: number, currency: string): string {
  const factor = CURRENCY_FACTORS[currency.toUpperCase()] ?? 100;
  const value = cents / factor;

  if (currency.toUpperCase() === 'BTC') {
    return `${value.toFixed(8)} BTC`;
  }
  if (factor === 1) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}

// Category mapping from provider-specific categories to normalized categories
const CATEGORY_MAP: Record<string, string> = {
  // Plaid categories
  'food and drink': 'Food & Drink',
  'restaurants': 'Food & Drink',
  'groceries': 'Food & Drink',
  'coffee shop': 'Food & Drink',
  'transportation': 'Transportation',
  'gas': 'Transportation',
  'ride share': 'Transportation',
  'shopping': 'Shopping',
  'clothing': 'Shopping',
  'electronics': 'Shopping',
  'entertainment': 'Entertainment',
  'music': 'Entertainment',
  'movies': 'Entertainment',
  'streaming': 'Subscription',
  'subscription': 'Subscription',
  'rent': 'Housing',
  'mortgage': 'Housing',
  'utilities': 'Utilities',
  'internet': 'Utilities',
  'phone': 'Utilities',
  'healthcare': 'Healthcare',
  'pharmacy': 'Healthcare',
  'medical': 'Healthcare',
  'income': 'Income',
  'payroll': 'Income',
  'deposit': 'Income',
  'transfer': 'Transfer',
  'payment': 'Transfer',
  'fee': 'Fees',
  'interest': 'Fees',
  'atm fee': 'Fees',
  'travel': 'Travel',
  'hotel': 'Travel',
  'airline': 'Travel',
  'education': 'Education',
  'crypto': 'Crypto',
};

/**
 * Normalize a provider-specific category to a standard category.
 */
export function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other';
  const lower = raw.toLowerCase().trim();
  // Direct match
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];
  // Partial match
  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return value;
  }
  return 'Other';
}

/**
 * Normalize a merchant name: strip trailing identifiers, normalize casing.
 * "MCDONALD'S #12345 SAN JOSE CA" -> "McDonald's"
 */
export function normalizeMerchant(raw: string | null | undefined): string {
  if (!raw) return '';
  let name = raw.trim();
  // Remove trailing location/ID patterns
  name = name.replace(/\s*#\d+.*$/i, '');          // "Store #12345 ..."
  name = name.replace(/\s*\d{5,}.*$/i, '');         // Trailing zip/phone
  name = name.replace(/\s+[A-Z]{2}\s*\d{5}.*$/i, ''); // "CA 95123"
  name = name.replace(/\s{2,}/g, ' ').trim();
  // Title case
  return name.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(And|Or|The|Of|In|At|To|For)\b/g, (w) => w.toLowerCase());
}

/**
 * Mask an account number to last 4 digits.
 * SECURITY: Call this IMMEDIATELY when receiving a full account number.
 * The full number must NEVER be stored or logged.
 */
export function maskAccountNumber(full: string | null | undefined): string | null {
  if (!full || full.length < 4) return full ?? null;
  return '****' + full.slice(-4);
}

/**
 * Deep-copy an object and redact sensitive fields.
 * SECURITY: Use before ANY console.log of API responses.
 */
export function sanitizeForLog(obj: unknown, sensitiveKeys: string[] = DEFAULT_SENSITIVE_KEYS): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLog(item, sensitiveKeys));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeForLog(value, sensitiveKeys);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const DEFAULT_SENSITIVE_KEYS = [
  'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'apiKey', 'api_key', 'apiSecret', 'api_secret',
  'clientSecret', 'client_secret', 'privateKey', 'private_key',
  'password', 'secret', 'token', 'authorization',
  'accountNumber', 'account_number', 'routingNumber', 'routing_number',
];
