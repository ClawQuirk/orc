import { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';

interface ServiceStatus {
  pluginId: string;
  connected: boolean;
}

interface FinancialSetupProps {
  onClose: () => void;
}

type Tab = 'stripe' | 'paypal' | 'coinbase' | 'robinhood' | 'plaid';

export default function FinancialSetup({ onClose }: FinancialSetupProps) {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('stripe');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchStatus = useCallback(() => {
    fetch('/api/financial/status')
      .then((r) => r.json())
      .then((data: { services: ServiceStatus[] }) => setServices(data.services))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const isConnected = (id: string) => services.find((s) => s.pluginId === id)?.connected ?? false;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'stripe', label: 'Stripe' },
    { id: 'paypal', label: 'PayPal' },
    { id: 'coinbase', label: 'Coinbase' },
    { id: 'robinhood', label: 'Robinhood' },
    { id: 'plaid', label: 'Plaid' },
  ];

  return (
    <div className="settings-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="financial-setup-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Financial Services</h3>

        <div className="financial-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`financial-tab ${activeTab === tab.id ? 'active' : ''} ${isConnected(tab.id) ? 'connected' : ''}`}
              onClick={() => { setActiveTab(tab.id); setError(''); setSuccess(''); }}
            >
              {tab.label}
              {isConnected(tab.id) && <span className="sidebar-status-dot" />}
            </button>
          ))}
        </div>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        {activeTab === 'stripe' && (
          <StripeTab
            connected={isConnected('stripe')}
            onConnect={async (key) => {
              setLoading(true); setError(''); setSuccess('');
              try {
                const res = await fetch('/api/financial/stripe/connect', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ apiKey: key }),
                });
                if (res.ok) { setSuccess('Stripe connected!'); fetchStatus(); }
                else { const d = await res.json(); setError(d.error); }
              } catch { setError('Connection error'); }
              finally { setLoading(false); }
            }}
            onDisconnect={async () => {
              await fetch('/api/financial/stripe/disconnect', { method: 'POST' });
              setSuccess('Stripe disconnected');
              fetchStatus();
            }}
            loading={loading}
          />
        )}

        {activeTab === 'paypal' && (
          <ApiKeyTab
            service="paypal"
            connected={isConnected('paypal')}
            fields={[
              { key: 'clientId', label: 'Client ID', type: 'text' },
              { key: 'clientSecret', label: 'Client Secret', type: 'password' },
            ]}
            instructions="Get your credentials from developer.paypal.com under your app's API credentials."
            instructionsLink="https://developer.paypal.com/dashboard/applications"
            onConnect={async (data) => {
              setLoading(true); setError(''); setSuccess('');
              try {
                const res = await fetch('/api/financial/paypal/connect', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
                });
                if (res.ok) { setSuccess('PayPal connected!'); fetchStatus(); }
                else { const d = await res.json(); setError(d.error); }
              } catch { setError('Connection error'); }
              finally { setLoading(false); }
            }}
            onDisconnect={async () => {
              await fetch('/api/financial/paypal/disconnect', { method: 'POST' });
              fetchStatus();
            }}
            loading={loading}
          />
        )}

        {activeTab === 'coinbase' && (
          <ApiKeyTab
            service="coinbase"
            connected={isConnected('coinbase')}
            fields={[
              { key: 'apiKeyId', label: 'API Key Name', type: 'text' },
              { key: 'privateKey', label: 'Private Key (PEM)', type: 'textarea' },
            ]}
            instructions="Create a CDP API key from the Coinbase Developer Platform. Select ECDSA (P-256) or Ed25519. Copy the API Key Name and the full Private Key (PEM block)."
            instructionsLink="https://portal.cdp.coinbase.com/"
            onConnect={async (data) => {
              setLoading(true); setError(''); setSuccess('');
              try {
                const res = await fetch('/api/financial/coinbase/connect', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
                });
                if (res.ok) { setSuccess('Coinbase connected!'); fetchStatus(); }
                else { const d = await res.json(); setError(d.error); }
              } catch { setError('Connection error'); }
              finally { setLoading(false); }
            }}
            onDisconnect={async () => {
              await fetch('/api/financial/coinbase/disconnect', { method: 'POST' });
              fetchStatus();
            }}
            loading={loading}
          />
        )}

        {activeTab === 'robinhood' && (
          <ApiKeyTab
            service="robinhood"
            connected={isConnected('robinhood')}
            fields={[
              { key: 'apiKey', label: 'API Key', type: 'text' },
              { key: 'privateKeyBase64', label: 'Private Key (Base64)', type: 'textarea' },
            ]}
            instructions="Generate an ED25519 key pair and register the public key at Robinhood. Crypto data only."
            instructionsLink="https://robinhood.com/account/settings"
            onConnect={async (data) => {
              setLoading(true); setError(''); setSuccess('');
              try {
                const res = await fetch('/api/financial/robinhood/connect', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
                });
                if (res.ok) { setSuccess('Robinhood connected!'); fetchStatus(); }
                else { const d = await res.json(); setError(d.error); }
              } catch { setError('Connection error'); }
              finally { setLoading(false); }
            }}
            onDisconnect={async () => {
              await fetch('/api/financial/robinhood/disconnect', { method: 'POST' });
              fetchStatus();
            }}
            loading={loading}
          />
        )}

        {activeTab === 'plaid' && (
          <PlaidTab
            loading={loading}
            onMessage={(msg, type) => { if (type === 'error') setError(msg); else setSuccess(msg); }}
            onRefresh={fetchStatus}
          />
        )}

        <button className="auth-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// --- Stripe-specific tab (validates key format) ---
