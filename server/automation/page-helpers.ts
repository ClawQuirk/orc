import type { Page } from 'playwright';
import type { LoginDetectionStrategy } from './types.js';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const MAX_SCREENSHOTS_PER_SERVICE = 10;

/**
 * Poll a page for login detection using the given strategy.
 */
export async function waitForLogin(
  page: Page,
  detection: LoginDetectionStrategy,
  opts?: { pollIntervalMs?: number; timeoutMs?: number }
): Promise<boolean> {
  const interval = opts?.pollIntervalMs ?? 2000;
  const timeout = opts?.timeoutMs ?? detection.timeout ?? 120_000;
  const deadline = Date.now() + timeout;

  let pollCount = 0;
  while (Date.now() < deadline) {
    try {
      const detected = await checkDetection(page, detection);
      pollCount++;
      // Log state every 5th poll for debugging
      if (pollCount % 5 === 1) {
        const url = page.url();
        const cookies = await page.context().cookies();
        const cookieNames = cookies.map(c => c.name).slice(0, 15).join(', ');
        console.log(`[automation] Login poll #${pollCount}: url=${url.substring(0, 80)} | cookies=[${cookieNames}] | detected=${detected}`);
      }
      if (detected) return true;
    } catch {
      // Page may be navigating — ignore and retry
    }
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

/**
 * Check a single detection strategy against the current page state.
 */
async function checkDetection(page: Page, detection: LoginDetectionStrategy): Promise<boolean> {
  switch (detection.type) {
    case 'url':
      return page.url().includes(detection.value);
    case 'cookie': {
      const cookies = await page.context().cookies();
      return cookies.some(c => c.name === detection.value);
    }
    case 'element':
      return (await page.$(detection.value)) !== null;
    default:
      return false;
  }
}

/**
 * Extract a table from a page into an array of objects.
 */
export async function extractTable(
  page: Page,
  containerSelector: string,
  rowSelector: string,
  cellSelectors: Record<string, string>
): Promise<Record<string, string>[]> {
  const rows = await page.$$(`${containerSelector} ${rowSelector}`);
  const results: Record<string, string>[] = [];

  for (const row of rows) {
    const record: Record<string, string> = {};
    for (const [key, selector] of Object.entries(cellSelectors)) {
      const cell = await row.$(selector);
      record[key] = cell ? (await cell.textContent() ?? '').trim() : '';
    }
    results.push(record);
  }
  return results;
}

/**
 * Retry a function with exponential backoff and jitter.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts?: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number }
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 3;
  const baseDelay = opts?.baseDelayMs ?? 1000;
  const maxDelay = opts?.maxDelayMs ?? 10_000;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt === maxRetries) break;
      const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      await new Promise(r => setTimeout(r, jitter));
    }
  }
  throw lastError;
}

/**
 * Capture a screenshot on failure. Stored under data/browser-contexts/{service}/screenshots/.
 * Capped at MAX_SCREENSHOTS_PER_SERVICE — oldest deleted when limit exceeded.
 */
export async function screenshotOnFailure(
  page: Page,
  serviceId: string,
  operationName: string
): Promise<string> {
  const screenshotDir = path.join(process.cwd(), 'data', 'browser-contexts', serviceId, 'screenshots');
  mkdirSync(screenshotDir, { recursive: true });

  // Cap screenshots
  if (existsSync(screenshotDir)) {
    const files = readdirSync(screenshotDir)
      .filter(f => f.endsWith('.png'))
      .sort();
    while (files.length >= MAX_SCREENSHOTS_PER_SERVICE) {
      const oldest = files.shift()!;
      unlinkSync(path.join(screenshotDir, oldest));
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedOp = operationName.replace(/[^a-z0-9-]/gi, '_');
  const filename = `${sanitizedOp}-${timestamp}.png`;
  const filepath = path.join(screenshotDir, filename);

  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

/**
 * Random delay to appear more human-like and reduce anti-bot detection risk.
 */
export async function humanDelay(minMs = 500, maxMs = 2000): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  await new Promise(r => setTimeout(r, delay));
}

/**
 * Wait for a selector to be visible, scroll into view, then click.
 * Returns false if the element is not found within the timeout.
 */
export async function safeClick(
  page: Page,
  selector: string,
  opts?: { timeout?: number }
): Promise<boolean> {
  try {
    const el = await page.waitForSelector(selector, {
      state: 'visible',
      timeout: opts?.timeout ?? 10_000,
    });
    if (!el) return false;
    await el.scrollIntoViewIfNeeded();
    await el.click();
    return true;
  } catch {
    return false;
  }
}

/**
 * Navigate with error handling. Returns false on navigation failure.
 */
export async function safeNavigate(
  page: Page,
  url: string,
  opts?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: opts?.waitUntil ?? 'domcontentloaded' });
    return true;
  } catch {
    return false;
  }
}
