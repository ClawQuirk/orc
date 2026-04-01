import 'dotenv/config';
import http from 'node:http';
import { exec } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Router, sendJson, readJsonBody, getQueryParams } from './router.js';
import { PtyManager } from './pty-manager.js';
import { detectAvailableShells } from './shell-detect.js';
import { initDatabase, closeDatabase, isDatabaseReady, getDatabase, hasEncryptedDb } from './db/index.js';
import { CredentialVault } from './vault/credential-vault.js';
import { pluginLoader } from './plugins/loader.js';
import { GoogleAuth } from './plugins/google/google-auth.js';
import { GmailPlugin } from './plugins/google-gmail/index.js';
import { CalendarPlugin } from './plugins/google-calendar/index.js';
import { ContactsPlugin } from './plugins/google-contacts/index.js';
import { DocsPlugin } from './plugins/google-docs/index.js';
import { SheetsPlugin } from './plugins/google-sheets/index.js';
import { SlidesPlugin } from './plugins/google-slides/index.js';
import { ProjectsPlugin } from './plugins/projects/index.js';
import { JournalPlugin } from './plugins/journal/index.js';
import { StripePlugin } from './plugins/stripe/index.js';
import { PayPalPlugin } from './plugins/paypal/index.js';
import { CoinbasePlugin } from './plugins/coinbase/index.js';
import { RobinhoodPlugin } from './plugins/robinhood/index.js';
import { PlaidPlugin } from './plugins/plaid/index.js';
import { FinancialOverviewPlugin } from './plugins/financial/index.js';
import { SproutsPlugin } from './plugins/sprouts/index.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerJournalRoutes } from './routes/journal.js';
import { registerFinancialRoutes } from './routes/financial.js';
import { registerAutomationRoutes } from './routes/automation.js';
import { browserManager } from './automation/browser-manager.js';
import { backupKeyToDrive, restoreKeyFromDrive, hasKeyBackup, backupDbToDrive, getDbBackupInfo, restoreDbFromDrive } from './plugins/google/drive-key-backup.js';

const PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);

// --- Phase 1: DB-independent initialization ---
const vault = new CredentialVault();
const googleAuth = new GoogleAuth(vault, `http://localhost:${parseInt(process.env.PORT || '5173', 10)}/api/auth/google/callback`);
const availableShells = detectAvailableShells();
const ptyManager = new PtyManager();
ptyManager.init();

// Plugin instances (created but NOT registered until DB is ready)
const gmailPlugin = new GmailPlugin();
gmailPlugin.setGoogleAuth(googleAuth);
const calendarPlugin = new CalendarPlugin();
calendarPlugin.setGoogleAuth(googleAuth);
const contactsPlugin = new ContactsPlugin();
contactsPlugin.setGoogleAuth(googleAuth);
const docsPlugin = new DocsPlugin();
docsPlugin.setGoogleAuth(googleAuth);
const sheetsPlugin = new SheetsPlugin();
sheetsPlugin.setGoogleAuth(googleAuth);
const slidesPlugin = new SlidesPlugin();
slidesPlugin.setGoogleAuth(googleAuth);
const projectsPlugin = new ProjectsPlugin();
const journalPlugin = new JournalPlugin();
const stripePlugin = new StripePlugin();
const paypalPlugin = new PayPalPlugin();
const coinbasePlugin = new CoinbasePlugin();
const robinhoodPlugin = new RobinhoodPlugin();
const plaidPlugin = new PlaidPlugin();
const financialOverviewPlugin = new FinancialOverviewPlugin();
const sproutsPlugin = new SproutsPlugin();

// --- Phase 2: Called after vault unlock — initializes DB and registers plugins ---
let dbInitialized = false;

