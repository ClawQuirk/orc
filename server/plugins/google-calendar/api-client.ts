import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { ToolResult } from '../base-plugin.js';

export class CalendarApiClient {
  private calendar;

  constructor(auth: OAuth2Client) {
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  async getUpcoming(maxResults = 10): Promise<ToolResult> {
    try {
      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = res.data.items ?? [];
      if (events.length === 0) {
        return { content: [{ type: 'text', text: 'No upcoming events.' }] };
      }

      const text = events
        .map((e) => {
          const start = e.start?.dateTime || e.start?.date || '';
          const end = e.end?.dateTime || e.end?.date || '';
          const attendees = (e.attendees ?? []).map((a) => a.email).join(', ');
          return [
            `**${e.summary || '(no title)'}**`,
            `Start: ${start}`,
            `End: ${end}`,
            e.location ? `Location: ${e.location}` : '',
            attendees ? `Attendees: ${attendees}` : '',
            `[ID: ${e.id}]`,
          ].filter(Boolean).join('\n');
        })
        .join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Calendar error: ${err.message}` }], isError: true };
    }
  }

  async searchEvents(query: string, timeMin?: string, timeMax?: string): Promise<ToolResult> {
    try {
      const res = await this.calendar.events.list({
        calendarId: 'primary',
        q: query,
        timeMin: timeMin || new Date().toISOString(),
        timeMax: timeMax || undefined,
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = res.data.items ?? [];
      if (events.length === 0) {
        return { content: [{ type: 'text', text: `No events matching "${query}".` }] };
      }

      const text = events
        .map((e) => {
          const start = e.start?.dateTime || e.start?.date || '';
          return `**${e.summary}** — ${start} [ID: ${e.id}]`;
        })
        .join('\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Calendar search error: ${err.message}` }], isError: true };
    }
  }

  async createEvent(
    summary: string,
    startTime: string,
    endTime: string,
    options?: { description?: string; location?: string; attendees?: string[] }
  ): Promise<ToolResult> {
    try {
      const event: any = {
        summary,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      };
      if (options?.description) event.description = options.description;
      if (options?.location) event.location = options.location;
      if (options?.attendees) {
        event.attendees = options.attendees.map((email) => ({ email }));
      }

      const res = await this.calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });

      return {
        content: [{
          type: 'text',
          text: `Event created: "${res.data.summary}" on ${res.data.start?.dateTime || res.data.start?.date} [ID: ${res.data.id}]`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Calendar create error: ${err.message}` }], isError: true };
    }
  }

  async updateEvent(eventId: string, updates: Record<string, unknown>): Promise<ToolResult> {
    try {
      const res = await this.calendar.events.patch({
        calendarId: 'primary',
        eventId,
        requestBody: updates,
      });

      return {
        content: [{
          type: 'text',
          text: `Event updated: "${res.data.summary}" [ID: ${res.data.id}]`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Calendar update error: ${err.message}` }], isError: true };
    }
  }
}
