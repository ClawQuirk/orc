import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClawQuirkSettings, ShellInfo } from '../lib/settings';
import { LAUNCH_PRESETS } from '../lib/settings';
import { apiFetch } from '../lib/api-client';

interface Props {
  settings: ClawQuirkSettings;
  onChange: (settings: ClawQuirkSettings) => void;
  onClose: () => void;
  availableShells: ShellInfo[];
  anchorRect?: DOMRect;
  onOpenGoogleAuth: () => void;
  onOpenFinancialSetup: () => void;
  onOpenShoppingSetup: () => void;
}

interface BackupStatus {
  googleConnected: boolean;
  localSize: number;
  remote: {
    exists: boolean;
    modifiedTime?: string;
    size?: number;
  };
}

interface GoogleStatus {
  clientConfigured: boolean;
  authorized: boolean;
  scopes: string[];
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

export default function SettingsPanel({
  settings,
  onChange,
  onClose,
  availableShells,
  anchorRect,
  onOpenGoogleAuth,
  onOpenFinancialSetup,
  onOpenShoppingSetup,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isCustomCommand = !LAUNCH_PRESETS.some((p) => p.value === settings.autoLaunchCommand);
  const [customDraft, setCustomDraft] = useState(isCustomCommand ? settings.autoLaunchCommand : '');

  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchStatus = useCallback(() => {
    apiFetch('/api/auth/google/status')
      .then((r) => r.json())
      .then((data: GoogleStatus) => setGoogleStatus(data))
      .catch(() => {});
    apiFetch('/api/backup/status')
      .then((r) => r.json())
      .then((data: BackupStatus) => setBackup(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleBackup = async () => {
    setBackingUp(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/backup/create', { method: 'POST' });
      if (res.ok) {
        setMessage({ text: 'Database backed up to Google Drive.', type: 'success' });
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
      const res = await apiFetch('/api/backup/restore', { method: 'POST' });
      if (res.ok) {
        setMessage({ text: 'Database restored from Google Drive.', type: 'success' });
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

  const update = (partial: Partial<ClawQuirkSettings>) => {
    onChange({ ...settings, ...partial });
  };

  const googleConnected = googleStatus?.authorized ?? false;

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div
        className="settings-panel"
        ref={panelRef}
        style={anchorRect ? {
          position: 'fixed',
          left: anchorRect.right + 8,
          bottom: window.innerHeight - anchorRect.bottom,
        } : undefined}
      >
        <h3>Settings</h3>

        <div className="setting-row">
          <span className="setting-label">Shell</span>
          <select
            className="setting-select"
            value={settings.shell}
            onChange={(e) => update({ shell: e.target.value })}
          >
            <option value="">Default</option>
            {availableShells.map((s) => (
              <option key={s.id} value={s.command}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <label className="setting-label">
            Terminal Font Size
            <span className="setting-value">{settings.terminalFontSize}px</span>
          </label>
          <input
            type="range"
            min={10}
            max={20}
            value={settings.terminalFontSize}
            onChange={(e) =>
              update({ terminalFontSize: Number(e.target.value) })
            }
          />
        </div>

        <div className="setting-row">
          <span className="setting-label">Auto-launch Command</span>
          <select
            className="setting-select"
            value={isCustomCommand ? '__custom__' : settings.autoLaunchCommand}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setCustomDraft('');
                update({ autoLaunchCommand: ' ' });
              } else {
                update({ autoLaunchCommand: e.target.value });
              }
            }}
          >
            {LAUNCH_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value="__custom__">Custom...</option>
          </select>
          {isCustomCommand && (
            <input
              className="setting-input"
              type="text"
              placeholder="e.g. ollama run mistral (press Enter to apply)"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  update({ autoLaunchCommand: customDraft.trim() || ' ' });
                }
              }}
              onBlur={() => {
                if (customDraft.trim() && customDraft.trim() !== settings.autoLaunchCommand.trim()) {
                  update({ autoLaunchCommand: customDraft.trim() || ' ' });
                }
              }}
            />
          )}
        </div>

        <div className="setting-row">
          <span className="setting-label">Terminal Position</span>
          <div className="position-toggle">
            <button
              className={settings.terminalPosition === 'left' ? 'active' : ''}
              onClick={() => update({ terminalPosition: 'left' })}
            >
              Left
            </button>
            <button
              className={settings.terminalPosition === 'right' ? 'active' : ''}
              onClick={() => update({ terminalPosition: 'right' })}
            >
              Right
            </button>
          </div>
        </div>

        <div className="setting-divider" />

        <h4 className="setting-section-header">Connections</h4>
        <div className="setting-row setting-row-stacked">
          <button className="settings-connection-btn" onClick={onOpenGoogleAuth}>
            <span>Google</span>
            {googleConnected && <span className="sidebar-status-dot" />}
          </button>
          <button className="settings-connection-btn" onClick={onOpenFinancialSetup}>
            <span>Financial Services</span>
          </button>
          <button className="settings-connection-btn" onClick={onOpenShoppingSetup}>
            <span>Shopping Merchants</span>
          </button>
        </div>

        <div className="setting-divider" />

        <h4 className="setting-section-header">Database Backup</h4>
        <div className="setting-backup-desc">
          Back up your encrypted database to Google Drive. Only accessible with your vault key.
        </div>
        {backup && (
          <div className="setting-backup-grid">
            <div className="setting-backup-stat">
              <div className="setting-backup-stat-label">Local</div>
              <div className="setting-backup-stat-value">{formatBytes(backup.localSize)}</div>
            </div>
            <div className="setting-backup-stat">
              <div className="setting-backup-stat-label">Drive backup</div>
              <div className="setting-backup-stat-value">
                {backup.remote.exists ? (
                  <>
                    {formatBytes(backup.remote.size ?? 0)}
                    {backup.remote.modifiedTime && (
                      <span className="setting-backup-stat-sub"> — {formatRelativeTime(backup.remote.modifiedTime)}</span>
                    )}
                  </>
                ) : (
                  <span className="setting-backup-stat-none">None</span>
                )}
              </div>
            </div>
          </div>
        )}
        {message && (
          <div className={`setting-backup-message setting-backup-message-${message.type}`}>
            {message.text}
          </div>
        )}
        <div className="setting-backup-actions">
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
        </div>

        <div className="setting-row shortcut-hint">
          <kbd>Ctrl</kbd> + <kbd>`</kbd> toggles terminal
        </div>
      </div>
    </>
  );
}
