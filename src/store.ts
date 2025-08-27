import { Note } from './types';

export interface INotesStore {
  upsert(note: Note & { id?: number }): number;
  getById(id: number): Note | null;
  getByKey(key: string, limit?: number): Note[];
  search(text: string, limit?: number): Note[];
  listKeys(limit?: number): Array<{ key: string; count: number }>;
  deleteById(id: number): boolean;
  deleteByKey(key: string): number;
  exportAll(): Note[];
  importMany(notes: Note[]): void;
}
