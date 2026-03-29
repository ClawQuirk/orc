import { google } from 'googleapis';
import { randomBytes } from 'node:crypto';
import type { CredentialVault } from '../../vault/credential-vault.js';
import type { ServiceCredentials } from '../../vault/types.js';

// All Google scopes we may request across plugins (Phase 1)
export const GOOGLE_SCOPES = {
  gmail_readonly: 'https://www.googleapis.com/auth/gmail.readonly',
  gmail_modify: 'https://www.googleapis.com/auth/gmail.modify',
  gmail_send: 'https://www.googleapis.com/auth/gmail.send',
  calendar: 'https://www.googleapis.com/auth/calendar',
  contacts: 'https://www.googleapis.com/auth/contacts',
  contacts_readonly: 'https://www.googleapis.com/auth/contacts.readonly',
  drive_readonly: 'https://www.googleapis.com/auth/drive.readonly',
  drive_appdata: 'https://www.googleapis.com/auth/drive.appdata',
  // Phase 2
  docs: 'https://www.googleapis.com/auth/documents',
  sheets: 'https://www.googleapis.com/auth/spreadsheets',
  slides_readonly: 'https://www.googleapis.com/auth/presentations.readonly',
  // Phase 4
  youtube_readonly: 'https://www.googleapis.com/auth/youtube.readonly',
};

// Scopes requested (Phase 1 + 2A)
const PHASE1_SCOPES = [
  GOOGLE_SCOPES.gmail_modify,
  GOOGLE_SCOPES.gmail_send,
  GOOGLE_SCOPES.calendar,
  GOOGLE_SCOPES.contacts,
  GOOGLE_SCOPES.contacts_readonly,
  GOOGLE_SCOPES.drive_readonly,
  GOOGLE_SCOPES.drive_appdata,
  GOOGLE_SCOPES.docs,
  GOOGLE_SCOPES.sheets,
  GOOGLE_SCOPES.slides_readonly,
];

const VAULT_GOOGLE_CREDS_KEY = 'google-oauth';
const VAULT_GOOGLE_CLIENT_KEY = 'google-client';

interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Manages Google OAuth 2.0 flow and token lifecycle.
 * Uses the vault to store both client config and tokens.
 */
export class GoogleAuth {
  private vault: CredentialVault;
  private redirectUri: string;
  private pendingStates = new Map<string, number>(); // state -> timestamp

  constructor(vault: CredentialVault, redirectUri: string) {
    this.vault = vault;
    this.redirectUri = redirectUri;
  }

  /** Check if Google client credentials (ID + secret) are configured */
  hasClientConfig(): boolean {
    const creds = this.vault.getCredentials(VAULT_GOOGLE_CLIENT_KEY);
    return !!(creds?.extra?.clientId && creds?.extra?.clientSecret);
  }

  /** Save Google Cloud client ID and secret */
  saveClientConfig(clientId: string, clientSecret: string): void {
    this.vault.setCredentials(VAULT_GOOGLE_CLIENT_KEY, {
      pluginId: VAULT_GOOGLE_CLIENT_KEY,
      type: 'api-key',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extra: { clientId, clientSecret },
    });
  }

  /** Get the stored client config */
  getClientConfig(): GoogleClientConfig | null {
    const creds = this.vault.getCredentials(VAULT_GOOGLE_CLIENT_KEY);
    if (!creds?.extra?.clientId || !creds?.extra?.clientSecret) return null;
    return { clientId: creds.extra.clientId, clientSecret: creds.extra.clientSecret };
  }

  /** Check if we have valid OAuth tokens */
  isAuthorized(): boolean {
    const creds = this.vault.getCredentials(VAULT_GOOGLE_CREDS_KEY);
    return !!(creds?.accessToken && creds?.refreshToken);
  }

  /** Get the list of granted scopes */
  getGrantedScopes(): string[] {
    const creds = this.vault.getCredentials(VAULT_GOOGLE_CREDS_KEY);
    return creds?.scope?.split(' ') ?? [];
  }

  /** Generate the OAuth authorization URL */
  getAuthorizationUrl(scopes?: string[]): string {
    const config = this.getClientConfig();
    if (!config) throw new Error('Google client not configured');

    const oauth2 = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      this.redirectUri
    );

    const state = randomBytes(16).toString('hex');
    this.pendingStates.set(state, Date.now());
    // Clean old states (>10 min)
    for (const [s, t] of this.pendingStates) {
      if (Date.now() - t > 600_000) this.pendingStates.delete(s);
    }

    return oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: scopes ?? PHASE1_SCOPES,
      state,
      prompt: 'consent', // Always show consent to get refresh token
    });
  }

  /** Validate a state parameter from callback */
  validateState(state: string): boolean {
    if (this.pendingStates.has(state)) {
      this.pendingStates.delete(state);
      return true;
    }
    return false;
  }

  /** Exchange authorization code for tokens */
  async exchangeCode(code: string): Promise<void> {
    const config = this.getClientConfig();
    if (!config) throw new Error('Google client not configured');

    const oauth2 = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      this.redirectUri
    );

    const { tokens } = await oauth2.getToken(code);

    this.vault.setCredentials(VAULT_GOOGLE_CREDS_KEY, {
      pluginId: VAULT_GOOGLE_CREDS_KEY,
      type: 'oauth2',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessToken: tokens.access_token ?? undefined,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : undefined,
      tokenType: tokens.token_type ?? 'Bearer',
      scope: tokens.scope ?? PHASE1_SCOPES.join(' '),
    });

    console.log('[google-auth] Tokens stored successfully');
  }

  /** Revoke tokens and remove from vault */
  async revoke(): Promise<void> {
    const creds = this.vault.getCredentials(VAULT_GOOGLE_CREDS_KEY);
    if (creds?.accessToken) {
      const config = this.getClientConfig();
      if (config) {
        const oauth2 = new google.auth.OAuth2(
          config.clientId,
          config.clientSecret,
          this.redirectUri
        );
        oauth2.setCredentials({ access_token: creds.accessToken });
        try {
          await oauth2.revokeCredentials();
        } catch {
          // Revocation may fail if token is already expired
        }
      }
    }
    this.vault.removeCredentials(VAULT_GOOGLE_CREDS_KEY);
    console.log('[google-auth] Tokens revoked');
  }

  /** Get an authenticated OAuth2 client with auto-refresh */
  getAuthenticatedClient(): InstanceType<typeof google.auth.OAuth2> {
    const config = this.getClientConfig();
    if (!config) throw new Error('Google client not configured');

    const creds = this.vault.getCredentials(VAULT_GOOGLE_CREDS_KEY);
    if (!creds?.accessToken) throw new Error('Not authorized. Run OAuth flow first.');

    const oauth2 = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      this.redirectUri
    );

    oauth2.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
      expiry_date: creds.expiresAt ? new Date(creds.expiresAt).getTime() : undefined,
      token_type: creds.tokenType ?? 'Bearer',
    });

    // Auto-save refreshed tokens
    oauth2.on('tokens', (tokens) => {
      const updated: ServiceCredentials = {
        ...creds,
        updatedAt: new Date().toISOString(),
      };
      if (tokens.access_token) updated.accessToken = tokens.access_token;
      if (tokens.refresh_token) updated.refreshToken = tokens.refresh_token;
      if (tokens.expiry_date) updated.expiresAt = new Date(tokens.expiry_date).toISOString();
      this.vault.setCredentials(VAULT_GOOGLE_CREDS_KEY, updated);
      console.log('[google-auth] Tokens auto-refreshed');
    });

    return oauth2;
  }
}
