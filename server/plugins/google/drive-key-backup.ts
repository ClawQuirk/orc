import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { Readable } from 'node:stream';
import { createReadStream, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const BACKUP_FILENAME = 'orc-db-key';
const DB_BACKUP_FILENAME = 'orc-db-backup';

/**
 * Back up the DB encryption key to Google Drive's appDataFolder.
 * The appDataFolder is invisible to the user and only accessible by this app's OAuth client ID.
 */
export async function backupKeyToDrive(auth: OAuth2Client, key: string): Promise<void> {
  const drive = google.drive({ version: 'v3', auth });

  // Check if backup already exists
  const existing = await drive.files.list({
    spaces: 'appDataFolder',
    q: `name = '${BACKUP_FILENAME}'`,
    fields: 'files(id)',
    pageSize: 1,
  });

  const content = Readable.from([key]);

  if (existing.data.files?.length && existing.data.files[0].id) {
    // Update existing file
    await drive.files.update({
      fileId: existing.data.files[0].id,
      media: { mimeType: 'text/plain', body: content },
    });
  } else {
    // Create new file
    await drive.files.create({
      requestBody: {
        name: BACKUP_FILENAME,
        parents: ['appDataFolder'],
      },
      media: { mimeType: 'text/plain', body: content },
      fields: 'id',
    });
  }
}

/**
 * Restore the DB encryption key from Google Drive's appDataFolder.
 * Returns the key string, or null if no backup exists.
 */
export async function restoreKeyFromDrive(auth: OAuth2Client): Promise<string | null> {
  const drive = google.drive({ version: 'v3', auth });

  const listing = await drive.files.list({
    spaces: 'appDataFolder',
    q: `name = '${BACKUP_FILENAME}'`,
    fields: 'files(id)',
    pageSize: 1,
  });

  const fileId = listing.data.files?.[0]?.id;
  if (!fileId) return null;

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' }
  );

  const key = typeof res.data === 'string' ? res.data : String(res.data);
  return key.trim() || null;
}

/**
 * Check if a key backup exists in Google Drive's appDataFolder.
 */
export async function hasKeyBackup(auth: OAuth2Client): Promise<boolean> {
  const drive = google.drive({ version: 'v3', auth });

  const listing = await drive.files.list({
    spaces: 'appDataFolder',
    q: `name = '${BACKUP_FILENAME}'`,
    fields: 'files(id)',
    pageSize: 1,
  });

  return (listing.data.files?.length ?? 0) > 0;
}

// --- Database file backup/restore ---

export interface DbBackupInfo {
  exists: boolean;
  modifiedTime?: string;
  size?: number;
}

/**
 * Back up the encrypted database file to Google Drive's appDataFolder.
 */
export async function backupDbToDrive(auth: OAuth2Client, dbPath: string): Promise<void> {
  const drive = google.drive({ version: 'v3', auth });

  const existing = await drive.files.list({
    spaces: 'appDataFolder',
    q: `name = '${DB_BACKUP_FILENAME}'`,
    fields: 'files(id)',
    pageSize: 1,
  });

  const media = { mimeType: 'application/x-sqlite3', body: createReadStream(dbPath) };

  if (existing.data.files?.length && existing.data.files[0].id) {
    await drive.files.update({
      fileId: existing.data.files[0].id,
      media,
    });
  } else {
    await drive.files.create({
      requestBody: {
        name: DB_BACKUP_FILENAME,
        parents: ['appDataFolder'],
      },
      media,
      fields: 'id',
    });
  }
}

/**
 * Get info about the DB backup in Google Drive.
 */
export async function getDbBackupInfo(auth: OAuth2Client): Promise<DbBackupInfo> {
  const drive = google.drive({ version: 'v3', auth });

  const listing = await drive.files.list({
    spaces: 'appDataFolder',
    q: `name = '${DB_BACKUP_FILENAME}'`,
    fields: 'files(id, modifiedTime, size)',
    pageSize: 1,
  });

  const file = listing.data.files?.[0];
  if (!file) return { exists: false };

  return {
    exists: true,
    modifiedTime: file.modifiedTime ?? undefined,
    size: file.size ? parseInt(file.size, 10) : undefined,
  };
}

/**
 * Restore the database file from Google Drive's appDataFolder.
 * Writes to the specified path (caller should close DB first).
 */
export async function restoreDbFromDrive(auth: OAuth2Client, destPath: string): Promise<boolean> {
  const drive = google.drive({ version: 'v3', auth });

  const listing = await drive.files.list({
    spaces: 'appDataFolder',
    q: `name = '${DB_BACKUP_FILENAME}'`,
    fields: 'files(id)',
    pageSize: 1,
  });

  const fileId = listing.data.files?.[0]?.id;
  if (!fileId) return false;

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  writeFileSync(destPath, Buffer.from(res.data as ArrayBuffer));
  return true;
}
