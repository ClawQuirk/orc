import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { ToolResult } from '../base-plugin.js';

export class SheetsApiClient {
  private sheets;
  private drive;

  constructor(auth: OAuth2Client) {
    this.sheets = google.sheets({ version: 'v4', auth });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async searchSpreadsheets(query?: string, maxResults = 20): Promise<ToolResult> {
    try {
      let q = "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
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
        return { content: [{ type: 'text', text: query ? `No spreadsheets matching "${query}".` : 'No spreadsheets found.' }] };
      }

      const text = files.map((f) =>
        `**${f.name}**\nModified: ${f.modifiedTime}\n[ID: ${f.id}]\nLink: ${f.webViewLink}`
      ).join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Sheets search error: ${err.message}` }], isError: true };
    }
  }

  async getSpreadsheetInfo(spreadsheetId: string): Promise<ToolResult> {
    try {
      const res = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties.title,sheets.properties',
      });

      const title = res.data.properties?.title ?? '(untitled)';
      const sheets = res.data.sheets ?? [];

      const sheetLines = sheets.map((s) => {
        const props = s.properties;
        const rows = props?.gridProperties?.rowCount ?? 0;
        const cols = props?.gridProperties?.columnCount ?? 0;
        return `- **${props?.title}** (${rows} rows x ${cols} cols) [index: ${props?.index}]`;
      });

      const text = `# ${title}\n\n[ID: ${spreadsheetId}]\n\nSheets:\n${sheetLines.join('\n')}`;
      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Sheets info error: ${err.message}` }], isError: true };
    }
  }

  async readRange(spreadsheetId: string, range: string): Promise<ToolResult> {
    try {
      const res = await this.sheets.spreadsheets.values.get({ spreadsheetId, range });
      const values = res.data.values ?? [];

      if (values.length === 0) {
        return { content: [{ type: 'text', text: `No data in range "${range}".` }] };
      }

      // Format as markdown table
      const maxCols = Math.max(...values.map((r) => r.length));
      const padded = values.map((row) => {
        const cells = [...row];
        while (cells.length < maxCols) cells.push('');
        return cells.map((c) => String(c ?? ''));
      });

      const header = padded[0];
      const separator = header.map(() => '---');
      const rows = padded.slice(1);

      const table = [
        `| ${header.join(' | ')} |`,
        `| ${separator.join(' | ')} |`,
        ...rows.map((r) => `| ${r.join(' | ')} |`),
      ].join('\n');

      const text = `Range: ${res.data.range}\n\n${table}\n\n(${values.length} rows, ${maxCols} columns)`;
      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Sheets read error: ${err.message}` }], isError: true };
    }
  }

  async writeRange(spreadsheetId: string, range: string, values: string[][]): Promise<ToolResult> {
    try {
      const res = await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      const updated = res.data.updatedCells ?? 0;
      return { content: [{ type: 'text', text: `Updated ${updated} cells in range "${res.data.updatedRange}"` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Sheets write error: ${err.message}` }], isError: true };
    }
  }

  async appendRows(spreadsheetId: string, range: string, values: string[][]): Promise<ToolResult> {
    try {
      const res = await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      const updated = res.data.updates?.updatedRows ?? values.length;
      return { content: [{ type: 'text', text: `Appended ${updated} rows to "${res.data.updates?.updatedRange ?? range}"` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Sheets append error: ${err.message}` }], isError: true };
    }
  }

  async createSpreadsheet(title: string, sheetNames?: string[]): Promise<ToolResult> {
    try {
      const sheets = sheetNames?.map((name) => ({ properties: { title: name } }));
      const res = await this.sheets.spreadsheets.create({
        requestBody: {
          properties: { title },
          sheets: sheets?.length ? sheets : undefined,
        },
      });

      const id = res.data.spreadsheetId!;
      return {
        content: [{
          type: 'text',
          text: `Spreadsheet created: "${title}" [ID: ${id}]\nLink: https://docs.google.com/spreadsheets/d/${id}/edit`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Sheets create error: ${err.message}` }], isError: true };
    }
  }
}
