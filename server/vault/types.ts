export interface VaultContents {
  version: 1;
  services: Record<string, ServiceCredentials>;
}

export interface ServiceCredentials {
  pluginId: string;
  type: 'oauth2' | 'api-key';
  createdAt: string;
  updatedAt: string;
  // OAuth2
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType?: string;
  scope?: string;
  // API key
  apiKey?: string;
  apiSecret?: string;
  // Arbitrary extra fields
  extra?: Record<string, string>;
}
