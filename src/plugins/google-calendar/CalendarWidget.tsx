import { useState, useEffect } from 'react';
import type { WidgetProps } from '../registry';

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
}

export default function CalendarWidget(_props: WidgetProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/calendar/upcoming?maxResults=5')
      .then((r) => {
        if (!r.ok) throw new Error('Not connected');
        return r.json();
      })
      .then((data) => setEvents(data.events ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="widget-loading">Loading...</div>;
  if (error) return <div className="widget-error">{error}</div>;
  if (events.length === 0) return <div className="widget-empty">No upcoming events</div>;

  return (
    <div className="calendar-widget">
      {events.map((event) => (
        <div key={event.id} className="calendar-item">
          <div className="calendar-title">{event.summary || '(no title)'}</div>
          <div className="calendar-time">
            {new Date(event.start).toLocaleString(undefined, {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })}
          </div>
          {event.location && <div className="calendar-location">{event.location}</div>}
        </div>
      ))}
    </div>
  );
}
