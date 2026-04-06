import { useState, useEffect } from 'react';
import { pluginRegistry } from '../plugins/registry';
import DashboardWidget from './DashboardWidget';
import type { Project } from '../lib/projects-api';
import type { JournalSummary } from '../lib/journal-api';

interface PinnedWidget {
  widgetId: string;
  pluginId: string;
  settings: Record<string, unknown>;
}

interface DashboardProps {
  pinnedWidgets: PinnedWidget[];
  onUnpin: (widgetId: string) => void;
  onSettingsChange: (widgetId: string, settings: Record<string, unknown>) => void;
}

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  attendees?: { email: string }[];
}

function formatEventTime(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const diffDays = Math.round((eventDay.getTime() - today.getTime()) / 86400000);

  let dayLabel: string;
  if (diffDays === 0) dayLabel = 'Today';
  else if (diffDays === 1) dayLabel = 'Tomorrow';
  else dayLabel = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  // All-day events (date-only strings have no 'T')
  if (!start.includes('T')) return dayLabel;

  const timeStr = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dur = Math.round((e.getTime() - s.getTime()) / 60000);
  const durLabel = dur >= 60 ? `${Math.floor(dur / 60)}h${dur % 60 ? ` ${dur % 60}m` : ''}` : `${dur}m`;
  return `${dayLabel} ${timeStr} (${durLabel})`;
}

function UpcomingEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/calendar/upcoming?maxResults=6')
      .then((r) => { if (!r.ok) throw new Error('Not connected'); return r.json(); })
      .then((data) => setEvents(data.events ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="dash-card-loading">Loading...</div>;
  if (error) return <div className="dash-card-empty">Calendar not connected</div>;
  if (!events.length) return <div className="dash-card-empty">No upcoming events</div>;

  return (
    <div className="dash-events">
      {events.map((ev) => (
        <div key={ev.id} className="dash-event-row">
          <div className="dash-event-title">{ev.summary || '(no title)'}</div>
          <div className="dash-event-time">{formatEventTime(ev.start, ev.end)}</div>
          {ev.location && <div className="dash-event-location">{ev.location}</div>}
        </div>
      ))}
    </div>
  );
}

function ActiveProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects?status=active')
      .then((r) => r.json())
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="dash-card-loading">Loading...</div>;
  if (!projects.length) return <div className="dash-card-empty">No active projects</div>;

  return (
    <div className="dash-projects">
      {projects.map((p) => {
        const total = p.taskCount ?? 0;
        const done = p.doneCount ?? 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <div key={p.id} className="dash-project-row">
            <div className="dash-project-name">{p.name}</div>
            {total > 0 ? (
              <div className="dash-project-progress">
                <div className="dash-progress-bar">
                  <div className="dash-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="dash-progress-label">{done}/{total}</span>
              </div>
            ) : (
              <span className="dash-project-tasks-none">No tasks yet</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecentJournal() {
  const [entries, setEntries] = useState<JournalSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/journal/summaries?limit=5')
      .then((r) => r.json())
      .then((data) => setEntries(data.entries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="dash-card-loading">Loading...</div>;
  if (!entries.length) return <div className="dash-card-empty">No journal entries</div>;

  return (
    <div className="dash-journal">
      {entries.map((e) => (
        <div key={e.id} className="dash-journal-row">
          <div className="dash-journal-date">
            {new Date(e.date + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </div>
          <div className="dash-journal-content">
            <div className="dash-journal-title">{e.title}</div>
            {e.summary && <div className="dash-journal-summary">{e.summary}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ pinnedWidgets, onUnpin, onSettingsChange }: DashboardProps) {
  return (
    <div className="dashboard-default">
      {pinnedWidgets.length > 0 && (
        <div className="dashboard-grid">
          {pinnedWidgets.map((pw) => {
            const registration = pluginRegistry.getWidget(pw.widgetId);
            if (!registration) return null;
            const WidgetComponent = registration.component;
            return (
              <DashboardWidget
                key={pw.widgetId}
                title={registration.manifest.title}
                pluginId={pw.pluginId}
                widgetId={pw.widgetId}
                onUnpin={() => onUnpin(pw.widgetId)}
              >
                <WidgetComponent
                  widgetId={pw.widgetId}
                  pluginId={pw.pluginId}
                  settings={pw.settings}
                  onSettingsChange={(s) => onSettingsChange(pw.widgetId, s)}
                />
              </DashboardWidget>
            );
          })}
        </div>
      )}

      <div className="dash-cards">
        <div className="dash-card">
          <div className="dash-card-header">Upcoming</div>
          <UpcomingEvents />
        </div>
        <div className="dash-card">
          <div className="dash-card-header">Projects</div>
          <ActiveProjects />
        </div>
        <div className="dash-card">
          <div className="dash-card-header">Journal</div>
          <RecentJournal />
        </div>
      </div>
    </div>
  );
}