function onVaultUnlocked(): void {
  if (dbInitialized) return;

  // Get or generate DB encryption key
  let dbKey = vault.getDbEncryptionKey();
  if (!dbKey) {
    // SECURITY: Do NOT generate a new key if an encrypted DB already exists.
    // This means the vault was reset and the user needs to recover the key from Google Drive.
    // Generating a new key here would make the existing encrypted DB inaccessible AND
    // the auto-backup on OAuth callback would overwrite the correct key in Drive.
    if (hasEncryptedDb()) {
      console.log('[vault] Encrypted DB exists but no key in vault — recovery needed. Skipping DB init.');
      console.log('[vault] User must reconnect Google and restore the key from Drive via /api/recovery/restore');
      return;
    }
    // No encrypted DB exists — first-time setup, generate a new key
    dbKey = randomBytes(32).toString('hex');
    vault.setDbEncryptionKey(dbKey);
    console.log('[vault] Generated new DB encryption key (first-time setup)');
  }

  // Initialize encrypted database (migrates from plaintext if needed)
  const db = initDatabase(dbKey);

  // Register all plugins now that DB is available
  const pluginDeps = { db, vault, logger: (msg: string) => console.log(`[plugin] ${msg}`) };
  pluginLoader.register(gmailPlugin, pluginDeps);
  pluginLoader.register(calendarPlugin, pluginDeps);
  pluginLoader.register(contactsPlugin, pluginDeps);
  pluginLoader.register(docsPlugin, pluginDeps);
  pluginLoader.register(sheetsPlugin, pluginDeps);
  pluginLoader.register(slidesPlugin, pluginDeps);
  pluginLoader.register(projectsPlugin, pluginDeps);
  pluginLoader.register(journalPlugin, pluginDeps);
  pluginLoader.register(stripePlugin, pluginDeps);
  pluginLoader.register(paypalPlugin, pluginDeps);
  pluginLoader.register(coinbasePlugin, pluginDeps);
  pluginLoader.register(robinhoodPlugin, pluginDeps);
  pluginLoader.register(plaidPlugin, pluginDeps);
  pluginLoader.register(financialOverviewPlugin, pluginDeps);
  pluginLoader.register(sproutsPlugin, pluginDeps);

  dbInitialized = true;
  console.log('[server] Database and plugins initialized');
}

function onVaultLocked(): void {
  pluginLoader.shutdownAll();
  closeDatabase();
  dbInitialized = false;
  console.log('[server] Database closed, plugins shut down');
}

// --- Router ---
const router = new Router();

router.get('/health', (_req, res) => {
  sendJson(res, 200, { status: 'ok', dbReady: isDatabaseReady() });
});

router.get('/api/shells', (_req, res) => {
  sendJson(res, 200, availableShells);
});

router.post('/api/open-folder', (_req, res) => {
  const cwd = process.cwd();
  const platform = process.platform;
  let cmd: string;
  if (platform === 'win32') {
    cmd = `explorer "${cwd}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${cwd}"`;
  } else {
    cmd = `xdg-open "${cwd}"`;
  }
  exec(cmd, (err) => {
    if (err) {
      console.error(`[server] Failed to open folder: ${err.message}`);
      sendJson(res, 500, { error: 'Failed to open folder' });
    } else {
      sendJson(res, 200, { path: cwd });
    }
  });
});

// --- Vault API ---
router.get('/api/vault/status', (_req, res) => {
  sendJson(res, 200, {
    exists: vault.exists(),
    unlocked: vault.isUnlocked(),
    dbReady: isDatabaseReady(),
  });
});

router.post('/api/vault/create', async (req, res) => {
  const body = await readJsonBody<{ password: string }>(req);
  if (!body.password || body.password.length < 4) {
    sendJson(res, 400, { error: 'Password must be at least 4 characters' });
    return;
  }
  if (vault.exists()) {
    sendJson(res, 409, { error: 'Vault already exists' });
    return;
  }
  vault.create(body.password);
  onVaultUnlocked();
  sendJson(res, 200, { success: true });
});

// Rate limiting for vault unlock (brute-force protection)
const unlockAttempts: { count: number; resetAt: number } = { count: 0, resetAt: 0 };
const MAX_UNLOCK_ATTEMPTS = 5;
const UNLOCK_WINDOW_MS = 60_000; // 1 minute

