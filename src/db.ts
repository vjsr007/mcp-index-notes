import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import type { Note } from './types.js';
import { logger } from './logger.js';

export interface DBOptions {
  filePath?: string;
}

export class NotesDB {
  private readonly db: any;
  private readonly dbPath: string;

  constructor(options: DBOptions = {}) {
    this.dbPath = options.filePath || path.resolve(process.cwd(), 'data', 'notes.db');
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    logger.info({ dbPath: this.dbPath }, 'Opening SQLite database');
    // Lazy-load optional native module better-sqlite3
    try {
      const require = createRequire(import.meta.url);
      const Database = require('better-sqlite3');
      this.db = new Database(this.dbPath);
    } catch (e) {
      logger.error({ e }, 'Failed to load better-sqlite3');
      throw e;
    }
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.migrate();
  }

  private migrate() {
    logger.info('Running DB migrations');
    const createNotes = `
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`;

    const createIndexKey = `CREATE INDEX IF NOT EXISTS idx_notes_key ON notes(key);`;

    const createFts = `
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        content, key, tags, metadata, content='notes', content_rowid='id'
      );`;

    const createFtsTriggers = `
      CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(rowid, content, key, tags, metadata)
        VALUES (new.id, new.content, new.key, new.tags, new.metadata);
      END;
      CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.id, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.id, old.content);
        INSERT INTO notes_fts(rowid, content, key, tags, metadata)
        VALUES (new.id, new.content, new.key, new.tags, new.metadata);
      END;`;

    this.db.exec([createNotes, createIndexKey, createFts, createFtsTriggers].join('\n'));
  }

  upsert(note: Note & { id?: number }): number {
    logger.debug({ note }, 'Upserting note');
    if (note.id) {
      const stmt = this.db.prepare(
        `UPDATE notes SET key=@key, content=@content, tags=@tags, metadata=@metadata, updated_at=datetime('now') WHERE id=@id`
      );
      const info = stmt.run({
        id: note.id,
        key: note.key,
        content: note.content,
        tags: JSON.stringify(note.tags ?? []),
        metadata: JSON.stringify(note.metadata ?? {}),
      });
      if (info.changes === 0) {
        throw new Error(`Note with id ${note.id} not found`);
      }
      return note.id;
    } else {
      const stmt = this.db.prepare(
        `INSERT INTO notes (key, content, tags, metadata) VALUES (@key, @content, @tags, @metadata)`
      );
      const info = stmt.run({
        key: note.key,
        content: note.content,
        tags: JSON.stringify(note.tags ?? []),
        metadata: JSON.stringify(note.metadata ?? {}),
      });
      return Number(info.lastInsertRowid);
    }
  }

  getById(id: number) {
    const row = this.db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id);
    return row ? this.rowToNote(row) : null;
  }

  getByKey(key: string, limit = 50) {
    const rows = this.db
      .prepare(`SELECT * FROM notes WHERE key = ? ORDER BY updated_at DESC LIMIT ?`)
      .all(key, limit) as any[];
    return rows.map((r: any) => this.rowToNote(r));
  }

  search(text: string, limit = 10) {
    logger.debug({ text, limit }, 'FTS search');
    const rows = this.db
      .prepare(
        `SELECT n.* FROM notes_fts f JOIN notes n ON n.id = f.rowid WHERE notes_fts MATCH ? ORDER BY rank LIMIT ?`
      )
      .all(text, limit) as any[];
    return rows.map((r: any) => this.rowToNote(r));
  }

  listKeys(limit = 100) {
    const rows = this.db.prepare(`SELECT key, COUNT(*) as count FROM notes GROUP BY key ORDER BY count DESC, key ASC LIMIT ?`).all(limit);
    return rows as Array<{ key: string; count: number }>;
  }

  deleteById(id: number) {
    logger.warn({ id }, 'Deleting note by id');
    const info = this.db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
    return info.changes > 0;
  }

  deleteByKey(key: string) {
    logger.warn({ key }, 'Deleting notes by key');
    const info = this.db.prepare(`DELETE FROM notes WHERE key = ?`).run(key);
    return info.changes;
  }

  exportAll() {
    logger.info('Exporting all notes');
    const rows = this.db.prepare(`SELECT * FROM notes ORDER BY updated_at DESC`).all() as any[];
    return rows.map((r: any) => this.rowToNote(r));
  }

  importMany(notes: Note[]) {
    logger.info({ count: notes.length }, 'Importing notes');
    const tx = this.db.transaction((items: Note[]) => {
      const insert = this.db.prepare(`INSERT INTO notes (key, content, tags, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const n of items) {
        insert.run(
          n.key,
          n.content,
          JSON.stringify(n.tags ?? []),
          JSON.stringify(n.metadata ?? {}),
          n.created_at ?? new Date().toISOString(),
          n.updated_at ?? new Date().toISOString()
        );
      }
    });
    tx(notes);
  }

  private rowToNote(row: any): Note {
    return {
      id: row.id,
      key: row.key,
      content: row.content,
      tags: JSON.parse(row.tags || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
