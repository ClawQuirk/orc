import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { PayPalApiClient } from './api-client.js';
import type { CredentialVault } from '../../vault/credential-vault.js';

const manifest: PluginManifest = {
  id: 'paypal',
  name: 'PayPal',
  description: 'View PayPal balance and transaction history',
  version: '0.1.0',
  icon: 'dollar',
  category: 'financial',
  requiresAuth: true,
  authType: 'api-key',
  toolPrefix: 'paypal',
  connection: 'paypal',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'paypal_balance',
    description: 'Get PayPal account balance.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'paypal_transactions',
    description: 'List PayPal transactions for a date range. Automatically chunks requests for ranges over 31 days.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD, default: today)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['startDate'],
    },
  },
  {
    name: 'paypal_transaction_detail',
    description: 'Get details of a specific PayPal transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'PayPal transaction ID' },
      },
      required: ['transactionId'],
    },
  },
];

export class PayPalPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private client: PayPalApiClient | null = null;
  private vault: CredentialVault | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    this.vault = deps.vault;
    deps.logger('PayPal plugin initialized');
  }

  private getClient(): PayPalApiClient {
    if (!this.vault) throw new Error('Vault not available');
    const creds = this.vault.getCredentials('paypal');
    if (!creds?.apiKey || !creds?.apiSecret) throw new Error('PayPal not connected. Add your Client ID and Secret first.');
    if (!this.client) {
      this.client = new PayPalApiClient(creds.apiKey, creds.apiSecret);
    }
    return this.client;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const client = this.getClient();
      switch (toolName) {
        case 'paypal_balance':
          return client.getBalance();
        case 'paypal_transactions':
          return client.listTransactions(
            args.startDate as string,
            args.endDate as string | undefined,
            (args.limit as number) ?? 20,
          );
        case 'paypal_transaction_detail':
          return client.getTransactionDetail(args.transactionId as string);
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `PayPal error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
