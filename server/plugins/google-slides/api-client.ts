import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { ToolResult } from '../base-plugin.js';

const MAX_CONTENT_LENGTH = 50_000;

export class SlidesApiClient {
  private slides;
  private drive;

  constructor(auth: OAuth2Client) {
    this.slides = google.slides({ version: 'v1', auth });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async searchPresentations(query?: string, maxResults = 20): Promise<ToolResult> {
    try {
      let q = "mimeType = 'application/vnd.google-apps.presentation' and trashed = false";
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
        return { content: [{ type: 'text', text: query ? `No presentations matching "${query}".` : 'No presentations found.' }] };
      }

      const text = files.map((f) =>
        `**${f.name}**\nModified: ${f.modifiedTime}\n[ID: ${f.id}]\nLink: ${f.webViewLink}`
      ).join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Slides search error: ${err.message}` }], isError: true };
    }
  }

  async readPresentation(presentationId: string): Promise<ToolResult> {
    try {
      // Get title
      const meta = await this.drive.files.get({ fileId: presentationId, fields: 'name,modifiedTime' });
      const title = meta.data.name ?? '(untitled)';

      // Export as plain text
      const res = await this.drive.files.export({ fileId: presentationId, mimeType: 'text/plain' });
      let content = typeof res.data === 'string' ? res.data : String(res.data);

      let truncated = false;
      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.slice(0, MAX_CONTENT_LENGTH);
        truncated = true;
      }

      const text = `# ${title}\n\n${content}${truncated ? '\n\n[truncated — content exceeds 50K chars]' : ''}`;
      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Slides read error: ${err.message}` }], isError: true };
    }
  }

  async getPresentationInfo(presentationId: string): Promise<ToolResult> {
    try {
      const res = await this.slides.presentations.get({ presentationId });
      const pres = res.data;
      const title = pres.title ?? '(untitled)';
      const slides = pres.slides ?? [];

      const lines: string[] = [`# ${title}`, '', `Slides: ${slides.length}`, ''];

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        lines.push(`## Slide ${i + 1} [${slide.objectId}]`);

        // Extract text from shapes
        const texts: string[] = [];
        for (const element of slide.pageElements ?? []) {
          if (element.shape?.text?.textElements) {
            for (const te of element.shape.text.textElements) {
              if (te.textRun?.content) {
                const trimmed = te.textRun.content.trim();
                if (trimmed) texts.push(trimmed);
              }
            }
          }
        }

        if (texts.length > 0) {
          lines.push(texts.join(' '));
        } else {
          lines.push('(no text content)');
        }
        lines.push('');
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Slides info error: ${err.message}` }], isError: true };
    }
  }
}