function StripeTab({ connected, onConnect, onDisconnect, loading }: {
  connected: boolean;
  onConnect: (key: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  loading: boolean;
}) {
  const [key, setKey] = useState('');

  if (connected) {
    return (
      <div className="auth-section">
        <div className="auth-connected"><span className="auth-status-dot connected" /> Connected</div>
        <button className="auth-revoke-btn" onClick={onDisconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <div className="auth-section">
      <p className="auth-hint">
        Create a <strong>restricted API key</strong> with <strong>read-only</strong> permissions at{' '}
        <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer">
          dashboard.stripe.com/apikeys
        </a>.
        For extra security, IP-restrict the key to 127.0.0.1.
      </p>
      <input
        type="password"
        placeholder="Restricted API key (rk_live_... or rk_test_...)"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        disabled={loading}
      />
      <button onClick={() => onConnect(key)} disabled={loading || !key.trim()}>
        {loading ? 'Connecting...' : 'Connect Stripe'}
      </button>
    </div>
  );
}

// --- Generic API key tab for services with simple key/secret auth ---
function ApiKeyTab({ service, connected, fields, instructions, instructionsLink, onConnect, onDisconnect, loading }: {
  service: string;
  connected: boolean;
  fields: Array<{ key: string; label: string; type: 'text' | 'password' | 'textarea' }>;
  instructions: string;
  instructionsLink: string;
  onConnect: (data: Record<string, string>) => Promise<void>;
  onDisconnect: () => Promise<void>;
  loading: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  if (connected) {
    return (
      <div className="auth-section">
        <div className="auth-connected"><span className="auth-status-dot connected" /> Connected</div>
        <button className="auth-revoke-btn" onClick={onDisconnect}>Disconnect</button>
      </div>
    );
  }

  const allFilled = fields.every((f) => values[f.key]?.trim());

  return (
    <div className="auth-section">
      <p className="auth-hint">
        {instructions}{' '}
        <a href={instructionsLink} target="_blank" rel="noopener noreferrer">Open dashboard</a>
      </p>
      {fields.map((f) =>
        f.type === 'textarea' ? (
          <textarea
            key={f.key}
            className="auth-section-textarea"
            placeholder={f.label}
            value={values[f.key] || ''}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            disabled={loading}
            rows={4}
          />
        ) : (
          <input
            key={f.key}
            type={f.type}
            placeholder={f.label}
            value={values[f.key] || ''}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            disabled={loading}
          />
        )
      )}
      <button onClick={() => onConnect(values)} disabled={loading || !allFilled}>
        {loading ? 'Connecting...' : `Connect ${service.charAt(0).toUpperCase() + service.slice(1)}`}
      </button>
    </div>
  );
}

// --- Plaid tab with Link integration ---
function PlaidTab({ loading: parentLoading, onMessage, onRefresh }: {
  loading: boolean;
  onMessage: (msg: string, type: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  const [phase, setPhase] = useState<'check' | 'setup' | 'configured'>('check');
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [environment, setEnvironment] = useState('sandbox');
  const [items, setItems] = useState<Array<{ itemId: string; accountCount: number }>>([]);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Check Plaid configuration status
  useEffect(() => {
    fetch('/api/financial/plaid/items')
      .then((r) => r.json())
      .then((data) => {
        if (data.configured) {
          setPhase('configured');
          setItems(data.items ?? []);
        } else {
          setPhase('setup');
        }
      })
      .catch(() => setPhase('setup'));
  }, []);

  const saveCredentials = async () => {
    if (!clientId.trim() || !secret.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/financial/plaid/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), secret: secret.trim(), environment }),
      });
      if (res.ok) {
        onMessage('Plaid credentials saved!', 'success');
        setPhase('configured');
        onRefresh();
      } else {
        const d = await res.json();
        onMessage(d.error || 'Failed to save', 'error');
      }
    } catch { onMessage('Connection error', 'error'); }
    finally { setSaving(false); }
  };

  const startLink = async () => {
    try {
      const res = await fetch('/api/financial/plaid/link-token', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.linkToken) {
        setLinkToken(data.linkToken);
      } else {
        onMessage(data.error || 'Failed to create link token', 'error');
      }
    } catch { onMessage('Connection error', 'error'); }
  };

  const refreshItems = () => {
    fetch('/api/financial/plaid/items')
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => {});
  };

  const unlinkItem = async (itemId: string) => {
    try {
      await fetch(`/api/financial/plaid/items/${itemId}`, { method: 'DELETE' });
      onMessage('Bank unlinked', 'success');
      refreshItems();
      onRefresh();
    } catch { onMessage('Failed to unlink', 'error'); }
  };

  const disconnectAll = async () => {
    await fetch('/api/financial/plaid/disconnect', { method: 'POST' });
    setPhase('setup');
    setItems([]);
    setLinkToken(null);
    onRefresh();
  };

  if (phase === 'check') {
    return <div className="auth-section"><p className="auth-hint">Checking Plaid configuration...</p></div>;
  }

  if (phase === 'setup') {
    return (
      <div className="auth-section">
        <p className="auth-hint">
          Enter your Plaid credentials from{' '}
          <a href="https://dashboard.plaid.com/developers/keys" target="_blank" rel="noopener noreferrer">dashboard.plaid.com</a>.
          Your bank login is handled securely by Plaid — credentials never touch Orc.
        </p>
        <input type="text" placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={saving} />
        <input type="password" placeholder="Secret" value={secret} onChange={(e) => setSecret(e.target.value)} disabled={saving} />
        <select value={environment} onChange={(e) => setEnvironment(e.target.value)} disabled={saving} style={{ padding: '0.5rem', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
          <option value="sandbox">Sandbox (testing)</option>
          <option value="production">Production (real banks)</option>
        </select>
        <button onClick={saveCredentials} disabled={saving || !clientId.trim() || !secret.trim()}>
          {saving ? 'Saving...' : 'Save Credentials'}
        </button>
      </div>
    );
  }

  return (
    <div className="auth-section">
      <div className="auth-connected"><span className="auth-status-dot connected" /> Plaid Configured</div>

      {items.length > 0 && (
        <div className="plaid-items-list">
          {items.map((item) => (
            <div key={item.itemId} className="plaid-item-row">
              <span className="plaid-item-name">Bank ({item.accountCount} accounts)</span>
              <button className="btn-ghost btn-xs" onClick={() => unlinkItem(item.itemId)}>Unlink</button>
            </div>
          ))}
        </div>
      )}

      {linkToken ? (
        <PlaidLinkButton
          linkToken={linkToken}
          onSuccess={async (publicToken: string) => {
            setLinkToken(null);
            try {
              const res = await fetch('/api/financial/plaid/exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicToken }),
              });
              if (res.ok) {
                onMessage('Bank account linked!', 'success');
                refreshItems();
                onRefresh();
              } else {
                const d = await res.json();
                onMessage(d.error || 'Link failed', 'error');
              }
            } catch { onMessage('Connection error', 'error'); }
          }}
          onExit={() => setLinkToken(null)}
        />
      ) : (
        <button onClick={startLink}>Link Bank Account</button>
      )}

      <button className="auth-revoke-btn" onClick={disconnectAll}>Disconnect All</button>
    </div>
  );
}

// Wrapper for react-plaid-link
function PlaidLinkButton({ linkToken, onSuccess, onExit }: {
  linkToken: string;
  onSuccess: (publicToken: string) => void;
  onExit: () => void;
}) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token) => onSuccess(public_token),
    onExit: () => onExit(),
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  return <p className="auth-hint">Opening Plaid Link...</p>;
}
