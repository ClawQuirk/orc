import { apiFetch } from './api-client';
import type {
  Workspace,
  WorkspaceWithCounts,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
} from '../../shared/workspace-types';

export const workspaceApi = {
  async list(): Promise<Workspace[]> {
    const res = await apiFetch('/api/workspaces');
    if (!res.ok) throw new Error('Failed to load workspaces');
    const data = (await res.json()) as { workspaces: Workspace[] };
    return data.workspaces;
  },

  async get(id: string): Promise<WorkspaceWithCounts> {
    const res = await apiFetch(`/api/workspaces/${id}`);
    if (!res.ok) throw new Error('Workspace not found');
    return res.json();
  },

  async create(input: WorkspaceCreateInput): Promise<Workspace> {
    const res = await apiFetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as any).error || 'Failed to create workspace');
    }
    return res.json();
  },

  async update(id: string, patch: WorkspaceUpdateInput): Promise<void> {
    const res = await apiFetch(`/api/workspaces/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as any).error || 'Failed to update workspace');
    }
  },

  async remove(id: string): Promise<void> {
    const res = await apiFetch(`/api/workspaces/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as any).error || 'Failed to delete workspace');
    }
  },
};
