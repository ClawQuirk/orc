import { useState } from 'react';

type ActionType = 'email' | 'contact' | 'event' | null;

export default function ActionsPage() {
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const executeAction = async (tool: string, args: Record<string, unknown>) => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/mcp/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, args }),
      });
      const data = await res.json();
      setResult(data.content?.[0]?.text ?? 'Done');
    } catch {
      setResult('Action failed. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-content">
      <h2>Actions</h2>
      <p className="page-description">Quick operations across your connected services.</p>

      <div className="action-grid">
        <ActionCard
          title="Search Emails"
          description="Search your Gmail inbox"
          icon="mail"
          active={activeAction === 'email'}
          onClick={() => setActiveAction(activeAction === 'email' ? null : 'email')}
        />
        <ActionCard
          title="Find Contact"
          description="Search your contacts"
          icon="contact"
          active={activeAction === 'contact'}
          onClick={() => setActiveAction(activeAction === 'contact' ? null : 'contact')}
        />
        <ActionCard
          title="Create Event"
          description="Add a calendar event"
          icon="event"
          active={activeAction === 'event'}
          onClick={() => setActiveAction(activeAction === 'event' ? null : 'event')}
        />
      </div>

      {activeAction === 'email' && (
        <SearchForm
          placeholder="Search emails (e.g. from:boss subject:meeting)"
          onSubmit={(query) => executeAction('gmail_search', { query, maxResults: 10 })}
          loading={loading}
        />
      )}

      {activeAction === 'contact' && (
        <SearchForm
          placeholder="Search contacts by name, email, or phone"
          onSubmit={(query) => executeAction('contacts_search', { query })}
          loading={loading}
        />
      )}

      {activeAction === 'event' && (
        <div className="action-form">
          <p className="action-hint">
            Use the terminal to create events with natural language:
            <code className="action-example">"Create a meeting tomorrow at 2pm with John"</code>
          </p>
        </div>
      )}

      {result && (
        <div className="action-result">
          <pre>{result}</pre>
        </div>
      )}
    </div>
  );
}

function ActionCard({ title, description, icon, active, onClick }: {
  title: string;
  description: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`action-card ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="action-card-icon">
        {icon === 'mail' && (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        )}
        {icon === 'contact' && (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )}
        {icon === 'event' && (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        )}
      </div>
      <div className="action-card-text">
        <div className="action-card-title">{title}</div>
        <div className="action-card-desc">{description}</div>
      </div>
    </button>
  );
}

function SearchForm({ placeholder, onSubmit, loading }: {
  placeholder: string;
  onSubmit: (query: string) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState('');
  return (
    <form className="action-form" onSubmit={(e) => { e.preventDefault(); if (query.trim()) onSubmit(query.trim()); }}>
      <input
        type="text"
        className="action-input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={loading}
        autoFocus
      />
      <button type="submit" className="action-submit" disabled={loading || !query.trim()}>
        {loading ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
}
