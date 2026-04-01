// Browser automation types for Phase 3A

export interface LoginDetectionStrategy {
  /** How to detect a successful login */
  type: 'url' | 'cookie' | 'element';
  /** URL pattern (includes match), cookie name, or CSS selector */
  value: string;
  /** Milliseconds to wait for login (default 120000 = 2 min) */
  timeout?: number;
}

export interface ServiceBrowserConfig {
  serviceId: string;
  loginUrl: string;
  loginDetection: LoginDetectionStrategy;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

export interface BrowserSessionInfo {
  serviceId: string;
  loggedIn: boolean;
  lastUsed: string | null;
  contextExists: boolean;
}

export interface AutomationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  screenshotPath?: string;
}
