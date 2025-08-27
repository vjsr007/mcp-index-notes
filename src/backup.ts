import fs from 'fs';
import path from 'path';
import type { Note } from './types.js';
import { logger } from './logger.js';

export function writeBackup(notes: Note[], dir?: string): string {
  const backupDir = dir || path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const file = path.join(
    backupDir,
    `notes-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  logger.info({ file, count: notes.length }, 'Writing JSON backup');
  fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), notes }, null, 2), 'utf8');
  return file;
}

export function readBackup(file: string): Note[] {
  logger.info({ file }, 'Reading JSON backup');
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw) as { notes?: Note[] } | Note[];
  if (Array.isArray(data)) return data;
  return data.notes ?? [];
}
