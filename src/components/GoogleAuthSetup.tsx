import { useState, useEffect, useCallback } from 'react';

interface GoogleAuthStatus {
  clientConfigured: boolean;
  authorized: boolean;
  scopes: string[];
}

interface PluginApproval {
  id: string;
  name: string;
  toolPrefix: string;
  connection?: string;
  toolCount: number;
  autoApprove: boolean;
}

interface GoogleAuthSetupProps {
  onClose: () => void;
}

export default function GoogleAuthSetup({ onClose }: GoogleAuthSetupProps) {
  const [status, setStatus] = useState<GoogleAuthStatus | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [approvals, setApprovals] = useState<PluginApproval[]>([]);
  const [backupStatus, setBackupStatus] = useState<{ hasBackup: boolean } | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  const fetchStatus = useCallback(() => {
    fetch('/api/auth/google/status')
      .then((r) => r.json())
      .then((data: GoogleAuthStatus) => setStatus(data))
      .catch(() => setError('Failed to load auth status'));
  }, []);

  const fetchApprovals = useCallback(() => {
    fetch('/api/settings/auto-approve')
      .then((r) => r.json())
      .then((data: { plugins: PluginApproval[] }) => {
        setApprovals(data.plugins.filter((p) => p.connection === 'google'));
      })
      .catch(() => { /* non-critical */ });
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Fetch auto-approve state and backup status when connected
  useEffect(() => {
    if (status?.authorized) {
      fetchApprovals();
      fetch('/api/recovery/status')
        .then((r) => r.json())
        .then((data) => setBackupStatus({ hasBackup: data.hasBackup }))
        .catch(() => {});
    }
  }, [status?.authorized, fetchApprovals]);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get('auth');
    if (auth === 'success') {
      setSuccess('Google account connected successfully!');
      fetchStatus();
      // Clean URL
      window.history.replaceState({}, '', '/');
    } else if (auth === 'error') {
      setError(params.get('message') || 'OAuth failed');
      window.history.replaceState({}, '', '/');
    }
  }, [fetchStatus]);

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/google/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      if (res.ok) {
        setSuccess('Client credentials saved');
        setClientId('');
        setClientSecret('');
        fetchStatus();
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorize = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/google/init', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to start OAuth');
        setLoading(false);
      }
    } catch {
      setError('Connection error');
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    setError('');
    setLoading(true);
    try {
      await fetch('/api/auth/google/revoke', { method: 'POST' });
      setSuccess('Google account disconnected');
      fetchStatus();
    } catch {
      setError('Failed to revoke');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleApproval = async (toolPrefix: string, enabled: boolean) => {
    // Optimistic update
    setApprovals((prev) =>
      prev.map((p) => (p.toolPrefix === toolPrefix ? { ...p, autoApprove: enabled } : p))
    );
    try {
      await fetch('/api/settings/auto-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolPrefix, enabled }),
      });
    } catch {
      fetchApprovals(); // revert on error
    }
  };

  const handleToggleAll = async (enabled: boolean) => {
    // Optimistic update
    setApprovals((prev) => prev.map((p) => ({ ...p, autoApprove: enabled })));
    try {
      await fetch('/api/settings/auto-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: 'google', enabled }),
      });
    } catch {
      fetchApprovals(); // revert on error
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  if (!status) return null;

  return (
    <div className="settings-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="google-auth-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Google Account</h3>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        {/* Step 1: Client credentials */}
        {!status.clientConfigured ? (
          <div className="auth-section">
            <p className="auth-hint">Follow these steps in the Google Cloud Console:</p>
            <ol className="auth-steps">
              <li>
                <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer">
                  Create a new project
                </a>{' '}
                (or select an existing one)
              </li>
              <li>
                Set up the{' '}
                <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer">
                  OAuth consent screen
                </a>
                :
                <ul className="auth-substeps">
                  <li>Select <strong>External</strong> user type</li>
                  <li>Fill in app name and your email</li>
                  <li>Skip the "Scopes" page (Orc requests these automatically)</li>
                  <li>On the <strong>Test users</strong> page, add your Google email — <em>your app starts in "Testing" mode, and only listed test users can sign in</em></li>
                </ul>
              </li>
              <li>
                Enable these APIs:{' '}
                <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer">
                  Gmail
                </a>
                ,{' '}
                <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener noreferrer">
                  Calendar
                </a>
                ,{' '}
                <a href="https://console.cloud.google.com/apis/library/people.googleapis.com" target="_blank" rel="noopener noreferrer">
                  People
                </a>
                ,{' '}
                <a href="https://console.cloud.google.com/apis/library/docs.googleapis.com" target="_blank" rel="noopener noreferrer">
                  Docs
                </a>
                ,{' '}
                <a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noopener noreferrer">
                  Sheets
                </a>
                ,{' '}
                <a href="https://console.cloud.google.com/apis/library/slides.googleapis.com" target="_blank" rel="noopener noreferrer">
                  Slides
                </a>
              </li>
              <li>
                Go to{' '}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">
                  Credentials
                </a>{' '}
                → Create Credentials → OAuth client ID → <strong>Web application</strong>
              </li>
              <li>
                There are two URI fields — add <strong>both</strong>:
                <div className="auth-uri-group">
                  <label>Authorized JavaScript origins:</label>
                  <code className="auth-redirect-uri">
                    {window.location.origin}
                  </code>
                  <label>Authorized redirect URIs:</label>
                  <code className="auth-redirect-uri">
                    {window.location.origin}/api/auth/google/callback
                  </code>
                </div>
              </li>
              <li>
                Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> into the form below
              </li>
            </ol>
            <form onSubmit={handleSaveClient}>
              <input
                type="text"
                placeholder="Client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={loading}
              />
              <input
                type="password"
                placeholder="Client Secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                disabled={loading}
              />
              <button type="submit" disabled={loading || !clientId.trim() || !clientSecret.trim()}>
                Save Credentials
              </button>
            </form>
          </div>
        ) : !status.authorized ? (
          /* Step 2: Authorize */
          <div className="auth-section">
            <p className="auth-hint">
              Client credentials saved. Click below to authorize Orc to access your Google account.
            </p>
            <button onClick={handleAuthorize} disabled={loading}>
              {loading ? 'Redirecting...' : 'Connect Google Account'}
            </button>
          </div>
        ) : (
          /* Step 3: Connected */
          <div className="auth-section">
            <div className="auth-connected">
              <span className="auth-status-dot connected" />
              Connected
            </div>
            <p className="auth-hint">
              Scopes: {status.scopes.map((s) => s.split('/').pop()).join(', ')}
            </p>

            {approvals.length > 0 && (
              <div className="auto-approve-section">
                <div className="auto-approve-header">
                  <span className="auto-approve-title">Auto-approve tool use</span>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={approvals.every((p) => p.autoApprove)}
                      onChange={(e) => handleToggleAll(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="auto-approve-plugins">
                  {approvals.map((p) => (
                    <div key={p.id} className="auto-approve-row">
                      <span className="auto-approve-plugin-name">
                        {p.name}
                        <span className="auto-approve-tool-count">{p.toolCount} tools</span>
                      </span>
                      <label className="toggle-switch toggle-switch-sm">
                        <input
                          type="checkbox"
                          checked={p.autoApprove}
                          onChange={(e) => handleToggleApproval(p.toolPrefix, e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {backupStatus && (
              <div className="auth-backup-status">
                <span className={`auth-backup-dot ${backupStatus.hasBackup ? 'backed-up' : 'not-backed-up'}`} />
                <span className="auth-backup-text">
                  {backupStatus.hasBackup
                    ? 'Recovery key backed up to Google Drive'
                    : 'Recovery key not backed up'}
                </span>
                {!backupStatus.hasBackup && (
                  <button
                    className="btn-ghost btn-xs"
                    disabled={backingUp}
                    onClick={async () => {
                      setBackingUp(true);
                      try {
                        await fetch('/api/recovery/backup', { method: 'POST' });
                        setBackupStatus({ hasBackup: true });
                      } catch { /* ignore */ }
                      setBackingUp(false);
                    }}
                  >
                    {backingUp ? 'Backing up...' : 'Back up now'}
                  </button>
                )}
              </div>
            )}

            <button className="auth-revoke-btn" onClick={handleRevoke} disabled={loading}>
              Disconnect
            </button>
          </div>
        )}

        <button className="auth-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
