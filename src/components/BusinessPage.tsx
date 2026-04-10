import { useCallback, useEffect, useState } from 'react';
import { workspaceApi } from '../lib/workspace-api';
import { useWorkspace } from '../lib/workspace-context';
import type { WorkspaceWithCounts } from '../../shared/workspace-types';

interface Props {
  workspaceId: string;
  onNavigatePage: (pageId: string) => void;
  onDeleted: () => void;
}

export default function BusinessPage({ workspaceId, onNavigatePage, onDeleted }: Props) {
  const { refreshWorkspaces } = useWorkspace();
  const [workspace, setWorkspace] = useState<WorkspaceWithCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    workspaceApi
      .get(workspaceId)
      .then((data) => {
        setWorkspace(data);
        setName(data.name);
        setDescription(data.description ?? '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!workspace) return;
    setSaving(true);
    setError(null);
    try {
      await workspaceApi.update(workspace.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      await refreshWorkspaces();
      load();
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!workspace) return;
    if (!confirm(`Archive "${workspace.name}"? Its projects, journal entries, and brainstorm boards will be hidden but not deleted.`)) {
      return;
    }
    try {
      await workspaceApi.remove(workspace.id);
      await refreshWorkspaces();
      onDeleted();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading || !workspace) {
    return (
      <div className="page-content">
        <div className="page-loading">Loading business...</div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="business-detail-header">
        {editing ? (
          <div className="business-edit-header">
            <input
              className="business-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Business name"
            />
            <textarea
              className="business-description-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
            />
            <div className="business-edit-actions">
              <button className="btn-primary btn-sm" onClick={save} disabled={saving || !name.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  setEditing(false);
                  setName(workspace.name);
                  setDescription(workspace.description ?? '');
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
            {error && <div className="business-error">{error}</div>}
          </div>
        ) : (
          <div className="business-header-display">
            <h2 onClick={() => setEditing(true)} title="Click to edit">{workspace.name}</h2>
            {workspace.description && <p className="business-description">{workspace.description}</p>}
          </div>
        )}
      </div>

      <div className="business-stats-grid">
        <StatCard label="Projects" count={workspace.counts.projects} onClick={() => onNavigatePage('projects')} />
        <StatCard label="Journal entries" count={workspace.counts.journal} onClick={() => onNavigatePage('memory')} />
        <StatCard label="Brainstorm boards" count={workspace.counts.boards} onClick={() => onNavigatePage('brainstorm')} />
      </div>

      <div className="business-quick-actions">
        <button className="btn-primary btn-sm" onClick={() => onNavigatePage('projects')}>Go to Projects</button>
        <button className="btn-ghost btn-sm" onClick={() => onNavigatePage('memory')}>Open Memory</button>
        <button className="btn-ghost btn-sm" onClick={() => onNavigatePage('brainstorm')}>Open Brainstorm</button>
      </div>

      <div className="business-danger-zone">
        <div className="business-danger-title">Danger Zone</div>
        <button className="btn-danger btn-sm" onClick={archive}>Archive Business</button>
      </div>
    </div>
  );
}

function StatCard({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <div className="business-stat-card" onClick={onClick}>
      <div className="business-stat-count">{count}</div>
      <div className="business-stat-label">{label}</div>
    </div>
  );
}
