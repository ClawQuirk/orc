export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  summary: string | null;
  content: string;
  tags: string[];
  source: 'manual' | 'auto' | 'mcp';
  mood: string | null;
  created_at: string;
  updated_at: string;
}

export type JournalIndex = Pick<JournalEntry, 'id' | 'date' | 'title' | 'tags' | 'source' | 'mood' | 'created_at'>;
export type JournalSummary = JournalIndex & { summary: string | null };

export interface DateCount {
  date: string;
  count: number;
}

export interface SearchResult extends JournalSummary {
  snippet: string;
}

const json = (r: Response) => r.json();
const headers = { 'Content-Type': 'application/json' };

export const journalApi = {
  dates: (): Promise<{ dates: DateCount[] }> =>
    fetch('/api/journal/dates').then(json),

  list: (params?: { from?: string; to?: string; tag?: string; source?: string }): Promise<{ entries: JournalIndex[] }> => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.source) qs.set('source', params.source);
    return fetch(`/api/journal?${qs}`).then(json);
  },

  summaries: (params?: { from?: string; to?: string }): Promise<{ entries: JournalSummary[] }> => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    return fetch(`/api/journal/summaries?${qs}`).then(json);
  },

  get: (id: string): Promise<JournalEntry> =>
    fetch(`/api/journal/${id}`).then(json),

  create: (data: { title: string; content: string; date?: string; tags?: string[]; summary?: string; source?: string; mood?: string }): Promise<{ id: string }> =>
    fetch('/api/journal', { method: 'POST', headers, body: JSON.stringify(data) }).then(json),

  update: (id: string, data: Partial<JournalEntry>): Promise<void> =>
    fetch(`/api/journal/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) }).then(() => {}),

  remove: (id: string): Promise<void> =>
    fetch(`/api/journal/${id}`, { method: 'DELETE' }).then(() => {}),

  search: (q: string, limit?: number): Promise<{ entries: SearchResult[] }> =>
    fetch(`/api/journal/search?q=${encodeURIComponent(q)}&limit=${limit || 20}`).then(json),
};
