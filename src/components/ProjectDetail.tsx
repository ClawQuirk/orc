import { useState, useEffect, useCallback } from 'react';
import { projectsApi } from '../lib/projects-api';
import type { ProjectDetail as ProjectDetailType, Epic, GoogleLink, Recommendation } from '../lib/projects-api';

interface Props {
  projectId: string;
  onBack: () => void;
}

export default function ProjectDetail({ projectId, onBack }: Props) {
  const [project, setProject] = useState<ProjectDetailType | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    projectsApi.get(projectId)
      .then((data) => setProject(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading || !project) return <div className="page-content"><div className="page-loading">Loading...</div></div>;

  return (
    <div className="page-content">
      <button className="btn-ghost btn-sm project-back-btn" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        Projects
      </button>

      <ProjectHeader project={project} onUpdate={refresh} />
      <SummarySection project={project} onUpdate={refresh} />
      <LinksSection project={project} onUpdate={refresh} />
      <RecommendationsSection project={project} onUpdate={refresh} />
      <EpicsSection project={project} onUpdate={refresh} />
    </div>
  );
}

// --- Header ---
function ProjectHeader({ project, onUpdate }: { project: ProjectDetailType; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [effort, setEffort] = useState(project.effort_estimate || '');

  const save = async () => {
    await projectsApi.update(project.id, { name, effort_estimate: effort || null } as any);
    setEditing(false);
    onUpdate();
  };

  return (
    <div className="project-detail-header">
      {editing ? (
        <div className="project-edit-header">
          <input className="project-name-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input className="project-effort-input" value={effort} onChange={(e) => setEffort(e.target.value)} placeholder="Effort estimate..." />
          <button className="btn-primary btn-sm" onClick={save}>Save</button>
          <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div className="project-header-display">
          <h2 onClick={() => setEditing(true)} title="Click to edit">{project.name}</h2>
          <div className="project-header-meta">
            <select
              className="project-status-select"
              value={project.status}
              onChange={async (e) => { await projectsApi.update(project.id, { status: e.target.value } as any); onUpdate(); }}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
            {project.effort_estimate && <span className="project-effort-badge">{project.effort_estimate}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Summary ---
function SummarySection({ project, onUpdate }: { project: ProjectDetailType; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.summary || '');

  const save = async () => {
    await projectsApi.update(project.id, { summary: value } as any);
    setEditing(false);
    onUpdate();
  };

  return (
    <div className="project-section">
      <div className="project-section-header">
        <span className="project-section-label">Summary</span>
        {!editing && <button className="btn-ghost btn-xs" onClick={() => setEditing(true)}>Edit</button>}
      </div>
      {editing ? (
        <div className="project-summary-edit">
          <textarea className="project-summary-textarea" value={value} onChange={(e) => setValue(e.target.value)} rows={4} autoFocus />
          <div className="project-edit-actions">
            <button className="btn-primary btn-sm" onClick={save}>Save</button>
            <button className="btn-ghost btn-sm" onClick={() => { setEditing(false); setValue(project.summary || ''); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="project-summary-text">{project.summary || 'No summary yet. Click Edit to add one.'}</p>
      )}
    </div>
  );
}

// --- Links ---
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  type: string;
  modifiedTime: string;
}

function LinksSection({ project, onUpdate }: { project: ProjectDetailType; onUpdate: () => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [linkType, setLinkType] = useState<GoogleLink['type']>('doc');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [driveQuery, setDriveQuery] = useState('');
  const [driveResults, setDriveResults] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);

  const searchDrive = async (q?: string) => {
    setDriveLoading(true);
    try {
      const res = await fetch(`/api/drive/search?q=${encodeURIComponent(q || driveQuery)}`);
      const data = await res.json();
      setDriveResults(data.files ?? []);
    } catch {
      setDriveResults([]);
    } finally {
      setDriveLoading(false);
    }
  };

  const openPicker = () => {
    setPickerOpen(true);
    searchDrive(''); // Load recent files immediately
  };

  const selectDriveFile = async (file: DriveFile) => {
    const links = [...project.google_links, { type: file.type as GoogleLink['type'], url: file.url, title: file.name }];
    await projectsApi.update(project.id, { google_links: links } as any);
    setPickerOpen(false);
    setDriveQuery('');
    setDriveResults([]);
    onUpdate();
  };

  const addManualLink = async () => {
    if (!linkUrl.trim() || !linkTitle.trim()) return;
    const links = [...project.google_links, { type: linkType, url: linkUrl.trim(), title: linkTitle.trim() }];
    await projectsApi.update(project.id, { google_links: links } as any);
    setManualOpen(false);
    setLinkUrl('');
    setLinkTitle('');
    onUpdate();
  };

  const removeLink = async (index: number) => {
    const links = project.google_links.filter((_, i) => i !== index);
    await projectsApi.update(project.id, { google_links: links } as any);
    onUpdate();
  };

  return (
    <div className="project-section">
      <div className="project-section-header">
        <span className="project-section-label">Links</span>
        <div className="project-section-actions">
          <button className="btn-ghost btn-xs" onClick={openPicker}>Browse Drive</button>
          <button className="btn-ghost btn-xs" onClick={() => setManualOpen(true)}>Add URL</button>
        </div>
      </div>
      {project.google_links.map((link, i) => (
        <div key={i} className="project-link-row">
          <span className="project-link-type">{link.type}</span>
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="project-link-title">{link.title}</a>
          <button className="btn-icon-xs" onClick={() => removeLink(i)} title="Remove">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      ))}
      {manualOpen && (
        <div className="project-link-form">
          <select className="project-link-type-select" value={linkType} onChange={(e) => setLinkType(e.target.value as GoogleLink['type'])}>
            <option value="doc">Doc</option>
            <option value="sheet">Sheet</option>
            <option value="slides">Slides</option>
            <option value="contacts">Contacts</option>
          </select>
          <input className="project-link-input" placeholder="Title" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} autoFocus />
          <input className="project-link-input" placeholder="URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <button className="btn-primary btn-xs" onClick={addManualLink}>Add</button>
          <button className="btn-ghost btn-xs" onClick={() => setManualOpen(false)}>Cancel</button>
        </div>
      )}
      {project.google_links.length === 0 && !manualOpen && !pickerOpen && (
        <p className="project-empty-hint">No links yet.</p>
      )}

      {pickerOpen && (
        <div className="settings-overlay" onClick={() => setPickerOpen(false)}>
          <div className="drive-picker" onClick={(e) => e.stopPropagation()}>
            <div className="drive-picker-header">
              <h4>Browse Google Drive</h4>
              <button className="btn-icon-xs" onClick={() => setPickerOpen(false)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="drive-picker-search">
              <input
                type="text"
                placeholder="Search files..."
                value={driveQuery}
                onChange={(e) => setDriveQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchDrive(); }}
                autoFocus
              />
              <button className="btn-primary btn-sm" onClick={() => searchDrive()}>Search</button>
            </div>
            <div className="drive-picker-results">
              {driveLoading ? (
                <div className="drive-picker-loading">Searching...</div>
              ) : driveResults.length === 0 ? (
                <div className="drive-picker-empty">No files found. Try a different search.</div>
              ) : (
                driveResults.map((file) => (
                  <button key={file.id} className="drive-file-row" onClick={() => selectDriveFile(file)}>
                    <span className={`drive-file-icon type-${file.type}`}>
                      {file.type === 'doc' ? 'D' : file.type === 'sheet' ? 'S' : 'P'}
                    </span>
                    <span className="drive-file-name">{file.name}</span>
                    <span className="drive-file-date">{new Date(file.modifiedTime).toLocaleDateString()}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Recommendations ---
function RecommendationsSection({ project, onUpdate }: { project: ProjectDetailType; onUpdate: () => void }) {
  const pending = project.recommendations.filter((r) => r.status === 'pending');
  const accepted = project.recommendations.filter((r) => r.status === 'accepted');

  const handleDecision = async (rec: Recommendation, status: 'accepted' | 'declined') => {
    await projectsApi.updateRecommendation(project.id, rec.id, status);
    onUpdate();
  };

  if (pending.length === 0 && accepted.length === 0) return null;

  return (
    <div className="project-section">
      <div className="project-section-header">
        <span className="project-section-label">AI Recommendations</span>
      </div>
      {pending.map((rec) => (
        <div key={rec.id} className="project-rec-row pending">
          <span className="project-rec-text">{rec.text}</span>
          <button className="btn-primary btn-xs" onClick={() => handleDecision(rec, 'accepted')}>Accept</button>
          <button className="btn-ghost btn-xs" onClick={() => handleDecision(rec, 'declined')}>Decline</button>
        </div>
      ))}
      {accepted.map((rec) => (
        <div key={rec.id} className="project-rec-row accepted">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
          <span className="project-rec-text">{rec.text}</span>
        </div>
      ))}
    </div>
  );
}

// --- Epics & Tasks ---
function EpicsSection({ project, onUpdate }: { project: ProjectDetailType; onUpdate: () => void }) {
  const [addingEpic, setAddingEpic] = useState(false);
  const [epicTitle, setEpicTitle] = useState('');
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set(project.epics.map((e) => e.id)));

  const addEpic = async () => {
    if (!epicTitle.trim()) return;
    await projectsApi.addEpic(project.id, { title: epicTitle.trim() });
    setEpicTitle('');
    setAddingEpic(false);
    onUpdate();
  };

  const toggleEpic = (id: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="project-section">
      <div className="project-section-header">
        <span className="project-section-label">Epics & Tasks</span>
        {!addingEpic && <button className="btn-ghost btn-xs" onClick={() => setAddingEpic(true)}>Add Epic</button>}
      </div>

      {addingEpic && (
        <div className="project-inline-form">
          <input placeholder="Epic title..." value={epicTitle} onChange={(e) => setEpicTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addEpic(); if (e.key === 'Escape') setAddingEpic(false); }} autoFocus />
          <button className="btn-primary btn-xs" onClick={addEpic}>Add</button>
          <button className="btn-ghost btn-xs" onClick={() => setAddingEpic(false)}>Cancel</button>
        </div>
      )}

      {project.epics.map((epic) => (
        <EpicCard
          key={epic.id}
          epic={epic}
          projectId={project.id}
          expanded={expandedEpics.has(epic.id)}
          onToggle={() => toggleEpic(epic.id)}
          onUpdate={onUpdate}
        />
      ))}

      {project.epics.length === 0 && !addingEpic && (
        <p className="project-empty-hint">No epics yet. Add one to start breaking down work.</p>
      )}
    </div>
  );
}

function EpicCard({ epic, projectId, expanded, onToggle, onUpdate }: {
  epic: Epic; projectId: string; expanded: boolean; onToggle: () => void; onUpdate: () => void;
}) {
  const [addingTask, setAddingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');

  const addTask = async () => {
    if (!taskTitle.trim()) return;
    await projectsApi.addTask(projectId, { epicId: epic.id, title: taskTitle.trim() });
    setTaskTitle('');
    setAddingTask(false);
    onUpdate();
  };

  const cycleStatus = async () => {
    const next = epic.status === 'todo' ? 'in_progress' : epic.status === 'in_progress' ? 'done' : 'todo';
    await projectsApi.updateEpic(projectId, epic.id, { status: next } as any);
    onUpdate();
  };

  const removeEpic = async () => {
    await projectsApi.removeEpic(projectId, epic.id);
    onUpdate();
  };

  const doneCount = epic.tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="epic-card">
      <div className="epic-header" onClick={onToggle}>
        <svg className={`event-chevron ${expanded ? 'open' : ''}`} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
        <span className={`epic-status-dot status-${epic.status}`} onClick={(e) => { e.stopPropagation(); cycleStatus(); }} title={`Status: ${epic.status} (click to cycle)`} />
        <span className="epic-title">{epic.title}</span>
        {epic.effort_estimate && <span className="epic-effort">{epic.effort_estimate}</span>}
        <span className="epic-progress">{doneCount}/{epic.tasks.length}</span>
        <button className="btn-icon-xs epic-remove" onClick={(e) => { e.stopPropagation(); removeEpic(); }} title="Remove epic">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {expanded && (
        <div className="epic-body">
          {epic.tasks.map((task) => (
            <TaskItem key={task.id} task={task} projectId={projectId} onUpdate={onUpdate} />
          ))}

          {addingTask ? (
            <div className="project-inline-form task-add-form">
              <input placeholder="Task title..." value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAddingTask(false); }} autoFocus />
              <button className="btn-primary btn-xs" onClick={addTask}>Add</button>
              <button className="btn-ghost btn-xs" onClick={() => setAddingTask(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn-ghost btn-xs task-add-btn" onClick={() => setAddingTask(true)}>+ Add task</button>
          )}
        </div>
      )}
    </div>
  );
}

function TaskItem({ task, projectId, onUpdate }: { task: any; projectId: string; onUpdate: () => void }) {
  const toggleDone = async () => {
    const next = task.status === 'done' ? 'todo' : 'done';
    await projectsApi.updateTask(projectId, task.id, { status: next } as any);
    onUpdate();
  };

  const remove = async () => {
    await projectsApi.removeTask(projectId, task.id);
    onUpdate();
  };

  return (
    <div className={`task-row ${task.status === 'done' ? 'task-done' : ''}`}>
      <button className="task-checkbox" onClick={toggleDone}>
        {task.status === 'done' ? (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
        )}
      </button>
      <span className="task-title">{task.title}</span>
      {task.effort_estimate && <span className="task-effort">{task.effort_estimate}</span>}
      <button className="btn-icon-xs task-remove" onClick={remove} title="Remove task">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  );
}
