import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useWorkspace } from '../lib/workspace-context';
import type { Workspace } from '../../shared/workspace-types';
import { workspaceApi } from '../lib/workspace-api';

export type PageId =
  | 'dashboard'
  | 'projects'
  | 'planning'
  | 'actions'
  | 'shopping'
  | 'people'
  | 'docs'
  | 'memory'
  | 'brainstorm'
  | 'knowledge'
  | 'agents'
  | 'business';

interface SidebarProps {
  onToggleTheme: () => void;
  onOpenFolder: () => void;
  onLockVault: () => void;
  onToggleSettings: (anchorRect: DOMRect | null) => void;
  onNewBusiness: () => void;
  theme: 'dark' | 'light';
  activeWorkspaceId: string;
  activePage: PageId;
  onNavigate: (workspaceId: string, page: PageId) => void;
}

interface PageItem {
  id: PageId;
  label: string;
  icon: ReactNode;
}

const BASE_PAGES: PageItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: 'planning',
    label: 'Planning',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: 'actions',
    label: 'Actions',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    id: 'people',
    label: 'People',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'docs',
    label: 'Docs',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
        <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
        <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
      </svg>
    ),
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="3" /><circle cx="5" cy="19" r="3" /><circle cx="19" cy="19" r="3" />
        <line x1="12" y1="8" x2="5" y2="16" /><line x1="12" y1="8" x2="19" y2="16" />
      </svg>
    ),
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="3" />
        <line x1="12" y1="8" x2="12" y2="11" />
        <line x1="8" y1="16" x2="8" y2="16.01" /><line x1="16" y1="16" x2="16" y2="16.01" />
      </svg>
    ),
  },
];

const SHOPPING_PAGE: PageItem = {
  id: 'shopping',
  label: 'Shopping',
  icon: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
};

const HOME_PAGES: PageItem[] = [...BASE_PAGES, SHOPPING_PAGE];
const BUSINESS_PAGES: PageItem[] = BASE_PAGES;

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function Sidebar({
  onToggleTheme,
  onOpenFolder,
  onLockVault,
  onToggleSettings,
  onNewBusiness,
  theme,
  activeWorkspaceId,
  activePage,
  onNavigate,
}: SidebarProps) {
  const { workspaces, refreshWorkspaces } = useWorkspace();
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  const homeWorkspace = useMemo(() => workspaces.find((w) => w.type === 'home'), [workspaces]);
  const businessWorkspaces = useMemo(() => workspaces.filter((w) => w.type === 'business'), [workspaces]);

  const [homeExpanded, setHomeExpanded] = useState<boolean>(true);
  const [expandedBusinessId, setExpandedBusinessId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    workspace: Workspace;
    x: number;
    y: number;
  } | null>(null);

  // Auto-expand the section containing the active workspace
  useEffect(() => {
    if (activeWorkspaceId === 'home') {
      setHomeExpanded(true);
    } else {
      setExpandedBusinessId(activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  // Dismiss context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleSettingsClick = () => {
    const rect = settingsBtnRef.current?.getBoundingClientRect() ?? null;
    onToggleSettings(rect);
  };

  const handleRenameBusiness = async (workspace: Workspace) => {
    const name = prompt(`Rename "${workspace.name}":`, workspace.name);
    if (!name || !name.trim() || name.trim() === workspace.name) return;
    try {
      await workspaceApi.update(workspace.id, { name: name.trim() });
      await refreshWorkspaces();
    } catch (err: any) {
      alert(err.message || 'Failed to rename');
    }
  };

  const handleDeleteBusiness = async (workspace: Workspace) => {
    if (!confirm(`Archive "${workspace.name}"? Its data will be hidden but not deleted.`)) return;
    try {
      await workspaceApi.remove(workspace.id);
      await refreshWorkspaces();
      // If user was viewing this workspace, reset to home
      if (activeWorkspaceId === workspace.id) {
        onNavigate('home', 'dashboard');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to archive');
    }
  };

  return (
    <div className="sidebar">
      {/* Home section */}
      <div className="sidebar-section">
        <button
          className="sidebar-group-header"
          onClick={() => setHomeExpanded((v) => !v)}
          title="Toggle Home pages"
        >
          <ChevronIcon open={homeExpanded} />
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span className="sidebar-group-label">Home</span>
        </button>
        {homeExpanded && (
          <div className="sidebar-group-children">
            {HOME_PAGES.map((page) => (
              <button
                key={page.id}
                className={`sidebar-item sidebar-child ${activeWorkspaceId === 'home' && activePage === page.id ? 'active' : ''}`}
                onClick={() => onNavigate('home', page.id)}
              >
                {page.icon}
                <span>{page.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Businesses section */}
      <div className="sidebar-section">
        <div className="sidebar-group-header-row">
          <button
            className="sidebar-group-header"
            onClick={() => {
              // Click on Businesses label doesn't navigate, just a label for the section.
              // Keep business rows manageable on their own.
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <span className="sidebar-group-label">Businesses</span>
          </button>
          <button
            className="sidebar-add-btn"
            onClick={(e) => {
              e.stopPropagation();
              onNewBusiness();
            }}
            title="New business"
            aria-label="New business"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {businessWorkspaces.length === 0 && (
          <div className="sidebar-empty-hint">No businesses yet. Click + to add one.</div>
        )}

        {businessWorkspaces.map((ws) => {
          const expanded = expandedBusinessId === ws.id;
          const isActive = activeWorkspaceId === ws.id;
          return (
            <div key={ws.id} className="sidebar-business">
              <div
                className={`sidebar-item sidebar-business-row ${isActive && activePage === 'business' ? 'active' : ''}`}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ workspace: ws, x: e.clientX, y: e.clientY });
                }}
              >
                <button
                  className="sidebar-business-chevron"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedBusinessId(expanded ? null : ws.id);
                  }}
                  title={expanded ? 'Collapse' : 'Expand'}
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                >
                  <ChevronIcon open={expanded} />
                </button>
                <button
                  className="sidebar-business-name"
                  onClick={() => onNavigate(ws.id, 'business')}
                  title={ws.name}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                  <span>{ws.name}</span>
                </button>
              </div>
              {expanded && (
                <div className="sidebar-group-children sidebar-business-children">
                  {BUSINESS_PAGES.map((page) => (
                    <button
                      key={page.id}
                      className={`sidebar-item sidebar-child ${isActive && activePage === page.id ? 'active' : ''}`}
                      onClick={() => onNavigate(ws.id, page.id)}
                    >
                      {page.icon}
                      <span>{page.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sidebar-spacer" />

      <div className="sidebar-section sidebar-actions">
        <button className="sidebar-item" onClick={onOpenFolder} title="Open project folder">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span>Project</span>
        </button>
        <button className="sidebar-item" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
          <span>Theme</span>
        </button>
        <button ref={settingsBtnRef} className="sidebar-item" onClick={handleSettingsClick} title="Settings">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </button>
        <button className="sidebar-item sidebar-lock" onClick={onLockVault} title="Lock vault">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Lock</span>
        </button>
      </div>

      {contextMenu && (
        <div
          className="sidebar-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="sidebar-context-item"
            onClick={() => {
              handleRenameBusiness(contextMenu.workspace);
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            className="sidebar-context-item sidebar-context-danger"
            onClick={() => {
              handleDeleteBusiness(contextMenu.workspace);
              setContextMenu(null);
            }}
          >
            Archive
          </button>
        </div>
      )}
    </div>
  );
}
