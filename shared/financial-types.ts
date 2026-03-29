// All monetary amounts are integers in the smallest currency unit (cents, satoshis, etc.)
// Never use floating point for money.

export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'crypto' | 'payment_processor';

export type TransactionType =
  | 'purchase' | 'refund' | 'transfer' | 'payment'
  | 'income' | 'fee' | 'interest'
  | 'crypto_buy' | 'crypto_sell' | 'other';

export type NormalizedCategory =
  | 'Food & Drink' | 'Transportation' | 'Shopping' | 'Entertainment'
  | 'Housing' | 'Utilities' | 'Healthcare' | 'Income' | 'Transfer'
  | 'Fees' | 'Crypto' | 'Subscription' | 'Travel' | 'Education' | 'Other';

export interface FinancialAccount {
  id: string;
  pluginId: string;
  sourceAccountId: string;
  accountName: string | null;
  accountType: AccountType;
  institutionName: string | null;
  mask: string | null;          // Last 4 digits ONLY
  currency: string;             // ISO 4217
  balanceCents: number | null;  // Integer, smallest currency unit
  balanceUpdatedAt: string | null;
  isActive: boolean;
}

export interface NormalizedTransaction {
  id: string;
  pluginId: string;
  accountId: string;
  sourceTransactionId: string;
  amountCents: number;          // Positive = credit/income, Negative = debit/expense
  currency: string;             // ISO 4217
  merchantName: string | null;
  merchantRaw: string | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  transactionDate: string;      // YYYY-MM-DD
  postedDate: string | null;
  transactionType: TransactionType;
  isPending: boolean;
  syncedAt: string;
}

export interface SpendingSummary {
  totalSpentCents: number;
  totalIncomeCents: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  categoryBreakdown: Record<string, number>;  // category -> total cents (absolute)
  merchantBreakdown: Record<string, number>;  // merchant -> total cents (absolute)
}

export interface FinancialServiceStatus {
  pluginId: string;
  name: string;
  connected: boolean;
  accountCount: number;
  lastSyncedAt: string | null;
}
