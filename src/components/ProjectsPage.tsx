import { useState, useEffect, useCallback } from 'react';
import { projectsApi } from '../lib/projects-api';
import type { Project } from '../lib/projects-api';
import ProjectDetail from './ProjectDetail';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const fetchProjects = useCallback(() => {
    projectsApi.list()
      .then((data) => setProjects(data.projects))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const project = await projectsApi.create({ name: newName.trim() });
    setNewName('');
    setCreating(false);
    setSelectedId(project.id);
    fetchProjects();
  };

  if (selectedId) {
    return (
      <ProjectDetail
        projectId={selectedId}
        onBack={() => { setSelectedId(null); fetchProjects(); }}
      />
    );
  }

  return (
    <div className="page-content">
      <div className="page-header-row">
        <div>
          <h2>Projects</h2>
          <p className="page-description">Manage and track your projects across connected services.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          New Project
        </button>
      </div>

      {creating && (
        <div className="project-create-form">
          <input
            type="text"
            className="project-create-input"
            placeholder="Project name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            autoFocus
          />
          <button className="btn-primary btn-sm" onClick={handleCreate} disabled={!newName.trim()}>Create</button>
          <button className="btn-ghost btn-sm" onClick={() => setCreating(false)}>Cancel</button>
        </div>
      )}

      {loading ? (
        <div className="page-loading">Loading projects...</div>
      ) : projects.length === 0 && !creating ? (
        <div className="page-placeholder">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <h3>No projects yet</h3>
          <p>Create your first project to start organizing work, linking services, and tracking progress.</p>
        </div>
      ) : (
        <div className="project-list">
          {projects.map((p) => (
            <button key={p.id} className="project-card" onClick={() => setSelectedId(p.id)}>
              <div className="project-card-header">
                <span className="project-card-name">{p.name}</span>
                <span className={`project-status-badge status-${p.status}`}>{p.status}</span>
              </div>
              {p.summary && <div className="project-card-summary">{p.summary}</div>}
              <div className="project-card-meta">
                {p.epicCount ? `${p.epicCount} epic${p.epicCount !== 1 ? 's' : ''}` : ''}
                {p.epicCount && p.taskCount ? ' · ' : ''}
                {p.taskCount ? `${p.taskCount} task${p.taskCount !== 1 ? 's' : ''}` : ''}
                {p.effort_estimate ? ` · ${p.effort_estimate}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
