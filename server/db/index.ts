import Database from 'better-sqlite3-multiple-ciphers';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from './migrate.js';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'orc.db');

let db: Database.Database | null = null;

/**
 * Initialize the database with an optional encryption key.
 * If key is provided, sets PRAGMA key as the first statement (SQLCipher requirement).
 * If an unencrypted DB exists and a key is provided, migrates it to encrypted first.
 */
export function initDatabase(key?: string): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // If a key is provided and an existing DB exists, check if it needs migration
  if (key && fs.existsSync(DB_PATH)) {
    migrateToEncryptedIfNeeded(key);
  }

  db = new Database(DB_PATH);

  // SQLCipher: key MUST be the first pragma after open
  if (key) {
    db.pragma(`key='${key}'`);
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);

  const mode = key ? 'encrypted' : 'unencrypted';
  console.log(`[db] Database initialized (${mode}) at ${DB_PATH}`);
  return db;
}

export function isDatabaseReady(): boolean {
  return db !== null;
}

/**
 * Check if an encrypted DB file exists (cannot be opened without a key).
 * Used during recovery to detect that a key is needed before generating a new one.
 */
export function hasEncryptedDb(): boolean {
  if (!fs.existsSync(DB_PATH)) return false;
  // Try opening without a key — if it fails, the DB is encrypted
  let testDb: Database.Database | null = null;
  try {
    testDb = new Database(DB_PATH);
    testDb.pragma('journal_mode'); // succeeds only if unencrypted
    testDb.close();
    return false; // unencrypted
  } catch {
    testDb?.close();
    return true; // encrypted
  }
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized. Unlock the vault first.');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[db] Database closed');
  }
}

/**
 * Detect if the existing DB is unencrypted and migrate it to encrypted format.
 * Uses PRAGMA rekey after switching from WAL to DELETE journal mode.
 * The original data is preserved — rekey encrypts in-place.
 * A backup of the pre-encryption DB is saved as .unencrypted.bak.
 */
function migrateToEncryptedIfNeeded(key: string): void {
  let plainDb: Database.Database | null = null;
  try {
    plainDb = new Database(DB_PATH);
    // Try reading a pragma — succeeds only if unencrypted
    plainDb.pragma('journal_mode');
  } catch {
    // Already encrypted or corrupt — nothing to migrate
    plainDb?.close();
    return;
  }

  console.log('[db] Detected unencrypted database — migrating to encrypted...');

  // Back up the unencrypted DB before modifying
  const bakPath = DB_PATH + '.unencrypted.bak';
  plainDb.pragma('wal_checkpoint(TRUNCATE)');
  plainDb.close();

  // Copy current DB to backup before in-place encryption
  fs.copyFileSync(DB_PATH, bakPath);
  // Remove WAL/SHM files (already checkpointed)
  for (const ext of ['-wal', '-shm']) {
    if (fs.existsSync(DB_PATH + ext)) {
      fs.unlinkSync(DB_PATH + ext);
    }
  }

  // Reopen and encrypt in-place: must be in DELETE mode for rekey
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = DELETE');
  db.pragma(`rekey='${key}'`);
  db.close();

  console.log(`[db] Database encrypted successfully. Unencrypted backup at ${bakPath}`);
}
