import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { StripeApiClient } from './api-client.js';
import type { CredentialVault } from '../../vault/credential-vault.js';

const manifest: PluginManifest = {
  id: 'stripe',
  name: 'Stripe',
  description: 'View payment history, invoices, and balances from Stripe',
  version: '0.1.0',
  icon: 'credit-card',
  category: 'financial',
  requiresAuth: true,
  authType: 'api-key',
  toolPrefix: 'stripe',
  connection: 'stripe',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'stripe_balance',
    description: 'Get current Stripe balance (available and pending).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'stripe_charges',
    description: 'List recent charges/payments. Amounts stored as normalized integers.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 20)' },
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD, optional)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD, optional)' },
      },
    },
  },
  {
    name: 'stripe_invoices',
    description: 'List invoices with status and amounts.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 20)' },
        status: { type: 'string', description: 'Filter by status: draft, open, paid, void, uncollectible (optional)' },
      },
    },
  },
  {
    name: 'stripe_payouts',
    description: 'List payouts to bank account.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
];

export class StripePlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private client: StripeApiClient | null = null;
  private vault: CredentialVault | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    this.vault = deps.vault;
    deps.logger('Stripe plugin initialized');
  }

  private getClient(): StripeApiClient {
    if (!this.vault) throw new Error('Vault not available');
    const creds = this.vault.getCredentials('stripe');
    if (!creds?.apiKey) throw new Error('Stripe not connected. Add your restricted API key first.');
    if (!this.client) {
      this.client = new StripeApiClient(creds.apiKey);
    }
    return this.client;
  }

  isConnected(): boolean {
    if (!this.vault) return false;
    const creds = this.vault.getCredentials('stripe');
    return !!creds?.apiKey;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const client = this.getClient();
      switch (toolName) {
        case 'stripe_balance':
          return client.getBalance();
        case 'stripe_charges':
          return client.listCharges(
            (args.limit as number) ?? 20,
            args.startDate as string | undefined,
            args.endDate as string | undefined,
          );
        case 'stripe_invoices':
          return client.listInvoices(
            (args.limit as number) ?? 20,
            args.status as string | undefined,
          );
        case 'stripe_payouts':
          return client.listPayouts((args.limit as number) ?? 20);
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Stripe error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
