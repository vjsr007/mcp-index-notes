import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import type { Note } from './types.js';
import { logger } from './logger.js';

export type GraphNode = {
  id?: number;
  label: string;
  type?: string;
  props?: Record<string, any>;
};

export type GraphEdge = {
  id?: number;
  src: number;
  dst: number;
  type?: string;
  props?: Record<string, any>;
};

export interface IGraphStore {
  upsertNode(node: GraphNode): number;
  getNodeByLabel(label: string, type?: string): GraphNode | null;
  addEdge(edge: Omit<GraphEdge, 'id'>): number;
  neighbors(node: number | { label: string; type?: string }, depth?: number, limit?: number): GraphNode[];
  path(from: number | { label: string; type?: string }, to: number | { label: string; type?: string }, maxDepth?: number): GraphNode[];
  importFromNotes(notes: Note[]): { nodes: number; edges: number };
  stats(): { nodes: number; edges: number };
}

export interface SqliteGraphOptions {
  filePath?: string; // path to sqlite file
}

export class SqliteGraphStore implements IGraphStore {
  private readonly db: any;
  private readonly dbPath: string;
  constructor(opts: SqliteGraphOptions = {}) {
    this.dbPath = opts.filePath || path.resolve(process.cwd(), 'data', 'notes.db');
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    logger.info({ dbPath: this.dbPath }, 'Opening SQLite database for graph');
    const require = createRequire(import.meta.url);
    const Database = require('better-sqlite3');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate() {
    logger.info('Running graph migrations');
    const stmts = [
      // Ensure tables (type columns may already exist; we normalize values after)
      `CREATE TABLE IF NOT EXISTS graph_nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, type TEXT DEFAULT '', props TEXT NOT NULL DEFAULT '{}');`,
      `CREATE TABLE IF NOT EXISTS graph_edges (id INTEGER PRIMARY KEY AUTOINCREMENT, src INTEGER NOT NULL, dst INTEGER NOT NULL, type TEXT DEFAULT '', props TEXT NOT NULL DEFAULT '{}', UNIQUE(src, dst, type) ON CONFLICT IGNORE, FOREIGN KEY(src) REFERENCES graph_nodes(id) ON DELETE CASCADE, FOREIGN KEY(dst) REFERENCES graph_nodes(id) ON DELETE CASCADE);`,
      // Normalize NULL types to empty string for uniqueness
      `UPDATE graph_nodes SET type='' WHERE type IS NULL;`,
      `UPDATE graph_edges SET type='' WHERE type IS NULL;`,
      // Create indexes without expressions
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_graph_nodes_label_type ON graph_nodes(label, type);`,
      `CREATE INDEX IF NOT EXISTS ix_graph_edges_src ON graph_edges(src);`,
      `CREATE INDEX IF NOT EXISTS ix_graph_edges_dst ON graph_edges(dst);`,
    ];
    try {
      this.db.exec(stmts.join('\n'));
    } catch (e: any) {
      logger.error({ e, message: e?.message }, 'Graph migrations failed');
      throw e;
    }
  }

  upsertNode(node: GraphNode): number {
    const props = JSON.stringify(node.props ?? {});
    if (node.id) {
      const info = this.db.prepare(`UPDATE graph_nodes SET label=?, type=?, props=? WHERE id=?`).run(node.label, node.type ?? null, props, node.id);
      if (info.changes === 0) throw new Error(`Node with id ${node.id} not found`);
      return node.id;
    }
    // Try find existing
    const existing = this.getNodeByLabel(node.label, node.type);
    if (existing) {
  this.db.prepare(`UPDATE graph_nodes SET props=? WHERE id=?`).run(props, existing.id);
      return existing.id!;
    }
    const info = this.db.prepare(`INSERT INTO graph_nodes(label, type, props) VALUES (?, ?, ?)`)
      .run(node.label, node.type ?? null, props);
    return Number(info.lastInsertRowid);
  }

  getNodeByLabel(label: string, type?: string): GraphNode | null {
  const t = type ?? '';
  const row = this.db.prepare(`SELECT * FROM graph_nodes WHERE label=? AND type=?`).get(label, t);
    return row ? { id: row.id, label: row.label, type: row.type ?? undefined, props: JSON.parse(row.props || '{}') } : null;
  }

  addEdge(edge: Omit<GraphEdge, 'id'>): number {
    const props = JSON.stringify(edge.props ?? {});
    const info = this.db.prepare(`INSERT OR IGNORE INTO graph_edges(src, dst, type, props) VALUES (?, ?, ?, ?)`)
      .run(edge.src, edge.dst, edge.type ?? '', props);
    if (info.changes === 0) {
      // fetch existing
      const row = this.db.prepare(`SELECT id FROM graph_edges WHERE src=? AND dst=? AND type=?`).get(edge.src, edge.dst, edge.type ?? '');
      return row?.id ?? 0;
    }
    return Number(info.lastInsertRowid);
  }

  private resolveNodeId(node: number | { label: string; type?: string }): number | null {
    if (typeof node === 'number') return node;
    const found = this.getNodeByLabel(node.label, node.type);
    return found?.id ?? null;
  }

  private mapRow(r: any): GraphNode {
    return { id: r.id, label: r.label, type: r.type ?? undefined, props: JSON.parse(r.props || '{}') };
  }

  private sqliteNeighborIds(src: number): number[] {
    const rows = this.db.prepare(`SELECT e.dst as id FROM graph_edges e WHERE e.src=?`).all(src) as any[];
    return rows.map((r) => r.id as number);
  }

  private nodesByIds(ids: number[]): GraphNode[] {
    if (!ids.length) return [];
    const rows = this.db.prepare(`SELECT id,label,type,props FROM graph_nodes WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    return ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((r: any) => this.mapRow(r));
  }

  private bfsTraverse(startId: number, depth: number, visit: (dstId: number, srcId: number) => boolean): void {
    const visited = new Set<number>([startId]);
    let frontier: number[] = [startId];
    const step = (ids: number[]): { next: number[]; stop: boolean } => {
      const next: number[] = [];
      for (const id of ids) {
        const neigh = this.sqliteNeighborIds(id);
        for (const dst of neigh) {
          if (visited.has(dst)) continue;
          visited.add(dst);
          next.push(dst);
          if (!visit(dst, id)) return { next, stop: true };
        }
      }
      return { next, stop: false };
    };
    for (let d = 0; d < depth && frontier.length; d++) {
      const { next, stop } = step(frontier);
      if (stop) return;
      frontier = next;
    }
  }

  neighbors(node: number | { label: string; type?: string }, depth = 1, limit = 50): GraphNode[] {
    const startId = this.resolveNodeId(node);
    if (!startId) return [];
    const collected: number[] = [];
    this.bfsTraverse(startId, depth, (dst) => {
      collected.push(dst);
      return collected.length < limit;
    });
    return this.nodesByIds(collected);
  }

  private bfsPath(fromId: number, toId: number, maxDepth: number): number[] {
    const prev = new Map<number, number | null>();
    prev.set(fromId, null);
    let found = false;
    this.bfsTraverse(fromId, maxDepth + 1, (dst, src) => {
      if (!prev.has(dst)) prev.set(dst, src);
      if (dst === toId) { found = true; return false; }
      return true;
    });
    if (!found) return [];
    const pathIds: number[] = [];
    let p: number | null | undefined = toId;
    while (p != null) { pathIds.push(p); p = prev.get(p)!; }
    pathIds.reverse();
    return pathIds;
  }

  path(from: number | { label: string; type?: string }, to: number | { label: string; type?: string }, maxDepth = 4): GraphNode[] {
    const fromId = this.resolveNodeId(from);
    const toId = this.resolveNodeId(to);
    if (!fromId || !toId) return [];
    const ids = this.bfsPath(fromId, toId, maxDepth);
    if (!ids.length) return [];
    const rows = this.db.prepare(`SELECT id,label,type,props FROM graph_nodes WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    return ids.map((id) => this.mapRow(byId.get(id)!));
  }

  importFromNotes(notes: Note[]): { nodes: number; edges: number } {
    let nodesCnt = 0;
    let edgesCnt = 0;
    const tx = this.db.transaction((items: Note[]) => {
      for (const n of items) {
        const noteNodeId = this.upsertNode({ label: `note:${n.id ?? n.key}:${(n.created_at || '').slice(0,10)}`, type: 'note', props: { key: n.key, tags: n.tags ?? [], metadata: n.metadata ?? {} } });
        const keyNodeId = this.upsertNode({ label: `key:${n.key}`, type: 'key' });
        edgesCnt += this.addEdge({ src: noteNodeId, dst: keyNodeId, type: 'has_key' }) ? 1 : 0;
        nodesCnt += 2; // approximate, since upsert may not create new
        for (const t of n.tags ?? []) {
          const tagId = this.upsertNode({ label: `tag:${t}`, type: 'tag' });
          edgesCnt += this.addEdge({ src: noteNodeId, dst: tagId, type: 'has_tag' }) ? 1 : 0;
          nodesCnt++;
        }
      }
    });
    tx(notes);
    // Adjust nodes count by querying totals
    const totals = this.stats();
    return { nodes: totals.nodes, edges: totals.edges };
  }

  stats(): { nodes: number; edges: number } {
    const n = (this.db.prepare(`SELECT COUNT(*) as c FROM graph_nodes`).get() as any).c as number;
    const e = (this.db.prepare(`SELECT COUNT(*) as c FROM graph_edges`).get() as any).c as number;
    return { nodes: n, edges: e };
  }
}

export class LiteGraphStore implements IGraphStore {
  private nodes = new Map<number, GraphNode>();
  private labelIndex = new Map<string, number>(); // key: `${label}\u0000${type ?? ''}` -> id
  private edges: GraphEdge[] = [];
  private nextNodeId = 1;
  private nextEdgeId = 1;

  private keyFor(label: string, type?: string) {
    return `${label}\u0000${type ?? ''}`;
  }

  upsertNode(node: GraphNode): number {
    if (node.id) {
      const existing = this.nodes.get(node.id);
      if (!existing) throw new Error(`Node with id ${node.id} not found`);
      const updated = { ...existing, label: node.label, type: node.type, props: node.props ?? existing.props };
      this.nodes.set(node.id, updated);
      this.labelIndex.set(this.keyFor(updated.label, updated.type), node.id);
      return node.id;
    }
    const idxKey = this.keyFor(node.label, node.type);
    const id = this.labelIndex.get(idxKey);
    if (id) {
      const updated = { ...this.nodes.get(id)!, props: node.props ?? this.nodes.get(id)!.props };
      this.nodes.set(id, updated);
      return id;
    }
    const newId = this.nextNodeId++;
    this.nodes.set(newId, { id: newId, label: node.label, type: node.type, props: node.props ?? {} });
    this.labelIndex.set(idxKey, newId);
    return newId;
  }

  getNodeByLabel(label: string, type?: string): GraphNode | null {
    const id = this.labelIndex.get(this.keyFor(label, type));
    return id ? this.nodes.get(id)! : null;
  }

  addEdge(edge: Omit<GraphEdge, 'id'>): number {
    // prevent duplicates
    if (this.edges.some((e) => e.src === edge.src && e.dst === edge.dst && (e.type ?? '') === (edge.type ?? ''))) {
      const existing = this.edges.find((e) => e.src === edge.src && e.dst === edge.dst && (e.type ?? '') === (edge.type ?? ''))!;
      return existing.id!;
    }
    const id = this.nextEdgeId++;
    this.edges.push({ id, ...edge });
    return id;
  }

  private liteNeighborIds(src: number): number[] {
    const out: number[] = [];
    for (const e of this.edges) if (e.src === src) out.push(e.dst);
    return out;
  }

  private liteNodesByIds(ids: number[]): GraphNode[] {
    const out: GraphNode[] = [];
    for (const id of ids) { const n = this.nodes.get(id); if (n) out.push(n); }
    return out;
  }

  private bfsLiteTraverse(startId: number, depth: number, visit: (dstId: number, srcId: number) => boolean): void {
    const visited = new Set<number>([startId]);
    let frontier: number[] = [startId];
    const step = (ids: number[]): { next: number[]; stop: boolean } => {
      const next: number[] = [];
      for (const id of ids) {
        const neigh = this.liteNeighborIds(id);
        for (const dst of neigh) {
          if (visited.has(dst)) continue;
          visited.add(dst);
          next.push(dst);
          if (!visit(dst, id)) return { next, stop: true };
        }
      }
      return { next, stop: false };
    };
    for (let d = 0; d < depth && frontier.length; d++) {
      const { next, stop } = step(frontier);
      if (stop) return;
      frontier = next;
    }
  }

  neighbors(node: number | { label: string; type?: string }, depth = 1, limit = 50): GraphNode[] {
  const startId = typeof node === 'number' ? node : this.getNodeByLabel(node.label, node.type)?.id;
    if (!startId) return [];
  const ids: number[] = [];
  this.bfsLiteTraverse(startId, depth, (dst) => { ids.push(dst); return ids.length < limit; });
  return this.liteNodesByIds(ids);
  }

  private bfsLitePath(fromId: number, toId: number, maxDepth: number): number[] {
    const queue: number[] = [fromId];
    const prev = new Map<number, number | null>();
    prev.set(fromId, null);
    let depth = 0;
    while (queue.length && depth <= maxDepth) {
      const size = queue.length;
      for (let i = 0; i < size; i++) {
        const cur = queue.shift()!;
        if (cur === toId) {
          const pathIds: number[] = [];
          let p: number | null | undefined = cur;
          while (p != null) { pathIds.push(p); p = prev.get(p)!; }
          pathIds.reverse();
          return pathIds;
        }
        for (const e of this.edges) {
          if (e.src === cur && !prev.has(e.dst)) { prev.set(e.dst, cur); queue.push(e.dst); }
        }
      }
      depth++;
    }
    return [];
  }

  path(from: number | { label: string; type?: string }, to: number | { label: string; type?: string }, maxDepth = 4): GraphNode[] {
    const fromId = typeof from === 'number' ? from : this.getNodeByLabel(from.label, from.type)?.id;
    const toId = typeof to === 'number' ? to : this.getNodeByLabel(to.label, to.type)?.id;
    if (!fromId || !toId) return [];
    const prev = new Map<number, number | null>();
    prev.set(fromId, null);
    let found = false;
    this.bfsLiteTraverse(fromId, maxDepth + 1, (dst, src) => {
      if (!prev.has(dst)) prev.set(dst, src);
      if (dst === toId) { found = true; return false; }
      return true;
    });
    if (!found) return [];
    const pathIds: number[] = [];
    let p: number | null | undefined = toId;
    while (p != null) { pathIds.push(p); p = prev.get(p)!; }
    pathIds.reverse();
    return this.liteNodesByIds(pathIds);
  }

  importFromNotes(notes: Note[]): { nodes: number; edges: number } {
    for (const n of notes) {
      const noteNodeId = this.upsertNode({ label: `note:${n.id ?? n.key}:${(n.created_at || '').slice(0,10)}`, type: 'note', props: { key: n.key, tags: n.tags ?? [], metadata: n.metadata ?? {} } });
      const keyNodeId = this.upsertNode({ label: `key:${n.key}`, type: 'key' });
      this.addEdge({ src: noteNodeId, dst: keyNodeId, type: 'has_key' });
      for (const t of n.tags ?? []) {
        const tagId = this.upsertNode({ label: `tag:${t}`, type: 'tag' });
        this.addEdge({ src: noteNodeId, dst: tagId, type: 'has_tag' });
      }
    }
    return this.stats();
  }

  stats(): { nodes: number; edges: number } {
    return { nodes: this.nodes.size, edges: this.edges.length };
  }
}
