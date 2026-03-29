import type { Router } from '../router.js';
import { sendJson, readJsonBody } from '../router.js';
import type { CredentialVault } from '../vault/credential-vault.js';
import { sanitizeForLog } from '../plugins/financial/normalize.js';
import Stripe from 'stripe';
import type { PlaidPlugin } from '../plugins/plaid/index.js';

// Financial service IDs that we support
const FINANCIAL_SERVICES = ['stripe', 'paypal', 'coinbase', 'plaid', 'robinhood'] as const;

export function registerFinancialRoutes(router: Router, vault: CredentialVault, plaidPlugin: PlaidPlugin): void {

  // Status endpoint — which services are connected
  router.get('/api/financial/status', (_req, res) => {
    if (!vault.isUnlocked()) {
      sendJson(res, 403, { error: 'Vault is locked' });
      return;
    }

    const services = FINANCIAL_SERVICES.map((id) => {
      const creds = vault.getCredentials(id);
      return {
        pluginId: id,
        connected: !!creds?.apiKey || !!creds?.accessToken,
      };
    });

    sendJson(res, 200, { services });
  });

  // --- Stripe connect/disconnect ---
  router.post('/api/financial/stripe/connect', async (req, res) => {
    if (!vault.isUnlocked()) {
      sendJson(res, 403, { error: 'Vault is locked' });
      return;
    }

    const body = await readJsonBody<{ apiKey: string }>(req);
    const key = body.apiKey?.trim();

    if (!key) {
      sendJson(res, 400, { error: 'API key required' });
      return;
    }

    // SECURITY: Validate key format — must be a restricted key or test key
    if (!key.startsWith('rk_live_') && !key.startsWith('rk_test_') && !key.startsWith('sk_test_')) {
      sendJson(res, 400, {
        error: 'Please use a restricted API key (starts with rk_live_ or rk_test_). Create one at dashboard.stripe.com/apikeys with read-only permissions.',
      });
      return;
    }

    // Validate by making a test API call
    try {
      const stripe = new Stripe(key);
      await stripe.balance.retrieve();
    } catch (err: any) {
      // SECURITY: Don't expose the key in the error message
      console.error('[stripe] Connection validation failed:', sanitizeForLog({ error: err.message }));
      sendJson(res, 401, { error: 'Invalid API key. Could not connect to Stripe.' });
      return;
    }

    vault.setCredentials('stripe', {
      pluginId: 'stripe',
      type: 'api-key',
      apiKey: key,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // SECURITY: Never log the key
    console.log('[stripe] Connected successfully');
    sendJson(res, 200, { success: true });
  });

  router.post('/api/financial/stripe/disconnect', (_req, res) => {
    if (!vault.isUnlocked()) {
      sendJson(res, 403, { error: 'Vault is locked' });
      return;
    }
    vault.removeCredentials('stripe');
    console.log('[stripe] Disconnected');
    sendJson(res, 200, { success: true });
  });

  // --- PayPal connect/disconnect (placeholder for next step) ---
  router.post('/api/financial/paypal/connect', async (req, res) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    const body = await readJsonBody<{ clientId: string; clientSecret: string }>(req);
    if (!body.clientId?.trim() || !body.clientSecret?.trim()) {
      sendJson(res, 400, { error: 'Client ID and Client Secret required' });
      return;
    }
    vault.setCredentials('paypal', {
      pluginId: 'paypal',
      type: 'api-key',
      apiKey: body.clientId.trim(),
      apiSecret: body.clientSecret.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.log('[paypal] Connected');
    sendJson(res, 200, { success: true });
  });

  router.post('/api/financial/paypal/disconnect', (_req, res) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    vault.removeCredentials('paypal');
    sendJson(res, 200, { success: true });
  });

  // --- Coinbase connect/disconnect (placeholder) ---
  router.post('/api/financial/coinbase/connect', async (req, res) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    const body = await readJsonBody<{ apiKeyId: string; privateKey: string }>(req);
    if (!body.apiKeyId?.trim() || !body.privateKey?.trim()) {
      sendJson(res, 400, { error: 'API Key and API Secret required' });
      return;
    }
    vault.setCredentials('coinbase', {
      pluginId: 'coinbase',
      type: 'api-key',
      apiKey: body.apiKeyId.trim(),
      apiSecret: body.privateKey.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.log('[coinbase] Connected');
    sendJson(res, 200, { success: true });
  });

  router.post('/api/financial/coinbase/disconnect', (_req, res) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    vault.removeCredentials('coinbase');
    sendJson(res, 200, { success: true });
  });

  // --- Robinhood connect/disconnect (placeholder) ---
  router.post('/api/financial/robinhood/connect', async (req, res) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    const body = await readJsonBody<{ apiKey: string; privateKeyBase64: string }>(req);
    if (!body.apiKey?.trim() || !body.privateKeyBase64?.trim()) {
      sendJson(res, 400, { error: 'API Key and Private Key (Base64) required' });
      return;
    }
    vault.setCredentials('robinhood', {
      pluginId: 'robinhood',
      type: 'api-key',
      apiKey: body.apiKey.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extra: { privateKeyBase64: body.privateKeyBase64.trim() },
    });
    console.log('[robinhood] Connected');
    sendJson(res, 200, { success: true });
  });

  router.post('/api/financial/robinhood/disconnect', (_req, res) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    vault.removeCredentials('robinhood');
    sendJson(res, 200, { success: true });
  });

  // --- Plaid connect/disconnect + Link flow ---
  router.post('/api/financial/plaid/connect', async (req, res) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    const body = await readJsonBody<{ clientId: string; secret: string; environment?: string }>(req);
    if (!body.clientId?.trim() || !body.secret?.trim()) {
      sendJson(res, 400, { error: 'Client ID and Secret required' });
      return;
    }
    vault.setCredentials('plaid-client', {
      pluginId: 'plaid',
      type: 'api-key',
      apiKey: body.clientId.trim(),
      apiSecret: body.secret.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extra: { environment: body.environment ?? 'production' },
    });
    // Reset the plugin client so it picks up new credentials
    (plaidPlugin as any).client = null;
    console.log('[plaid] Client credentials saved');
    sendJson(res, 200, { success: true });
  });

  router.post('/api/financial/plaid/disconnect', (_req, res) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    // Remove client creds and all linked items
    const services = vault.listServices();
    for (const svc of services) {
      if (svc.startsWith('plaid')) vault.removeCredentials(svc);
    }
    (plaidPlugin as any).client = null;
    console.log('[plaid] Disconnected all');
    sendJson(res, 200, { success: true });
  });

  router.post('/api/financial/plaid/link-token', async (_req, res) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    const client = plaidPlugin.getClient();
    if (!client) {
      sendJson(res, 400, { error: 'Plaid not configured. Save Client ID and Secret first.' });
      return;
    }
    try {
      const { linkToken } = await client.createLinkToken();
      sendJson(res, 200, { linkToken });
    } catch (err: any) {
      console.error('[plaid] Link token error:', sanitizeForLog({ error: err.message }));
      sendJson(res, 500, { error: 'Failed to create link token. Check your Plaid credentials.' });
    }
  });

  router.post('/api/financial/plaid/exchange', async (req, res) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    const body = await readJsonBody<{ publicToken: string }>(req);
    if (!body.publicToken) {
      sendJson(res, 400, { error: 'publicToken required' });
      return;
    }
    const client = plaidPlugin.getClient();
    if (!client) {
      sendJson(res, 400, { error: 'Plaid not configured' });
      return;
    }
    try {
      const { itemId } = await client.exchangePublicToken(body.publicToken);
      sendJson(res, 200, { success: true, itemId });
    } catch (err: any) {
      console.error('[plaid] Exchange error:', sanitizeForLog({ error: err.message }));
      sendJson(res, 500, { error: 'Failed to exchange token' });
    }
  });

  router.get('/api/financial/plaid/items', (_req, res) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    const client = plaidPlugin.getClient();
    if (!client) {
      sendJson(res, 200, { items: [], configured: false });
      return;
    }
    const items = client.getLinkedItems();
    sendJson(res, 200, { items, configured: true });
  });

  router.delete('/api/financial/plaid/items/:itemId', async (_req, res, params) => {
    if (!vault.isUnlocked()) { sendJson(res, 403, { error: 'Vault is locked' }); return; }
    const client = plaidPlugin.getClient();
    if (!client) { sendJson(res, 400, { error: 'Plaid not configured' }); return; }
    try {
      await client.unlinkItem(params.itemId);
      sendJson(res, 200, { success: true });
    } catch (err: any) {
      sendJson(res, 500, { error: err.message });
    }
  });
}
