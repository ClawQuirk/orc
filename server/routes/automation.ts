import type { Router } from '../router.js';
import { sendJson } from '../router.js';
import type { CredentialVault } from '../vault/credential-vault.js';
import { browserManager } from '../automation/browser-manager.js';
import { serviceRegistry } from '../automation/service-registry.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function registerAutomationRoutes(router: Router, vault: CredentialVault): void {

  // List all browser sessions
  router.get('/api/automation/status', (_req, res) => {
    if (!vault.isUnlocked()) {
      sendJson(res, 403, { error: 'Vault is locked' });
      return;
    }

    const sessions = browserManager.listSessions();
    const services = serviceRegistry.getAll().map(config => ({
      ...browserManager.getSessionInfo(config.serviceId),
      name: config.serviceId,
      loginUrl: config.loginUrl,
    }));

    sendJson(res, 200, { sessions, services });
  });

  // Check login status for a specific service
  router.get('/api/automation/status/:service', async (_req, res, params) => {
    if (!vault.isUnlocked()) {
      sendJson(res, 403, { error: 'Vault is locked' });
      return;
    }

    const serviceId = params.service;
    const config = serviceRegistry.get(serviceId);

    if (!config) {
      sendJson(res, 404, { error: `No browser configuration registered for: ${serviceId}` });
      return;
    }

    const info = browserManager.getSessionInfo(serviceId);
    sendJson(res, 200, info);
  });

  // Open a headed browser for manual login
  router.post('/api/automation/login/:service', async (_req, res, params) => {
    if (!vault.isUnlocked()) {
      sendJson(res, 403, { error: 'Vault is locked' });
      return;
    }

    const serviceId = params.service;
    const config = serviceRegistry.get(serviceId);

    if (!config) {
      sendJson(res, 404, { error: `No browser configuration registered for: ${serviceId}` });
      return;
    }

    // Open login session in the background — respond immediately
    // The frontend polls GET /api/automation/status/:service to detect completion
    browserManager.openLoginSession(config).then(result => {
      if (result.success) {
        console.log(`[automation] Login successful for: ${serviceId}`);
      } else {
        console.log(`[automation] Login failed for ${serviceId}: ${result.error}`);
      }
    });

    sendJson(res, 202, { message: 'Login window opened. Complete login in the browser.' });
  });

  // Clear browser context (logout)
  router.post('/api/automation/logout/:service', async (_req, res, params) => {
    if (!vault.isUnlocked()) {
      sendJson(res, 403, { error: 'Vault is locked' });
      return;
    }

    const serviceId = params.service;
    await browserManager.clearContext(serviceId);
    sendJson(res, 200, { success: true });
  });

  // Get latest debug screenshot for a service
  router.get('/api/automation/screenshot/:service', (_req, res, params) => {
    if (!vault.isUnlocked()) {
      sendJson(res, 403, { error: 'Vault is locked' });
      return;
    }

    if (!serviceRegistry.has(params.service)) {
      sendJson(res, 404, { error: `No browser configuration for: ${params.service}` });
      return;
    }

    const screenshotDir = path.join(process.cwd(), 'data', 'browser-contexts', params.service, 'screenshots');
    if (!existsSync(screenshotDir)) {
      sendJson(res, 404, { error: 'No screenshots available' });
      return;
    }

    const files = readdirSync(screenshotDir)
      .filter(f => f.endsWith('.png'))
      .sort();

    if (files.length === 0) {
      sendJson(res, 404, { error: 'No screenshots available' });
      return;
    }

    const latest = path.join(screenshotDir, files[files.length - 1]);
    const data = readFileSync(latest);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': data.length });
    res.end(data);
  });
}
