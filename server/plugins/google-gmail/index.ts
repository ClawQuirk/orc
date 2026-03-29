import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { GmailApiClient } from './api-client.js';
import { GoogleAuth } from '../google/google-auth.js';

const manifest: PluginManifest = {
  id: 'google-gmail',
  name: 'Gmail',
  description: 'Search, read, and send emails via Gmail',
  version: '0.1.0',
  icon: 'gmail',
  category: 'email',
  requiresAuth: true,
  authType: 'oauth2',
  toolPrefix: 'gmail',
  connection: 'google',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'gmail_search',
    description: 'Search emails in Gmail. Returns subject, sender, date, and snippet for matching messages. Use Gmail search syntax (e.g., "from:boss subject:meeting is:unread").',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (same syntax as Gmail search bar)' },
        maxResults: { type: 'number', description: 'Maximum results to return (default 10, max 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gmail_read',
    description: 'Read the full content of a specific email by its message ID.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Gmail message ID (returned by gmail_search)' },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'gmail_send',
    description: 'Send an email via Gmail.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body (plain text)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'gmail_draft',
    description: 'Create a draft email in Gmail (does not send it).',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body (plain text)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'gmail_labels',
    description: 'List all Gmail labels/folders.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export class GmailPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private client: GmailApiClient | null = null;
  private googleAuth: GoogleAuth | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    // GoogleAuth will be injected via setGoogleAuth after construction
    deps.logger('Gmail plugin initialized');
  }

  setGoogleAuth(auth: GoogleAuth): void {
    this.googleAuth = auth;
  }

  private getClient(): GmailApiClient {
    if (!this.googleAuth) throw new Error('GoogleAuth not configured');
    if (!this.client) {
      this.client = new GmailApiClient(this.googleAuth.getAuthenticatedClient());
    }
    return this.client;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const client = this.getClient();
      switch (toolName) {
        case 'gmail_search':
          return client.searchEmails(
            args.query as string,
            Math.min((args.maxResults as number) ?? 10, 50)
          );
        case 'gmail_read':
          return client.readEmail(args.messageId as string);
        case 'gmail_send':
          return client.sendEmail(args.to as string, args.subject as string, args.body as string);
        case 'gmail_draft':
          return client.createDraft(args.to as string, args.subject as string, args.body as string);
        case 'gmail_labels':
          return client.listLabels();
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Gmail error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
