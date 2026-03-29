import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import type { ToolResult } from '../base-plugin.js';
import { toCents, fromCents, normalizeCategory, normalizeMerchant, sanitizeForLog } from '../financial/normalize.js';
import { getDatabase } from '../../db/index.js';

export class StripeApiClient {
  private stripe: Stripe;

  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey);
  }

  async getBalance(): Promise<ToolResult> {
    try {
      const balance = await this.stripe.balance.retrieve();
      const lines: string[] = ['**Stripe Balance**', ''];

      for (const b of balance.available) {
        lines.push(`Available: ${fromCents(b.amount, b.currency.toUpperCase())}`);
      }
      for (const b of balance.pending) {
        lines.push(`Pending: ${fromCents(b.amount, b.currency.toUpperCase())}`);
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Stripe balance error: ${err.message}` }], isError: true };
    }
  }

  async listCharges(limit = 20, startDate?: string, endDate?: string): Promise<ToolResult> {
    try {
      const params: Stripe.ChargeListParams = { limit };
      if (startDate || endDate) {
        params.created = {};
        if (startDate) params.created.gte = Math.floor(new Date(startDate).getTime() / 1000);
        if (endDate) params.created.lte = Math.floor(new Date(endDate).getTime() / 1000);
      }

      const charges = await this.stripe.charges.list(params);
      if (charges.data.length === 0) {
        return { content: [{ type: 'text', text: 'No charges found.' }] };
      }

      // Normalize and store in DB
      const db = getDatabase();
      this.ensureAccount(db);

      for (const charge of charges.data) {
        const txnDate = new Date(charge.created * 1000).toISOString().split('T')[0];
        db.prepare(`
          INSERT OR REPLACE INTO financial_transactions
          (id, plugin_id, account_id, source_transaction_id, amount_cents, currency,
           merchant_name, merchant_raw, category, description, transaction_date,
           transaction_type, is_pending, synced_at)
          VALUES (?, 'stripe', 'stripe-main', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          randomUUID(), charge.id,
          -(charge.amount), // Negative = money going out (payment received by merchant)
          charge.currency.toUpperCase(),
          normalizeMerchant(charge.description),
          charge.description,
          normalizeCategory(charge.metadata?.category),
          charge.description ?? `Charge ${charge.id}`,
          txnDate,
          charge.refunded ? 'refund' : 'purchase',
          charge.status === 'pending' ? 1 : 0,
        );
      }

      const text = charges.data.map((c) => {
        const date = new Date(c.created * 1000).toLocaleDateString();
        const amount = fromCents(c.amount, c.currency.toUpperCase());
        return `**${amount}** — ${c.description || '(no description)'}\n${date} [${c.status}] [ID: ${c.id}]`;
      }).join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Stripe charges error: ${err.message}` }], isError: true };
    }
  }

  async listInvoices(limit = 20, status?: string): Promise<ToolResult> {
    try {
      const params: Stripe.InvoiceListParams = { limit };
      if (status) params.status = status as Stripe.InvoiceListParams.Status;

      const invoices = await this.stripe.invoices.list(params);
      if (invoices.data.length === 0) {
        return { content: [{ type: 'text', text: 'No invoices found.' }] };
      }

      const text = invoices.data.map((inv) => {
        const amount = inv.amount_due ? fromCents(inv.amount_due, (inv.currency ?? 'usd').toUpperCase()) : 'N/A';
        const date = inv.created ? new Date(inv.created * 1000).toLocaleDateString() : '';
        return `**${amount}** — ${inv.customer_name || inv.customer_email || 'Unknown'}\n${date} [${inv.status}] [ID: ${inv.id}]`;
      }).join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Stripe invoices error: ${err.message}` }], isError: true };
    }
  }

  async listPayouts(limit = 20): Promise<ToolResult> {
    try {
      const payouts = await this.stripe.payouts.list({ limit });
      if (payouts.data.length === 0) {
        return { content: [{ type: 'text', text: 'No payouts found.' }] };
      }

      const text = payouts.data.map((p) => {
        const amount = fromCents(p.amount, p.currency.toUpperCase());
        const date = new Date(p.created * 1000).toLocaleDateString();
        return `**${amount}** — ${date} [${p.status}] [ID: ${p.id}]`;
      }).join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Stripe payouts error: ${err.message}` }], isError: true };
    }
  }

  /**
   * Ensure the Stripe "account" row exists in financial_accounts.
   */
  private ensureAccount(db: ReturnType<typeof getDatabase>): void {
    const existing = db.prepare(
      "SELECT id FROM financial_accounts WHERE plugin_id = 'stripe' AND source_account_id = 'stripe-main'"
    ).get();
    if (!existing) {
      db.prepare(`
        INSERT INTO financial_accounts (id, plugin_id, source_account_id, account_name, account_type, institution_name, currency)
        VALUES (?, 'stripe', 'stripe-main', 'Stripe', 'payment_processor', 'Stripe', 'USD')
      `).run('stripe-main');
    }
  }
}
