import nacl from 'tweetnacl';
import { fromByteArray, toByteArray } from 'base64-js';
import type { ToolResult } from '../base-plugin.js';

const RH_BASE = 'https://trading.robinhood.com';

/**
 * Robinhood Crypto Trading API client.
 * SECURITY: Uses ED25519 key pair for request signing. Private key from vault, never logged.
 * Crypto-only — no stocks, options, or bank transfers.
 */
export class RobinhoodApiClient {
  private apiKey: string;
  private privateKeyBytes: Uint8Array;

  constructor(apiKey: string, privateKeyBase64: string) {
    this.apiKey = apiKey;
    this.privateKeyBytes = toByteArray(privateKeyBase64);
  }

  private async signedRequest(method: string, path: string, body?: string): Promise<any> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `${this.apiKey}${timestamp}${path}${method.toUpperCase()}${body ?? ''}`;
    const messageBytes = new TextEncoder().encode(message);

    const signature = nacl.sign.detached(messageBytes, this.privateKeyBytes);
    const signatureBase64 = fromByteArray(signature);

    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'x-timestamp': timestamp,
      'x-signature': signatureBase64,
      'Content-Type': 'application/json',
    };

    const res = await fetch(`${RH_BASE}${path}`, {
      method,
      headers,
      body: body ?? undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Robinhood API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  async getCryptoHoldings(): Promise<ToolResult> {
    try {
      const data = await this.signedRequest('GET', '/api/v1/crypto/trading/holdings/');
      const holdings = data.results ?? [];

      if (holdings.length === 0) {
        return { content: [{ type: 'text', text: 'No crypto holdings found.' }] };
      }

      const lines = ['**Robinhood Crypto Holdings**', ''];
      for (const h of holdings) {
        const qty = parseFloat(h.total_quantity ?? '0');
        if (qty <= 0) continue;
        const cost = parseFloat(h.cost_basis ?? '0');
        const current = parseFloat(h.market_value ?? '0');
        const pnl = current - cost;
        lines.push(`**${h.currency_code}**: ${qty.toFixed(8)}`);
        lines.push(`  Value: $${current.toFixed(2)} (Cost: $${cost.toFixed(2)}, P&L: $${pnl.toFixed(2)})`);
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Robinhood holdings error: ${err.message}` }], isError: true };
    }
  }

  async getCryptoPrices(symbols?: string[]): Promise<ToolResult> {
    try {
      const pairs = symbols?.length
        ? symbols.map((s) => `${s.toUpperCase()}-USD`)
        : ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD'];

      const data = await this.signedRequest('GET', `/api/v1/crypto/trading/pairs/`);
      const allPairs = data.results ?? [];

      const prices: string[] = [];
      for (const pair of pairs) {
        const found = allPairs.find((p: any) => p.symbol === pair);
        if (found) {
          prices.push(`**${pair}**: $${parseFloat(found.price ?? '0').toLocaleString()}`);
        } else {
          prices.push(`**${pair}**: unavailable`);
        }
      }

      return { content: [{ type: 'text', text: `**Robinhood Crypto Prices**\n\n${prices.join('\n')}` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Robinhood prices error: ${err.message}` }], isError: true };
    }
  }

  async getCryptoHistory(limit = 20): Promise<ToolResult> {
    try {
      const data = await this.signedRequest('GET', `/api/v1/crypto/trading/orders/?page_size=${limit}`);
      const orders = data.results ?? [];

      if (orders.length === 0) {
        return { content: [{ type: 'text', text: 'No crypto order history found.' }] };
      }

      const text = orders.map((o: any) => {
        const qty = o.quantity ?? '0';
        const price = o.price ?? o.average_price ?? '0';
        const date = (o.created_at ?? '').split('T')[0];
        return `**${o.side?.toUpperCase()} ${qty} ${o.currency_pair_id}** @ $${parseFloat(price).toFixed(2)}\n${date} [${o.state}] [ID: ${o.id}]`;
      }).join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Robinhood history error: ${err.message}` }], isError: true };
    }
  }
}
