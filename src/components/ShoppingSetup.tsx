import { useState, useEffect, useCallback, useRef } from 'react';

interface BrowserService {
  serviceId: string;
  name: string;
  loginUrl: string;
  loggedIn: boolean;
  lastUsed: string | null;
  contextExists: boolean;
}

interface ShoppingSetupProps {
  onClose: () => void;
}

export default function ShoppingSetup({ onClose }: ShoppingSetupProps) {
  const [services, setServices] = useState<BrowserService[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(() => {
    fetch('/api/automation/status')
      .then((r) => r.json())
      .then((data: { services: BrowserService[] }) => {
        // Filter out the _test service in production-like display
        setServices(data.services.filter(s => !s.serviceId.startsWith('_')));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  const handleLogin = async (serviceId: string) => {
    setLoading(serviceId);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/automation/login/${serviceId}`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to open login window');
        setLoading(null);
        return;
      }

      // Poll for login completion
      pollRef.current = setInterval(() => {
        fetch(`/api/automation/status/${serviceId}`)
          .then(r => r.json())
          .then(info => {
            if (info.contextExists) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setLoading(null);
              setSuccess(`Logged in to ${serviceId} successfully.`);
              fetchStatus();
            }
          })
          .catch(() => {});
      }, 2000);

      // Stop polling after 2.5 minutes (login timeout is 2 min)
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setLoading(null);
          setError('Login timed out or browser was closed.');
          fetchStatus();
        }
      }, 150_000);
    } catch {
      setError('Failed to connect to server');
      setLoading(null);
    }
  };

  const handleLogout = async (serviceId: string) => {
    setError('');
    setSuccess('');

    try {
      await fetch(`/api/automation/logout/${serviceId}`, { method: 'POST' });
      setSuccess(`Logged out of ${serviceId}.`);
      fetchStatus();
    } catch {
      setError('Failed to disconnect');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="settings-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="financial-setup-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Shopping Services</h3>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        {services.length === 0 ? (
          <div className="shopping-empty">
            <p>No shopping services configured.</p>
            <p className="text-muted">Shopping plugins will appear here when installed.</p>
          </div>
        ) : (
          <div className="shopping-services">
            {services.map(service => (
              <div key={service.serviceId} className="shopping-service-row">
                <div className="shopping-service-info">
                  <span className="shopping-service-name">{service.name}</span>
                  {service.contextExists && <span className="sidebar-status-dot" />}
                </div>

                {loading === service.serviceId ? (
                  <div className="browser-login-status pending">
                    Login window open — complete login in the browser...
                  </div>
                ) : service.contextExists ? (
                  <button
                    className="auth-button disconnect"
                    onClick={() => handleLogout(service.serviceId)}
                  >
                    Log out
                  </button>
                ) : (
                  <button
                    className="auth-button"
                    onClick={() => handleLogin(service.serviceId)}
                  >
                    Log in
                  </button>
                )}

                {service.lastUsed && (
                  <span className="text-muted shopping-last-used">
                    Last used: {new Date(service.lastUsed).toLocaleString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <button className="auth-button" onClick={onClose} style={{ marginTop: '1rem' }}>
          Close
        </button>
      </div>
    </div>
  );
}
