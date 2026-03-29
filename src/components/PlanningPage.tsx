import { useState, useEffect, useCallback } from 'react';

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  id: string;
  eventType: 'birthday' | 'meeting' | 'generic';
  contactName?: string; // extracted from birthday title
}

interface ContactInfo {
  name: string;
  email?: string;
  phone?: string;
  org?: string;
  resourceName?: string;
}

export default function PlanningPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contactCache, setContactCache] = useState<Record<string, ContactInfo | 'loading' | 'not-found'>>({});
  const [deletedContacts, setDeletedContacts] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/mcp/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'calendar_upcoming', args: { maxResults: 20 } }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.content?.[0]?.text) {
          setEvents(parseCalendarResponse(data.content[0].text));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fetchContact = useCallback((name: string) => {
    if (contactCache[name]) return;
    setContactCache((prev) => ({ ...prev, [name]: 'loading' }));

    fetch('/api/mcp/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'contacts_search', args: { query: name } }),
    })
      .then((r) => r.json())
      .then((data) => {
        const text = data.content?.[0]?.text ?? '';
        const contact = parseContactResponse(text);
        setContactCache((prev) => ({
          ...prev,
          [name]: contact ?? 'not-found',
        }));
      })
      .catch(() => {
        setContactCache((prev) => ({ ...prev, [name]: 'not-found' }));
      });
  }, [contactCache]);

  const handleEventClick = (event: CalendarEvent) => {
    const newId = expandedId === event.id ? null : event.id;
    setExpandedId(newId);

    if (newId && event.eventType === 'birthday' && event.contactName) {
      fetchContact(event.contactName);
    }
  };

  const handleSoftDelete = useCallback(async (resourceName: string, name: string) => {
    try {
      const res = await fetch('/api/mcp/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'contacts_soft_delete', args: { resourceName } }),
      });
      const data = await res.json();
      if (!data.isError) {
        setDeletedContacts((prev) => new Set(prev).add(name));
      }
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="page-content">
      <h2>Planning</h2>
      <p className="page-description">Upcoming events from your connected calendars.</p>

      {loading ? (
        <div className="page-loading">Loading events...</div>
      ) : events.length === 0 ? (
        <div className="page-empty">No upcoming events found. Connect Google Calendar to see your schedule.</div>
      ) : (
        <div className="events-list">
          {events.map((event) => {
            const isExpanded = expandedId === event.id;
            return (
              <div
                key={event.id}
                className={`event-card event-card-clickable ${isExpanded ? 'expanded' : ''}`}
                onClick={() => handleEventClick(event)}
              >
                <div className="event-card-main">
                  <div className="event-card-left">
                    <EventIcon type={event.eventType} />
                    <div>
                      <div className="event-title">{event.summary}</div>
                      <div className="event-time">{formatEventTime(event.start, event.end)}</div>
                      {event.location && <div className="event-location">{event.location}</div>}
                    </div>
                  </div>
                  <svg className={`event-chevron ${isExpanded ? 'open' : ''}`} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {isExpanded && (
                  <div className="event-details" onClick={(e) => e.stopPropagation()}>
                    {event.eventType === 'birthday' && event.contactName && (
                      <ContactCard
                        name={event.contactName}
                        data={contactCache[event.contactName]}
                        deleted={deletedContacts.has(event.contactName)}
                        onDelete={handleSoftDelete}
                      />
                    )}

                    {event.attendees && event.attendees.length > 0 && (
                      <div className="event-attendees">
                        <div className="event-detail-label">Attendees</div>
                        {event.attendees.map((email) => (
                          <div key={email} className="event-attendee">{email}</div>
                        ))}
                      </div>
                    )}

                    {event.eventType === 'generic' && !event.attendees?.length && (
                      <div className="event-detail-empty">No additional details available.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EventIcon({ type }: { type: CalendarEvent['eventType'] }) {
  if (type === 'birthday') {
    return (
      <div className="event-icon event-icon-birthday" title="Birthday">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
    );
  }
  if (type === 'meeting') {
    return (
      <div className="event-icon event-icon-meeting" title="Meeting">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
    );
  }
  return (
    <div className="event-icon event-icon-generic" title="Event">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    </div>
  );
}

function ContactCard({ name, data, deleted, onDelete }: {
  name: string;
  data: ContactInfo | 'loading' | 'not-found' | undefined;
  deleted: boolean;
  onDelete: (resourceName: string, name: string) => void;
}) {
  if (!data || data === 'loading') {
    return (
      <div className="contact-card">
        <div className="contact-card-header">
          <div className="event-detail-label">Contact</div>
        </div>
        <div className="contact-card-loading">Searching for {name}...</div>
      </div>
    );
  }

  if (data === 'not-found') {
    return (
      <div className="contact-card">
        <div className="contact-card-header">
          <div className="event-detail-label">Contact</div>
        </div>
        <div className="contact-card-empty">No contact found for "{name}"</div>
      </div>
    );
  }

  return (
    <div className={`contact-card ${deleted ? 'contact-deleted' : ''}`}>
      <div className="contact-card-header">
        <div className="event-detail-label">Contact</div>
        {!deleted && data.resourceName && (
          <button
            className="contact-delete-btn"
            onClick={() => onDelete(data.resourceName!, name)}
            title="Move to Orc Deletion"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
        {deleted && <span className="contact-deleted-label">Moved to Orc Deletion</span>}
      </div>
      <div className="contact-card-body">
        <div className="contact-card-name">{data.name}</div>
        {data.email && (
          <div className="contact-card-field">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
            <span>{data.email}</span>
          </div>
        )}
        {data.phone && (
          <div className="contact-card-field">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            <span>{data.phone}</span>
          </div>
        )}
        {data.org && (
          <div className="contact-card-field">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
            <span>{data.org}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Parsing helpers ---

function parseCalendarResponse(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const blocks = text.split('---').map((b) => b.trim()).filter(Boolean);

  for (const block of blocks) {
    const titleMatch = block.match(/\*\*(.+?)\*\*/);
    const startMatch = block.match(/Start:\s*(.+)/);
    const endMatch = block.match(/End:\s*(.+)/);
    const locationMatch = block.match(/Location:\s*(.+)/);
    const attendeesMatch = block.match(/Attendees:\s*(.+)/);
    const idMatch = block.match(/\[ID:\s*(.+?)\]/);

    if (titleMatch && startMatch) {
      const summary = titleMatch[1];
      const attendees = attendeesMatch
        ? attendeesMatch[1].split(',').map((a) => a.trim()).filter(Boolean)
        : undefined;

      const birthdayMatch = summary.match(/^(.+?)(?:'s)?\s+birthday$/i);
      const eventType: CalendarEvent['eventType'] = birthdayMatch
        ? 'birthday'
        : attendees && attendees.length > 0
          ? 'meeting'
          : 'generic';

      events.push({
        summary,
        start: startMatch[1].trim(),
        end: endMatch?.[1]?.trim() ?? '',
        location: locationMatch?.[1]?.trim(),
        attendees,
        id: idMatch?.[1]?.trim() ?? Math.random().toString(),
        eventType,
        contactName: birthdayMatch?.[1]?.trim(),
      });
    }
  }

  return events;
}

function parseContactResponse(text: string): ContactInfo | null {
  if (!text || text.includes('No contacts matching')) return null;

  // Parse the first contact from the response
  const nameMatch = text.match(/\*\*(.+?)\*\*/);
  const emailMatch = text.match(/Email:\s*(.+)/);
  const phoneMatch = text.match(/Phone:\s*(.+)/);
  const orgMatch = text.match(/Org:\s*(.+)/);
  const resourceMatch = text.match(/\[Resource:\s*(.+?)\]/);

  if (!nameMatch) return null;

  return {
    name: nameMatch[1],
    email: emailMatch?.[1]?.trim(),
    phone: phoneMatch?.[1]?.trim(),
    org: orgMatch?.[1]?.trim(),
    resourceName: resourceMatch?.[1]?.trim(),
  };
}

function formatEventTime(start: string, end: string): string {
  try {
    if (!start.includes('T')) {
      return new Date(start + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric',
      });
    }
    const s = new Date(start);
    const e = new Date(end);
    const dateStr = s.toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const timeStr = `${s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} - ${e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    return `${dateStr}, ${timeStr}`;
  } catch {
    return start;
  }
}
