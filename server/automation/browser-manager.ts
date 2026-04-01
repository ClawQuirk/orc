import path from 'node:path';
import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { ServiceBrowserConfig, BrowserSessionInfo, AutomationResult } from './types.js';
import { waitForLogin } from './page-helpers.js';

const CONTEXT_ROOT = path.join(process.cwd(), 'data', 'browser-contexts');
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const IDLE_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

interface ActiveContext {
  context: BrowserContext;
  lastUsed: number;
  headed: boolean;
}

class BrowserManager {
  private browser: Browser | null = null;
  private browserLaunchPromise: Promise<Browser> | null = null;
  private activeContexts = new Map<string, ActiveContext>();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private headedSessionActive = false;

  /**
   * Open a headed (visible) browser for manual login.
   * User logs in manually — we never capture credentials.
   * Uses a separate headed browser instance since headless is browser-level in Playwright.
   */
  async openLoginSession(config: ServiceBrowserConfig): Promise<AutomationResult> {
    if (this.headedSessionActive) {
      return {
        success: false,
        error: 'Another login session is already active. Complete or close it first.',
      };
    }

    let headedBrowser: Browser | null = null;
    try {
      this.headedSessionActive = true;
      const contextDir = this.getContextDir(config.serviceId);
      mkdirSync(contextDir, { recursive: true });

      // Launch a separate HEADED browser for the login flow
      const { chromium } = await import('playwright');
      headedBrowser = await chromium.launch({ headless: false });
      console.log('[automation] Headed Chromium launched for login');

      const context = await headedBrowser.newContext(this.contextOptions(config));
      const page = await context.newPage();
      await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded' });

      // Detect if the user closes the browser window
      let userClosed = false;
      headedBrowser.on('disconnected', () => { userClosed = true; });

      // Poll for login detection
      const detected = await waitForLogin(page, config.loginDetection, {
        timeoutMs: config.loginDetection.timeout ?? 120_000,
      });

      if (userClosed) {
        return { success: false, error: 'Browser window was closed before login completed.' };
      }

      if (detected) {
        // Save the persistent state (cookies/localStorage) for headless reuse
        await this.savePersistentState(config.serviceId, context);
        await headedBrowser.close();
        console.log(`[automation] Login successful for: ${config.serviceId}`);
        return { success: true };
      }

      // Timeout
      await headedBrowser.close();
      return { success: false, error: 'Login timed out. The browser window has been closed.' };
    } catch (err: any) {
      if (headedBrowser) {
        try { await headedBrowser.close(); } catch { /* ignore */ }
      }
      return { success: false, error: err.message };
    } finally {
      this.headedSessionActive = false;
    }
  }

  /**
   * Get a headless page in the persistent context for a service.
   * This is the main method Phase 3B plugins call for scraping.
   */
  async getPage(serviceId: string): Promise<Page> {
    const contextDir = this.getContextDir(serviceId);
    if (!existsSync(path.join(contextDir, 'state.json'))) {
      throw new Error(`No saved session for "${serviceId}". User must log in first via the Shopping panel.`);
    }

    let active = this.activeContexts.get(serviceId);
    if (!active || active.headed) {
      // Create or replace with a headless context
      if (active?.headed) {
        // Don't close the headed session — let it finish. Create a separate headless one.
      }
      const browser = await this.ensureBrowser();
      const context = await browser.newContext({
        headless: true,
        storageState: path.join(contextDir, 'state.json'),
      });
      active = { context, lastUsed: Date.now(), headed: false };
      this.activeContexts.set(serviceId, active);
    }

    active.lastUsed = Date.now();
    return await active.context.newPage();
  }

