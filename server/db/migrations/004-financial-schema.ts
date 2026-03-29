import type Database from 'better-sqlite3-multiple-ciphers';
import type { Migration } from '../migrate.js';

export const migration: Migration = {
  id: 4,
  name: 'financial-schema',
  up(db: Database.Database) {
    // Linked financial accounts — one per bank connection, crypto wallet, etc.
    // SECURITY: mask stores last 4 digits ONLY. source_account_id is provider's opaque ID, NOT a real account number.
    db.exec(`
      CREATE TABLE financial_accounts (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        source_account_id TEXT NOT NULL,
        account_name TEXT,
        account_type TEXT NOT NULL CHECK (account_type IN (
          'checking', 'savings', 'credit', 'investment', 'crypto', 'payment_processor'
        )),
        institution_name TEXT,
        mask TEXT,
        currency TEXT NOT NULL DEFAULT 'USD',
        balance_cents INTEGER,
        balance_updated_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(plugin_id, source_account_id)
      )
    `);
    db.exec(`CREATE INDEX idx_fin_accounts_plugin ON financial_accounts(plugin_id)`);

    // Normalized transactions — all amounts as INTEGER in smallest currency unit (cents/satoshis)
    // SECURITY: amount_cents is INTEGER to avoid floating-point rounding errors.
    // raw_data is stored in SQLCipher-encrypted DB for audit/debug only.
    db.exec(`
      CREATE TABLE financial_transactions (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
        source_transaction_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        merchant_name TEXT,
        merchant_raw TEXT,
        category TEXT,
        subcategory TEXT,
        description TEXT,
        transaction_date TEXT NOT NULL,
        posted_date TEXT,
        transaction_type TEXT NOT NULL CHECK (transaction_type IN (
          'purchase', 'refund', 'transfer', 'payment', 'income', 'fee', 'interest', 'crypto_buy', 'crypto_sell', 'other'
        )),
        is_pending INTEGER NOT NULL DEFAULT 0,
        raw_data TEXT,
        synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(plugin_id, source_transaction_id)
      )
    `);
    db.exec(`CREATE INDEX idx_fin_txn_date ON financial_transactions(transaction_date DESC)`);
    db.exec(`CREATE INDEX idx_fin_txn_account ON financial_transactions(account_id)`);
    db.exec(`CREATE INDEX idx_fin_txn_category ON financial_transactions(category)`);
    db.exec(`CREATE INDEX idx_fin_txn_merchant ON financial_transactions(merchant_name)`);
    db.exec(`CREATE INDEX idx_fin_txn_plugin ON financial_transactions(plugin_id)`);

    // Sync cursors for incremental polling per service/account
    db.exec(`
      CREATE TABLE financial_sync_state (
        plugin_id TEXT NOT NULL,
        account_id TEXT NOT NULL DEFAULT '',
        cursor_type TEXT NOT NULL,
        cursor_value TEXT,
        last_synced_at TEXT,
        PRIMARY KEY (plugin_id, account_id, cursor_type)
      )
    `);
  },
};
