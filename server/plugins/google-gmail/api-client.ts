import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { ToolResult } from '../base-plugin.js';

export class GmailApiClient {
  private gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async searchEmails(query: string, maxResults = 10): Promise<ToolResult> {
    try {
      const res = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
      });

      const messages = res.data.messages ?? [];
      if (messages.length === 0) {
        return { content: [{ type: 'text', text: 'No emails found.' }] };
      }

      // Fetch headers for each message
      const details = await Promise.all(
        messages.map(async (msg) => {
          const detail = await this.gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date'],
          });
          const headers = detail.data.payload?.headers ?? [];
          const get = (name: string) => headers.find((h) => h.name === name)?.value ?? '';
          return {
            id: msg.id,
            subject: get('Subject'),
            from: get('From'),
            date: get('Date'),
            snippet: detail.data.snippet ?? '',
          };
        })
      );

      const text = details
        .map((d) => `**${d.subject}**\nFrom: ${d.from}\nDate: ${d.date}\n${d.snippet}\n[ID: ${d.id}]`)
        .join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Gmail search error: ${err.message}` }], isError: true };
    }
  }

  async readEmail(messageId: string): Promise<ToolResult> {
    try {
      const res = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const headers = res.data.payload?.headers ?? [];
      const get = (name: string) => headers.find((h) => h.name === name)?.value ?? '';

      // Extract body text
      let body = '';
      const payload = res.data.payload;
      if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      } else if (payload?.parts) {
        const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
        }
      }

      const text = [
        `**Subject:** ${get('Subject')}`,
        `**From:** ${get('From')}`,
        `**To:** ${get('To')}`,
        `**Date:** ${get('Date')}`,
        '',
        body || '(no text content)',
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Gmail read error: ${err.message}` }], isError: true };
    }
  }

  async sendEmail(to: string, subject: string, body: string): Promise<ToolResult> {
    try {
      const raw = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].join('\r\n');

      const encoded = Buffer.from(raw)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encoded },
      });

      return { content: [{ type: 'text', text: `Email sent to ${to} with subject "${subject}"` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Gmail send error: ${err.message}` }], isError: true };
    }
  }

  async createDraft(to: string, subject: string, body: string): Promise<ToolResult> {
    try {
      const raw = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].join('\r\n');

      const encoded = Buffer.from(raw)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw: encoded } },
      });

      return { content: [{ type: 'text', text: `Draft created (ID: ${res.data.id})` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Gmail draft error: ${err.message}` }], isError: true };
    }
  }

  async listLabels(): Promise<ToolResult> {
    try {
      const res = await this.gmail.users.labels.list({ userId: 'me' });
      const labels = (res.data.labels ?? []).map((l) => l.name).join(', ');
      return { content: [{ type: 'text', text: `Labels: ${labels}` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Gmail labels error: ${err.message}` }], isError: true };
    }
  }
}
