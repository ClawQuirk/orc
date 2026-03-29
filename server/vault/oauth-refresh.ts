import type { CredentialVault } from './credential-vault.js';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

export interface OAuthEndpoints {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}

export async function getValidAccessToken(
  vault: CredentialVault,
  pluginId: string,
  endpoints: OAuthEndpoints
): Promise<string> {
  const creds = vault.getCredentials(pluginId);
  if (!creds || !creds.accessToken) {
    throw new Error(`No credentials for ${pluginId}. OAuth flow required.`);
  }

  // Check if token is still valid
  if (creds.expiresAt) {
    const expiresAt = new Date(creds.expiresAt).getTime();
    if (Date.now() < expiresAt - REFRESH_BUFFER_MS) {
      return creds.accessToken;
    }
  }

  // Token expired or about to expire - refresh
  if (!creds.refreshToken) {
    throw new Error(
      `Access token expired for ${pluginId} and no refresh token available.`
    );
  }

  const response = await fetch(endpoints.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: endpoints.clientId,
      client_secret: endpoints.clientSecret,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Token refresh failed for ${pluginId}: ${response.status} ${body}`
    );
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  vault.setCredentials(pluginId, {
    ...creds,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? creds.refreshToken,
    expiresAt: new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString(),
    tokenType: tokenData.token_type,
  });

  console.log(`[vault] Refreshed access token for ${pluginId}`);
  return tokenData.access_token;
}
