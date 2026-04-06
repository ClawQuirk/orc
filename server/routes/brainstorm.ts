import { randomUUID } from 'node:crypto';
import type { Router } from '../router.js';
import { sendJson, readJsonBody, getQueryParams } from '../router.js';
import { getDatabase } from '../db/index.js';

export function registerBrainstormRoutes(router: Router): void {
  const db = () => getDatabase();
  const now = () => new Date().toISOString();

  // --- Boards ---

  // List boards (optional ?status=active|archived)
  router.get('/api/brainstorm/boards', (req, res) => {
    const params = getQueryParams(req);
    const status = params.get('status');
    let sql = 'SELECT * FROM brainstorm_boards';
    const binds: unknown[] = [];
    if (status) { sql += ' WHERE status = ?'; binds.push(status); }
    sql += ' ORDER BY sort_order, created_at';
    const boards = db().prepare(sql).all(...binds);
    sendJson(res, 200, { boards });
  });

  // Get board with all nodes + edges
  router.get('/api/brainstorm/boards/:id', (_req, res, params) => {
    const board = db().prepare('SELECT * FROM brainstorm_boards WHERE id = ?').get(params.id);
    if (!board) { sendJson(res, 404, { error: 'Board not found' }); return; }
    const nodes = db().prepare('SELECT * FROM brainstorm_nodes WHERE board_id = ?').all(params.id);
    const edges = db().prepare('SELECT * FROM brainstorm_edges WHERE board_id = ?').all(params.id);
    sendJson(res, 200, { ...board as object, nodes, edges });
  });

  // Create board
  router.post('/api/brainstorm/boards', async (req, res) => {
    const body = await readJsonBody<{ name: string }>(req);
    if (!body.name?.trim()) { sendJson(res, 400, { error: 'name required' }); return; }
    const id = randomUUID();
    const maxOrder = db().prepare('SELECT MAX(sort_order) as m FROM brainstorm_boards').get() as any;
    const sortOrder = (maxOrder?.m ?? -1) + 1;
    const ts = now();
    db().prepare(
      'INSERT INTO brainstorm_boards (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, body.name.trim(), sortOrder, ts, ts);
    sendJson(res, 201, { id, name: body.name.trim(), status: 'active', sort_order: sortOrder, created_at: ts, updated_at: ts });
  });

  // Update board (partial: name, status, sort_order)
  router.put('/api/brainstorm/boards/:id', async (req, res, params) => {
    const body = await readJsonBody<Record<string, unknown>>(req);
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ['name', 'status', 'sort_order']) {
      if (key in body) { fields.push(`${key} = ?`); values.push(body[key]); }
    }
    if (fields.length === 0) { sendJson(res, 400, { error: 'No fields to update' }); return; }
    fields.push('updated_at = ?');
    values.push(now());
    values.push(params.id);
    db().prepare(`UPDATE brainstorm_boards SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    sendJson(res, 200, { success: true });
  });

  // Delete board (CASCADE handles nodes/edges)
  router.delete('/api/brainstorm/boards/:id', (_req, res, params) => {
    db().prepare('DELETE FROM brainstorm_boards WHERE id = ?').run(params.id);
    sendJson(res, 200, { success: true });
  });

  // Duplicate board (deep copy with new UUIDs)
  router.post('/api/brainstorm/boards/:id/duplicate', async (_req, res, params) => {
    const board = db().prepare('SELECT * FROM brainstorm_boards WHERE id = ?').get(params.id) as any;
    if (!board) { sendJson(res, 404, { error: 'Board not found' }); return; }

    const newBoardId = randomUUID();
    const maxOrder = db().prepare('SELECT MAX(sort_order) as m FROM brainstorm_boards').get() as any;
    const sortOrder = (maxOrder?.m ?? -1) + 1;
    const ts = now();

    const nodes = db().prepare('SELECT * FROM brainstorm_nodes WHERE board_id = ?').all(params.id) as any[];
    const edges = db().prepare('SELECT * FROM brainstorm_edges WHERE board_id = ?').all(params.id) as any[];

    // Map old node IDs to new ones
    const nodeIdMap = new Map<string, string>();
    for (const n of nodes) { nodeIdMap.set(n.id, randomUUID()); }

    db().transaction(() => {
      db().prepare(
        'INSERT INTO brainstorm_boards (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(newBoardId, `${board.name} (copy)`, sortOrder, ts, ts);

      const insertNode = db().prepare(
        'INSERT INTO brainstorm_nodes (id, board_id, type, position_x, position_y, width, height, data, style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const n of nodes) {
        insertNode.run(nodeIdMap.get(n.id), newBoardId, n.type, n.position_x, n.position_y, n.width, n.height, n.data, n.style, ts, ts);
      }

      const insertEdge = db().prepare(
        'INSERT INTO brainstorm_edges (id, board_id, source, target, source_handle, target_handle, type, label, data, style, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const e of edges) {
        const newSource = nodeIdMap.get(e.source);
        const newTarget = nodeIdMap.get(e.target);
        if (newSource && newTarget) {
          insertEdge.run(randomUUID(), newBoardId, newSource, newTarget, e.source_handle, e.target_handle, e.type, e.label, e.data, e.style, ts);
        }
      }
    })();

    sendJson(res, 201, { id: newBoardId, name: `${board.name} (copy)` });
  });

  // --- Nodes ---

  // Create node
  router.post('/api/brainstorm/boards/:boardId/nodes', async (req, res, params) => {
    const body = await readJsonBody<{ type?: string; position_x: number; position_y: number; width?: number; height?: number; data?: object }>(req);
    const id = randomUUID();
    const ts = now();
    db().prepare(
      'INSERT INTO brainstorm_nodes (id, board_id, type, position_x, position_y, width, height, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, params.boardId, body.type || 'custom', body.position_x ?? 0, body.position_y ?? 0, body.width ?? null, body.height ?? null, JSON.stringify(body.data || {}), ts, ts);
    sendJson(res, 201, { id });
  });

  // Batch update nodes (for drag-stop + paste) — MUST be before :id route
  router.put('/api/brainstorm/boards/:boardId/nodes/batch', async (req, res) => {
    const body = await readJsonBody<{ nodes: Array<Record<string, unknown>> }>(req);
    if (!body.nodes?.length) { sendJson(res, 400, { error: 'nodes array required' }); return; }
    const ts = now();
    db().transaction(() => {
      for (const node of body.nodes) {
        const fields: string[] = [];
        const values: unknown[] = [];
        for (const key of ['type', 'position_x', 'position_y', 'width', 'height']) {
          if (key in node) { fields.push(`${key} = ?`); values.push(node[key]); }
        }
        if ('data' in node) { fields.push('data = ?'); values.push(JSON.stringify(node.data)); }
        if ('style' in node) { fields.push('style = ?'); values.push(JSON.stringify(node.style)); }
        if (fields.length === 0) continue;
        fields.push('updated_at = ?');
        values.push(ts);
        values.push(node.id);
        db().prepare(`UPDATE brainstorm_nodes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }
    })();
    sendJson(res, 200, { success: true });
  });

  // Update node (partial)
  router.put('/api/brainstorm/boards/:boardId/nodes/:id', async (req, res, params) => {
    const body = await readJsonBody<Record<string, unknown>>(req);
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ['type', 'position_x', 'position_y', 'width', 'height']) {
      if (key in body) { fields.push(`${key} = ?`); values.push(body[key]); }
    }
    if ('data' in body) { fields.push('data = ?'); values.push(JSON.stringify(body.data)); }
    if ('style' in body) { fields.push('style = ?'); values.push(JSON.stringify(body.style)); }
    if (fields.length === 0) { sendJson(res, 400, { error: 'No fields to update' }); return; }
    fields.push('updated_at = ?');
    values.push(now());
    values.push(params.id);
    db().prepare(`UPDATE brainstorm_nodes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    sendJson(res, 200, { success: true });
  });

  // Delete node (CASCADE deletes connected edges)
  router.delete('/api/brainstorm/boards/:boardId/nodes/:id', (_req, res, params) => {
    db().prepare('DELETE FROM brainstorm_nodes WHERE id = ?').run(params.id);
    sendJson(res, 200, { success: true });
  });

  // --- Edges ---

  // Create edge
  router.post('/api/brainstorm/boards/:boardId/edges', async (req, res, params) => {
    const body = await readJsonBody<{ source: string; target: string; source_handle?: string; target_handle?: string; type?: string; label?: string }>(req);
    if (!body.source || !body.target) { sendJson(res, 400, { error: 'source and target required' }); return; }
    const id = randomUUID();
    db().prepare(
      'INSERT INTO brainstorm_edges (id, board_id, source, target, source_handle, target_handle, type, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, params.boardId, body.source, body.target, body.source_handle ?? null, body.target_handle ?? null, body.type ?? null, body.label ?? null, now());
    sendJson(res, 201, { id });
  });

  // Batch create edges (for paste) — MUST be before :id route
  router.post('/api/brainstorm/boards/:boardId/edges/batch', async (req, res, params) => {
    const body = await readJsonBody<{ edges: Array<{ source: string; target: string; source_handle?: string; target_handle?: string; type?: string; label?: string }> }>(req);
    if (!body.edges?.length) { sendJson(res, 400, { error: 'edges array required' }); return; }
    const ts = now();
    const ids: string[] = [];
    db().transaction(() => {
      const stmt = db().prepare(
        'INSERT INTO brainstorm_edges (id, board_id, source, target, source_handle, target_handle, type, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const e of body.edges) {
        const id = randomUUID();
        ids.push(id);
        stmt.run(id, params.boardId, e.source, e.target, e.source_handle ?? null, e.target_handle ?? null, e.type ?? null, e.label ?? null, ts);
      }
    })();
    sendJson(res, 200, { ids });
  });

  // Batch delete edges — MUST be before :id route
  router.delete('/api/brainstorm/boards/:boardId/edges/batch', async (req, res) => {
    const body = await readJsonBody<{ ids: string[] }>(req);
    if (!body.ids?.length) { sendJson(res, 400, { error: 'ids array required' }); return; }
    db().transaction(() => {
      const stmt = db().prepare('DELETE FROM brainstorm_edges WHERE id = ?');
      for (const id of body.ids) { stmt.run(id); }
    })();
    sendJson(res, 200, { success: true });
  });

  // Delete edge
  router.delete('/api/brainstorm/boards/:boardId/edges/:id', (_req, res, params) => {
    db().prepare('DELETE FROM brainstorm_edges WHERE id = ?').run(params.id);
    sendJson(res, 200, { success: true });
  });
}
