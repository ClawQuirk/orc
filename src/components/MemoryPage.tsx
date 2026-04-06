import { useState, useEffect, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { journalApi } from '../lib/journal-api';
import type { JournalIndex, JournalEntry, DateCount } from '../lib/journal-api';

function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') { try { const p = JSON.parse(tags); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

export default function MemoryPage() {
  const [dates, setDates] = useState<DateCount[]>([]);
  const [entries, setEntries] = useState<JournalIndex[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<JournalIndex[] | null>(null);

  const fetchSidebar = useCallback(() => {
    Promise.all([journalApi.dates(), journalApi.list()])
      .then(([d, e]) => {
        setDates(d.dates);
        setEntries(e.entries);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchSidebar(); }, [fetchSidebar]);

  const selectEntry = async (id: string) => {
    const entry = await journalApi.get(id);
    setSelectedEntry(entry);
    setEditing(false);
    setCreating(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    const res = await journalApi.search(searchQuery.trim());
    setSearchResults(res.entries);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleDelete = async () => {
    if (!selectedEntry) return;
    await journalApi.remove(selectedEntry.id);
    setSelectedEntry(null);
    fetchSidebar();
  };

  const startCreate = () => {
    setCreating(true);
    setEditing(false);
    setSelectedEntry(null);
  };

  // Group entries by date for sidebar
  const displayEntries = searchResults ?? entries;
  const grouped = new Map<string, JournalIndex[]>();
  for (const entry of displayEntries) {
    const list = grouped.get(entry.date) ?? [];
    list.push(entry);
    grouped.set(entry.date, list);
  }

  return (
    <div className="memory-layout">
      <aside className="journal-sidebar">
        <div className="journal-sidebar-header">
          <div className="journal-search-row">
            <input
              type="text"
              className="journal-search-input"
              placeholder="Search journal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); if (e.key === 'Escape') clearSearch(); }}
            />
            {searchResults && (
              <button className="btn-icon-xs" onClick={clearSearch} title="Clear search">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
          <button className="btn-primary btn-sm journal-new-btn" onClick={startCreate}>
            New Entry
          </button>
        </div>

        {loading ? (
          <div className="journal-sidebar-loading">Loading...</div>
        ) : displayEntries.length === 0 ? (
          <div className="journal-sidebar-empty">
            {searchResults ? 'No results found.' : 'No journal entries yet.'}
          </div>
        ) : (
          <div className="journal-date-list">
            {[...grouped.entries()].map(([date, items]) => (
              <div key={date} className="journal-date-group">
                <div className="journal-date-heading">{formatDate(date)}</div>
                {items.map((item) => (
                  <button
                    key={item.id}
                    className={`journal-entry-item ${selectedEntry?.id === item.id ? 'active' : ''}`}
                    onClick={() => selectEntry(item.id)}
                  >
                    <div className="journal-entry-item-title">{item.title}</div>
                    <div className="journal-entry-item-meta">
                      {item.source !== 'manual' && (
                        <span className={`journal-source-badge source-${item.source}`}>{item.source}</span>
                      )}
                      {parseTags(item.tags).map((tag: string) => (
                        <span key={tag} className="journal-tag">{tag}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </aside>

      <main className="journal-content">
        {creating ? (
          <JournalEditor
            onSave={async (data) => {
              await journalApi.create(data);
              setCreating(false);
              fetchSidebar();
            }}
            onCancel={() => setCreating(false)}
          />
        ) : editing && selectedEntry ? (
          <JournalEditor
            initial={selectedEntry}
            onSave={async (data) => {
              await journalApi.update(selectedEntry.id, data);
              setEditing(false);
              await selectEntry(selectedEntry.id);
              fetchSidebar();
            }}
            onCancel={() => setEditing(false)}
          />
        ) : selectedEntry ? (
          <div className="journal-entry-view">
            <div className="journal-entry-header">
              <div>
                <h2>{selectedEntry.title}</h2>
                <div className="journal-entry-meta-row">
                  <span className="journal-entry-date">{formatDate(selectedEntry.date)}</span>
                  {selectedEntry.source !== 'manual' && (
                    <span className={`journal-source-badge source-${selectedEntry.source}`}>{selectedEntry.source}</span>
                  )}
                  {selectedEntry.mood && <span className="journal-mood">{selectedEntry.mood}</span>}
                  {selectedEntry.tags.map((tag) => (
                    <span key={tag} className="journal-tag">{tag}</span>
                  ))}
                </div>
              </div>
              <div className="journal-entry-actions">
                <button className="btn-ghost btn-xs" onClick={() => setEditing(true)}>Edit</button>
                <button className="btn-ghost btn-xs" onClick={handleDelete} style={{ color: '#e74c3c' }}>Delete</button>
              </div>
            </div>
            <div className="journal-body">
              <Markdown remarkPlugins={[remarkGfm]}>{selectedEntry.content}</Markdown>
            </div>
          </div>
        ) : (
          <div className="journal-empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.2">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="9" y="9" width="6" height="6" />
              <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
              <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
              <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
              <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
            </svg>
            <p>Select a journal entry or create a new one.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// --- Editor ---
function JournalEditor({ initial, onSave, onCancel }: {
  initial?: JournalEntry;
  onSave: (data: { title: string; content: string; date?: string; tags?: string[]; mood?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split('T')[0]);
  const [tagsStr, setTagsStr] = useState(initial?.tags?.join(', ') ?? '');
  const [mood, setMood] = useState(initial?.mood ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    const tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
    await onSave({ title: title.trim(), content: content.trim(), date, tags, mood: mood.trim() || undefined });
    setSaving(false);
  };

  return (
    <div className="journal-editor">
      <h3>{initial ? 'Edit Entry' : 'New Journal Entry'}</h3>
      <div className="journal-editor-fields">
        <input
          className="journal-editor-title"
          placeholder="Title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <div className="journal-editor-row">
          <input type="date" className="journal-editor-date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="journal-editor-mood" placeholder="Mood (optional)" value={mood} onChange={(e) => setMood(e.target.value)} />
        </div>
        <input
          className="journal-editor-tags"
          placeholder="Tags (comma-separated)"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
        />
        <textarea
          className="journal-editor-content"
          placeholder="Write your journal entry (supports markdown)..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
        />
      </div>
      <div className="journal-editor-actions">
        <button className="btn-primary btn-sm" onClick={handleSave} disabled={saving || !title.trim() || !content.trim()}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
