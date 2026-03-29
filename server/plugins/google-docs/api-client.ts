import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { ToolResult } from '../base-plugin.js';

const MAX_CONTENT_LENGTH = 50_000;

export class DocsApiClient {
  private docs;
  private drive;

  constructor(auth: OAuth2Client) {
    this.docs = google.docs({ version: 'v1', auth });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async searchDocuments(query?: string, maxResults = 20): Promise<ToolResult> {
    try {
      let q = "mimeType = 'application/vnd.google-apps.document' and trashed = false";
      if (query) {
        q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
      }

      const res = await this.drive.files.list({
        q,
        fields: 'files(id, name, webViewLink, modifiedTime)',
        pageSize: maxResults,
        orderBy: 'modifiedTime desc',
      });

      const files = res.data.files ?? [];
      if (files.length === 0) {
        return { content: [{ type: 'text', text: query ? `No documents matching "${query}".` : 'No documents found.' }] };
      }

      const text = files.map((f) =>
        `**${f.name}**\nModified: ${f.modifiedTime}\n[ID: ${f.id}]\nLink: ${f.webViewLink}`
      ).join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Docs search error: ${err.message}` }], isError: true };
    }
  }

  async readDocument(documentId: string): Promise<ToolResult> {
    try {
      const meta = await this.drive.files.get({ fileId: documentId, fields: 'name,modifiedTime' });
      const title = meta.data.name ?? '(untitled)';

      const res = await this.drive.files.export({ fileId: documentId, mimeType: 'text/plain' });
      let content = typeof res.data === 'string' ? res.data : String(res.data);

      let truncated = false;
      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.slice(0, MAX_CONTENT_LENGTH);
        truncated = true;
      }

      const text = `# ${title}\n\n${content}${truncated ? '\n\n[truncated — content exceeds 50K chars]' : ''}`;
      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Docs read error: ${err.message}` }], isError: true };
    }
  }

  async createDocument(title: string, initialContent?: string): Promise<ToolResult> {
    try {
      const createRes = await this.docs.documents.create({ requestBody: { title } });
      const documentId = createRes.data.documentId!;

      if (initialContent) {
        await this.docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [{
              insertText: {
                endOfSegmentLocation: {},
                text: initialContent,
              },
            }],
          },
        });
      }

      return {
        content: [{
          type: 'text',
          text: `Document created: "${title}" [ID: ${documentId}]\nLink: https://docs.google.com/document/d/${documentId}/edit`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Docs create error: ${err.message}` }], isError: true };
    }
  }

  async appendToDocument(documentId: string, text: string): Promise<ToolResult> {
    try {
      await this.docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [{
            insertText: {
              endOfSegmentLocation: {},
              text,
            },
          }],
        },
      });

      return { content: [{ type: 'text', text: `Text appended to document [ID: ${documentId}]` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Docs append error: ${err.message}` }], isError: true };
    }
  }

  async replaceInDocument(documentId: string, findText: string, replaceText: string, matchCase = true): Promise<ToolResult> {
    try {
      const res = await this.docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [{
            replaceAllText: {
              containsText: { text: findText, matchCase },
              replaceText,
            },
          }],
        },
      });

      const count = res.data.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;
      return {
        content: [{
          type: 'text',
          text: `Replaced ${count} occurrence${count !== 1 ? 's' : ''} of "${findText}" in document [ID: ${documentId}]`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Docs replace error: ${err.message}` }], isError: true };
    }
  }
}
