# Phase 2: Extended Google + Financial

## Status: NOT STARTED
## Depends on: Phase 1 complete

---

## 2A: Extended Google Services (parallel, all use Phase 1 OAuth)

### 2A.1 - Google Docs
- **Scope**: `https://www.googleapis.com/auth/documents`
- **Methods**: listDocuments, getDocument, createDocument, updateDocument, searchDocuments
- **MCP Tools**: docs_list, docs_read, docs_create, docs_edit
- **Note**: Docs API uses batch update model - service layer abstracts into simpler operations
- **Files**: 5 new (server plugin + frontend widget)

### 2A.2 - Google Sheets
- **Scope**: `https://www.googleapis.com/auth/spreadsheets`
- **Methods**: listSpreadsheets, getSpreadsheet, readRange, writeRange, appendRows, createSpreadsheet
- **MCP Tools**: sheets_list, sheets_read, sheets_write, sheets_create
- **Note**: Always use specific range notation, never read entire sheets
- **Files**: 5 new

### 2A.3 - Google Slides
- **Scope**: `https://www.googleapis.com/auth/presentations.readonly`
- **Methods**: listPresentations, getPresentation, getSlide, getSlideThumbnail (read-only)
- **MCP Tools**: slides_list, slides_read
- **Note**: Read-only for now; focus on text extraction
- **Files**: 4 new

---

## 2B: Financial Services

### 2B.0 - Financial Base Layer
- `server/db/migrations/002-financial-tables.ts` - Tables: transactions, accounts, financial_cache
- `server/plugins/financial/base-financial.ts` - Abstract base with transaction normalization
- `src/components/widgets/TransactionListWidget.tsx` - Reusable transaction list component
- **Files**: 3-4 new

### 2B.1 - Plaid (Banking)
- **Auth**: Client ID + Secret (stored in vault), Link token for user authorization
- **Package**: `plaid`, `react-plaid-link`
- **Methods**: createLinkToken, exchangePublicToken, listAccounts, getTransactions, getBalances
- **MCP Tools**: plaid_accounts, plaid_transactions, plaid_balances
- **Widget**: Account balances + recent transactions
- **Note**: Requires Plaid account (Sandbox free for dev, paid for production)
- **Files**: 6-7 new

### 2B.2 - Coinbase (Crypto)
- **Auth**: Coinbase OAuth 2.0 (separate flow from Google)
- **Package**: `coinbase-advanced-sdk`
- **Methods**: getPortfolio, getAccounts, getTransactions, getSpotPrice, getTradeHistory
- **MCP Tools**: coinbase_portfolio, coinbase_prices, coinbase_history
- **Widget**: Portfolio value + holdings breakdown
- **Files**: 5-6 new

### 2B.3 - Stripe (Payments)
- **Auth**: API Keys (no OAuth, stored in vault)
- **Package**: `stripe`
- **Methods**: listPayments, getPayment, listInvoices, getInvoice, getBalance
- **MCP Tools**: stripe_payments, stripe_invoices, stripe_balance
- **Widget**: Recent payments + invoice status
- **Note**: Read-only payment/invoice/balance endpoints only
- **Files**: 5 new

### 2B.4 - PayPal (Transactions)
- **Auth**: Client credentials OAuth 2.0
- **Package**: `@paypal/paypal-server-sdk`
- **Methods**: getBalance, listTransactions, getTransaction
- **MCP Tools**: paypal_balance, paypal_transactions
- **Widget**: Balance + recent transactions
- **Files**: 5 new

### 2B.5 - Robinhood (Crypto Only)
- **Auth**: ED25519/RSA key pairs
- **Methods**: getCryptoPortfolio, getCryptoHoldings, getCryptoHistory, getCryptoPrice
- **MCP Tools**: robinhood_crypto_portfolio, robinhood_crypto_prices
- **Widget**: Crypto holdings value
- **LIMITATION**: Stocks and options NOT available via API (crypto only)
- **Files**: 5 new

---

## Phase 2 Completion Criteria

- [ ] Google Docs: list/read/create/edit via chat + MCP
- [ ] Google Sheets: read/write range data via chat + MCP
- [ ] Google Slides: list/read presentations via chat + MCP
- [ ] Plaid: bank accounts linked, transactions queryable
- [ ] Coinbase: crypto portfolio visible, prices queryable
- [ ] Stripe: payment history and invoices viewable
- [ ] PayPal: balance and transactions viewable
- [ ] Robinhood: crypto holdings viewable
- [ ] Aggregated "How much did I spend this month?" works across financial services
- [ ] All financial data normalized in common transaction format
