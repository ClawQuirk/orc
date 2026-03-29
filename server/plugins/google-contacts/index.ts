import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { ContactsApiClient } from './api-client.js';
import { GoogleAuth } from '../google/google-auth.js';

const manifest: PluginManifest = {
  id: 'google-contacts',
  name: 'Google Contacts',
  description: 'Search, view, and create contacts via Google People API',
  version: '0.1.0',
  icon: 'contacts',
  category: 'contacts',
  requiresAuth: true,
  authType: 'oauth2',
  toolPrefix: 'contacts',
  connection: 'google',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'contacts_search',
    description: 'Search contacts by name, email, or phone number.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (name, email, or phone)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'contacts_get',
    description: 'Get full details of a specific contact by resource name.',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Contact resource name (e.g., "people/c12345")' },
      },
      required: ['resourceName'],
    },
  },
  {
    name: 'contacts_create',
    description: 'Create a new contact.',
    inputSchema: {
      type: 'object',
      properties: {
        givenName: { type: 'string', description: 'First name' },
        familyName: { type: 'string', description: 'Last name (optional)' },
        email: { type: 'string', description: 'Email address (optional)' },
        phone: { type: 'string', description: 'Phone number (optional)' },
      },
      required: ['givenName'],
    },
  },
  {
    name: 'contacts_soft_delete',
    description: 'Soft-delete a contact by moving it to the "Orc Deletion" group for manual review. Does NOT permanently delete — the contact is labeled for later purge or restore in Google Contacts.',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Contact resource name (e.g., "people/c12345"). Use contacts_search to find this.' },
      },
      required: ['resourceName'],
    },
  },
];

export class ContactsPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private client: ContactsApiClient | null = null;
  private googleAuth: GoogleAuth | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    deps.logger('Contacts plugin initialized');
  }

  setGoogleAuth(auth: GoogleAuth): void {
    this.googleAuth = auth;
  }

  private getClient(): ContactsApiClient {
    if (!this.googleAuth) throw new Error('GoogleAuth not configured');
    if (!this.client) {
      this.client = new ContactsApiClient(this.googleAuth.getAuthenticatedClient());
    }
    return this.client;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const client = this.getClient();
      switch (toolName) {
        case 'contacts_search':
          return client.searchContacts(args.query as string);
        case 'contacts_get':
          return client.getContact(args.resourceName as string);
        case 'contacts_create':
          return client.createContact(
            args.givenName as string,
            args.familyName as string | undefined,
            args.email as string | undefined,
            args.phone as string | undefined
          );
        case 'contacts_soft_delete':
          return client.softDelete(args.resourceName as string);
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Contacts error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
