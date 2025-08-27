import fs from 'fs';
import path from 'path';
import MiniSearch from 'minisearch';
import { INotesStore } from './store.js';
import type { Note } from './types.js';
import { logger } from './logger.js';

export interface LiteStoreOptions {
  filePath?: string; // JSON file to persist
}

export class LiteNotesStore implements INotesStore {
  private notes: Note[] = [];
  private nextId = 1;
  private ms: MiniSearch<Note>;
  private file?: string;

  constructor(opts: LiteStoreOptions = {}) {
    this.file = opts.filePath ? path.resolve(opts.filePath) : undefined;
    this.ms = new MiniSearch<Note>({
      idField: 'id',
      fields: ['content', 'key', 'tags', 'metadata'],
      storeFields: ['id', 'key', 'content', 'tags', 'metadata', 'created_at', 'updated_at'],
      searchOptions: { boost: { key: 3, tags: 2 } },
    });
    if (this.file && fs.existsSync(this.file)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Note[];
        this.notes = raw;
        this.nextId = (this.notes.reduce((m, n) => Math.max(m, n.id ?? 0), 0) || 0) + 1;
        this.ms.addAll(this.notes);
        logger.info({ file: this.file, count: this.notes.length }, 'Lite store loaded');
      } catch (e) {
        logger.warn({ e }, 'Failed to load lite store file; starting empty');
      }
    }
  }

  private persist() {
    if (!this.file) return;
    const dir = path.dirname(this.file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.notes, null, 2), 'utf8');
  }

  upsert(note: Note & { id?: number }): number {
    const now = new Date().toISOString();
    if (note.id) {
      const idx = this.notes.findIndex((n) => n.id === note.id);
      if (idx === -1) throw new Error(`Note with id ${note.id} not found`);
      const updated: Note = {
        ...this.notes[idx],
        key: note.key,
        content: note.content,
        tags: note.tags ?? [],
        metadata: note.metadata ?? {},
        updated_at: now,
      };
      this.notes[idx] = updated;
      this.ms.replace(updated);
      this.persist();
      return updated.id!;
    } else {
      const id = this.nextId++;
      const created: Note = {
        id,
        key: note.key,
        content: note.content,
        tags: note.tags ?? [],
        metadata: note.metadata ?? {},
        created_at: now,
        updated_at: now,
      };
      this.notes.push(created);
      this.ms.add(created);
      this.persist();
      return id;
    }
  }

  getById(id: number): Note | null {
    return this.notes.find((n) => n.id === id) ?? null;
  }

  getByKey(key: string, limit = 50): Note[] {
    return this.notes
      .filter((n) => n.key === key)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
      .slice(0, limit);
  }

  search(text: string, limit = 10): Note[] {
    const res = this.ms.search(text, { prefix: true, fuzzy: 0.2 });
    const byId = new Map(this.notes.map((n) => [n.id, n] as const));
    return res.map((r) => byId.get(Number(r.id))!).filter(Boolean).slice(0, limit);
  }

  listKeys(limit = 100): Array<{ key: string; count: number }> {
    const counts: Record<string, number> = {};
    for (const n of this.notes) counts[n.key] = (counts[n.key] || 0) + 1;
    return Object.entries(counts)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, limit);
  }

  deleteById(id: number): boolean {
    const idx = this.notes.findIndex((n) => n.id === id);
    if (idx === -1) return false;
    const [removed] = this.notes.splice(idx, 1);
    if (removed) this.ms.discard(removed);
    this.persist();
    return true;
  }

  deleteByKey(key: string): number {
    const toDelete = this.notes.filter((n) => n.key === key).map((n) => n.id!);
    this.notes = this.notes.filter((n) => n.key !== key);
    for (const id of toDelete) this.ms.discard({ id } as any);
    this.persist();
    return toDelete.length;
  }

  exportAll(): Note[] {
    return [...this.notes].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }

  importMany(notes: Note[]): void {
    for (const n of notes) {
      const id = n.id ?? this.nextId++;
      const normalized: Note = {
        ...n,
        id,
        created_at: n.created_at ?? new Date().toISOString(),
        updated_at: n.updated_at ?? n.created_at ?? new Date().toISOString(),
        tags: n.tags ?? [],
        metadata: n.metadata ?? {},
      };
      const existing = this.notes.findIndex((x) => x.id === id);
      if (existing >= 0) this.notes[existing] = normalized; else this.notes.push(normalized);
    }
    this.ms.removeAll();
    this.ms.addAll(this.notes);
    this.persist();
  }
}