  /**
   * Check if a saved session is still logged in (headless probe).
   */
  async checkLoginStatus(
    serviceId: string,
    detection: import('./types.js').LoginDetectionStrategy
  ): Promise<boolean> {
    const contextDir = this.getContextDir(serviceId);
    if (!existsSync(path.join(contextDir, 'state.json'))) {
      return false;
    }

    try {
      const browser = await this.ensureBrowser();
      const context = await browser.newContext({
        headless: true,
        storageState: path.join(contextDir, 'state.json'),
      });
      const page = await context.newPage();

      // Navigate to the service's login URL origin to trigger cookie/redirect checks
      try {
        const { serviceRegistry } = await import('./service-registry.js');
        const config = serviceRegistry.get(serviceId);
        const checkUrl = config ? new URL(config.loginUrl).origin : `https://www.${serviceId}.com`;
        await page.goto(checkUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 15_000,
        });
      } catch {
        // Navigation may fail for various reasons — check what we have
      }

      let loggedIn = false;
      switch (detection.type) {
        case 'url':
          loggedIn = page.url().includes(detection.value);
          break;
        case 'cookie': {
          const cookies = await context.cookies();
          loggedIn = cookies.some(c => c.name === detection.value);
          break;
        }
        case 'element':
          loggedIn = (await page.$(detection.value)) !== null;
          break;
      }

      await context.close();
      return loggedIn;
    } catch {
      return false;
    }
  }

  /**
   * Remove the persistent context directory for a service (logout).
   */
  async clearContext(serviceId: string): Promise<void> {
    await this.closeActiveContext(serviceId);
    const contextDir = this.getContextDir(serviceId);
    if (existsSync(contextDir)) {
      rmSync(contextDir, { recursive: true, force: true });
      console.log(`[automation] Cleared browser context for: ${serviceId}`);
    }
  }

  /**
   * Get session info without launching a browser.
   */
  getSessionInfo(serviceId: string): BrowserSessionInfo {
    const contextDir = this.getContextDir(serviceId);
    const contextExists = existsSync(path.join(contextDir, 'state.json'));
    const active = this.activeContexts.get(serviceId);
    return {
      serviceId,
      loggedIn: contextExists,
      lastUsed: active ? new Date(active.lastUsed).toISOString() : null,
      contextExists,
    };
  }

  /**
   * List all services that have saved browser contexts.
   */
  listSessions(): BrowserSessionInfo[] {
    mkdirSync(CONTEXT_ROOT, { recursive: true });
    const dirs = readdirSync(CONTEXT_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    return dirs.map(serviceId => this.getSessionInfo(serviceId));
  }

  /**
   * Close all active contexts and shut down the browser.
   */
  async shutdown(): Promise<void> {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }

    for (const [id, active] of this.activeContexts) {
      try { await active.context.close(); } catch { /* ignore */ }
      this.activeContexts.delete(id);
    }

    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
      this.browser = null;
      this.browserLaunchPromise = null;
      console.log('[automation] Browser shut down');
    }
  }

  // --- Internal ---

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;

    // Prevent concurrent launches
    if (this.browserLaunchPromise) return this.browserLaunchPromise;

    this.browserLaunchPromise = (async () => {
      try {
        const { chromium } = await import('playwright');
        this.browser = await chromium.launch({ headless: true });
        console.log('[automation] Chromium launched (lazy init)');
        this.ensureIdleTimer();
        return this.browser;
      } catch (err: any) {
        this.browserLaunchPromise = null;
        if (err.message?.includes('Executable doesn\'t exist') || err.message?.includes('browserType.launch')) {
          throw new Error(
            'Chromium not installed. Run: npx playwright install chromium'
          );
        }
        throw err;
      }
    })();

    return this.browserLaunchPromise;
  }

  private getContextDir(serviceId: string): string {
    return path.join(CONTEXT_ROOT, serviceId);
  }

  private contextOptions(config: ServiceBrowserConfig) {
    return {
      ...(config.userAgent ? { userAgent: config.userAgent } : {}),
      ...(config.viewport ? { viewport: config.viewport } : {}),
    };
  }

  private async savePersistentState(serviceId: string, context: BrowserContext): Promise<void> {
    const contextDir = this.getContextDir(serviceId);
    mkdirSync(contextDir, { recursive: true });
    const statePath = path.join(contextDir, 'state.json');
    await context.storageState({ path: statePath });
    console.log(`[automation] Saved browser state for: ${serviceId}`);
  }

  private async closeActiveContext(serviceId: string): Promise<void> {
    const active = this.activeContexts.get(serviceId);
    if (active) {
      try { await active.context.close(); } catch { /* ignore */ }
      this.activeContexts.delete(serviceId);
    }
  }

  private ensureIdleTimer(): void {
    if (this.idleTimer) return;
    this.idleTimer = setInterval(() => this.cleanIdleContexts(), IDLE_CHECK_INTERVAL_MS);
  }

  private async cleanIdleContexts(): Promise<void> {
    const now = Date.now();
    for (const [id, active] of this.activeContexts) {
      if (now - active.lastUsed > IDLE_TIMEOUT_MS && !active.headed) {
        console.log(`[automation] Closing idle context: ${id}`);
        try { await active.context.close(); } catch { /* ignore */ }
        this.activeContexts.delete(id);
      }
    }

    // If no active contexts remain and browser is running, close the browser too
    if (this.activeContexts.size === 0 && this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
      this.browser = null;
      this.browserLaunchPromise = null;
      if (this.idleTimer) {
        clearInterval(this.idleTimer);
        this.idleTimer = null;
      }
      console.log('[automation] Browser closed (all contexts idle)');
    }
  }
}

export const browserManager = new BrowserManager();
