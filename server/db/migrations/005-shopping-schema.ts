import type Database from 'better-sqlite3-multiple-ciphers';
import type { Migration } from '../migrate.js';

export const migration: Migration = {
  id: 5,
  name: 'shopping-schema',
  up(db: Database.Database) {
    // Shopping learning entries (user preferences, brand notes, value tips)
    db.exec(`
      CREATE TABLE shopping_learning (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        merchant TEXT,
        category TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`CREATE INDEX idx_shopping_learning_merchant ON shopping_learning(merchant)`);
    db.exec(`CREATE INDEX idx_shopping_learning_category ON shopping_learning(category)`);

    // FTS5 for full-text search over learnings
    db.exec(`
      CREATE VIRTUAL TABLE shopping_learning_fts USING fts5(
        title, content, tags,
        content=shopping_learning,
        content_rowid=rowid
      )
    `);

    // Triggers to keep FTS in sync (same pattern as journal_fts)
    db.exec(`
      CREATE TRIGGER shopping_learning_fts_insert AFTER INSERT ON shopping_learning BEGIN
        INSERT INTO shopping_learning_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER shopping_learning_fts_delete AFTER DELETE ON shopping_learning BEGIN
        INSERT INTO shopping_learning_fts(shopping_learning_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER shopping_learning_fts_update AFTER UPDATE ON shopping_learning BEGIN
        INSERT INTO shopping_learning_fts(shopping_learning_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
        INSERT INTO shopping_learning_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
      END
    `);

    // Short-TTL cache for search results (avoid re-scraping same query within minutes)
    db.exec(`
      CREATE TABLE shopping_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        merchant TEXT NOT NULL,
        results TEXT NOT NULL,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(query, merchant)
      )
    `);

    db.exec(`CREATE INDEX idx_shopping_cache_fetched ON shopping_cache(fetched_at)`);
  },
};
