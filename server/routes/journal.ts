import { randomUUID } from 'node:crypto';
import type { Router } from '../router.js';
import { sendJson, readJsonBody, getQueryParams } from '../router.js';
import { getDatabase } from '../db/index.js';

function autoSummary(content: string): string {
  const clean = content.replace(/[#*_`\[\]]/g, '').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  let summary = '';
  for (const s of sentences) {
    if ((summary + s).length > 200) break;
    summary += s;
  }
  return (summary || clean.slice(0, 200)).trim();
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function registerJournalRoutes(router: Router): void {
  const db = () => getDatabase();
  const now = () => new Date().toISOString();

  // Distinct dates with entry counts (for sidebar)
  router.get('/api/journal/dates', (_req, res) => {
    const rows = db().prepare(
      `SELECT date, COUNT(*) as count FROM journal_entries GROUP BY date ORDER BY date DESC`
    ).all();
    sendJson(res, 200, { dates: rows });
  });

  // List entries — Tier 1 (index: id, date, title, tags, source)
  router.get('/api/journal', (req, res) => {
    const params = getQueryParams(req);
    const from = params.get('from');
    const to = params.get('to');
    const tag = params.get('tag');
    const source = params.get('source');

    let sql = 'SELECT id, date, title, tags, source, mood, created_at FROM journal_entries WHERE 1=1';
    const binds: unknown[] = [];

    if (from) { sql += ' AND date >= ?'; binds.push(from); }
    if (to) { sql += ' AND date <= ?'; binds.push(to); }
    if (source) { sql += ' AND source = ?'; binds.push(source); }
    sql += ' ORDER BY date DESC, created_at DESC';

    let entries = db().prepare(sql).all(...binds) as any[];

    // Parse tags JSON and filter by tag if needed (handle double-encoded strings)
    entries = entries.map((e) => {
      let tags = JSON.parse(e.tags || '[]');
      if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch {} }
      return { ...e, tags: Array.isArray(tags) ? tags : [] };
    });
    if (tag) {
      entries = entries.filter((e) => e.tags.includes(tag));
    }

    sendJson(res, 200, { entries });
  });

  // List entries — Tier 2 (adds summary)
  router.get('/api/journal/summaries', (req, res) => {
    const params = getQueryParams(req);
    const from = params.get('from');
    const to = params.get('to');

    let sql = 'SELECT id, date, title, summary, tags, source, mood, created_at FROM journal_entries WHERE 1=1';
    const binds: unknown[] = [];
    if (from) { sql += ' AND date >= ?'; binds.push(from); }
    if (to) { sql += ' AND date <= ?'; binds.push(to); }
    sql += ' ORDER BY date DESC, created_at DESC';

    const entries = db().prepare(sql).all(...binds) as any[];
    sendJson(res, 200, {
      entries: entries.map((e) => ({ ...e, tags: JSON.parse(e.tags || '[]') })),
    });
  });

  // Get full entry — Tier 3
  router.get('/api/journal/:id', (_req, res, params) => {
    const entry = db().prepare('SELECT * FROM journal_entries WHERE id = ?').get(params.id) as any;
    if (!entry) { sendJson(res, 404, { error: 'Not found' }); return; }
    entry.tags = JSON.parse(entry.tags || '[]');
    sendJson(res, 200, entry);
  });

  // Create entry
  router.post('/api/journal', async (req, res) => {
    const body = await readJsonBody<{
      date?: string;
      title: string;
      content: string;
      summary?: string;
      tags?: string[];
      source?: string;
      mood?: string;
    }>(req);

    if (!body.title?.trim() || !body.content?.trim()) {
      sendJson(res, 400, { error: 'title and content required' });
      return;
    }

    const id = randomUUID();
    const ts = now();
    const date = body.date || today();
    const summary = body.summary?.trim() || autoSummary(body.content);
    const tags = JSON.stringify(body.tags || []);
    const source = body.source || 'manual';

    db().prepare(
      `INSERT INTO journal_entries (id, date, title, summary, content, tags, source, mood, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, date, body.title.trim(), summary, body.content.trim(), tags, source, body.mood || null, ts, ts);

    sendJson(res, 201, { id, date, title: body.title.trim(), summary });
  });

  // Update entry
  router.put('/api/journal/:id', async (req, res, params) => {
    const body = await readJsonBody<Record<string, unknown>>(req);
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const key of ['title', 'content', 'mood', 'date']) {
      if (key in body) { fields.push(`${key} = ?`); values.push(body[key]); }
    }
    if ('tags' in body) {
      fields.push('tags = ?');
      values.push(JSON.stringify(body.tags));
    }
    if ('summary' in body) {
      fields.push('summary = ?');
      values.push(body.summary);
    } else if ('content' in body && typeof body.content === 'string') {
      // Auto-regenerate summary when content changes
      fields.push('summary = ?');
      values.push(autoSummary(body.content));
    }

    if (fields.length === 0) { sendJson(res, 400, { error: 'No fields to update' }); return; }
    fields.push('updated_at = ?');
    values.push(now());
    values.push(params.id);

    db().prepare(`UPDATE journal_entries SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    sendJson(res, 200, { success: true });
  });

  // Delete entry
  router.delete('/api/journal/:id', (_req, res, params) => {
    db().prepare('DELETE FROM journal_entries WHERE id = ?').run(params.id);
    sendJson(res, 200, { success: true });
  });

  // FTS5 search — returns Tier 2 with snippets
  router.get('/api/journal/search', (req, res) => {
    const params = getQueryParams(req);
    const q = params.get('q');
    const limit = Math.min(parseInt(params.get('limit') || '20', 10), 50);

    if (!q) { sendJson(res, 400, { error: 'q parameter required' }); return; }

    const rows = db().prepare(`
      SELECT je.id, je.date, je.title, je.summary, je.tags, je.source, je.mood,
             snippet(journal_fts, 2, '<mark>', '</mark>', '...', 40) as snippet
      FROM journal_fts
      JOIN journal_entries je ON je.rowid = journal_fts.rowid
      WHERE journal_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(q, limit) as any[];

    sendJson(res, 200, {
      entries: rows.map((r) => ({ ...r, tags: JSON.parse(r.tags || '[]') })),
    });
  });
}
