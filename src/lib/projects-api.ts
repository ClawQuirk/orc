export interface GoogleLink {
  type: 'doc' | 'sheet' | 'slides' | 'contacts';
  url: string;
  title: string;
}

export interface Recommendation {
  id: string;
  project_id: string;
  text: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

export interface Task {
  id: string;
  epic_id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  sort_order: number;
  effort_estimate: string | null;
}

export interface Epic {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  sort_order: number;
  effort_estimate: string | null;
  tasks: Task[];
}

export interface ProjectMeeting {
  id: string;
  project_id: string;
  calendar_event_id: string;
  label: string | null;
}

export interface Project {
  id: string;
  name: string;
  summary: string | null;
  status: 'active' | 'paused' | 'completed' | 'archived';
  google_links: GoogleLink[];
  effort_estimate: string | null;
  created_at: string;
  updated_at: string;
  epicCount?: number;
  taskCount?: number;
  doneCount?: number;
}

export interface ProjectDetail extends Project {
  epics: Epic[];
  meetings: ProjectMeeting[];
  recommendations: Recommendation[];
}

const json = (r: Response) => r.json();
const headers = { 'Content-Type': 'application/json' };

export const projectsApi = {
  list: (status?: string): Promise<{ projects: Project[] }> =>
    fetch(`/api/projects${status ? `?status=${status}` : ''}`).then(json),

  get: (id: string): Promise<ProjectDetail> =>
    fetch(`/api/projects/${id}`).then(json),

  create: (data: { name: string; summary?: string; effort_estimate?: string }): Promise<Project> =>
    fetch('/api/projects', { method: 'POST', headers, body: JSON.stringify(data) }).then(json),

  update: (id: string, data: Partial<Project>): Promise<void> =>
    fetch(`/api/projects/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) }).then(() => {}),

  remove: (id: string): Promise<void> =>
    fetch(`/api/projects/${id}`, { method: 'DELETE' }).then(() => {}),

  addEpic: (projectId: string, data: { title: string; description?: string; effort_estimate?: string }): Promise<{ id: string }> =>
    fetch(`/api/projects/${projectId}/epics`, { method: 'POST', headers, body: JSON.stringify(data) }).then(json),

  updateEpic: (projectId: string, epicId: string, data: Partial<Epic>): Promise<void> =>
    fetch(`/api/projects/${projectId}/epics/${epicId}`, { method: 'PUT', headers, body: JSON.stringify(data) }).then(() => {}),

  removeEpic: (projectId: string, epicId: string): Promise<void> =>
    fetch(`/api/projects/${projectId}/epics/${epicId}`, { method: 'DELETE' }).then(() => {}),

  addTask: (projectId: string, data: { epicId: string; title: string; description?: string; effort_estimate?: string }): Promise<{ id: string }> =>
    fetch(`/api/projects/${projectId}/tasks`, { method: 'POST', headers, body: JSON.stringify(data) }).then(json),

  updateTask: (projectId: string, taskId: string, data: Partial<Task>): Promise<void> =>
    fetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: 'PUT', headers, body: JSON.stringify(data) }).then(() => {}),

  removeTask: (projectId: string, taskId: string): Promise<void> =>
    fetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' }).then(() => {}),

  addMeeting: (projectId: string, calendarEventId: string, label?: string): Promise<{ id: string }> =>
    fetch(`/api/projects/${projectId}/meetings`, { method: 'POST', headers, body: JSON.stringify({ calendarEventId, label }) }).then(json),

  removeMeeting: (projectId: string, meetingId: string): Promise<void> =>
    fetch(`/api/projects/${projectId}/meetings/${meetingId}`, { method: 'DELETE' }).then(() => {}),

  addRecommendation: (projectId: string, text: string): Promise<{ id: string }> =>
    fetch(`/api/projects/${projectId}/recommendations`, { method: 'POST', headers, body: JSON.stringify({ text }) }).then(json),

  updateRecommendation: (projectId: string, recId: string, status: 'accepted' | 'declined'): Promise<void> =>
    fetch(`/api/projects/${projectId}/recommendations/${recId}`, { method: 'PUT', headers, body: JSON.stringify({ status }) }).then(() => {}),
};
