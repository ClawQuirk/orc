import type Database from 'better-sqlite3-multiple-ciphers';

export interface Migration {
  id: number;
  name: string;
  up(db: Database.Database): void;
}

// Migrations are imported explicitly and listed in order
import { migration as m001 } from './migrations/001-initial-schema.js';
import { migration as m002 } from './migrations/002-projects-schema.js';
import { migration as m003 } from './migrations/003-journal-schema.js';
import { migration as m004 } from './migrations/004-financial-schema.js';
import { migration as m005 } from './migrations/005-shopping-schema.js';
import { migration as m006 } from './migrations/006-brainstorm-schema.js';
import { migration as m007 } from './migrations/007-workspaces.js';

const migrations: Migration[] = [m001, m002, m003, m004, m005, m006, m007];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as Array<{ id: number }>).map((r) => r.id)
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    console.log(`[db] Applying migration ${migration.id}: ${migration.name}`);
    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
    })();
  }
}
