import { useState } from 'react';
import type { WidgetProps } from '../registry';

export default function ContactsWidget(_props: WidgetProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ name: string; email: string }>>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Not connected');
      const data = await res.json();
      setResults(data.contacts ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="contacts-widget">
      <div className="contacts-search">
        <input
          type="text"
          placeholder="Search contacts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
      </div>
      {loading && <div className="widget-loading">Searching...</div>}
      {results.map((c, i) => (
        <div key={i} className="contacts-item">
          <div className="contacts-name">{c.name}</div>
          {c.email && <div className="contacts-email">{c.email}</div>}
        </div>
      ))}
    </div>
  );
}
