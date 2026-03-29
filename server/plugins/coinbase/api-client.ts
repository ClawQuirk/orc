import { randomUUID, createHmac, createPrivateKey, randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import type { ToolResult } from '../base-plugin.js';
import { toCents, fromCents } from '../financial/normalize.js';
import { getDatabase } from '../../db/index.js';

const CB_BASE = 'https://api.coinbase.com';

// PKCS8 DER prefix for Ed25519 private keys (RFC 8410)
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * Coinbase API client.
 * Supports both HMAC (legacy v2 API keys) and JWT (CDP Ed25519 keys).
 * Auto-detects which method works.
 * SECURITY: API secret stored in vault, never logged.
 */
export class CoinbaseApiClient {
  private apiKeyId: string;
  private secret: string;
  private authMethod: 'hmac' | 'jwt' | null = null;

  constructor(apiKeyId: string, secret: string) {
    this.apiKeyId = apiKeyId;
    this.secret = secret;

    // Detect auth method from key format instead of trial-and-error
    // CDP keys have PEM-formatted secrets; legacy v2 keys are short alphanumeric strings
    const trimmed = secret.replace(/\\n/g, '\n').trim();
    if (trimmed.startsWith('-----BEGIN') || trimmed.length > 100) {
      this.authMethod = 'jwt';
      console.log('[coinbase] Detected CDP key format — using JWT authentication');
    } else {
      this.authMethod = 'hmac';
      console.log('[coinbase] Detected legacy key format — using HMAC authentication');
    }
  }

  private async signedRequestHmac(method: string, path: string): Promise<Response> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = timestamp + method.toUpperCase() + path;
    const signature = createHmac('sha256', this.secret).update(message).digest('hex');

    return fetch(`${CB_BASE}${path}`, {
      method,
      headers: {
        'CB-ACCESS-KEY': this.apiKeyId,
        'CB-ACCESS-SIGN': signature,
        'CB-ACCESS-TIMESTAMP': timestamp,
        'CB-VERSION': '2024-01-01',
        'Content-Type': 'application/json',
      },
    });
  }

  private async signedRequestJwt(method: string, path: string): Promise<Response> {
    const secret = this.secret.replace(/\\n/g, '\n').trim();
    let privateKey;

    try {
      if (secret.startsWith('-----BEGIN')) {
        privateKey = createPrivateKey(secret);
      } else {
        // Raw base64 Ed25519 seed — wrap in PKCS8
        let seedBytes = Buffer.from(secret, 'base64');
        if (seedBytes.length > 32) seedBytes = seedBytes.subarray(0, 32);
        const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, seedBytes]);
        privateKey = createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
      }
    } catch (keyErr: any) {
      console.error(`[coinbase] Private key parse error: ${keyErr.message}`);
      throw keyErr;
    }

    const now = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(16).toString('hex');
    const uri = `${method.toUpperCase()} api.coinbase.com${path}`;

    const alg = privateKey.asymmetricKeyType === 'ed25519' ? 'EdDSA' : 'ES256';
    console.error(`[coinbase] JWT debug: alg=${alg}, keyType=${privateKey.asymmetricKeyType}, kid=${this.apiKeyId.slice(0, 30)}..., uri=${uri}`);

    const jwt = await new SignJWT({
      sub: this.apiKeyId,
      iss: 'cdp',
      aud: ['cdp_service'],
      uris: [uri],
    })
      .setProtectedHeader({ alg, kid: this.apiKeyId, nonce, typ: 'JWT' })
      .setNotBefore(now)
      .setExpirationTime(now + 120)
      .setIssuedAt(now)
      .sign(privateKey);

    return fetch(`${CB_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'CB-VERSION': '2024-01-01',
        'Content-Type': 'application/json',
      },
    });
  }

  private async signedRequest(method: string, path: string): Promise<any> {
    // If we already know which method works, use it
    if (this.authMethod === 'hmac') {
      const res = await this.signedRequestHmac(method, path);
      if (!res.ok) throw new Error(`Coinbase API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return res.json();
    }
    if (this.authMethod === 'jwt') {
      const res = await this.signedRequestJwt(method, path);
      if (!res.ok) {
        const body = await res.text();
        console.error(`[coinbase] JWT auth failed for ${method} ${path}: ${res.status} ${body.slice(0, 500)}`);
        throw new Error(`Coinbase API ${res.status}: ${body.slice(0, 200)}`);
      }
      return res.json();
    }

    // Should not reach here — authMethod is set in constructor
    throw new Error('Auth method not determined');
  }

  async listAccounts(): Promise<ToolResult> {
    try {
      const data = await this.signedRequest('GET', '/v2/accounts?limit=100');
      const accounts = (data.data ?? []).filter((a: any) => parseFloat(a.balance?.amount ?? '0') > 0);

      if (accounts.length === 0) {
        return { content: [{ type: 'text', text: 'No Coinbase accounts with balances found.' }] };
      }

      const db = getDatabase();
      for (const acct of accounts) {
        const currency = acct.balance?.currency ?? 'USD';
        const amount = parseFloat(acct.balance?.amount ?? '0');
        const balanceCents = toCents(amount, currency);

        db.prepare(`
          INSERT OR REPLACE INTO financial_accounts
          (id, plugin_id, source_account_id, account_name, account_type, institution_name, currency, balance_cents, balance_updated_at, is_active)
          VALUES (?, 'coinbase', ?, ?, 'crypto', 'Coinbase', ?, ?, datetime('now'), 1)
        `).run(
          `coinbase-${acct.id}`, acct.id,
          `${acct.name} (${currency})`,
          currency, balanceCents,
        );
      }

      const text = accounts.map((a: any) => {
        const amount = a.balance?.amount ?? '0';
        const currency = a.balance?.currency ?? '';
        const native = a.native_balance ? `${a.native_balance.amount} ${a.native_balance.currency}` : '';
        return `**${a.name}**\n${amount} ${currency}${native ? ` (${native})` : ''}\n[ID: ${a.id}]`;
      }).join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Coinbase accounts error: ${err.message}` }], isError: true };
    }
  }

  async getPortfolio(): Promise<ToolResult> {
    try {
      const data = await this.signedRequest('GET', '/v2/accounts?limit=100');
      const accounts = (data.data ?? []).filter((a: any) => parseFloat(a.balance?.amount ?? '0') > 0);

      if (accounts.length === 0) {
        return { content: [{ type: 'text', text: 'Empty portfolio.' }] };
      }

      let totalUsd = 0;
      const holdings: string[] = [];
      for (const a of accounts) {
        const nativeAmount = parseFloat(a.native_balance?.amount ?? '0');
        totalUsd += nativeAmount;
        holdings.push(`${a.balance.amount} ${a.balance.currency} = $${nativeAmount.toFixed(2)}`);
      }

      const text = [
        `**Coinbase Portfolio**`,
        `Total: $${totalUsd.toFixed(2)}`,
        '',
        ...holdings,
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Coinbase portfolio error: ${err.message}` }], isError: true };
    }
  }

  async listTransactions(accountId: string, limit = 20): Promise<ToolResult> {
    try {
      const data = await this.signedRequest('GET', `/v2/accounts/${accountId}/transactions?limit=${limit}`);
      const txns = data.data ?? [];

      if (txns.length === 0) {
        return { content: [{ type: 'text', text: 'No transactions found for this account.' }] };
      }

      const text = txns.map((t: any) => {
        const amount = `${t.amount?.amount} ${t.amount?.currency}`;
        const native = t.native_amount ? `${t.native_amount.amount} ${t.native_amount.currency}` : '';
        const date = (t.created_at ?? '').split('T')[0];
        return `**${amount}**${native ? ` (${native})` : ''}\n${t.type}: ${t.description || t.details?.title || ''}\n${date} [${t.status}] [ID: ${t.id}]`;
      }).join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Coinbase transactions error: ${err.message}` }], isError: true };
    }
  }

  async getSpotPrices(currencies?: string[]): Promise<ToolResult> {
    try {
      const pairs = currencies?.length
        ? currencies.map((c) => `${c.toUpperCase()}-USD`)
        : ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD', 'ADA-USD'];

      const prices: string[] = [];
      for (const pair of pairs) {
        try {
          const data = await this.signedRequest('GET', `/v2/prices/${pair}/spot`);
          prices.push(`**${pair}**: $${parseFloat(data.data?.amount ?? '0').toLocaleString()}`);
        } catch {
          prices.push(`**${pair}**: unavailable`);
        }
      }

      return { content: [{ type: 'text', text: `**Spot Prices**\n\n${prices.join('\n')}` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Coinbase prices error: ${err.message}` }], isError: true };
    }
  }
}
