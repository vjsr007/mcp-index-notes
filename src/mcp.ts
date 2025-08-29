import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Tool, CallToolRequestSchema, CallToolResult, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { DeleteSchema, QuerySchema, RestoreSchema, UpsertSchema, GraphNodeSchema, GraphNeighborsSchema, GraphPathSchema, GraphImportSchema, GraphStatsSchema, ImageUpsertSchema, ImageGetSchema, ImageDeleteSchema, ImageExportSchema } from './types.js';
import { INotesStore } from './store.js';
import { LiteNotesStore } from './store.lite.js';
import { writeBackup, readBackup } from './backup.js';
import { logger } from './logger.js';
import { NotesDB } from './db.js';
import { IGraphStore, LiteGraphStore, SqliteGraphStore } from './graph.js';

let db: INotesStore;
let graph: IGraphStore;
try {
  // Try native SQLite for speed
  db = new NotesDB({ filePath: process.env.DB_PATH });
  logger.info('Using SQLite NotesDB');
  try {
    graph = new SqliteGraphStore({ filePath: process.env.DB_PATH });
    logger.info('Using SQLite GraphStore');
  } catch (e) {
    logger.warn({ e }, 'SQLite unavailable for graph; using LiteGraphStore');
    graph = new LiteGraphStore();
  }
} catch (e) {
  // Fallback to pure JS store
  logger.warn({ e }, 'SQLite unavailable, falling back to LiteNotesStore');
  db = new LiteNotesStore({ filePath: process.env.DB_PATH?.replace(/\.db$/i, '.json') });
  graph = new LiteGraphStore();
}

