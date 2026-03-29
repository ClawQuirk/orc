import { useState, useEffect, useCallback } from 'react';

interface BackupStatus {
  googleConnected: boolean;
  localSize: number;
  remote: {
    exists: boolean;
    modifiedTime?: string;
    size?: number;
  };
}

interface PluginInfo {
  id: string;
  name: string;
  toolPrefix?: string;
  connection?: string;
  tools: string[];
}

export default function SystemPage() {
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchStatus = useCallback(() => {
    fetch('/api/backup/status')
      .then((r) => r.json())
      .then((data: BackupStatus) => setBackup(data))
      .catch(() => {});
    fetch('/api/plugins')
      .then((r) => r.json())
      .then((data: { plugins: PluginInfo[] }) => setPlugins(data.plugins))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleBackup = async () => {
    setBackingUp(true);
    setMessage(null);
    try {
      const res = await fetch('/api/backup/create', { method: 'POST' });
      if (res.ok) {
        setMessage({ text: 'Database backed up to Google Drive successfully.', type: 'success' });
        fetchStatus();
      } else {
        const data = await res.json();
        setMessage({ text: data.error || 'Backup failed', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Connection error', type: 'error' });
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!confirm('This will replace your local database with the Google Drive backup. Are you sure?')) return;
    setRestoring(true);
    setMessage(null);
    try {
      const res = await fetch('/api/backup/restore', { method: 'POST' });
      if (res.ok) {
        setMessage({ text: 'Database restored from Google Drive successfully.', type: 'success' });
        fetchStatus();
      } else {
        const data = await res.json();
        setMessage({ text: data.error || 'Restore failed', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Connection error', type: 'error' });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="page-content">
      <h2>System</h2>
      <p className="page-description">Server status, database backup, and plugin overview.</p>

      {/* Database Backup Section */}
      <div className="system-section">
        <h3 className="system-section-title">Database Backup</h3>
        <p className="system-section-desc">
          Back up your encrypted database to Google Drive. The file is already encrypted with SQLCipher — only accessible with your vault key.
        </p>

        {backup && (
          <div className="system-backup-grid">
            <div className="system-stat">
              <div className="system-stat-label">Local database</div>
              <div className="system-stat-value">{formatBytes(backup.localSize)}</div>
            </div>
            <div className="system-stat">
              <div className="system-stat-label">Google Drive backup</div>
              <div className="system-stat-value">
                {backup.remote.exists ? (
                  <>
                    {formatBytes(backup.remote.size ?? 0)}
                    <span className="system-stat-sub">
                      {backup.remote.modifiedTime && ` — ${formatRelativeTime(backup.remote.modifiedTime)}`}
                    </span>
                  </>
                ) : (
                  <span className="system-stat-none">No backup yet</span>
                )}
              </div>
            </div>
          </div>
        )}

        {message && (
          <div className={`system-message system-message-${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="system-backup-actions">
          <button
            className="btn-primary btn-sm"
            onClick={handleBackup}
            disabled={backingUp || restoring || !backup?.googleConnected}
            title={!backup?.googleConnected ? 'Connect Google first' : undefined}
          >
            {backingUp ? 'Backing up...' : 'Back up now'}
          </button>
          {backup?.remote.exists && (
            <button
              className="btn-ghost btn-sm"
              onClick={handleRestore}
              disabled={backingUp || restoring}
            >
              {restoring ? 'Restoring...' : 'Restore from backup'}
            </button>
          )}
          {!backup?.googleConnected && (
            <span className="system-hint">Connect Google services to enable backups.</span>
          )}
        </div>
      </div>

      {/* Plugins Section */}
      <div className="system-section">
        <h3 className="system-section-title">Plugins</h3>
        <p className="system-section-desc">Registered plugins and their MCP tools.</p>

        <div className="system-plugin-list">
          {plugins.map((p) => (
            <div key={p.id} className="system-plugin-card">
              <div className="system-plugin-header">
                <span className="system-plugin-name">{p.name}</span>
                <span className="system-plugin-connection">{p.connection ?? 'local'}</span>
              </div>
              <div className="system-plugin-tools">
                {p.tools.map((t) => (
                  <span key={t} className="system-tool-badge">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
