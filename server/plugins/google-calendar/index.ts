import type { ServerPlugin, PluginDependencies, ToolResult } from '../base-plugin.js';
import type { PluginManifest, PluginToolDefinition } from '../../../shared/plugin-types.js';
import { CalendarApiClient } from './api-client.js';
import { GoogleAuth } from '../google/google-auth.js';

const manifest: PluginManifest = {
  id: 'google-calendar',
  name: 'Google Calendar',
  description: 'View, create, and manage calendar events',
  version: '0.1.0',
  icon: 'calendar',
  category: 'calendar',
  requiresAuth: true,
  authType: 'oauth2',
  toolPrefix: 'calendar',
  connection: 'google',
};

const tools: PluginToolDefinition[] = [
  {
    name: 'calendar_upcoming',
    description: 'Get upcoming calendar events. Returns the next N events starting from now.',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Number of events to return (default 10)' },
      },
    },
  },
  {
    name: 'calendar_search',
    description: 'Search calendar events by keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword (matches event titles, descriptions)' },
        timeMin: { type: 'string', description: 'Start of time range (ISO 8601, default: now)' },
        timeMax: { type: 'string', description: 'End of time range (ISO 8601, optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'calendar_create',
    description: 'Create a new calendar event.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title' },
        startTime: { type: 'string', description: 'Start time (ISO 8601 with timezone, e.g., "2025-03-27T14:00:00-07:00")' },
        endTime: { type: 'string', description: 'End time (ISO 8601 with timezone)' },
        description: { type: 'string', description: 'Event description (optional)' },
        location: { type: 'string', description: 'Event location (optional)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'List of attendee email addresses (optional)' },
      },
      required: ['summary', 'startTime', 'endTime'],
    },
  },
  {
    name: 'calendar_update',
    description: 'Update an existing calendar event by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Event ID (returned by calendar_upcoming or calendar_search)' },
        summary: { type: 'string', description: 'New event title (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        location: { type: 'string', description: 'New location (optional)' },
      },
      required: ['eventId'],
    },
  },
];

export class CalendarPlugin implements ServerPlugin {
  manifest = manifest;
  tools = tools;
  private client: CalendarApiClient | null = null;
  private googleAuth: GoogleAuth | null = null;

  async initialize(deps: PluginDependencies): Promise<void> {
    deps.logger('Calendar plugin initialized');
  }

  setGoogleAuth(auth: GoogleAuth): void {
    this.googleAuth = auth;
  }

  private getClient(): CalendarApiClient {
    if (!this.googleAuth) throw new Error('GoogleAuth not configured');
    if (!this.client) {
      this.client = new CalendarApiClient(this.googleAuth.getAuthenticatedClient());
    }
    return this.client;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const client = this.getClient();
      switch (toolName) {
        case 'calendar_upcoming':
          return client.getUpcoming((args.maxResults as number) ?? 10);
        case 'calendar_search':
          return client.searchEvents(
            args.query as string,
            args.timeMin as string | undefined,
            args.timeMax as string | undefined
          );
        case 'calendar_create':
          return client.createEvent(
            args.summary as string,
            args.startTime as string,
            args.endTime as string,
            {
              description: args.description as string | undefined,
              location: args.location as string | undefined,
              attendees: args.attendees as string[] | undefined,
            }
          );
        case 'calendar_update': {
          const { eventId, ...updates } = args;
          return client.updateEvent(eventId as string, updates);
        }
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Calendar error: ${err.message}` }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
