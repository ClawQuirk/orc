import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { getSpendingByCategory, getSpendingByMerchant, getNetWorth, getRecentTransactions } from './aggregation.js';
import { fromCents } from './normalize.js';

const manifest: PluginManifest = {
  id: 'financial-overview',
  name: 'Financial Overview',
  description: 'Cross-service financial aggregation: spending, merchants, net worth, recent transactions',
  version: '0.1.0',
  icon: 'chart',
  category: 'financial',
  requiresAuth: false,
  authType: 'none',
  toolPrefix: 'financial',
  connection: 'local',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'financial_spending',
    description: 'Spending breakdown by category across all connected financial services. Answers "How much did I spend on food this month?"',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD, default: first of current month)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD, default: today)' },
        category: { type: 'string', description: 'Filter to a specific category (optional)' },
      },
    },
  },
  {
    name: 'financial_merchants',
    description: 'Top merchants by spend amount across all connected financial services.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        limit: { type: 'number', description: 'Max merchants (default 20)' },
      },
    },
  },
  {
    name: 'financial_net_worth',
    description: 'Total balance across all linked financial accounts (bank + crypto + payment processors).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'financial_recent',
    description: 'Recent transactions across all connected financial services, sorted by date.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max transactions (default 30)' },
        pluginId: { type: 'string', description: 'Filter to a specific service: stripe, paypal, coinbase, plaid, robinhood (optional)' },
      },
    },
  },
];

export class FinancialOverviewPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;

  async initialize(deps: PluginDependencies): Promise<void> {
    deps.logger('Financial Overview plugin initialized');
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'financial_spending': {
          const now = new Date();
          const startDate = (args.startDate as string) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
          const endDate = (args.endDate as string) ?? now.toISOString().split('T')[0];

          const summary = getSpendingByCategory({ startDate, endDate });

          const lines = [
            `**Spending Summary** (${startDate} to ${endDate})`,
            `Total Spent: ${fromCents(summary.totalSpentCents, 'USD')}`,
            `Total Income: ${fromCents(summary.totalIncomeCents, 'USD')}`,
            '',
            '**By Category:**',
          ];

          const categories = Object.entries(summary.categoryBreakdown).sort((a, b) => b[1] - a[1]);
          if (categories.length === 0) {
            lines.push('(no transactions in this period)');
          } else {
            for (const [cat, cents] of categories) {
              if (args.category && cat.toLowerCase() !== (args.category as string).toLowerCase()) continue;
              const pct = summary.totalSpentCents > 0 ? Math.round((cents / summary.totalSpentCents) * 100) : 0;
              lines.push(`- ${cat}: ${fromCents(cents, 'USD')} (${pct}%)`);
            }
          }

          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }

        case 'financial_merchants': {
          const merchants = getSpendingByMerchant({
            startDate: args.startDate as string | undefined,
            endDate: args.endDate as string | undefined,
            limit: (args.limit as number) ?? 20,
          });

          if (merchants.length === 0) {
            return { content: [{ type: 'text', text: 'No transaction data found for the specified period.' }] };
          }

          const lines = ['**Top Merchants by Spend**', ''];
          for (const m of merchants) {
            lines.push(`- ${m.merchantName}: ${fromCents(m.totalCents, 'USD')} (${m.transactionCount} transactions)`);
          }

          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }

        case 'financial_net_worth': {
          const { accounts, totalCents } = getNetWorth();

          if (accounts.length === 0) {
            return { content: [{ type: 'text', text: 'No financial accounts linked. Connect services in the Financial setup panel.' }] };
          }

          const lines = [
            `**Net Worth: ${fromCents(totalCents, 'USD')}**`,
            '',
            '**Accounts:**',
          ];

          for (const a of accounts) {
            const balance = a.balanceCents != null ? fromCents(a.balanceCents, a.currency) : 'N/A';
            const mask = a.mask ? ` ****${a.mask}` : '';
            lines.push(`- ${a.institutionName ?? a.pluginId} — ${a.accountName}${mask}: ${balance} (${a.accountType})`);
          }

          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }

        case 'financial_recent': {
          const txns = getRecentTransactions({
            limit: (args.limit as number) ?? 30,
            pluginIds: args.pluginId ? [args.pluginId as string] : undefined,
          });

          if (txns.length === 0) {
            return { content: [{ type: 'text', text: 'No transactions found.' }] };
          }

          const text = txns.map((t) => {
            const amount = fromCents(t.amountCents, t.currency);
            const source = t.pluginId.charAt(0).toUpperCase() + t.pluginId.slice(1);
            return `**${amount}** — ${t.merchantName || t.description || '(unknown)'}\n${t.transactionDate} [${t.category ?? 'Other'}] (${source})`;
          }).join('\n\n');

          return { content: [{ type: 'text', text }] };
        }

        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Financial overview error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {}
}
