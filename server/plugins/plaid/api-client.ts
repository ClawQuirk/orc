import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { randomUUID } from 'node:crypto';
import type { ToolResult } from '../base-plugin.js';
import { toCents, fromCents, normalizeCategory, normalizeMerchant, maskAccountNumber, sanitizeForLog } from '../financial/normalize.js';
import { getDatabase } from '../../db/index.js';
import type { CredentialVault } from '../../vault/credential-vault.js';

/**
 * Plaid API client.
 * SECURITY:
 * - User NEVER enters bank credentials in Orc — Plaid Link handles this
 * - Access tokens stored per-item in encrypted vault
 * - Public tokens exchanged immediately and discarded
 * - Full account numbers never stored (use Plaid's mask field)
 * - Uses /transactions/sync for incremental polling
 */
export class PlaidApiClient {
  private client: PlaidApi;
  private vault: CredentialVault;

  constructor(clientId: string, secret: string, vault: CredentialVault, useSandbox = false) {
    const config = new Configuration({
      basePath: useSandbox ? PlaidEnvironments.sandbox : PlaidEnvironments.production,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': clientId,
          'PLAID-SECRET': secret,
        },
      },
    });
    this.client = new PlaidApi(config);
    this.vault = vault;
  }

  /**
   * Create a Link token for the frontend Plaid Link component.
   */
  async createLinkToken(): Promise<{ linkToken: string }> {
    const res = await this.client.linkTokenCreate({
      user: { client_user_id: 'orc-user-1' },
      client_name: 'Orc',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    return { linkToken: res.data.link_token };
  }

  /**
   * Exchange a public token for an access token and store it in the vault.
   * SECURITY: Public token is used once and discarded. Access token goes to vault only.
   */
  async exchangePublicToken(publicToken: string): Promise<{ itemId: string }> {
    const res = await this.client.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = res.data.access_token;
    const itemId = res.data.item_id;

    // Store access token in vault keyed by item ID
    this.vault.setCredentials(`plaid-item-${itemId}`, {
      pluginId: 'plaid',
      type: 'api-key',
      apiKey: accessToken,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extra: { itemId },
    });

    // Sync accounts immediately
    await this.syncAccounts(accessToken, itemId);

    // SECURITY: Never log the access token
    console.log(`[plaid] Linked bank item: ${itemId}`);
    return { itemId };
  }

  /**
   * Get all linked Plaid items from the vault.
   */
  getLinkedItems(): Array<{ itemId: string; accountCount: number }> {
    const services = this.vault.listServices();
    const items: Array<{ itemId: string; accountCount: number }> = [];

    for (const svc of services) {
      if (svc.startsWith('plaid-item-')) {
        const creds = this.vault.getCredentials(svc);
        const itemId = creds?.extra?.itemId ?? svc.replace('plaid-item-', '');
        const db = getDatabase();
        const count = (db.prepare(
          "SELECT COUNT(*) as c FROM financial_accounts WHERE plugin_id = 'plaid' AND source_account_id LIKE ?"
        ).get(`${itemId}%`) as any)?.c ?? 0;
        items.push({ itemId, accountCount: count });
      }
    }
    return items;
  }

  /**
   * Remove a linked bank (revoke access token + remove from vault).
   */
  async unlinkItem(itemId: string): Promise<void> {
    const creds = this.vault.getCredentials(`plaid-item-${itemId}`);
    if (creds?.apiKey) {
      try {
        await this.client.itemRemove({ access_token: creds.apiKey });
      } catch {
        // Best effort — token may already be invalid
      }
    }
    this.vault.removeCredentials(`plaid-item-${itemId}`);

    // Clean up DB
    const db = getDatabase();
    const accounts = db.prepare(
      "SELECT id FROM financial_accounts WHERE plugin_id = 'plaid' AND source_account_id LIKE ?"
    ).all(`${itemId}%`) as any[];
    for (const acct of accounts) {
      db.prepare('DELETE FROM financial_transactions WHERE account_id = ?').run(acct.id);
    }
    db.prepare(
      "DELETE FROM financial_accounts WHERE plugin_id = 'plaid' AND source_account_id LIKE ?"
    ).run(`${itemId}%`);
    db.prepare("DELETE FROM financial_sync_state WHERE plugin_id = 'plaid' AND account_id LIKE ?").run(`${itemId}%`);

    console.log(`[plaid] Unlinked bank item: ${itemId}`);
  }

  /**
   * Sync accounts for a Plaid item.
   */
  private async syncAccounts(accessToken: string, itemId: string): Promise<void> {
    const res = await this.client.accountsGet({ access_token: accessToken });
    const db = getDatabase();
    const institution = res.data.item?.institution_id ?? 'Unknown';

    for (const acct of res.data.accounts) {
      const accountType = mapPlaidAccountType(acct.type);
      db.prepare(`
        INSERT OR REPLACE INTO financial_accounts
        (id, plugin_id, source_account_id, account_name, account_type, institution_name,
         mask, currency, balance_cents, balance_updated_at, is_active)
        VALUES (?, 'plaid', ?, ?, ?, ?, ?, 'USD', ?, datetime('now'), 1)
      `).run(
        `plaid-${acct.account_id}`,
        `${itemId}-${acct.account_id}`,
        acct.name ?? acct.official_name ?? 'Account',
        accountType,
        institution,
        maskAccountNumber(acct.mask ?? ''),
        toCents(acct.balances.current ?? 0, 'USD'),
      );
    }
  }

  // --- MCP Tool Methods ---

  async listAccounts(): Promise<ToolResult> {
    try {
      const db = getDatabase();
      const accounts = db.prepare(
        "SELECT * FROM financial_accounts WHERE plugin_id = 'plaid' AND is_active = 1 ORDER BY institution_name, account_name"
      ).all() as any[];

      if (accounts.length === 0) {
        return { content: [{ type: 'text', text: 'No Plaid bank accounts linked. Use the Financial setup panel to link a bank.' }] };
      }

      const text = accounts.map((a: any) => {
        const balance = a.balance_cents != null ? fromCents(a.balance_cents, 'USD') : 'N/A';
        return `**${a.account_name}** (${a.account_type})\n${a.institution_name} ****${a.mask ?? '????'}\nBalance: ${balance}\n[ID: ${a.id}]`;
      }).join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Plaid accounts error: ${err.message}` }], isError: true };
    }
  }

  async getBalances(): Promise<ToolResult> {
    try {
      // Refresh balances from Plaid for each linked item
      const items = this.getLinkedItems();
      for (const item of items) {
        const creds = this.vault.getCredentials(`plaid-item-${item.itemId}`);
        if (creds?.apiKey) {
          await this.syncAccounts(creds.apiKey, item.itemId);
        }
      }

      return this.listAccounts();
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Plaid balances error: ${err.message}` }], isError: true };
    }
  }

  async getTransactions(days = 30, accountId?: string): Promise<ToolResult> {
    try {
      const items = this.getLinkedItems();
      let totalSynced = 0;

      for (const item of items) {
        const creds = this.vault.getCredentials(`plaid-item-${item.itemId}`);
        if (!creds?.apiKey) continue;
        totalSynced += await this.syncTransactions(creds.apiKey, item.itemId);
      }

      // Query from DB
      const db = getDatabase();
      const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
      let sql = `SELECT * FROM financial_transactions WHERE plugin_id = 'plaid' AND transaction_date >= ?`;
      const params: unknown[] = [startDate];

      if (accountId) {
        sql += ' AND account_id = ?';
        params.push(accountId);
      }
      sql += ' ORDER BY transaction_date DESC LIMIT 50';

      const txns = db.prepare(sql).all(...params) as any[];

      if (txns.length === 0) {
        return { content: [{ type: 'text', text: `No Plaid transactions in the last ${days} days.` }] };
      }

      const text = txns.map((t: any) => {
        const amount = fromCents(t.amount_cents, t.currency);
        return `**${amount}** — ${t.merchant_name || t.description || '(unknown)'}\n${t.transaction_date} [${t.category ?? 'Other'}] ${t.is_pending ? '[PENDING]' : ''}`;
      }).join('\n\n');

      return { content: [{ type: 'text', text: `${totalSynced ? `(synced ${totalSynced} new)` : ''}\n\n${text}` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Plaid transactions error: ${err.message}` }], isError: true };
    }
  }

  async syncAll(): Promise<ToolResult> {
    try {
      const items = this.getLinkedItems();
      let totalSynced = 0;

      for (const item of items) {
        const creds = this.vault.getCredentials(`plaid-item-${item.itemId}`);
        if (!creds?.apiKey) continue;
        await this.syncAccounts(creds.apiKey, item.itemId);
        totalSynced += await this.syncTransactions(creds.apiKey, item.itemId);
      }

      return { content: [{ type: 'text', text: `Sync complete. ${totalSynced} new transactions across ${items.length} linked bank(s).` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Plaid sync error: ${err.message}` }], isError: true };
    }
  }

  /**
   * Incremental transaction sync using /transactions/sync.
   * Uses cursors stored in financial_sync_state.
   */
  private async syncTransactions(accessToken: string, itemId: string): Promise<number> {
    const db = getDatabase();
    let cursor = (db.prepare(
      "SELECT cursor_value FROM financial_sync_state WHERE plugin_id = 'plaid' AND account_id = ? AND cursor_type = 'transactions'"
    ).get(itemId) as any)?.cursor_value ?? '';

    let added = 0;
    let hasMore = true;

    while (hasMore) {
      const res = await this.client.transactionsSync({
        access_token: accessToken,
        cursor: cursor || undefined,
      });

      for (const txn of res.data.added) {
        const amountCents = toCents(-(txn.amount), 'USD'); // Plaid: positive = debit, we flip to negative
        const merchant = normalizeMerchant(txn.merchant_name ?? txn.name ?? '');
        const category = normalizeCategory(txn.personal_finance_category?.primary ?? txn.category?.[0] ?? '');

        db.prepare(`
          INSERT OR REPLACE INTO financial_transactions
          (id, plugin_id, account_id, source_transaction_id, amount_cents, currency,
           merchant_name, merchant_raw, category, description, transaction_date, posted_date,
           transaction_type, is_pending, synced_at)
          VALUES (?, 'plaid', ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          randomUUID(),
          `plaid-${txn.account_id}`,
          txn.transaction_id,
          amountCents, merchant,
          txn.merchant_name ?? txn.name ?? '',
          category,
          txn.name ?? '',
          txn.date,
          txn.authorized_date,
          amountCents >= 0 ? 'income' : 'purchase',
          txn.pending ? 1 : 0,
        );
        added++;
      }

      // Handle removed transactions
      for (const removed of res.data.removed) {
        db.prepare("DELETE FROM financial_transactions WHERE plugin_id = 'plaid' AND source_transaction_id = ?")
          .run(removed.transaction_id);
      }

      cursor = res.data.next_cursor;
      hasMore = res.data.has_more;
    }

    // Save cursor
    db.prepare(`
      INSERT OR REPLACE INTO financial_sync_state (plugin_id, account_id, cursor_type, cursor_value, last_synced_at)
      VALUES ('plaid', ?, 'transactions', ?, datetime('now'))
    `).run(itemId, cursor);

    return added;
  }
}

function mapPlaidAccountType(type: string): string {
  switch (type) {
    case 'depository': return 'checking';
    case 'credit': return 'credit';
    case 'investment': return 'investment';
    case 'loan': return 'credit';
    default: return 'checking';
  }
}
