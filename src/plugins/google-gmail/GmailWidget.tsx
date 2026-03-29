import { useState, useEffect } from 'react';
import type { WidgetProps } from '../registry';

interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export default function GmailWidget(_props: WidgetProps) {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/gmail/messages?maxResults=5')
      .then((r) => {
        if (!r.ok) throw new Error('Not connected');
        return r.json();
      })
      .then((data) => setEmails(data.messages ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="widget-loading">Loading...</div>;
  if (error) return <div className="widget-error">{error}</div>;
  if (emails.length === 0) return <div className="widget-empty">No recent emails</div>;

  return (
    <div className="gmail-widget">
      {emails.map((email) => (
        <div key={email.id} className="gmail-item">
          <div className="gmail-subject">{email.subject || '(no subject)'}</div>
          <div className="gmail-meta">{email.from} - {email.date}</div>
        </div>
      ))}
    </div>
  );
}
