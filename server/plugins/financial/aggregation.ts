/**
 * Cross-service financial aggregation queries.
 * SECURITY: All queries use parameterized SQL (? placeholders). Never string interpolation.
 */
import { getDatabase } from '../../db/index.js';
import type { FinancialAccount, NormalizedTransaction, SpendingSummary } from '../../../shared/financial-types.js';

interface CategoryRow { category: string; total: number; }
interface MerchantRow { merchant_name: string; total: number; }
interface TimeSeriesRow { period: string; total: number; }

/**
 * Get spending breakdown by category for a time period.
 */
export function getSpendingByCategory(opts: {
  startDate?: string;
  endDate?: string;
  pluginIds?: string[];
  accountIds?: string[];
}): SpendingSummary {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.startDate) { conditions.push('transaction_date >= ?'); params.push(opts.startDate); }
  if (opts.endDate) { conditions.push('transaction_date <= ?'); params.push(opts.endDate); }
  if (opts.pluginIds?.length) {
    conditions.push(`plugin_id IN (${opts.pluginIds.map(() => '?').join(',')})`);
    params.push(...opts.pluginIds);
  }
  if (opts.accountIds?.length) {
    conditions.push(`account_id IN (${opts.accountIds.map(() => '?').join(',')})`);
    params.push(...opts.accountIds);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Category breakdown (expenses only: amount_cents < 0)
  const categoryRows = db.prepare(`
    SELECT COALESCE(category, 'Other') as category, SUM(ABS(amount_cents)) as total
    FROM financial_transactions
    ${where} ${conditions.length ? 'AND' : 'WHERE'} amount_cents < 0
    GROUP BY category ORDER BY total DESC
  `).all(...params) as CategoryRow[];

  // Merchant breakdown (expenses only)
  const merchantRows = db.prepare(`
    SELECT COALESCE(merchant_name, 'Unknown') as merchant_name, SUM(ABS(amount_cents)) as total
    FROM financial_transactions
    ${where} ${conditions.length ? 'AND' : 'WHERE'} amount_cents < 0
    GROUP BY merchant_name ORDER BY total DESC
    LIMIT 20
  `).all(...params) as MerchantRow[];

  // Totals
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN amount_cents < 0 THEN ABS(amount_cents) ELSE 0 END), 0) as spent,
      COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END), 0) as income
    FROM financial_transactions ${where}
  `).get(...params) as { spent: number; income: number };

  const categoryBreakdown: Record<string, number> = {};
  for (const r of categoryRows) categoryBreakdown[r.category] = r.total;

  const merchantBreakdown: Record<string, number> = {};
  for (const r of merchantRows) merchantBreakdown[r.merchant_name] = r.total;

  return {
    totalSpentCents: totals.spent,
    totalIncomeCents: totals.income,
    currency: 'USD',
    periodStart: opts.startDate ?? '',
    periodEnd: opts.endDate ?? '',
    categoryBreakdown,
    merchantBreakdown,
  };
}

/**
 * Get top merchants by spend amount.
 */
export function getSpendingByMerchant(opts: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Array<{ merchantName: string; totalCents: number; transactionCount: number }> {
  const db = getDatabase();
  const conditions: string[] = ['amount_cents < 0'];
  const params: unknown[] = [];

  if (opts.startDate) { conditions.push('transaction_date >= ?'); params.push(opts.startDate); }
  if (opts.endDate) { conditions.push('transaction_date <= ?'); params.push(opts.endDate); }

  const rows = db.prepare(`
    SELECT COALESCE(merchant_name, 'Unknown') as merchant_name,
           SUM(ABS(amount_cents)) as total,
           COUNT(*) as count
    FROM financial_transactions
    WHERE ${conditions.join(' AND ')}
    GROUP BY merchant_name ORDER BY total DESC
    LIMIT ?
  `).all(...params, opts.limit ?? 20) as Array<{ merchant_name: string; total: number; count: number }>;

  return rows.map((r) => ({
    merchantName: r.merchant_name,
    totalCents: r.total,
    transactionCount: r.count,
  }));
}

/**
 * Get net worth: sum of all active account balances.
 */
export function getNetWorth(): { accounts: FinancialAccount[]; totalCents: number } {
  const db = getDatabase();
  const rows = db.prepare(
    'SELECT * FROM financial_accounts WHERE is_active = 1 ORDER BY balance_cents DESC'
  ).all() as any[];

  const accounts: FinancialAccount[] = rows.map((r) => ({
    id: r.id,
    pluginId: r.plugin_id,
    sourceAccountId: r.source_account_id,
    accountName: r.account_name,
    accountType: r.account_type,
    institutionName: r.institution_name,
    mask: r.mask,
    currency: r.currency,
    balanceCents: r.balance_cents,
    balanceUpdatedAt: r.balance_updated_at,
    isActive: !!r.is_active,
  }));

  const totalCents = accounts.reduce((sum, a) => sum + (a.balanceCents ?? 0), 0);
  return { accounts, totalCents };
}

/**
 * Get recent transactions across all connected services.
 */
export function getRecentTransactions(opts: {
  limit?: number;
  pluginIds?: string[];
}): NormalizedTransaction[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.pluginIds?.length) {
    conditions.push(`plugin_id IN (${opts.pluginIds.map(() => '?').join(',')})`);
    params.push(...opts.pluginIds);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT * FROM financial_transactions ${where}
    ORDER BY transaction_date DESC, synced_at DESC
    LIMIT ?
  `).all(...params, opts.limit ?? 50) as any[];

  return rows.map((r) => ({
    id: r.id,
    pluginId: r.plugin_id,
    accountId: r.account_id,
    sourceTransactionId: r.source_transaction_id,
    amountCents: r.amount_cents,
    currency: r.currency,
    merchantName: r.merchant_name,
    merchantRaw: r.merchant_raw,
    category: r.category,
    subcategory: r.subcategory,
    description: r.description,
    transactionDate: r.transaction_date,
    postedDate: r.posted_date,
    transactionType: r.transaction_type,
    isPending: !!r.is_pending,
    syncedAt: r.synced_at,
  }));
}
