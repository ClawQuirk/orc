import type Database from 'better-sqlite3-multiple-ciphers';
import type { Migration } from '../migrate.js';

export const migration: Migration = {
  id: 6,
  name: 'brainstorm-schema',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE brainstorm_boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE TABLE brainstorm_nodes (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES brainstorm_boards(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'custom',
        position_x REAL NOT NULL DEFAULT 0,
        position_y REAL NOT NULL DEFAULT 0,
        width REAL,
        height REAL,
        data TEXT DEFAULT '{}',
        style TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE TABLE brainstorm_edges (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES brainstorm_boards(id) ON DELETE CASCADE,
        source TEXT NOT NULL REFERENCES brainstorm_nodes(id) ON DELETE CASCADE,
        target TEXT NOT NULL REFERENCES brainstorm_nodes(id) ON DELETE CASCADE,
        source_handle TEXT,
        target_handle TEXT,
        type TEXT,
        label TEXT,
        data TEXT,
        style TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`CREATE INDEX idx_brainstorm_nodes_board ON brainstorm_nodes(board_id)`);
    db.exec(`CREATE INDEX idx_brainstorm_edges_board ON brainstorm_edges(board_id)`);
    db.exec(`CREATE INDEX idx_brainstorm_edges_source ON brainstorm_edges(source)`);
    db.exec(`CREATE INDEX idx_brainstorm_edges_target ON brainstorm_edges(target)`);
  },
};
