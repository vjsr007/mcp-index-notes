import { NotesDB } from './db.js';
import { LiteNotesStore } from './store.lite.js';
import { writeBackup, readBackup } from './backup.js';
import { logger } from './logger.js';
import { LiteGraphStore, SqliteGraphStore } from './graph.js';

async function main() {
  let db: any;
  let graph: any;
  try {
    db = new NotesDB();
    try {
      graph = new SqliteGraphStore();
    } catch {
      graph = new LiteGraphStore();
    }
  } catch {
    logger.warn('SQLite unavailable in smoke; using LiteNotesStore');
    db = new LiteNotesStore();
    graph = new LiteGraphStore();
  }
  const id1 = db.upsert({ key: 'sql.connection', content: 'Server=tcp:foo,1433;User=sa;Pwd=***', tags: ['sql','connection'], metadata: {} });
  const id2 = db.upsert({ key: 'api.keys', content: 'stripe_sk=sk_live_123', tags: ['secret'], metadata: {} });
  logger.info({ id1, id2 }, 'Inserted notes');

  const keys = db.listKeys();
  logger.info({ keys }, 'List keys');

  const gotByKey = db.getByKey('sql.connection');
  logger.info({ gotByKey }, 'Get by key');

  const search = db.search('connection');
  logger.info({ search }, 'FTS search');

  const file = writeBackup(db.exportAll());
  const notes = readBackup(file);
  logger.info({ file, cnt: notes.length }, 'Backup roundtrip');

  // Graph import and queries
  const imported = graph.importFromNotes(db.exportAll());
  logger.info({ imported }, 'Graph import from notes');
  const anyNote = db.exportAll()[0];
  if (anyNote) {
    const noteLabel = `note:${anyNote.id ?? anyNote.key}:${(anyNote.created_at || '').slice(0,10)}`;
    const neighbors = graph.neighbors({ label: noteLabel, type: 'note' }, 2, 20);
    logger.info({ neighbors }, 'Graph neighbors');
    const keyNodeLabel = `key:${anyNote.key}`;
    const path = graph.path({ label: noteLabel, type: 'note' }, { label: keyNodeLabel, type: 'key' }, 2);
    logger.info({ path }, 'Graph path note->key');
  }

  logger.info('Smoke test done');
}

main().catch((e) => {
  logger.error(e, 'Smoke test failed');
  process.exit(1);
});
