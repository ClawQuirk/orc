import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { RobinhoodApiClient } from './api-client.js';
import type { CredentialVault } from '../../vault/credential-vault.js';

const manifest: PluginManifest = {
  id: 'robinhood',
  name: 'Robinhood (Crypto)',
  description: 'View crypto holdings, prices, and order history from Robinhood (crypto only)',
  version: '0.1.0',
  icon: 'trending',
  category: 'financial',
  requiresAuth: true,
  authType: 'api-key',
  toolPrefix: 'robinhood',
  connection: 'robinhood',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'robinhood_crypto_holdings',
    description: 'List crypto holdings with current values and P&L.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'robinhood_crypto_prices',
    description: 'Get current crypto prices from Robinhood.',
    inputSchema: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Crypto symbols (e.g., ["BTC", "ETH"]). Defaults to BTC, ETH, SOL, DOGE.',
        },
      },
    },
  },
  {
    name: 'robinhood_crypto_history',
    description: 'List recent crypto order history.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
];

export class RobinhoodPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private client: RobinhoodApiClient | null = null;
  private vault: CredentialVault | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    this.vault = deps.vault;
    deps.logger('Robinhood plugin initialized');
  }

  private getClient(): RobinhoodApiClient {
    if (!this.vault) throw new Error('Vault not available');
    const creds = this.vault.getCredentials('robinhood');
    if (!creds?.apiKey || !creds?.extra?.privateKeyBase64) throw new Error('Robinhood not connected. Add your API key and private key first.');
    if (!this.client) {
      this.client = new RobinhoodApiClient(creds.apiKey, creds.extra.privateKeyBase64);
    }
    return this.client;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const client = this.getClient();
      switch (toolName) {
        case 'robinhood_crypto_holdings':
          return client.getCryptoHoldings();
        case 'robinhood_crypto_prices':
          return client.getCryptoPrices(args.symbols as string[] | undefined);
        case 'robinhood_crypto_history':
          return client.getCryptoHistory((args.limit as number) ?? 20);
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Robinhood error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
