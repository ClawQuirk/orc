import type { IncomingMessage } from 'node:http';
import { getDatabase } from '../db/index.js';

const HOME_ID = 'home';

let cachedIds: Set<string> | null = null;

function loadCache(): Set<string> {
  try {
    const rows = getDatabase()
      .prepare(`SELECT id FROM workspaces WHERE status = 'active'`)
      .all() as Array<{ id: string }>;
    cachedIds = new Set(rows.map((r) => r.id));
  } catch {
    // Workspaces table may not exist yet (DB not initialized, migration partial,
    // or vault locked). Fall back to a single-entry cache containing 'home'.
    cachedIds = new Set(['home']);
  }
  return cachedIds;
}

export function invalidateWorkspaceCache(): void {
  cachedIds = null;
}

export function workspaceExists(id: string): boolean {
  const ids = cachedIds ?? loadCache();
  return ids.has(id);
}

/**
 * Resolve the active workspace ID for an incoming request.
 * Reads the X-Workspace-Id header; falls back to 'home' if missing or invalid.
 * Safe to call on unscoped routes — it simply returns 'home' by default.
 */
export function getWorkspaceId(req: IncomingMessage): string {
  const raw = req.headers['x-workspace-id'];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id === 'string' && id.length > 0 && workspaceExists(id)) {
    return id;
  }
  return HOME_ID;
}
