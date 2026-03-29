import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { SlidesApiClient } from './api-client.js';
import { GoogleAuth } from '../google/google-auth.js';

const manifest: PluginManifest = {
  id: 'google-slides',
  name: 'Google Slides',
  description: 'Search and read Google Slides presentations (read-only)',
  version: '0.1.0',
  icon: 'slides',
  category: 'documents',
  requiresAuth: true,
  authType: 'oauth2',
  toolPrefix: 'slides',
  connection: 'google',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'slides_search',
    description: 'Search Google Slides presentations by name. Returns file list with IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (optional — omit for recent presentations)' },
        maxResults: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'slides_read',
    description: 'Read the full text content of a Google Slides presentation.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Presentation ID (from slides_search)' },
      },
      required: ['presentationId'],
    },
  },
  {
    name: 'slides_info',
    description: 'Get presentation metadata with per-slide text content.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Presentation ID' },
      },
      required: ['presentationId'],
    },
  },
];

export class SlidesPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private client: SlidesApiClient | null = null;
  private googleAuth: GoogleAuth | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    deps.logger('Slides plugin initialized');
  }

  setGoogleAuth(auth: GoogleAuth): void {
    this.googleAuth = auth;
  }

  private getClient(): SlidesApiClient {
    if (!this.googleAuth) throw new Error('GoogleAuth not configured');
    if (!this.client) {
      this.client = new SlidesApiClient(this.googleAuth.getAuthenticatedClient());
    }
    return this.client;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const client = this.getClient();
      switch (toolName) {
        case 'slides_search':
          return client.searchPresentations(args.query as string | undefined, (args.maxResults as number) ?? 20);
        case 'slides_read':
          return client.readPresentation(args.presentationId as string);
        case 'slides_info':
          return client.getPresentationInfo(args.presentationId as string);
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Slides error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