router.post('/api/vault/unlock', async (req, res) => {
  const now = Date.now();
  if (now > unlockAttempts.resetAt) {
    unlockAttempts.count = 0;
    unlockAttempts.resetAt = now + UNLOCK_WINDOW_MS;
  }
  if (unlockAttempts.count >= MAX_UNLOCK_ATTEMPTS) {
    const retryAfter = Math.ceil((unlockAttempts.resetAt - now) / 1000);
    sendJson(res, 429, {
      error: `Too many attempts. Try again in ${retryAfter} seconds.`,
      retryAfter,
    });
    return;
  }

  const body = await readJsonBody<{ password: string }>(req);
  if (!body.password) {
    sendJson(res, 400, { error: 'Password required' });
    return;
  }

  unlockAttempts.count++;
  const success = vault.unlock(body.password);
  if (success) {
    unlockAttempts.count = 0;
    onVaultUnlocked();
    sendJson(res, 200, { success: true });
  } else {
    const remaining = MAX_UNLOCK_ATTEMPTS - unlockAttempts.count;
    sendJson(res, 401, {
      error: `Invalid password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
    });
  }
});

router.post('/api/vault/lock', (_req, res) => {
  onVaultLocked();
  vault.lock();
  sendJson(res, 200, { success: true });
});

router.delete('/api/vault/reset', (_req, res) => {
  onVaultLocked();
  vault.delete();
  sendJson(res, 200, { success: true });
});

router.get('/api/vault/services', (_req, res) => {
  if (!vault.isUnlocked()) {
    sendJson(res, 403, { error: 'Vault is locked' });
    return;
  }
  sendJson(res, 200, { services: vault.listServices() });
});

// --- Recovery API ---
router.get('/api/recovery/status', async (_req, res) => {
  const googleConnected = vault.isUnlocked() && googleAuth.isAuthorized();
  let hasBackup = false;
  if (googleConnected) {
    try {
      hasBackup = await hasKeyBackup(googleAuth.getAuthenticatedClient());
    } catch { /* ignore — scope may not be granted yet */ }
  }
  sendJson(res, 200, { googleConnected, hasBackup });
});

router.post('/api/recovery/backup', async (_req, res) => {
  if (!vault.isUnlocked()) {
    sendJson(res, 403, { error: 'Vault is locked' });
    return;
  }
  if (!dbInitialized) {
    sendJson(res, 400, { error: 'DB not initialized — cannot verify key is correct. Complete recovery first.' });
    return;
  }
  if (!googleAuth.isAuthorized()) {
    sendJson(res, 400, { error: 'Google not authorized' });
    return;
  }
  const dbKey = vault.getDbEncryptionKey();
  if (!dbKey) {
    sendJson(res, 400, { error: 'No DB encryption key in vault' });
    return;
  }
  try {
    await backupKeyToDrive(googleAuth.getAuthenticatedClient(), dbKey);
    sendJson(res, 200, { success: true });
  } catch (err: any) {
    sendJson(res, 500, { error: err.message });
  }
});

router.post('/api/recovery/restore', async (_req, res) => {
  if (!vault.isUnlocked()) {
    sendJson(res, 403, { error: 'Vault must be unlocked first' });
    return;
  }
  if (!googleAuth.isAuthorized()) {
    sendJson(res, 400, { error: 'Google not authorized. Complete OAuth first.' });
    return;
  }
  try {
    const key = await restoreKeyFromDrive(googleAuth.getAuthenticatedClient());
    if (!key) {
      sendJson(res, 404, { error: 'No backup key found in Google Drive' });
      return;
    }
    vault.setDbEncryptionKey(key);
    onVaultUnlocked();
    sendJson(res, 200, { success: true });
  } catch (err: any) {
    sendJson(res, 500, { error: err.message });
  }
});

// --- Database Backup API ---
const DB_PATH = path.join(process.cwd(), 'data', 'orc.db');

router.get('/api/backup/status', async (_req, res) => {
  const googleConnected = vault.isUnlocked() && googleAuth.isAuthorized();
  const localSize = isDatabaseReady() ? (() => { try { const { statSync } = require('fs'); return statSync(DB_PATH).size; } catch { return 0; } })() : 0;

  let remote = { exists: false as boolean, modifiedTime: undefined as string | undefined, size: undefined as number | undefined };
  if (googleConnected) {
    try {
      remote = await getDbBackupInfo(googleAuth.getAuthenticatedClient());
    } catch { /* scope may not be granted */ }
  }

  sendJson(res, 200, {
    googleConnected,
    localSize,
    remote,
  });
});

router.post('/api/backup/create', async (_req, res) => {
  if (!vault.isUnlocked() || !isDatabaseReady()) {
    sendJson(res, 403, { error: 'Vault locked or DB not ready' });
    return;
  }
  if (!googleAuth.isAuthorized()) {
    sendJson(res, 400, { error: 'Google not authorized' });
    return;
  }

  try {
    // Checkpoint WAL to ensure all data is in the main file before backup
    getDatabase().pragma('wal_checkpoint(PASSIVE)');
    await backupDbToDrive(googleAuth.getAuthenticatedClient(), DB_PATH);
    sendJson(res, 200, { success: true });
  } catch (err: any) {
    sendJson(res, 500, { error: err.message });
  }
});

router.post('/api/backup/restore', async (_req, res) => {
  if (!vault.isUnlocked()) {
    sendJson(res, 403, { error: 'Vault locked' });
    return;
  }
  if (!googleAuth.isAuthorized()) {
    sendJson(res, 400, { error: 'Google not authorized' });
    return;
  }

  try {
    // Close current DB before overwriting
    closeDatabase();
    dbInitialized = false;

    const restored = await restoreDbFromDrive(googleAuth.getAuthenticatedClient(), DB_PATH);
    if (!restored) {
      // Re-open existing DB
      onVaultUnlocked();
      sendJson(res, 404, { error: 'No backup found in Google Drive' });
      return;
    }

    // Re-open the restored DB
    onVaultUnlocked();
    sendJson(res, 200, { success: true });
  } catch (err: any) {
    // Try to recover by re-opening existing DB
    try { onVaultUnlocked(); } catch { /* best effort */ }
    sendJson(res, 500, { error: err.message });
  }
});

// --- Google Auth API ---
router.get('/api/auth/google/status', (_req, res) => {
  if (!vault.isUnlocked()) {
    sendJson(res, 403, { error: 'Vault is locked' });
    return;
  }
  sendJson(res, 200, {
    clientConfigured: googleAuth.hasClientConfig(),
    authorized: googleAuth.isAuthorized(),
    scopes: googleAuth.getGrantedScopes(),
  });
});

router.post('/api/auth/google/client', async (req, res) => {
  if (!vault.isUnlocked()) {
    sendJson(res, 403, { error: 'Vault is locked' });
    return;
  }
  const body = await readJsonBody<{ clientId: string; clientSecret: string }>(req);
  if (!body.clientId || !body.clientSecret) {
    sendJson(res, 400, { error: 'clientId and clientSecret required' });
    return;
  }
  googleAuth.saveClientConfig(body.clientId, body.clientSecret);
  sendJson(res, 200, { success: true });
});

router.post('/api/auth/google/init', (_req, res) => {
  if (!vault.isUnlocked()) {
    sendJson(res, 403, { error: 'Vault is locked' });
    return;
  }
  if (!googleAuth.hasClientConfig()) {
    sendJson(res, 400, { error: 'Google client not configured. Save client ID and secret first.' });
    return;
  }
  try {
    const url = googleAuth.getAuthorizationUrl();
    sendJson(res, 200, { url });
  } catch (err: any) {
    sendJson(res, 500, { error: err.message });
  }
});

router.get('/api/auth/google/callback', async (req, res) => {
  const params = getQueryParams(req);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) {
    res.writeHead(302, { Location: '/?auth=error&message=' + encodeURIComponent(error) });
    res.end();
    return;
  }

  if (!code || !state) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing code or state parameter');
    return;
  }

  if (!googleAuth.validateState(state)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid state parameter (possible CSRF)');
    return;
  }

  try {
    await googleAuth.exchangeCode(code);

    // Auto-backup DB encryption key to Google Drive after successful OAuth
    // SECURITY: Only backup if DB is successfully initialized — this confirms the key is correct.
    // Without this check, a recovery flow could overwrite the correct key in Drive with a wrong one.
    if (vault.isUnlocked() && dbInitialized) {
      const dbKey = vault.getDbEncryptionKey();
      if (dbKey) {
        backupKeyToDrive(googleAuth.getAuthenticatedClient(), dbKey)
          .then(() => console.log('[recovery] DB key backed up to Google Drive'))
          .catch((err) => console.error('[recovery] Auto-backup failed:', err.message));
      }
    }

    res.writeHead(302, { Location: '/?auth=success' });
    res.end();
  } catch (err: any) {
    console.error('[google-auth] Token exchange failed:', err.message);
    res.writeHead(302, { Location: '/?auth=error&message=' + encodeURIComponent(err.message) });
    res.end();
  }
});

router.post('/api/auth/google/revoke', async (_req, res) => {
  if (!vault.isUnlocked()) {
    sendJson(res, 403, { error: 'Vault is locked' });
    return;
  }
  await googleAuth.revoke();
  sendJson(res, 200, { success: true });
});

// --- Google Drive API ---
router.get('/api/drive/search', async (req, res) => {
  if (!vault.isUnlocked()) {
    sendJson(res, 403, { error: 'Vault is locked' });
    return;
  }
  if (!googleAuth.isAuthorized()) {
    sendJson(res, 401, { error: 'Google not authorized' });
    return;
  }
  const params = getQueryParams(req);
  const query = params.get('q') || '';
  const pageToken = params.get('pageToken') || undefined;

  try {
    const { google } = await import('googleapis');
    const drive = google.drive({ version: 'v3', auth: googleAuth.getAuthenticatedClient() });

    const mimeFilter = [
      "mimeType = 'application/vnd.google-apps.document'",
      "mimeType = 'application/vnd.google-apps.spreadsheet'",
      "mimeType = 'application/vnd.google-apps.presentation'",
    ].join(' or ');

    let q = `(${mimeFilter}) and trashed = false`;
    if (query) {
      q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
    }

    const result = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink, iconLink, modifiedTime)',
      pageSize: 20,
      orderBy: 'modifiedTime desc',
      pageToken,
    });

    const files = (result.data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      url: f.webViewLink,
      iconLink: f.iconLink,
      modifiedTime: f.modifiedTime,
      type: mimeToType(f.mimeType ?? ''),
    }));

    sendJson(res, 200, { files, nextPageToken: result.data.nextPageToken });
  } catch (err: any) {
    sendJson(res, 500, { error: err.message });
  }
});

function mimeToType(mime: string): string {
  if (mime.includes('document')) return 'doc';
  if (mime.includes('spreadsheet')) return 'sheet';
  if (mime.includes('presentation')) return 'slides';
  return 'doc';
}

// --- Financial API ---
registerFinancialRoutes(router, vault, plaidPlugin);

// --- Journal API (routes use getDatabase() per-request) ---
registerJournalRoutes(router);

// --- Project API (routes use getDatabase() per-request) ---
registerProjectRoutes(router);

// --- Browser Automation API ---
registerAutomationRoutes(router, vault);

// --- Plugin API ---
router.get('/api/plugins', (_req, res) => {
  const plugins = pluginLoader.getAllPlugins().map((p) => ({
    id: p.manifest.id,
    name: p.manifest.name,
    description: p.manifest.description,
    category: p.manifest.category,
    toolPrefix: p.manifest.toolPrefix,
    connection: p.manifest.connection,
    tools: p.tools.map((t) => t.name),
  }));
  sendJson(res, 200, { plugins });
});

// --- Auto-approve settings API ---
const CLAUDE_SETTINGS_PATH = path.resolve('.claude/settings.local.json');
const MCP_RULE_PREFIX = 'mcp__orc__';

function readClaudeSettings(): Record<string, unknown> {
  try {
    if (existsSync(CLAUDE_SETTINGS_PATH)) {
      return JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    }
  } catch { /* ignore parse errors */ }
  return {};
}

function writeClaudeSettings(settings: Record<string, unknown>): void {
  const dir = path.dirname(CLAUDE_SETTINGS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

function getAutoApproveState(): { allApproved: boolean; prefixes: Set<string> } {
  const settings = readClaudeSettings();
  const allow = ((settings.permissions as any)?.allow as string[]) ?? [];
  const prefixes = new Set<string>();
  let allApproved = false;
  for (const rule of allow) {
    if (rule === `${MCP_RULE_PREFIX}*`) {
      allApproved = true;
    } else if (rule.startsWith(MCP_RULE_PREFIX) && rule.endsWith('*')) {
      const inner = rule.slice(MCP_RULE_PREFIX.length, -2);
      if (inner) prefixes.add(inner);
    }
  }
  return { allApproved, prefixes };
}

router.get('/api/settings/auto-approve', (_req, res) => {
  const { allApproved, prefixes } = getAutoApproveState();
  const plugins = pluginLoader.getAllPlugins()
    .filter((p) => p.manifest.toolPrefix)
    .map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      toolPrefix: p.manifest.toolPrefix!,
      connection: p.manifest.connection,
      toolCount: p.tools.length,
      autoApprove: allApproved || prefixes.has(p.manifest.toolPrefix!),
    }));
  sendJson(res, 200, { plugins });
});

router.post('/api/settings/auto-approve', async (req, res) => {
  const body = await readJsonBody<{
    toolPrefix?: string;
    connection?: string;
    enabled: boolean;
  }>(req);

  if (!body.toolPrefix && !body.connection) {
    sendJson(res, 400, { error: 'toolPrefix or connection required' });
    return;
  }

  const targetPrefixes: string[] = [];
  if (body.connection) {
    for (const p of pluginLoader.getAllPlugins()) {
      if (p.manifest.connection === body.connection && p.manifest.toolPrefix) {
        targetPrefixes.push(p.manifest.toolPrefix);
      }
    }
  } else if (body.toolPrefix) {
    const valid = pluginLoader.getAllPlugins().some(
      (p) => p.manifest.toolPrefix === body.toolPrefix
    );
    if (!valid) {
      sendJson(res, 400, { error: `Unknown toolPrefix: ${body.toolPrefix}` });
      return;
    }
    targetPrefixes.push(body.toolPrefix);
  }

  const settings = readClaudeSettings();
  const perms = (settings.permissions ?? {}) as Record<string, unknown>;
  let allow = ((perms.allow as string[]) ?? []).slice();

  const blanketRule = `${MCP_RULE_PREFIX}*`;
  const blanketIdx = allow.indexOf(blanketRule);
  if (blanketIdx !== -1 && !body.enabled) {
    allow.splice(blanketIdx, 1);
    for (const p of pluginLoader.getAllPlugins()) {
      if (p.manifest.toolPrefix) {
        const rule = `${MCP_RULE_PREFIX}${p.manifest.toolPrefix}_*`;
        if (!allow.includes(rule)) allow.push(rule);
      }
    }
  }

  for (const prefix of targetPrefixes) {
    const rule = `${MCP_RULE_PREFIX}${prefix}_*`;
    const idx = allow.indexOf(rule);
    if (body.enabled && idx === -1) {
      allow.push(rule);
    } else if (!body.enabled && idx !== -1) {
      allow.splice(idx, 1);
    }
  }

  const allPrefixes = pluginLoader.getAllPlugins()
    .filter((p) => p.manifest.toolPrefix)
    .map((p) => p.manifest.toolPrefix!);
  const allEnabled = allPrefixes.every((pf) =>
    allow.includes(`${MCP_RULE_PREFIX}${pf}_*`)
  );
  if (allEnabled && allPrefixes.length > 0) {
    allow = allow.filter((r) => !r.startsWith(MCP_RULE_PREFIX));
    allow.push(blanketRule);
  }

  perms.allow = allow;
  settings.permissions = perms;
  writeClaudeSettings(settings);
  sendJson(res, 200, { success: true });
});

// --- MCP Proxy API ---
router.get('/api/mcp/tools', (_req, res) => {
  if (!vault.isUnlocked()) {
    sendJson(res, 403, { error: 'Vault is locked' });
    return;
  }
  const tools = pluginLoader.getAllTools().map(({ tool }) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
  sendJson(res, 200, { tools });
});

router.post('/api/mcp/execute', async (req, res) => {
  if (!vault.isUnlocked()) {
    sendJson(res, 403, { error: 'Vault is locked' });
    return;
  }
  const body = await readJsonBody<{ tool: string; args: Record<string, unknown> }>(req);
  if (!body.tool) {
    sendJson(res, 400, { error: 'tool name required' });
    return;
  }

  const entry = pluginLoader.getAllTools().find(({ tool }) => tool.name === body.tool);
  if (!entry) {
    sendJson(res, 404, { error: `Unknown tool: ${body.tool}` });
    return;
  }

  try {
    const result = await entry.plugin.executeTool(body.tool, body.args ?? {});
    sendJson(res, 200, result);
  } catch (err: any) {
    sendJson(res, 500, { error: err.message });
  }
});

// --- HTTP Server ---
const server = http.createServer((req, res) => {
  if (!router.handle(req, res)) {
    res.writeHead(404);
    res.end();
  }
});

// --- WebSocket ---
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[ws] Client connected');
  ptyManager.handleClientConnect(ws);
});

// --- Shutdown ---
async function shutdown() {
  await browserManager.shutdown();
  await pluginLoader.shutdownAll();
  ptyManager.shutdown();
  closeDatabase();
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => {
  ptyManager.shutdown();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] Terminal backend running on http://127.0.0.1:${PORT}`);
});

export { router, ptyManager, server, vault, pluginLoader, googleAuth };
