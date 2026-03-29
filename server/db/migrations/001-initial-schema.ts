import type Database from 'better-sqlite3-multiple-ciphers';
import type { Migration } from '../migrate.js';

export const migration: Migration = {
  id: 1,
  name: 'initial-schema',
  up(db: Database.Database) {
    // Chat messages
    db.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        metadata TEXT,
        conversation_id TEXT NOT NULL DEFAULT 'default'
      )
    `);
    db.exec(`CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at)`);

    // Contacts cache
    db.exec(`
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        name TEXT,
        email TEXT,
        phone TEXT,
        organization TEXT,
        raw_data TEXT,
        synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(plugin_id, source_id)
      )
    `);
    db.exec(`CREATE INDEX idx_contacts_email ON contacts(email)`);
    db.exec(`CREATE INDEX idx_contacts_name ON contacts(name)`);

    // Email cache
    db.exec(`
      CREATE TABLE emails (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        thread_id TEXT,
        subject TEXT,
        sender TEXT,
        recipients TEXT,
        snippet TEXT,
        body_text TEXT,
        body_html TEXT,
        date TEXT,
        labels TEXT,
        is_read INTEGER DEFAULT 0,
        has_attachments INTEGER DEFAULT 0,
        raw_data TEXT,
        synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(plugin_id, source_id)
      )
    `);
    db.exec(`CREATE INDEX idx_emails_date ON emails(date DESC)`);
    db.exec(`CREATE INDEX idx_emails_thread ON emails(thread_id)`);
    db.exec(`CREATE INDEX idx_emails_sender ON emails(sender)`);

    // Calendar events cache
    db.exec(`
      CREATE TABLE calendar_events (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        calendar_id TEXT,
        title TEXT,
        description TEXT,
        location TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_all_day INTEGER DEFAULT 0,
        recurrence TEXT,
        attendees TEXT,
        status TEXT,
        raw_data TEXT,
        synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(plugin_id, source_id)
      )
    `);
    db.exec(`CREATE INDEX idx_events_time ON calendar_events(start_time, end_time)`);
    db.exec(`CREATE INDEX idx_events_calendar ON calendar_events(calendar_id)`);

    // Documents index
    db.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        title TEXT,
        mime_type TEXT,
        url TEXT,
        parent_folder_id TEXT,
        owner TEXT,
        modified_at TEXT,
        content_text TEXT,
        raw_data TEXT,
        synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(plugin_id, source_id)
      )
    `);
    db.exec(`CREATE INDEX idx_documents_title ON documents(title)`);
    db.exec(`CREATE INDEX idx_documents_modified ON documents(modified_at DESC)`);

    // Embeddings metadata (vector data will use sqlite-vec in Phase 5)
    db.exec(`
      CREATE TABLE embeddings (
        id TEXT PRIMARY KEY,
        source_table TEXT NOT NULL,
        source_id TEXT NOT NULL,
        text_content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(source_table, source_id)
      )
    `);

    // Plugin sync state
    db.exec(`
      CREATE TABLE sync_state (
        plugin_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        last_sync_token TEXT,
        last_synced_at TEXT,
        PRIMARY KEY (plugin_id, resource_type)
      )
    `);

    // Widget configuration
    db.exec(`
      CREATE TABLE widget_config (
        widget_id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        is_pinned INTEGER DEFAULT 0,
        grid_x INTEGER DEFAULT 0,
        grid_y INTEGER DEFAULT 0,
        grid_w INTEGER DEFAULT 2,
        grid_h INTEGER DEFAULT 2,
        settings TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  },
};
