import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { workspaceApi } from './workspace-api';
import { setActiveWorkspaceIdForApi } from './api-client';
import { HOME_WORKSPACE_ID } from '../../shared/workspace-types';
import type { Workspace } from '../../shared/workspace-types';

interface WorkspaceContextValue {
  activeWorkspace: Workspace | null;
  activeWorkspaceId: string;
  workspaces: Workspace[];
  loading: boolean;
  setActiveWorkspace: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const STORAGE_KEY = 'orc-active-workspace';

function readStoredId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || HOME_WORKSPACE_ID;
  } catch {
    return HOME_WORKSPACE_ID;
  }
}

function writeStoredId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

interface ProviderProps {
  children: ReactNode;
  enabled: boolean; // false while vault is locked — don't fetch yet
}

export function WorkspaceProvider({ children, enabled }: ProviderProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(() => readStoredId());
  const [loading, setLoading] = useState<boolean>(true);

  const refreshWorkspaces = useCallback(async () => {
    if (!enabled) return;
    try {
      const list = await workspaceApi.list();
      setWorkspaces(list);
      // Validate stored ID against fetched list; fall back to home if missing
      setActiveWorkspaceIdState((current) => {
        const exists = list.some((w) => w.id === current);
        const next = exists ? current : HOME_WORKSPACE_ID;
        writeStoredId(next);
        setActiveWorkspaceIdForApi(next);
        return next;
      });
    } catch (err) {
      console.error('[workspace] Failed to load workspaces', err);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      return;
    }
    void refreshWorkspaces();
  }, [enabled, refreshWorkspaces]);

  const setActiveWorkspace = useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    writeStoredId(id);
    setActiveWorkspaceIdForApi(id);
  }, []);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  );

  const value: WorkspaceContextValue = {
    activeWorkspace,
    activeWorkspaceId,
    workspaces,
    loading,
    setActiveWorkspace,
    refreshWorkspaces,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}

export function useWorkspaceId(): string {
  return useWorkspace().activeWorkspaceId;
}
