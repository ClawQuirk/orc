import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { SheetsApiClient } from './api-client.js';
import { GoogleAuth } from '../google/google-auth.js';

const manifest: PluginManifest = {
  id: 'google-sheets',
  name: 'Google Sheets',
  description: 'Search, read, write, and create Google Sheets',
  version: '0.1.0',
  icon: 'sheets',
  category: 'documents',
  requiresAuth: true,
  authType: 'oauth2',
  toolPrefix: 'sheets',
  connection: 'google',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'sheets_search',
    description: 'Search Google Sheets by name. Returns file list with IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (optional — omit for recent spreadsheets)' },
        maxResults: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'sheets_info',
    description: 'Get spreadsheet metadata: title, sheet names, and dimensions.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'Spreadsheet ID (from sheets_search)' },
      },
      required: ['spreadsheetId'],
    },
  },
  {
    name: 'sheets_read',
    description: 'Read a range of cells from a spreadsheet. Returns data as a markdown table.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
        range: { type: 'string', description: 'A1 notation range (e.g., "Sheet1!A1:D10", "Sheet1" for all data, "A1:C5" for default sheet)' },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
  {
    name: 'sheets_write',
    description: 'Write data to a range in a spreadsheet. Supports formulas and auto-type detection.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
        range: { type: 'string', description: 'A1 notation range (e.g., "Sheet1!A1:C3")' },
        values: {
          type: 'array',
          items: { type: 'array', items: { type: 'string' } },
          description: 'A 2D array of cell values (rows of columns). Example: [["Name","Age"],["Alice","30"]]',
        },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
  },
  {
    name: 'sheets_append',
    description: 'Append rows after the last data row in a sheet.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
        range: { type: 'string', description: 'Sheet name or range (e.g., "Sheet1"). The API finds the last row with data and appends below.' },
        values: {
          type: 'array',
          items: { type: 'array', items: { type: 'string' } },
          description: 'Rows to append. Example: [["Alice","30"],["Bob","25"]]',
        },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
  },
  {
    name: 'sheets_create',
    description: 'Create a new Google Spreadsheet.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Spreadsheet title' },
        sheetNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Sheet names (optional — defaults to "Sheet1")',
        },
      },
      required: ['title'],
    },
  },
];

export class SheetsPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private client: SheetsApiClient | null = null;
  private googleAuth: GoogleAuth | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    deps.logger('Sheets plugin initialized');
  }

  setGoogleAuth(auth: GoogleAuth): void {
    this.googleAuth = auth;
  }

  private getClient(): SheetsApiClient {
    if (!this.googleAuth) throw new Error('GoogleAuth not configured');
    if (!this.client) {
      this.client = new SheetsApiClient(this.googleAuth.getAuthenticatedClient());
    }
    return this.client;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const client = this.getClient();
      switch (toolName) {
        case 'sheets_search':
          return client.searchSpreadsheets(args.query as string | undefined, (args.maxResults as number) ?? 20);
        case 'sheets_info':
          return client.getSpreadsheetInfo(args.spreadsheetId as string);
        case 'sheets_read':
          return client.readRange(args.spreadsheetId as string, args.range as string);
        case 'sheets_write':
          return client.writeRange(args.spreadsheetId as string, args.range as string, args.values as string[][]);
        case 'sheets_append':
          return client.appendRows(args.spreadsheetId as string, args.range as string, args.values as string[][]);
        case 'sheets_create':
          return client.createSpreadsheet(args.title as string, args.sheetNames as string[] | undefined);
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Sheets error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
