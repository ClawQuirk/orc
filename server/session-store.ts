import fs from 'node:fs';
import path from 'node:path';

export interface SessionData {
  sessionId: string;
  scrollback: string;
  cols: number;
  rows: number;
  createdAt: string;
  lastActive: string;
}

const SESSION_PATH = path.join(process.cwd(), '.terminal-session.json');
const TMP_PATH = SESSION_PATH + '.tmp';

export function load(): SessionData | null {
  try {
    const raw = fs.readFileSync(SESSION_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function save(data: SessionData): void {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(TMP_PATH, json, 'utf-8');
  fs.renameSync(TMP_PATH, SESSION_PATH);
}
