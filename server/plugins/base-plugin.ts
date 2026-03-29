import type Database from 'better-sqlite3-multiple-ciphers';
import type { CredentialVault } from '../vault/credential-vault.js';
import type { PluginManifest, PluginToolDefinition, OAuthConfig } from '../../shared/plugin-types.js';

export interface PluginDependencies {
  db: Database.Database;
  vault: CredentialVault;
  logger: (msg: string) => void;
}

export interface ToolResult {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'resource'; uri: string; text: string }
  >;
  isError?: boolean;
}

export interface ServerPlugin {
  manifest: PluginManifest;
  oauthConfig?: OAuthConfig;
  tools: PluginToolDefinition[];

  initialize(deps: PluginDependencies): Promise<void>;
  shutdown(): Promise<void>;
  executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult>;
}
