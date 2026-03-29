import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { CoinbaseApiClient } from './api-client.js';
import type { CredentialVault } from '../../vault/credential-vault.js';

const manifest: PluginManifest = {
  id: 'coinbase',
  name: 'Coinbase',
  description: 'View crypto portfolio, accounts, transactions, and prices from Coinbase',
  version: '0.1.0',
  icon: 'bitcoin',
  category: 'financial',
  requiresAuth: true,
  authType: 'api-key',
  toolPrefix: 'coinbase',
  connection: 'coinbase',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'coinbase_accounts',
    description: 'List Coinbase crypto wallets/accounts with balances.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'coinbase_portfolio',
    description: 'Get portfolio value summary with total USD value.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'coinbase_transactions',
    description: 'List transactions for a specific Coinbase account.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account ID (from coinbase_accounts)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'coinbase_prices',
    description: 'Get current spot prices for cryptocurrencies.',
    inputSchema: {
      type: 'object',
      properties: {
        currencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Currency symbols (e.g., ["BTC", "ETH"]). Defaults to BTC, ETH, SOL, DOGE, ADA.',
        },
      },
    },
  },
];

export class CoinbasePlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private client: CoinbaseApiClient | null = null;
  private vault: CredentialVault | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    this.vault = deps.vault;
    deps.logger('Coinbase plugin initialized');
  }

  private getClient(): CoinbaseApiClient {
    if (!this.vault) throw new Error('Vault not available');
    const creds = this.vault.getCredentials('coinbase');
    // Support both legacy keys (apiKey + apiSecret/extra.privateKey) and CDP keys
    const secret = creds?.apiSecret ?? creds?.extra?.privateKey;
    if (!creds?.apiKey || !secret) throw new Error('Coinbase not connected. Add your API key and secret first.');
    if (!this.client) {
      this.client = new CoinbaseApiClient(creds.apiKey, secret);
    }
    return this.client;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const client = this.getClient();
      switch (toolName) {
        case 'coinbase_accounts':
          return client.listAccounts();
        case 'coinbase_portfolio':
          return client.getPortfolio();
        case 'coinbase_transactions':
          return client.listTransactions(args.accountId as string, (args.limit as number) ?? 20);
        case 'coinbase_prices':
          return client.getSpotPrices(args.currencies as string[] | undefined);
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Coinbase error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
