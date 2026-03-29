import { useState } from 'react';

interface VaultUnlockProps {
  vaultExists: boolean;
  onUnlocked: () => void;
}

type RecoveryStep = 'confirm' | 'new-password' | 'google-client' | 'google-auth' | 'restoring' | 'done' | 'failed';

export default function VaultUnlock({ vaultExists, onUnlocked }: VaultUnlockProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('confirm');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [recoveryError, setRecoveryError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!vaultExists && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    setLoading(true);
    try {
      const endpoint = vaultExists ? '/api/vault/unlock' : '/api/vault/create';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onUnlocked();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to unlock vault');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  // --- Recovery flow ---
  const startRecovery = () => {
    setRecovering(true);
    setRecoveryStep('confirm');
    setRecoveryError('');
  };

  const cancelRecovery = () => {
    setRecovering(false);
    setRecoveryStep('confirm');
    setRecoveryError('');
    setPassword('');
    setConfirmPassword('');
    setClientId('');
    setClientSecret('');
  };

  const handleResetVault = async () => {
    setRecoveryError('');
    try {
      await fetch('/api/vault/reset', { method: 'DELETE' });
      setRecoveryStep('new-password');
    } catch {
      setRecoveryError('Failed to reset vault');
    }
  };

  const handleCreateNewVault = async () => {
    if (password.length < 4) { setRecoveryError('Password must be at least 4 characters'); return; }
    if (password !== confirmPassword) { setRecoveryError('Passwords do not match'); return; }
    setRecoveryError('');
    try {
      const res = await fetch('/api/vault/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setRecoveryStep('google-client');
      } else {
        const data = await res.json();
        setRecoveryError(data.error);
      }
    } catch {
      setRecoveryError('Connection error');
    }
  };

  const handleSaveClient = async () => {
    if (!clientId.trim() || !clientSecret.trim()) { setRecoveryError('Both fields required'); return; }
    setRecoveryError('');
    try {
      const res = await fetch('/api/auth/google/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      if (res.ok) {
        setRecoveryStep('google-auth');
      } else {
        const data = await res.json();
        setRecoveryError(data.error);
      }
    } catch {
      setRecoveryError('Connection error');
    }
  };

  const handleStartAuth = async () => {
    setRecoveryError('');
    try {
      const res = await fetch('/api/auth/google/init', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.url) {
        // Before redirecting, set up a listener for when we return
        localStorage.setItem('orc-recovery-in-progress', 'true');
        window.location.href = data.url;
      } else {
        setRecoveryError(data.error || 'Failed to start OAuth');
      }
    } catch {
      setRecoveryError('Connection error');
    }
  };

  const handleRestore = async () => {
    setRecoveryStep('restoring');
    setRecoveryError('');
    try {
      const res = await fetch('/api/recovery/restore', { method: 'POST' });
      if (res.ok) {
        localStorage.removeItem('orc-recovery-in-progress');
        setRecoveryStep('done');
      } else {
        const data = await res.json();
        setRecoveryStep('failed');
        setRecoveryError(data.error || 'Recovery failed');
      }
    } catch {
      setRecoveryStep('failed');
      setRecoveryError('Connection error');
    }
  };

  // Check if returning from OAuth redirect during recovery
  const params = new URLSearchParams(window.location.search);
  const authResult = params.get('auth');
  const isReturningFromOAuth = localStorage.getItem('orc-recovery-in-progress') === 'true';

  if (isReturningFromOAuth && authResult === 'success' && !recovering) {
    // Resume recovery flow — vault was re-created before redirect
    setRecovering(true);
    setRecoveryStep('google-auth');
    window.history.replaceState({}, '', '/');
    // Auto-trigger restore
    setTimeout(() => handleRestore(), 100);
  } else if (isReturningFromOAuth && authResult === 'error') {
    localStorage.removeItem('orc-recovery-in-progress');
    window.history.replaceState({}, '', '/');
  }

  // --- Recovery UI ---
  if (recovering) {
    return (
      <div className="vault-unlock-overlay">
        <div className="vault-unlock-form recovery-wizard">
          <div className="vault-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6" /><path d="M21.34 15.57a10 10 0 1 1-.57-8.38" />
            </svg>
          </div>
          <h2>Recover Vault</h2>

          {recoveryStep === 'confirm' && (
            <>
              <p className="vault-description">
                This will delete your current vault and create a new one. Your database encryption key
                can be recovered from Google Drive if it was previously backed up.
              </p>
              <p className="vault-description" style={{ color: '#e74c3c', fontSize: '0.75rem' }}>
                You will need your Google Cloud OAuth client ID and secret (from the Google Cloud Console)
                to re-authorize and restore the key.
              </p>
              {recoveryError && <div className="vault-error">{recoveryError}</div>}
              <button onClick={handleResetVault}>I understand, start recovery</button>
              <button className="vault-cancel-btn" onClick={cancelRecovery}>Cancel</button>
            </>
          )}

          {recoveryStep === 'new-password' && (
            <>
              <p className="vault-description">Create a new master password for your vault.</p>
              <input type="password" placeholder="New master password" value={password}
                onChange={(e) => setPassword(e.target.value)} autoFocus />
              <input type="password" placeholder="Confirm password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} />
              {recoveryError && <div className="vault-error">{recoveryError}</div>}
              <button onClick={handleCreateNewVault} disabled={!password || !confirmPassword}>
                Create New Vault
              </button>
            </>
          )}

          {recoveryStep === 'google-client' && (
            <>
              <p className="vault-description">
                Enter your Google OAuth credentials from the{' '}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">
                  Google Cloud Console
                </a>.
              </p>
              <input type="text" placeholder="Client ID" value={clientId}
                onChange={(e) => setClientId(e.target.value)} autoFocus />
              <input type="password" placeholder="Client Secret" value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)} />
              {recoveryError && <div className="vault-error">{recoveryError}</div>}
              <button onClick={handleSaveClient} disabled={!clientId.trim() || !clientSecret.trim()}>
                Save & Continue
              </button>
            </>
          )}

          {recoveryStep === 'google-auth' && (
            <>
              <p className="vault-description">
                Authorize Orc with Google to retrieve your database encryption key from Drive.
              </p>
              {recoveryError && <div className="vault-error">{recoveryError}</div>}
              <button onClick={handleStartAuth}>Connect Google Account</button>
            </>
          )}

          {recoveryStep === 'restoring' && (
            <p className="vault-description">Restoring database encryption key from Google Drive...</p>
          )}

          {recoveryStep === 'done' && (
            <>
              <p className="vault-description" style={{ color: '#27ae60' }}>
                Recovery successful! Your database has been restored.
              </p>
              <button onClick={onUnlocked}>Continue to Orc</button>
            </>
          )}

          {recoveryStep === 'failed' && (
            <>
              <p className="vault-description" style={{ color: '#e74c3c' }}>
                {recoveryError || 'Recovery failed. No backup key was found in Google Drive.'}
              </p>
              <button onClick={cancelRecovery}>Back</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- Normal unlock/create UI ---
  return (
    <div className="vault-unlock-overlay">
      <form className="vault-unlock-form" onSubmit={handleSubmit}>
        <div className="vault-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2>{vaultExists ? 'Unlock Vault' : 'Create Vault'}</h2>
        <p className="vault-description">
          {vaultExists
            ? 'Enter your master password to access your credentials.'
            : 'Set a master password to encrypt your API keys and tokens.'}
        </p>

        <input
          type="password"
          placeholder="Master password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          disabled={loading}
        />

        {!vaultExists && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
          />
        )}

        {error && <div className="vault-error">{error}</div>}

        <button type="submit" disabled={loading || !password}>
          {loading ? 'Working...' : vaultExists ? 'Unlock' : 'Create Vault'}
        </button>

        {vaultExists && (
          <button type="button" className="vault-forgot-btn" onClick={startRecovery}>
            Forgot password?
          </button>
        )}
      </form>
    </div>
  );
}
