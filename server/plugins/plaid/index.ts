import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { PlaidApiClient } from './api-client.js';
import type { CredentialVault } from '../../vault/credential-vault.js';

const manifest: PluginManifest = {
  id: 'plaid',
  name: 'Plaid (Banking)',
  description: 'Link bank accounts, view balances, and track transactions via Plaid',
  version: '0.1.0',
  icon: 'bank',
  category: 'financial',
  requiresAuth: true,
  authType: 'api-key',
  toolPrefix: 'plaid',
  connection: 'plaid',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'plaid_accounts',
    description: 'List linked bank accounts with balances.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'plaid_transactions',
    description: 'Get recent bank transactions. Automatically syncs new transactions from Plaid.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look back (default 30)' },
        accountId: { type: 'string', description: 'Filter to a specific account ID (optional)' },
      },
    },
  },
  {
    name: 'plaid_balances',
    description: 'Get current balances for all linked bank accounts (refreshes from Plaid).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'plaid_sync',
    description: 'Manually trigger a full sync of accounts and transactions from all linked banks.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export class PlaidPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private client: PlaidApiClient | null = null;
  private vault: CredentialVault | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    this.vault = deps.vault;
    deps.logger('Plaid plugin initialized');
  }

  getClient(): PlaidApiClient | null {
    if (!this.vault) return null;
    const creds = this.vault.getCredentials('plaid-client');
    if (!creds?.apiKey || !creds?.apiSecret) return null;
    if (!this.client) {
      const useSandbox = creds.extra?.environment === 'sandbox';
      this.client = new PlaidApiClient(creds.apiKey, creds.apiSecret, this.vault, useSandbox);
    }
    return this.client;
  }

  isConfigured(): boolean {
    if (!this.vault) return false;
    const creds = this.vault.getCredentials('plaid-client');
    return !!creds?.apiKey && !!creds?.apiSecret;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const client = this.getClient();
    if (!client) {
      return { content: [{ type: 'text', text: 'Plaid not configured. Add your Client ID and Secret in the Financial setup panel.' }], isError: true };
    }

    try {
      switch (toolName) {
        case 'plaid_accounts':
          return client.listAccounts();
        case 'plaid_transactions':
          return client.getTransactions((args.days as number) ?? 30, args.accountId as string | undefined);
        case 'plaid_balances':
          return client.getBalances();
        case 'plaid_sync':
          return client.syncAll();
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Plaid error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
