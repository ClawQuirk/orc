import { useState } from 'react';
import { workspaceApi } from '../lib/workspace-api';
import { useWorkspace } from '../lib/workspace-context';

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export default function BusinessCreateModal({ onClose, onCreated }: Props) {
  const { refreshWorkspaces } = useWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const ws = await workspaceApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      await refreshWorkspaces();
      onCreated(ws.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create business');
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Business</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <label className="modal-field">
              <span className="modal-field-label">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Co"
                autoFocus
                required
              />
            </label>
            <label className="modal-field">
              <span className="modal-field-label">Description (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short description of this business"
                rows={3}
              />
            </label>
            {error && <div className="modal-error">{error}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-ghost btn-sm" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={saving || !name.trim()}>
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
