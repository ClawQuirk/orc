import type Database from 'better-sqlite3-multiple-ciphers';
import type { Migration } from '../migrate.js';

export const migration: Migration = {
  id: 7,
  name: 'workspaces',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('home', 'business')),
        description TEXT,
        icon TEXT,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`CREATE INDEX idx_workspaces_type ON workspaces(type)`);
    db.exec(`CREATE INDEX idx_workspaces_sort ON workspaces(sort_order)`);

    db.prepare(
      `INSERT INTO workspaces (id, name, type) VALUES ('home', 'Home', 'home')`
    ).run();

    // SQLite limitation: ALTER TABLE ADD COLUMN cannot combine REFERENCES with a
    // non-NULL default. Workaround: add the column without the FK declaration. The
    // workspace_id values are still validated at the application layer via
    // workspace-helper.ts; orphaned rows would also be filtered out by every
    // scoped query's WHERE workspace_id = ? clause.
    db.exec(
      `ALTER TABLE projects ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'home'`
    );
    db.exec(
      `ALTER TABLE journal_entries ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'home'`
    );
    db.exec(
      `ALTER TABLE brainstorm_boards ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'home'`
    );
    db.exec(
      `ALTER TABLE shopping_learning ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'home'`
    );

    db.exec(`CREATE INDEX idx_projects_workspace ON projects(workspace_id)`);
    db.exec(`CREATE INDEX idx_journal_workspace ON journal_entries(workspace_id)`);
    db.exec(`CREATE INDEX idx_brainstorm_workspace ON brainstorm_boards(workspace_id)`);
    db.exec(`CREATE INDEX idx_shopping_learning_workspace ON shopping_learning(workspace_id)`);
  },
};
