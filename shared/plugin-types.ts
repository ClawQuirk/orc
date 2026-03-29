export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  icon: string;
  category:
    | 'email'
    | 'calendar'
    | 'documents'
    | 'contacts'
    | 'financial'
    | 'shopping'
    | 'social'
    | 'automation';
  requiresAuth: boolean;
  authType?: 'oauth2' | 'api-key' | 'none';
  /** Shared prefix for all tool names (e.g., 'gmail', 'calendar'). Used for MCP permission rules. */
  toolPrefix?: string;
  /** Connection group this plugin belongs to (e.g., 'google', 'slack'). Plugins sharing a connection share auth. */
  connection?: string;
}

export interface PluginToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
}

export interface WidgetManifest {
  id: string;
  pluginId: string;
  title: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  refreshIntervalMs: number;
}
