import type Database from 'better-sqlite3-multiple-ciphers';
import type { Migration } from '../migrate.js';

export const migration: Migration = {
  id: 3,
  name: 'journal-schema',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE journal_entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'mcp')),
        mood TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`CREATE INDEX idx_journal_date ON journal_entries(date DESC)`);
    db.exec(`CREATE INDEX idx_journal_source ON journal_entries(source)`);

    // FTS5 virtual table for full-text search
    db.exec(`
      CREATE VIRTUAL TABLE journal_fts USING fts5(
        title, summary, content, tags,
        content=journal_entries,
        content_rowid=rowid
      )
    `);

    // Triggers to keep FTS in sync
    db.exec(`
      CREATE TRIGGER journal_fts_insert AFTER INSERT ON journal_entries BEGIN
        INSERT INTO journal_fts(rowid, title, summary, content, tags)
        VALUES (new.rowid, new.title, new.summary, new.content, new.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER journal_fts_delete AFTER DELETE ON journal_entries BEGIN
        INSERT INTO journal_fts(journal_fts, rowid, title, summary, content, tags)
        VALUES ('delete', old.rowid, old.title, old.summary, old.content, old.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER journal_fts_update AFTER UPDATE ON journal_entries BEGIN
        INSERT INTO journal_fts(journal_fts, rowid, title, summary, content, tags)
        VALUES ('delete', old.rowid, old.title, old.summary, old.content, old.tags);
        INSERT INTO journal_fts(rowid, title, summary, content, tags)
        VALUES (new.rowid, new.title, new.summary, new.content, new.tags);
      END
    `);
  },
};
