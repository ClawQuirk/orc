export type WorkspaceType = 'home' | 'business';
export type WorkspaceStatus = 'active' | 'archived';

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  status: WorkspaceStatus;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceCounts {
  projects: number;
  journal: number;
  boards: number;
}

export interface WorkspaceWithCounts extends Workspace {
  counts: WorkspaceCounts;
}

export interface WorkspaceCreateInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface WorkspaceUpdateInput {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  sort_order?: number;
}

export const HOME_WORKSPACE_ID = 'home';
