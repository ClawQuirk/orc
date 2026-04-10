import { HOME_WORKSPACE_ID } from '../../shared/workspace-types';

let activeWorkspaceId: string = HOME_WORKSPACE_ID;

// Try restoring from localStorage synchronously so the first fetch after page
// load uses the correct workspace even before WorkspaceProvider mounts.
try {
  const stored = localStorage.getItem('orc-active-workspace');
  if (stored) activeWorkspaceId = stored;
} catch {
  /* localStorage unavailable */
}

/** Called by WorkspaceProvider whenever the active workspace changes. */
export function setActiveWorkspaceIdForApi(id: string): void {
  activeWorkspaceId = id;
}

export function getActiveWorkspaceIdForApi(): string {
  return activeWorkspaceId;
}

/**
 * fetch wrapper that automatically attaches the X-Workspace-Id header.
 * Use this instead of raw fetch() for any /api/ call so workspace scoping
 * propagates consistently.
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Workspace-Id', activeWorkspaceId);
  return fetch(path, { ...init, headers });
}

/** apiFetch + .json() convenience. */
export async function apiJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  return res.json();
}