const tools: Tool[] = [
  {
    name: 'index-upsert',
    description: 'Create or update a note under a key. Returns the note id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Optional note id to update' },
        key: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        metadata: { type: 'object' },
        backup: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            dir: { type: 'string' },
          },
        },
      },
      required: ['key', 'content'],
      additionalProperties: true,
    },
  },
  {
    name: 'image-upsert',
    description: 'Store an image (base64 data or file path) under a key. Returns image id.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        data: { type: 'string', description: 'Base64-encoded image data (no data: prefix)' },
        file: { type: 'string', description: 'Path to image file to read if data not provided' },
        mime: { type: 'string', description: 'MIME type e.g. image/png if data provided' },
        metadata: { type: 'object' },
      },
      required: ['key'],
    },
  },
  {
    name: 'image-get',
    description: 'Retrieve images by id or key. Optionally include base64 data.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        key: { type: 'string' },
        limit: { type: 'number' },
        includeData: { type: 'boolean' },
      },
    },
  },
  {
    name: 'image-delete',
    description: 'Delete an image by id or all images by key.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' }, key: { type: 'string' } },
    },
  },
  {
    name: 'image-export',
    description: 'Export images (by id or key) to files. Returns file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        key: { type: 'string' },
        limit: { type: 'number' },
        dir: { type: 'string' },
      },
    },
  },
  {
    name: 'index-query',
    description: 'Query notes by key or full-text search.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        text: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'index-delete',
    description: 'Delete notes by id or by key. Returns count/boolean.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        key: { type: 'string' },
      },
    },
  },
  {
    name: 'index-backup',
    description: 'Export all notes to a JSON backup file and return the path.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string' },
      },
    },
  },
  {
    name: 'index-restore',
    description: 'Restore notes from a JSON backup file. Returns imported count.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
      },
      required: ['file'],
    },
  },
  {
    name: 'index-list-keys',
    description: 'List known keys and counts.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
  },
  {
    name: 'index-health',
    description: 'Health check.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'graph-node-upsert',
    description: 'Create or update a graph node with label/type/props. Returns node id.',
    inputSchema: { type: 'object', properties: { id: { type: 'number' }, label: { type: 'string' }, type: { type: 'string' }, props: { type: 'object' } }, required: ['label'] },
  },
  {
    name: 'graph-neighbors',
    description: 'Get neighbors of a node (by id or label/type) up to a depth and limit.',
    inputSchema: { type: 'object', properties: { node: { anyOf: [{ type: 'number' }, { type: 'object', properties: { label: { type: 'string' }, type: { type: 'string' } }, required: ['label'] }] }, depth: { type: 'number' }, limit: { type: 'number' } }, required: ['node'] },
  },
  {
    name: 'graph-path',
    description: 'Find a path of nodes from A to B (by id or label/type).',
    inputSchema: { type: 'object', properties: { from: { anyOf: [{ type: 'number' }, { type: 'object', properties: { label: { type: 'string' }, type: { type: 'string' } }, required: ['label'] }] }, to: { anyOf: [{ type: 'number' }, { type: 'object', properties: { label: { type: 'string' }, type: { type: 'string' } }, required: ['label'] }] }, maxDepth: { type: 'number' } }, required: ['from', 'to'] },
  },
  {
    name: 'graph-import-from-notes',
    description: 'Import nodes and edges from existing notes: note -> key and note -> tags.',
    inputSchema: { type: 'object', properties: { source: { type: 'string', enum: ['all', 'key'] }, key: { type: 'string' } } },
  },
  {
    name: 'graph-stats',
    description: 'Get counts of nodes and edges in the graph store.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const server = new Server(
  {
    name: 'mcp-index-notes',
    version: '0.1.0',
  },
  {
  capabilities: { tools: {} },
    instructions:
      'This server indexes notes under user-defined keys. Prefer index.upsert to store, index.query to retrieve by key or text, index.delete to remove, index.listKeys to discover keys, and index.backup/index.restore for JSON snapshots. All responses are English JSON in text blocks.',
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
  const { name, arguments: args } = req.params;
  try {
    switch (name) {
      case 'index-upsert': {
        const parsed = UpsertSchema.parse(args);
        const id = db.upsert(parsed);
        if (parsed.backup?.enabled) {
          const file = writeBackup(db.exportAll(), parsed.backup.dir);
          return { content: [{ type: 'text', text: JSON.stringify({ id, backup: file }) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
      }
      case 'index-query': {
        const parsed = QuerySchema.parse(args ?? {});
        let result: any[] = [];
        if (parsed.key) {
          result = db.getByKey(parsed.key, parsed.limit);
        } else if (parsed.text) {
          result = db.search(parsed.text, parsed.limit);
        }
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'index-delete': {
        const parsed = DeleteSchema.parse(args ?? {});
        if (parsed.id) {
          const ok = db.deleteById(parsed.id);
          return { content: [{ type: 'text', text: JSON.stringify({ ok }) }] };
        }
        if (parsed.key) {
          const count = db.deleteByKey(parsed.key);
          return { content: [{ type: 'text', text: JSON.stringify({ deleted: count }) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Provide id or key' }) }] };
      }
      case 'index-backup': {
        const parsed = z.object({ dir: z.string().optional() }).parse(args ?? {});
        const file = writeBackup(db.exportAll(), parsed.dir);
        return { content: [{ type: 'text', text: JSON.stringify({ file }) }] };
      }
      case 'index-restore': {
        const parsed = RestoreSchema.parse(args);
        const notes = readBackup(parsed.file);
        db.importMany(notes);
        return { content: [{ type: 'text', text: JSON.stringify({ imported: notes.length }) }] };
      }
      case 'index-list-keys': {
        const parsed = z.object({ limit: z.number().positive().max(500).optional().default(100) }).parse(args ?? {});
        const keys = db.listKeys(parsed.limit);
        return { content: [{ type: 'text', text: JSON.stringify(keys) }] };
      }
      case 'index-health': {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
      }
      case 'graph-node-upsert': {
        const parsed = GraphNodeSchema.parse(args);
        const id = graph.upsertNode(parsed);
        return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
      }
      case 'graph-neighbors': {
        const parsed = GraphNeighborsSchema.parse(args);
        const nodes = graph.neighbors(parsed.node as any, parsed.depth, parsed.limit);
        return { content: [{ type: 'text', text: JSON.stringify(nodes) }] };
      }
      case 'graph-path': {
        const parsed = GraphPathSchema.parse(args);
        const nodes = graph.path(parsed.from as any, parsed.to as any, parsed.maxDepth);
        return { content: [{ type: 'text', text: JSON.stringify(nodes) }] };
      }
      case 'graph-import-from-notes': {
        const parsed = GraphImportSchema.parse(args ?? {});
        const notes = parsed.source === 'key' && parsed.key ? db.getByKey(parsed.key, 1000) : db.exportAll();
        const res = graph.importFromNotes(notes);
        return { content: [{ type: 'text', text: JSON.stringify(res) }] };
      }
      case 'graph-stats': {
        GraphStatsSchema.parse(args ?? {});
        const res = graph.stats();
        return { content: [{ type: 'text', text: JSON.stringify(res) }] };
      }
      case 'image-upsert': {
        const parsed = ImageUpsertSchema.parse(args);
        if (!('insertImage' in (db as any))) {
          throw new Error('Image storage not supported in current store implementation');
        }
        const fs = await import('fs');
        let raw: Buffer | null = null;
        if (parsed.data) {
          raw = Buffer.from(parsed.data, 'base64');
        } else if (parsed.file) {
            raw = fs.readFileSync(parsed.file);
        } else {
          throw new Error('Provide data (base64) or file');
        }
        // crude mime guess if not provided
        let mime = parsed.mime;
        if (!mime && parsed.file) {
          const ext = parsed.file.toLowerCase();
          if (ext.endsWith('.png')) mime = 'image/png';
          else if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mime = 'image/jpeg';
          else if (ext.endsWith('.gif')) mime = 'image/gif';
          else if (ext.endsWith('.webp')) mime = 'image/webp';
          else mime = 'application/octet-stream';
        }
        if (!mime) mime = 'application/octet-stream';
        const id = (db as any).insertImage({ key: parsed.key, mime, data: raw!, metadata: parsed.metadata });
        return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
      }
      case 'image-get': {
        const parsed = ImageGetSchema.parse(args ?? {});
        if (!('getImageById' in (db as any))) {
          throw new Error('Image storage not supported in current store implementation');
        }
        let result: any = null;
        if (parsed.id) {
          result = (db as any).getImageById(parsed.id, parsed.includeData);
        } else if (parsed.key) {
          result = (db as any).getImagesByKey(parsed.key, parsed.limit, parsed.includeData);
        } else {
          result = [];
        }
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'image-delete': {
        const parsed = ImageDeleteSchema.parse(args ?? {});
        if (!('deleteImageById' in (db as any))) {
          throw new Error('Image storage not supported in current store implementation');
        }
        if (parsed.id) {
          const ok = (db as any).deleteImageById(parsed.id);
          return { content: [{ type: 'text', text: JSON.stringify({ ok }) }] };
        }
        if (parsed.key) {
          const deleted = (db as any).deleteImagesByKey(parsed.key);
          return { content: [{ type: 'text', text: JSON.stringify({ deleted }) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Provide id or key' }) }] };
      }
      case 'image-export': {
        const parsed = ImageExportSchema.parse(args ?? {});
        if (!('getImageById' in (db as any))) {
          throw new Error('Image storage not supported in current store implementation');
        }
        const fs = await import('fs');
        const path = await import('path');
        const exportDir = parsed.dir ? path.resolve(parsed.dir) : path.resolve(process.cwd(), 'exported-images');
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
        let images: any[] = [];
        if (parsed.id) {
          const one = (db as any).getImageById(parsed.id, true);
          if (one) images = [one];
        } else if (parsed.key) {
          images = (db as any).getImagesByKey(parsed.key, parsed.limit, true);
        } else {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Provide id or key' }) }] };
        }
        const files: string[] = [];
        for (const img of images) {
          if (!img.data) continue;
            const safeKey = img.key.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60);
            const ext = (() => {
              switch (img.mime) {
                case 'image/png': return '.png';
                case 'image/jpeg': return '.jpg';
                case 'image/gif': return '.gif';
                case 'image/webp': return '.webp';
                default: return '.bin';
              }
            })();
            const filename = `${safeKey}-${img.id}${ext}`;
            const outPath = path.join(exportDir, filename);
            fs.writeFileSync(outPath, Buffer.from(img.data, 'base64'));
            files.push(outPath);
        }
        return { content: [{ type: 'text', text: JSON.stringify({ dir: exportDir, files }) }] };
      }
      default:
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool ${name}` }) }] };
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: err?.message || String(err) }) }] };
  }
});

logger.info('Starting MCP index-notes server on stdio');
await server.connect(new StdioServerTransport());
