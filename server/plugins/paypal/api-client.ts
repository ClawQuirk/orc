import { randomUUID } from 'node:crypto';
import type { ToolResult } from '../base-plugin.js';
import { toCents, fromCents, normalizeCategory, normalizeMerchant, sanitizeForLog } from '../financial/normalize.js';
import { getDatabase } from '../../db/index.js';

const PAYPAL_BASE = 'https://api-m.paypal.com';

/**
 * PayPal API client using OAuth 2.0 client credentials.
 * SECURITY: Access token held in memory only, never persisted to vault.
 */
export class PayPalApiClient {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      throw new Error(`PayPal auth failed: ${res.status}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    return this.accessToken;
  }

  private async apiGet(path: string): Promise<any> {
    const token = await this.getToken();
    const res = await fetch(`${PAYPAL_BASE}${path}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 401) {
      // Token expired — retry once
      this.accessToken = null;
      const newToken = await this.getToken();
      const retry = await fetch(`${PAYPAL_BASE}${path}`, {
        headers: { 'Authorization': `Bearer ${newToken}`, 'Content-Type': 'application/json' },
      });
      if (!retry.ok) throw new Error(`PayPal API error: ${retry.status}`);
      return retry.json();
    }
    if (!res.ok) throw new Error(`PayPal API error: ${res.status}`);
    return res.json();
  }

  async getBalance(): Promise<ToolResult> {
    try {
      const data = await this.apiGet('/v1/reporting/balances?as_of_time=' + new Date().toISOString() + '&currency_code=USD');
      const balances = data.balances ?? [];

      if (balances.length === 0) {
        return { content: [{ type: 'text', text: 'No PayPal balance data available.' }] };
      }

      const lines = ['**PayPal Balance**', ''];
      for (const b of balances) {
        const amount = fromCents(toCents(parseFloat(b.total_balance?.value ?? '0'), b.total_balance?.currency_code ?? 'USD'), b.total_balance?.currency_code ?? 'USD');
        lines.push(`${b.total_balance?.currency_code}: ${amount}`);
        if (b.available_balance) {
          const avail = fromCents(toCents(parseFloat(b.available_balance.value), b.available_balance.currency_code), b.available_balance.currency_code);
          lines.push(`  Available: ${avail}`);
        }
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `PayPal balance error: ${err.message}` }], isError: true };
    }
  }

  async listTransactions(startDate: string, endDate?: string, limit = 20): Promise<ToolResult> {
    try {
      const end = endDate || new Date().toISOString().split('T')[0];
      // PayPal has 31-day max range — chunk if needed
      const start = new Date(startDate);
      const endDt = new Date(end);
      const diffDays = Math.ceil((endDt.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      let allTxns: any[] = [];

      if (diffDays <= 31) {
        const data = await this.apiGet(
          `/v1/reporting/transactions?start_date=${startDate}T00:00:00-0000&end_date=${end}T23:59:59-0000&fields=all&page_size=${Math.min(limit, 100)}&page=1`
        );
        allTxns = data.transaction_details ?? [];
      } else {
        // Chunk into 31-day ranges
        let chunkStart = new Date(startDate);
        while (chunkStart < endDt && allTxns.length < limit) {
          const chunkEnd = new Date(Math.min(chunkStart.getTime() + 30 * 86400000, endDt.getTime()));
          const s = chunkStart.toISOString().split('T')[0];
          const e = chunkEnd.toISOString().split('T')[0];
          const data = await this.apiGet(
            `/v1/reporting/transactions?start_date=${s}T00:00:00-0000&end_date=${e}T23:59:59-0000&fields=all&page_size=${Math.min(limit - allTxns.length, 100)}&page=1`
          );
          allTxns.push(...(data.transaction_details ?? []));
          chunkStart = new Date(chunkEnd.getTime() + 86400000);
        }
      }

      if (allTxns.length === 0) {
        return { content: [{ type: 'text', text: `No PayPal transactions from ${startDate} to ${end}.` }] };
      }

      // Normalize and store
      const db = getDatabase();
      this.ensureAccount(db);

      for (const txn of allTxns) {
        const info = txn.transaction_info;
        if (!info?.transaction_id) continue;
        const amount = parseFloat(info.transaction_amount?.value ?? '0');
        const currency = (info.transaction_amount?.currency_code ?? 'USD').toUpperCase();
        const amountCents = toCents(amount, currency);
        const date = (info.transaction_initiation_date ?? '').split('T')[0];
        const payerName = txn.payer_info?.payer_name?.alternate_full_name ?? txn.payer_info?.email_address ?? '';

        db.prepare(`
          INSERT OR REPLACE INTO financial_transactions
          (id, plugin_id, account_id, source_transaction_id, amount_cents, currency,
           merchant_name, merchant_raw, category, description, transaction_date,
           transaction_type, is_pending, synced_at)
          VALUES (?, 'paypal', 'paypal-main', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
        `).run(
          randomUUID(), info.transaction_id,
          amountCents, currency,
          normalizeMerchant(payerName), payerName,
          normalizeCategory(info.transaction_subject),
          info.transaction_note || info.transaction_subject || `PayPal ${info.transaction_event_code}`,
          date,
          amount >= 0 ? 'income' : 'purchase',
        );
      }

      const text = allTxns.slice(0, limit).map((txn: any) => {
        const info = txn.transaction_info;
        const amount = fromCents(toCents(parseFloat(info.transaction_amount?.value ?? '0'), info.transaction_amount?.currency_code ?? 'USD'), (info.transaction_amount?.currency_code ?? 'USD').toUpperCase());
        const date = (info.transaction_initiation_date ?? '').split('T')[0];
        const name = txn.payer_info?.payer_name?.alternate_full_name ?? info.transaction_subject ?? '';
        return `**${amount}** — ${name}\n${date} [${info.transaction_event_code}] [ID: ${info.transaction_id}]`;
      }).join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `PayPal transactions error: ${err.message}` }], isError: true };
    }
  }

  async getTransactionDetail(transactionId: string): Promise<ToolResult> {
    try {
      // Search for this specific transaction in the last 31 days
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 31 * 86400000).toISOString().split('T')[0];
      const data = await this.apiGet(
        `/v1/reporting/transactions?start_date=${start}T00:00:00-0000&end_date=${end}T23:59:59-0000&transaction_id=${transactionId}&fields=all`
      );
      const txns = data.transaction_details ?? [];
      if (txns.length === 0) {
        return { content: [{ type: 'text', text: `Transaction ${transactionId} not found in last 31 days.` }] };
      }

      const txn = txns[0];
      const info = txn.transaction_info;
      const payer = txn.payer_info;
      const lines = [
        `**Transaction Detail**`,
        `ID: ${info.transaction_id}`,
        `Amount: ${info.transaction_amount?.value} ${info.transaction_amount?.currency_code}`,
        `Fee: ${info.fee_amount?.value ?? '0'} ${info.fee_amount?.currency_code ?? ''}`,
        `Date: ${info.transaction_initiation_date}`,
        `Status: ${info.transaction_status}`,
        `Type: ${info.transaction_event_code}`,
        payer?.email_address ? `Payer: ${payer.email_address}` : '',
        payer?.payer_name?.alternate_full_name ? `Name: ${payer.payer_name.alternate_full_name}` : '',
        info.transaction_note ? `Note: ${info.transaction_note}` : '',
        info.transaction_subject ? `Subject: ${info.transaction_subject}` : '',
      ].filter(Boolean);

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `PayPal detail error: ${err.message}` }], isError: true };
    }
  }

  private ensureAccount(db: ReturnType<typeof getDatabase>): void {
    const existing = db.prepare(
      "SELECT id FROM financial_accounts WHERE plugin_id = 'paypal' AND source_account_id = 'paypal-main'"
    ).get();
    if (!existing) {
      db.prepare(`
        INSERT INTO financial_accounts (id, plugin_id, source_account_id, account_name, account_type, institution_name, currency)
        VALUES (?, 'paypal', 'paypal-main', 'PayPal', 'payment_processor', 'PayPal', 'USD')
      `).run('paypal-main');
    }
  }
}
