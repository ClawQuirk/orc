import type Database from 'better-sqlite3-multiple-ciphers';
import type { Migration } from '../migrate.js';

export const migration: Migration = {
  id: 2,
  name: 'projects-schema',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        summary TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
        google_links TEXT DEFAULT '[]',
        effort_estimate TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE TABLE epics (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        effort_estimate TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_epics_project ON epics(project_id, sort_order)`);

    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        epic_id TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        effort_estimate TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_tasks_epic ON tasks(epic_id, sort_order)`);
    db.exec(`CREATE INDEX idx_tasks_project ON tasks(project_id)`);

    db.exec(`
      CREATE TABLE project_meetings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        calendar_event_id TEXT NOT NULL,
        label TEXT,
        UNIQUE(project_id, calendar_event_id)
      )
    `);

    db.exec(`
      CREATE TABLE project_recommendations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_recommendations_project ON project_recommendations(project_id)`);
  },
};
