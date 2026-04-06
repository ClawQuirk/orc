import { randomUUID } from 'node:crypto';
import type { Router } from '../router.js';
import { sendJson, readJsonBody, getQueryParams } from '../router.js';
import { getDatabase } from '../db/index.js';
import { regenerateProjectMarkdown, deleteProjectMarkdown } from '../projects/markdown-gen.js';

export function registerProjectRoutes(router: Router): void {
  const db = () => getDatabase();
  const now = () => new Date().toISOString();

  // --- Projects CRUD ---
  router.get('/api/projects', (req, res) => {
    const params = getQueryParams(req);
    const status = params.get('status');
    let rows;
    if (status) {
      rows = db().prepare('SELECT * FROM projects WHERE status = ? ORDER BY updated_at DESC').all(status);
    } else {
      rows = db().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
    }
    // Attach epic counts
    const projects = (rows as any[]).map((p) => {
      const epicCount = (db().prepare('SELECT COUNT(*) as c FROM epics WHERE project_id = ?').get(p.id) as any).c;
      const taskCount = (db().prepare('SELECT COUNT(*) as c FROM tasks WHERE project_id = ?').get(p.id) as any).c;
      const doneCount = (db().prepare("SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND status = 'done'").get(p.id) as any).c;
      return { ...p, google_links: JSON.parse(p.google_links || '[]'), epicCount, taskCount, doneCount };
    });
    sendJson(res, 200, { projects });
  });

  router.post('/api/projects', async (req, res) => {
    const body = await readJsonBody<{ name: string; summary?: string; effort_estimate?: string }>(req);
    if (!body.name?.trim()) {
      sendJson(res, 400, { error: 'Project name required' });
      return;
    }
    const id = randomUUID();
    const ts = now();
    db().prepare(
      'INSERT INTO projects (id, name, summary, effort_estimate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, body.name.trim(), body.summary?.trim() || null, body.effort_estimate?.trim() || null, ts, ts);
    regenerateProjectMarkdown(id);
    const project = db().prepare('SELECT * FROM projects WHERE id = ?').get(id);
    sendJson(res, 201, project);
  });

  router.get('/api/projects/:id', (_req, res, params) => {
    const project = db().prepare('SELECT * FROM projects WHERE id = ?').get(params.id) as any;
    if (!project) { sendJson(res, 404, { error: 'Not found' }); return; }
    project.google_links = JSON.parse(project.google_links || '[]');

    const epics = db().prepare('SELECT * FROM epics WHERE project_id = ? ORDER BY sort_order, created_at').all(params.id) as any[];
    const tasks = db().prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order, created_at').all(params.id) as any[];
    const meetings = db().prepare('SELECT * FROM project_meetings WHERE project_id = ?').all(params.id);
    const recommendations = db().prepare('SELECT * FROM project_recommendations WHERE project_id = ? ORDER BY created_at').all(params.id);

    // Nest tasks under epics
    const tasksByEpic = new Map<string, any[]>();
    for (const t of tasks) {
      const list = tasksByEpic.get(t.epic_id) ?? [];
      list.push(t);
      tasksByEpic.set(t.epic_id, list);
    }
    for (const e of epics) {
      e.tasks = tasksByEpic.get(e.id) ?? [];
    }

    sendJson(res, 200, { ...project, epics, meetings, recommendations });
  });

  router.put('/api/projects/:id', async (req, res, params) => {
    const body = await readJsonBody<Record<string, unknown>>(req);
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const key of ['name', 'summary', 'status', 'effort_estimate']) {
      if (key in body) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }
    if ('google_links' in body) {
      fields.push('google_links = ?');
      values.push(JSON.stringify(body.google_links));
    }
    if (fields.length === 0) { sendJson(res, 400, { error: 'No fields to update' }); return; }
    fields.push('updated_at = ?');
    values.push(now());
    values.push(params.id);

    db().prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    regenerateProjectMarkdown(params.id);
    sendJson(res, 200, { success: true });
  });

  router.delete('/api/projects/:id', (_req, res, params) => {
    db().prepare('DELETE FROM projects WHERE id = ?').run(params.id);
    deleteProjectMarkdown(params.id);
    sendJson(res, 200, { success: true });
  });

  // --- Epics ---
  router.post('/api/projects/:id/epics', async (req, res, params) => {
    const body = await readJsonBody<{ title: string; description?: string; effort_estimate?: string }>(req);
    if (!body.title?.trim()) { sendJson(res, 400, { error: 'Title required' }); return; }
    const id = randomUUID();
    const maxOrder = (db().prepare('SELECT MAX(sort_order) as m FROM epics WHERE project_id = ?').get(params.id) as any)?.m ?? -1;
    db().prepare(
      'INSERT INTO epics (id, project_id, title, description, effort_estimate, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, params.id, body.title.trim(), body.description?.trim() || null, body.effort_estimate?.trim() || null, maxOrder + 1);
    db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), params.id);
    regenerateProjectMarkdown(params.id);
    sendJson(res, 201, { id });
  });

  router.put('/api/projects/:id/epics/:epicId', async (req, res, params) => {
    const body = await readJsonBody<Record<string, unknown>>(req);
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ['title', 'description', 'status', 'effort_estimate', 'sort_order']) {
      if (key in body) { fields.push(`${key} = ?`); values.push(body[key]); }
    }
    if (fields.length === 0) { sendJson(res, 400, { error: 'No fields' }); return; }
    fields.push('updated_at = ?'); values.push(now());
    values.push(params.epicId);
    db().prepare(`UPDATE epics SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), params.id);
    regenerateProjectMarkdown(params.id);
    sendJson(res, 200, { success: true });
  });

  router.delete('/api/projects/:id/epics/:epicId', (_req, res, params) => {
    db().prepare('DELETE FROM epics WHERE id = ?').run(params.epicId);
    db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), params.id);
    regenerateProjectMarkdown(params.id);
    sendJson(res, 200, { success: true });
  });

  // --- Tasks ---
  router.post('/api/projects/:id/tasks', async (req, res, params) => {
    const body = await readJsonBody<{ epicId: string; title: string; description?: string; effort_estimate?: string }>(req);
    if (!body.epicId || !body.title?.trim()) { sendJson(res, 400, { error: 'epicId and title required' }); return; }
    const id = randomUUID();
    const maxOrder = (db().prepare('SELECT MAX(sort_order) as m FROM tasks WHERE epic_id = ?').get(body.epicId) as any)?.m ?? -1;
    db().prepare(
      'INSERT INTO tasks (id, epic_id, project_id, title, description, effort_estimate, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, body.epicId, params.id, body.title.trim(), body.description?.trim() || null, body.effort_estimate?.trim() || null, maxOrder + 1);
    db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), params.id);
    regenerateProjectMarkdown(params.id);
    sendJson(res, 201, { id });
  });

  router.put('/api/projects/:id/tasks/:taskId', async (req, res, params) => {
    const body = await readJsonBody<Record<string, unknown>>(req);
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ['title', 'description', 'status', 'effort_estimate', 'sort_order']) {
      if (key in body) { fields.push(`${key} = ?`); values.push(body[key]); }
    }
    if (fields.length === 0) { sendJson(res, 400, { error: 'No fields' }); return; }
    fields.push('updated_at = ?'); values.push(now());
    values.push(params.taskId);
    db().prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), params.id);
    regenerateProjectMarkdown(params.id);
    sendJson(res, 200, { success: true });
  });

  router.delete('/api/projects/:id/tasks/:taskId', (_req, res, params) => {
    db().prepare('DELETE FROM tasks WHERE id = ?').run(params.taskId);
    db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), params.id);
    regenerateProjectMarkdown(params.id);
    sendJson(res, 200, { success: true });
  });

  // --- Meetings ---
  router.post('/api/projects/:id/meetings', async (req, res, params) => {
    const body = await readJsonBody<{ calendarEventId: string; label?: string }>(req);
    if (!body.calendarEventId) { sendJson(res, 400, { error: 'calendarEventId required' }); return; }
    const id = randomUUID();
    try {
      db().prepare(
        'INSERT INTO project_meetings (id, project_id, calendar_event_id, label) VALUES (?, ?, ?, ?)'
      ).run(id, params.id, body.calendarEventId, body.label?.trim() || null);
    } catch {
      sendJson(res, 409, { error: 'Meeting already linked' });
      return;
    }
    db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), params.id);
    regenerateProjectMarkdown(params.id);
    sendJson(res, 201, { id });
  });

  router.delete('/api/projects/:id/meetings/:meetingId', (_req, res, params) => {
    db().prepare('DELETE FROM project_meetings WHERE id = ?').run(params.meetingId);
    db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), params.id);
    regenerateProjectMarkdown(params.id);
    sendJson(res, 200, { success: true });
  });

  // --- Recommendations ---
  router.post('/api/projects/:id/recommendations', async (req, res, params) => {
    const body = await readJsonBody<{ text: string }>(req);
    if (!body.text?.trim()) { sendJson(res, 400, { error: 'text required' }); return; }
    const id = randomUUID();
    db().prepare(
      'INSERT INTO project_recommendations (id, project_id, text) VALUES (?, ?, ?)'
    ).run(id, params.id, body.text.trim());
    db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), params.id);
    regenerateProjectMarkdown(params.id);
    sendJson(res, 201, { id });
  });

  router.put('/api/projects/:id/recommendations/:recId', async (req, res, params) => {
    const body = await readJsonBody<{ status: 'accepted' | 'declined' }>(req);
    if (!body.status || !['accepted', 'declined'].includes(body.status)) {
      sendJson(res, 400, { error: 'status must be accepted or declined' });
      return;
    }
    db().prepare('UPDATE project_recommendations SET status = ? WHERE id = ?').run(body.status, params.recId);
    db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), params.id);
    regenerateProjectMarkdown(params.id);
    sendJson(res, 200, { success: true });
  });
}
