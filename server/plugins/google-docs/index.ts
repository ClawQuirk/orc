import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { DocsApiClient } from './api-client.js';
import { GoogleAuth } from '../google/google-auth.js';

const manifest: PluginManifest = {
  id: 'google-docs',
  name: 'Google Docs',
  description: 'Search, read, create, and edit Google Docs',
  version: '0.1.0',
  icon: 'docs',
  category: 'documents',
  requiresAuth: true,
  authType: 'oauth2',
  toolPrefix: 'docs',
  connection: 'google',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'docs_search',
    description: 'Search Google Docs by name. Returns file list with IDs and links.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (optional — omit for recent docs)' },
        maxResults: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'docs_read',
    description: 'Read the full plain text content of a Google Doc. Truncates at 50K chars to protect context window.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Document ID (from docs_search or Drive search)' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'docs_create',
    description: 'Create a new Google Doc with optional initial content.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title' },
        content: { type: 'string', description: 'Initial text content (optional)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'docs_append',
    description: 'Append text to the end of a Google Doc.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Document ID' },
        text: { type: 'string', description: 'Text to append' },
      },
      required: ['documentId', 'text'],
    },
  },
  {
    name: 'docs_replace',
    description: 'Find and replace text in a Google Doc. Returns the number of replacements made.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Document ID' },
        findText: { type: 'string', description: 'Text to find' },
        replaceText: { type: 'string', description: 'Replacement text' },
        matchCase: { type: 'boolean', description: 'Case-sensitive match (default true)' },
      },
      required: ['documentId', 'findText', 'replaceText'],
    },
  },
];

export class DocsPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private client: DocsApiClient | null = null;
  private googleAuth: GoogleAuth | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    deps.logger('Docs plugin initialized');
  }

  setGoogleAuth(auth: GoogleAuth): void {
    this.googleAuth = auth;
  }

  private getClient(): DocsApiClient {
    if (!this.googleAuth) throw new Error('GoogleAuth not configured');
    if (!this.client) {
      this.client = new DocsApiClient(this.googleAuth.getAuthenticatedClient());
    }
    return this.client;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const client = this.getClient();
      switch (toolName) {
        case 'docs_search':
          return client.searchDocuments(args.query as string | undefined, (args.maxResults as number) ?? 20);
        case 'docs_read':
          return client.readDocument(args.documentId as string);
        case 'docs_create':
          return client.createDocument(args.title as string, args.content as string | undefined);
        case 'docs_append':
          return client.appendToDocument(args.documentId as string, args.text as string);
        case 'docs_replace':
          return client.replaceInDocument(
            args.documentId as string,
            args.findText as string,
            args.replaceText as string,
            (args.matchCase as boolean) ?? true
          );
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Docs error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
