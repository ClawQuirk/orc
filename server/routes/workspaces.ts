// NOTE: Route ordering matters. Literal paths must register before parameterized
// ones (see ~/.claude/memory/feedback_route_ordering.md). Current routes have no
// literal-vs-param conflicts, but preserve this invariant when adding new ones.
import { randomBytes } from 'node:crypto';
import type { Router } from '../router.js';
import { sendJson, readJsonBody } from '../router.js';
import { getDatabase } from '../db/index.js';
import { invalidateWorkspaceCache } from './workspace-helper.js';

interface WorkspaceRow {
  id: string;
  name: string;
  type: 'home' | 'business';
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

function shortId(): string {
  return randomBytes(6).toString('hex');
}

function now(): string {
  return new Date().toISOString();
}

export function registerWorkspaceRoutes(router: Router): void {
  const db = () => getDatabase();

  // List active workspaces, Home first then businesses by sort_order
  router.get('/api/workspaces', (_req, res) => {
    const rows = db()
      .prepare(
        `SELECT * FROM workspaces WHERE status = 'active'
         ORDER BY CASE type WHEN 'home' THEN 0 ELSE 1 END, sort_order, created_at`
      )
      .all() as WorkspaceRow[];
    sendJson(res, 200, { workspaces: rows });
  });

  // Get a single workspace with counts of scoped data
  router.get('/api/workspaces/:id', (_req, res, params) => {
    const row = db()
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(params.id) as WorkspaceRow | undefined;
    if (!row) {
      sendJson(res, 404, { error: 'Workspace not found' });
      return;
    }
    const projectCount = (db()
      .prepare(`SELECT COUNT(*) as c FROM projects WHERE workspace_id = ?`)
      .get(params.id) as { c: number }).c;
    const journalCount = (db()
      .prepare(`SELECT COUNT(*) as c FROM journal_entries WHERE workspace_id = ?`)
      .get(params.id) as { c: number }).c;
    const boardCount = (db()
      .prepare(`SELECT COUNT(*) as c FROM brainstorm_boards WHERE workspace_id = ?`)
      .get(params.id) as { c: number }).c;
    sendJson(res, 200, {
      ...row,
      counts: { projects: projectCount, journal: journalCount, boards: boardCount },
    });
  });

  // Create a business workspace
  router.post('/api/workspaces', async (req, res) => {
    const body = await readJsonBody<{
      name: string;
      description?: string;
      icon?: string;
      color?: string;
    }>(req);
    const name = body.name?.trim();
    if (!name) {
      sendJson(res, 400, { error: 'name required' });
      return;
    }
    const existing = db()
      .prepare(
        `SELECT id FROM workspaces WHERE lower(name) = lower(?) AND status = 'active'`
      )
      .get(name);
    if (existing) {
      sendJson(res, 409, { error: 'A workspace with that name already exists' });
      return;
    }
    const id = shortId();
    const maxOrder = db()
      .prepare(
        `SELECT MAX(sort_order) as m FROM workspaces WHERE type = 'business'`
      )
      .get() as { m: number | null };
    const sortOrder = (maxOrder.m ?? -1) + 1;
    const ts = now();
    db()
      .prepare(
        `INSERT INTO workspaces (id, name, type, description, icon, color, sort_order, status, created_at, updated_at)
         VALUES (?, ?, 'business', ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(
        id,
        name,
        body.description ?? null,
        body.icon ?? null,
        body.color ?? null,
        sortOrder,
        ts,
        ts
      );
    invalidateWorkspaceCache();
    sendJson(res, 201, {
      id,
      name,
      type: 'business',
      description: body.description ?? null,
      icon: body.icon ?? null,
      color: body.color ?? null,
      sort_order: sortOrder,
      status: 'active',
      created_at: ts,
      updated_at: ts,
    });
  });

  // Update a workspace (name, description, icon, color, sort_order)
  router.put('/api/workspaces/:id', async (req, res, params) => {
    const row = db()
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(params.id) as WorkspaceRow | undefined;
    if (!row) {
      sendJson(res, 404, { error: 'Workspace not found' });
      return;
    }
    const body = await readJsonBody<Record<string, unknown>>(req);
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ['name', 'description', 'icon', 'color', 'sort_order']) {
      if (key in body) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }
    if (fields.length === 0) {
      sendJson(res, 400, { error: 'No fields to update' });
      return;
    }
    if (typeof body.name === 'string' && body.name.trim() !== row.name) {
      const existing = db()
        .prepare(
          `SELECT id FROM workspaces WHERE lower(name) = lower(?) AND status = 'active' AND id != ?`
        )
        .get(body.name.trim(), params.id);
      if (existing) {
        sendJson(res, 409, {
          error: 'A workspace with that name already exists',
        });
        return;
      }
    }
    fields.push('updated_at = ?');
    values.push(now());
    values.push(params.id);
    db()
      .prepare(`UPDATE workspaces SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
    invalidateWorkspaceCache();
    sendJson(res, 200, { success: true });
  });

  // Soft-delete (archive) a business workspace — Home cannot be deleted
  router.delete('/api/workspaces/:id', (_req, res, params) => {
    if (params.id === 'home') {
      sendJson(res, 400, { error: 'Cannot delete Home workspace' });
      return;
    }
    const row = db()
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(params.id) as WorkspaceRow | undefined;
    if (!row) {
      sendJson(res, 404, { error: 'Workspace not found' });
      return;
    }
    db()
      .prepare(
        `UPDATE workspaces SET status = 'archived', updated_at = ? WHERE id = ?`
      )
      .run(now(), params.id);
    invalidateWorkspaceCache();
    sendJson(res, 200, { success: true });
  });
}
