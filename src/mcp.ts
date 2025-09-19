import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Tool, CallToolRequestSchema, CallToolResult, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, Resource, ListPromptsRequestSchema, GetPromptRequestSchema, Prompt } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { DeleteSchema, QuerySchema, RestoreSchema, UpsertSchema, GraphNodeSchema, GraphNeighborsSchema, GraphPathSchema, GraphImportSchema, GraphStatsSchema, ImageUpsertSchema, ImageGetSchema, ImageDeleteSchema, ImageExportSchema } from './types.js';
import { INotesStore } from './store.js';
import { LiteNotesStore } from './store.lite.js';
import { writeBackup, readBackup } from './backup.js';
import { logger } from './logger.js';
import { NotesDB } from './db.js';
import { IGraphStore, LiteGraphStore, SqliteGraphStore } from './graph.js';
import { suggestTags, findDuplicates, analyzeSentiment, extractEntities, clusterNotes, generateRecommendations, extractKeywords } from './analysis.js';
import { StreamingSearch, StreamingAnalysis, StreamingExport, StreamingConfigSchema, StreamingSearchSchema, StreamingSimilaritySchema, StreamingExportSchema } from './streaming.js';
import { getConfig, ConfigUpdateSchema, ConfigExportSchema, ConfigImportSchema } from './config.js';

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
  {
    name: 'index-bootstrap',
    description: 'Fetch initial context: list of keys and recent notes per key to seed an LLM conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        keyLimit: { type: 'number', description: 'Max number of keys to include (default 20)' },
        notesPerKey: { type: 'number', description: 'Max notes per key (default 3)' },
        keys: { type: 'array', items: { type: 'string' }, description: 'Explicit keys to include (overrides keyLimit if provided)' },
      },
    },
  },
  {
    name: 'index-bootstrap-summary',
    description: 'Compact summary of recent notes by key (snippets + top tags) to prepend as system context.',
    inputSchema: {
      type: 'object',
      properties: {
        keyLimit: { type: 'number', description: 'Max keys (default 20)' },
        notesPerKey: { type: 'number', description: 'Max notes per key (default 3)' },
        keys: { type: 'array', items: { type: 'string' } },
        maxCharsPerNote: { type: 'number', description: 'Trim each note snippet to this length (default 180)' },
        tagLimit: { type: 'number', description: 'Top tags per key (default 5)' },
        totalCharBudget: { type: 'number', description: 'Approx total char budget for all snippets (soft cap)' },
      },
    },
  },
  {
    name: 'analysis-auto-tag',
    description: 'Automatically suggest tags for content using NLP analysis',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Content to analyze for tag suggestions' },
        max_tags: { type: 'number', description: 'Maximum number of tags to suggest (default: 5)' },
        existing_tags_only: { type: 'boolean', description: 'Only suggest from existing tags in system (default: false)' }
      },
      required: ['content']
    }
  },
  {
    name: 'analysis-find-duplicates',
    description: 'Find duplicate or very similar notes in the database',
    inputSchema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', description: 'Similarity threshold 0-1 (default: 0.8)' },
        key_filter: { type: 'string', description: 'Only check notes under specific key' },
        max_results: { type: 'number', description: 'Maximum duplicate pairs to return (default: 10)' }
      }
    }
  },
  {
    name: 'analysis-sentiment',
    description: 'Analyze sentiment of notes content',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: { type: 'number', description: 'Specific note ID to analyze' },
        key: { type: 'string', description: 'Analyze all notes under this key' },
        content: { type: 'string', description: 'Direct content to analyze' }
      }
    }
  },
  {
    name: 'analysis-extract-entities',
    description: 'Extract entities (emails, URLs, dates, etc.) from note content',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: { type: 'number', description: 'Specific note ID to analyze' },
        key: { type: 'string', description: 'Analyze all notes under this key' },
        content: { type: 'string', description: 'Direct content to analyze' }
      }
    }
  },
  {
    name: 'analysis-cluster-notes',
    description: 'Group similar notes into clusters using machine learning',
    inputSchema: {
      type: 'object',
      properties: {
        max_clusters: { type: 'number', description: 'Maximum number of clusters (default: 5)' },
        key_filter: { type: 'string', description: 'Only cluster notes under specific key' },
        min_cluster_size: { type: 'number', description: 'Minimum notes per cluster (default: 2)' }
      }
    }
  },
  {
    name: 'analysis-recommend-related',
    description: 'Generate intelligent recommendations for related notes',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: { type: 'number', description: 'Reference note ID for recommendations' },
        content: { type: 'string', description: 'Reference content for recommendations' },
        max_recommendations: { type: 'number', description: 'Maximum recommendations (default: 5)' },
        min_score: { type: 'number', description: 'Minimum recommendation score (default: 0.1)' }
      }
    }
  },
  {
    name: 'analysis-keyword-extraction',
    description: 'Extract key terms and phrases from content using NLP',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Content to extract keywords from' },
        note_id: { type: 'number', description: 'Note ID to extract keywords from' },
        key: { type: 'string', description: 'Extract keywords from all notes under this key' },
        max_keywords: { type: 'number', description: 'Maximum keywords to extract (default: 10)' }
      }
    }
  },
  {
    name: 'analysis-content-insights',
    description: 'Comprehensive content analysis including sentiment, entities, keywords, and metadata',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: { type: 'number', description: 'Note ID to analyze' },
        content: { type: 'string', description: 'Direct content to analyze' },
        include_recommendations: { type: 'boolean', description: 'Include related note recommendations (default: true)' }
      }
    }
  },
  {
    name: 'streaming-search',
    description: 'Stream search results in batches for large result sets with filtering and progress tracking',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        batch_size: { type: 'number', description: 'Items per batch (default: 10)', default: 10 },
        max_items: { type: 'number', description: 'Maximum total items (default: 1000)', default: 1000 },
        delay_ms: { type: 'number', description: 'Delay between batches in ms (default: 50)', default: 50 },
        filters: {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
            keys: { type: 'array', items: { type: 'string' }, description: 'Filter by key patterns' },
            metadata: { type: 'object', description: 'Filter by metadata fields' }
          }
        }
      },
      required: ['query']
    }
  },
  {
    name: 'streaming-similarity',
    description: 'Stream similarity analysis between a target note and all other notes',
    inputSchema: {
      type: 'object',
      properties: {
        target_key: { type: 'string', description: 'Key of the target note' },
        threshold: { type: 'number', description: 'Minimum similarity threshold (0-1)', default: 0.3 },
        batch_size: { type: 'number', description: 'Items per batch (default: 10)', default: 10 },
        max_items: { type: 'number', description: 'Maximum total items (default: 1000)', default: 1000 }
      },
      required: ['target_key']
    }
  },
  {
    name: 'streaming-tag-analysis',
    description: 'Stream comprehensive tag analysis with usage statistics and note associations',
    inputSchema: {
      type: 'object',
      properties: {
        batch_size: { type: 'number', description: 'Items per batch (default: 10)', default: 10 },
        min_count: { type: 'number', description: 'Minimum tag usage count (default: 1)', default: 1 }
      }
    }
  },
  {
    name: 'streaming-export',
    description: 'Stream export of notes and images with format transformation and progress tracking',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['json', 'csv', 'markdown'], description: 'Export format', default: 'json' },
        include_images: { type: 'boolean', description: 'Include images in export', default: false },
        batch_size: { type: 'number', description: 'Items per batch (default: 10)', default: 10 },
        filters: {
          type: 'object',
          properties: {
            keys: { type: 'array', items: { type: 'string' }, description: 'Filter by key patterns' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' }
          }
        }
      }
    }
  },
  {
    name: 'config-get',
    description: 'Get current server configuration or specific section',
    inputSchema: {
      type: 'object',
      properties: {
        section: { 
          type: 'string', 
          enum: ['database', 'search', 'analysis', 'streaming', 'server', 'resources', 'prompts', 'logging'],
          description: 'Specific configuration section to retrieve (optional)' 
        },
        path: { type: 'string', description: 'Dot-notation path to specific config value (optional)' }
      }
    }
  },
  {
    name: 'config-update',
    description: 'Update server configuration settings',
    inputSchema: {
      type: 'object',
      properties: {
        section: { 
          type: 'string', 
          enum: ['database', 'search', 'analysis', 'streaming', 'server', 'resources', 'prompts', 'logging'],
          description: 'Configuration section to update (optional)' 
        },
        path: { type: 'string', description: 'Dot-notation path to specific config value (optional)' },
        value: { description: 'New configuration value or section object' },
        merge: { type: 'boolean', description: 'Merge with existing config (default: true)', default: true }
      },
      required: ['value']
    }
  },
  {
    name: 'config-reset',
    description: 'Reset configuration to default values',
    inputSchema: {
      type: 'object',
      properties: {
        section: { 
          type: 'string', 
          enum: ['database', 'search', 'analysis', 'streaming', 'server', 'resources', 'prompts', 'logging'],
          description: 'Specific section to reset (optional - if not provided, resets all)' 
        },
        confirm: { type: 'boolean', description: 'Confirmation required', default: false }
      }
    }
  },
  {
    name: 'config-export',
    description: 'Export current configuration for backup or sharing',
    inputSchema: {
      type: 'object',
      properties: {
        include_metadata: { type: 'boolean', description: 'Include export metadata', default: true },
        sections: { 
          type: 'array', 
          items: { type: 'string' }, 
          description: 'Specific sections to export (optional)' 
        },
        format: { type: 'string', enum: ['json', 'yaml'], description: 'Export format', default: 'json' }
      }
    }
  },
  {
    name: 'config-import',
    description: 'Import configuration from backup or template',
    inputSchema: {
      type: 'object',
      properties: {
        config: { description: 'Configuration object to import' },
        overwrite: { type: 'boolean', description: 'Overwrite existing config', default: false },
        validate_only: { type: 'boolean', description: 'Only validate, don\'t apply', default: false }
      },
      required: ['config']
    }
  },
  {
    name: 'config-validate',
    description: 'Validate configuration schema and values',
    inputSchema: {
      type: 'object',
      properties: {
        config: { description: 'Configuration object to validate (optional - validates current if not provided)' },
        section: { 
          type: 'string', 
          enum: ['database', 'search', 'analysis', 'streaming', 'server', 'resources', 'prompts', 'logging'],
          description: 'Specific section to validate (optional)' 
        }
      }
    }
  }
];

// Define available prompts
const prompts: Prompt[] = [
  {
    name: 'summarize-notes',
    description: 'Summarize all notes under a specific key or matching a search query',
    arguments: [
      {
        name: 'key',
        description: 'The key to summarize notes for',
        required: false
      },
      {
        name: 'search',
        description: 'Search query to find notes to summarize',
        required: false
      },
      {
        name: 'max_notes',
        description: 'Maximum number of notes to include in summary (default: 10)',
        required: false
      }
    ]
  },
  {
    name: 'find-connections',
    description: 'Find connections between concepts or topics in your notes',
    arguments: [
      {
        name: 'concept1',
        description: 'First concept to connect',
        required: true
      },
      {
        name: 'concept2',
        description: 'Second concept to connect',
        required: true
      },
      {
        name: 'depth',
        description: 'Maximum connection depth to explore (default: 3)',
        required: false
      }
    ]
  },
  {
    name: 'generate-tags',
    description: 'Generate relevant tags for new content based on existing notes',
    arguments: [
      {
        name: 'content',
        description: 'The content to generate tags for',
        required: true
      },
      {
        name: 'max_tags',
        description: 'Maximum number of tags to suggest (default: 5)',
        required: false
      }
    ]
  },
  {
    name: 'knowledge-qa',
    description: 'Answer questions based on your stored knowledge',
    arguments: [
      {
        name: 'question',
        description: 'The question to answer',
        required: true
      },
      {
        name: 'context_limit',
        description: 'Maximum number of relevant notes to use as context (default: 5)',
        required: false
      }
    ]
  },
  {
    name: 'analyze-trends',
    description: 'Analyze trends and patterns in your notes over time',
    arguments: [
      {
        name: 'time_period',
        description: 'Time period to analyze (e.g., "last_week", "last_month", "all_time")',
        required: false
      },
      {
        name: 'focus_tags',
        description: 'Specific tags to focus the analysis on (comma-separated)',
        required: false
      }
    ]
  },
  {
    name: 'suggest-related',
    description: 'Suggest related notes based on content similarity',
    arguments: [
      {
        name: 'reference_note_id',
        description: 'ID of the reference note',
        required: false
      },
      {
        name: 'reference_content',
        description: 'Content to find related notes for',
        required: false
      },
      {
        name: 'max_suggestions',
        description: 'Maximum number of suggestions (default: 5)',
        required: false
      }
    ]
  },
  {
    name: 'export-summary',
    description: 'Create an organized export summary of your knowledge base',
    arguments: [
      {
        name: 'format',
        description: 'Export format (markdown, json, outline)',
        required: false
      },
      {
        name: 'include_metadata',
        description: 'Whether to include note metadata in export (default: true)',
        required: false
      },
      {
        name: 'group_by',
        description: 'How to group notes (key, tags, date)',
        required: false
      }
    ]
  }
];

const server = new Server(
  {
    name: 'mcp-index-notes',
    version: '0.1.0',
  },
  {
    capabilities: { 
      tools: {},
      resources: {},
      prompts: {}
    },
    instructions:
      'This server indexes notes (and images) under user-defined keys. Typical flow: (1) On session start call index-bootstrap to load a concise set of recent notes as grounding context. (2) Use index.query for retrieval (by key or text). (3) Use index.upsert to add/update notes. (4) Use image-* tools for images. (5) Optionally build a concept graph via graph-import-from-notes. (6) Access data directly via resources like notes://key/{key} or notes://search/{query}. Always minimize payload sizes by limiting notesPerKey. If a user asks a question that could relate to stored knowledge, first retrieve relevant notes before answering.',
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources: Resource[] = [
    {
      uri: 'notes://keys',
      name: 'Available Keys',
      description: 'List of all available note keys with counts',
      mimeType: 'application/json'
    },
    {
      uri: 'notes://key/{key}',
      name: 'Notes by Key',
      description: 'All notes under a specific key',
      mimeType: 'application/json'
    },
    {
      uri: 'notes://search/{query}',
      name: 'Search Results',
      description: 'Full-text search results for a query',
      mimeType: 'application/json'
    },
    {
      uri: 'notes://stats',
      name: 'System Statistics',
      description: 'Overall system statistics and health information',
      mimeType: 'application/json'
    },
    {
      uri: 'graph://nodes',
      name: 'Graph Nodes',
      description: 'All nodes in the knowledge graph',
      mimeType: 'application/json'
    },
    {
      uri: 'graph://stats',
      name: 'Graph Statistics',
      description: 'Graph statistics including node and edge counts',
      mimeType: 'application/json'
    },
    {
      uri: 'images://key/{key}',
      name: 'Images by Key',
      description: 'Image metadata for a specific key',
      mimeType: 'application/json'
    }
  ];
  return { resources };
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const { uri } = req.params;
  
  try {
    if (uri === 'notes://keys') {
      const keys = db.listKeys(100);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(keys, null, 2)
          }
        ]
      };
    }
    
    if (uri.startsWith('notes://key/')) {
      const key = uri.replace('notes://key/', '');
      const notes = db.getByKey(key, 50);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(notes, null, 2)
          }
        ]
      };
    }
    
    if (uri.startsWith('notes://search/')) {
      const query = decodeURIComponent(uri.replace('notes://search/', ''));
      const results = db.search(query, 20);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(results, null, 2)
          }
        ]
      };
    }
    
    if (uri === 'notes://stats') {
      const keys = db.listKeys(1000);
      const totalNotes = keys.reduce((sum, k) => sum + k.count, 0);
      const stats = {
        totalKeys: keys.length,
        totalNotes,
        timestamp: new Date().toISOString(),
        topKeys: keys.slice(0, 10)
      };
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2)
          }
        ]
      };
    }
    
    if (uri === 'graph://nodes') {
      // This would need implementation in graph store
      const stats = graph.stats();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ message: 'Node listing not yet implemented', stats }, null, 2)
          }
        ]
      };
    }
    
    if (uri === 'graph://stats') {
      const stats = graph.stats();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2)
          }
        ]
      };
    }
    
    if (uri.startsWith('images://key/')) {
      const key = uri.replace('images://key/', '');
      if ('getImagesByKey' in db) {
        const images = (db as any).getImagesByKey(key, 20, false);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(images, null, 2)
            }
          ]
        };
      } else {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({ error: 'Image storage not supported in current store implementation' }, null, 2)
            }
          ]
        };
      }
    }
    
    throw new Error(`Unknown resource URI: ${uri}`);
    
  } catch (err: any) {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ error: err?.message || String(err) }, null, 2)
        }
      ]
    };
  }
});

// List available prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts };
});

// Handle prompt requests
server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  
  try {
    switch (name) {
      case 'summarize-notes': {
        const key = args?.key as string;
        const search = args?.search as string;
        const maxNotes = parseInt(args?.max_notes as string) || 10;
        
        let notes: any[] = [];
        let contextInfo = '';
        
        if (key) {
          notes = db.getByKey(key, maxNotes);
          contextInfo = `Notes under key "${key}"`;
        } else if (search) {
          notes = db.search(search, maxNotes);
          contextInfo = `Notes matching search "${search}"`;
        } else {
          // Get recent notes from top keys
          const topKeys = db.listKeys(5);
          for (const keyInfo of topKeys) {
            notes.push(...db.getByKey(keyInfo.key, 2));
          }
          notes = notes.slice(0, maxNotes);
          contextInfo = `Recent notes from top keys`;
        }
        
        const prompt = `Please provide a comprehensive summary of the following notes.

**Context**: ${contextInfo}
**Total Notes**: ${notes.length}

**Instructions**:
1. Identify the main themes and topics
2. Highlight key insights and important information
3. Note any patterns or connections between the notes
4. Organize the summary in a clear, structured format

**Notes to Summarize**:
${notes.map((note, idx) => `
**Note ${idx + 1}** (Key: ${note.key})
Tags: [${note.tags?.join(', ') || 'none'}]
Content: ${note.content}
---`).join('\n')}

Please provide your summary now.`;

        return {
          description: `Summarize ${notes.length} notes`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: prompt
              }
            }
          ]
        };
      }
      
      case 'find-connections': {
        const concept1 = args?.concept1 as string;
        const concept2 = args?.concept2 as string;
        const depth = parseInt(args?.depth as string) || 3;
        
        if (!concept1 || !concept2) {
          throw new Error('Both concept1 and concept2 are required');
        }
        
        // Search for notes related to both concepts
        const notes1 = db.search(concept1, 10);
        const notes2 = db.search(concept2, 10);
        
        const prompt = `Please analyze the connections between "${concept1}" and "${concept2}" based on the following notes.

**Analysis Depth**: Up to ${depth} levels of connection
**Search Results**:

**Notes related to "${concept1}"**:
${notes1.map((note, idx) => `${idx + 1}. [${note.key}] ${note.content.substring(0, 200)}... (Tags: ${note.tags?.join(', ') || 'none'})`).join('\n')}

**Notes related to "${concept2}"**:
${notes2.map((note, idx) => `${idx + 1}. [${note.key}] ${note.content.substring(0, 200)}... (Tags: ${note.tags?.join(', ') || 'none'})`).join('\n')}

**Please provide**:
1. Direct connections between the two concepts
2. Indirect connections through intermediate concepts
3. Common themes or patterns
4. Potential relationships that could be explored further
5. Suggest ways to strengthen the connection in your knowledge base`;

        return {
          description: `Find connections between "${concept1}" and "${concept2}"`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: prompt
              }
            }
          ]
        };
      }
      
      case 'generate-tags': {
        const content = args?.content as string;
        const maxTags = parseInt(args?.max_tags as string) || 5;
        
        if (!content) {
          throw new Error('Content is required for tag generation');
        }
        
        // Get existing tags for reference
        const allNotes = db.exportAll();
        const existingTags = new Set<string>();
        allNotes.forEach(note => {
          note.tags?.forEach(tag => existingTags.add(tag));
        });
        
        const prompt = `Please generate ${maxTags} relevant tags for the following content.

**Content to tag**:
${content}

**Existing tags in the system** (for consistency):
${Array.from(existingTags).sort().join(', ')}

**Instructions**:
1. Suggest ${maxTags} most relevant tags
2. Prefer existing tags when appropriate for consistency
3. Suggest new tags only when existing ones don't fit
4. Keep tags concise and descriptive
5. Consider both topic and category tags

**Output format**: Provide just the comma-separated list of suggested tags.`;

        return {
          description: `Generate tags for content (${content.substring(0, 50)}...)`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: prompt
              }
            }
          ]
        };
      }
      
      case 'knowledge-qa': {
        const question = args?.question as string;
        const contextLimit = parseInt(args?.context_limit as string) || 5;
        
        if (!question) {
          throw new Error('Question is required');
        }
        
        // Find relevant notes for the question
        const relevantNotes = db.search(question, contextLimit);
        
        const prompt = `Please answer the following question based on the knowledge in my notes.

**Question**: ${question}

**Relevant notes from my knowledge base**:
${relevantNotes.map((note, idx) => `
**Source ${idx + 1}** [Key: ${note.key}]
Tags: [${note.tags?.join(', ') || 'none'}]
Content: ${note.content}
---`).join('\n')}

**Instructions**:
1. Answer the question based primarily on the provided notes
2. If the notes don't contain enough information, clearly state what's missing
3. Reference specific notes when using their information
4. If you need to make inferences, clearly distinguish them from facts in the notes
5. Suggest what additional information might be useful to better answer this question

**Please provide your answer now.**`;

        return {
          description: `Answer question: "${question}"`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: prompt
              }
            }
          ]
        };
      }
      
      case 'analyze-trends': {
        const timePeriod = args?.time_period as string || 'all_time';
        const focusTags = args?.focus_tags as string;
        
        const allNotes = db.exportAll();
        const keys = db.listKeys(50);
        
        // Basic trend analysis
        const tagFrequency: Record<string, number> = {};
        const keyGrowth: Record<string, number> = {};
        
        allNotes.forEach(note => {
          note.tags?.forEach(tag => {
            if (!focusTags || focusTags.split(',').map(t => t.trim()).includes(tag)) {
              tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
            }
          });
          keyGrowth[note.key] = (keyGrowth[note.key] || 0) + 1;
        });
        
        const prompt = `Please analyze trends and patterns in my knowledge base.

**Analysis Period**: ${timePeriod}
**Focus Tags**: ${focusTags || 'All tags'}
**Total Notes**: ${allNotes.length}
**Total Keys**: ${keys.length}

**Tag Frequency Distribution**:
${Object.entries(tagFrequency)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 15)
  .map(([tag, count]) => `- ${tag}: ${count} notes`)
  .join('\n')}

**Key Growth (Notes per Key)**:
${Object.entries(keyGrowth)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 10)
  .map(([key, count]) => `- ${key}: ${count} notes`)
  .join('\n')}

**Please provide**:
1. **Trend Analysis**: What patterns do you see in my knowledge accumulation?
2. **Topic Focus**: What subjects am I focusing on most?
3. **Knowledge Gaps**: What areas might need more attention?
4. **Growth Recommendations**: How can I better organize or expand my knowledge base?
5. **Optimization Suggestions**: Ways to improve my note-taking and organization`;

        return {
          description: `Analyze trends in knowledge base (${timePeriod})`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: prompt
              }
            }
          ]
        };
      }
      
      case 'suggest-related': {
        const referenceNoteId = args?.reference_note_id ? parseInt(args.reference_note_id as string) : undefined;
        const referenceContent = args?.reference_content as string;
        const maxSuggestions = parseInt(args?.max_suggestions as string) || 5;
        
        let referenceNote: any = null;
        let searchContent = referenceContent;
        
        if (referenceNoteId) {
          const allNotes = db.exportAll();
          referenceNote = allNotes.find(n => n.id === referenceNoteId);
          if (referenceNote) {
            searchContent = referenceNote.content;
          }
        }
        
        if (!searchContent) {
          throw new Error('Either reference_note_id or reference_content is required');
        }
        
        // Find related notes
        const relatedNotes = db.search(searchContent, maxSuggestions * 2)
          .filter(note => referenceNoteId ? note.id !== referenceNoteId : true)
          .slice(0, maxSuggestions);
        
        const prompt = `Please suggest related notes and explain the connections.

**Reference ${referenceNoteId ? `Note (ID: ${referenceNoteId})` : 'Content'}**:
${referenceNote ? `Key: ${referenceNote.key}\nTags: [${referenceNote.tags?.join(', ') || 'none'}]\n` : ''}Content: ${searchContent}

**Related Notes Found**:
${relatedNotes.map((note, idx) => `
**${idx + 1}. ${note.key}** (ID: ${note.id})
Tags: [${note.tags?.join(', ') || 'none'}]
Content: ${note.content.substring(0, 150)}...
---`).join('\n')}

**Please provide**:
1. **Relevance Ranking**: Order the related notes by relevance and explain why
2. **Connection Types**: What types of connections exist (topical, methodological, etc.)
3. **Knowledge Links**: How these notes could be linked in a knowledge graph
4. **Missing Connections**: What additional notes or topics would strengthen these connections
5. **Action Items**: Specific suggestions for improving the knowledge network`;

        return {
          description: `Suggest related notes for ${referenceNoteId ? `note ${referenceNoteId}` : 'provided content'}`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: prompt
              }
            }
          ]
        };
      }
      
      case 'export-summary': {
        const format = args?.format as string || 'markdown';
        const includeMetadata = args?.include_metadata !== 'false';
        const groupBy = args?.group_by as string || 'key';
        
        const allNotes = db.exportAll();
        const keys = db.listKeys(100);
        
        const prompt = `Please create an organized export summary of my knowledge base.

**Export Configuration**:
- Format: ${format}
- Include Metadata: ${includeMetadata}
- Group By: ${groupBy}
- Total Notes: ${allNotes.length}
- Total Keys: ${keys.length}

**Knowledge Base Overview**:
${keys.slice(0, 20).map(k => `- ${k.key}: ${k.count} notes`).join('\n')}

**Sample Notes by Key**:
${keys.slice(0, 5).map(keyInfo => {
  const keyNotes = db.getByKey(keyInfo.key, 2);
  return `
**${keyInfo.key}** (${keyInfo.count} notes):
${keyNotes.map(note => `  - ${note.content.substring(0, 100)}... ${includeMetadata ? `[Tags: ${note.tags?.join(', ') || 'none'}]` : ''}`).join('\n')}`;
}).join('\n')}

**Please create**:
1. **Executive Summary**: High-level overview of the knowledge base
2. **Organized Structure**: Notes organized by ${groupBy}
3. **Key Insights**: Main themes and valuable information
4. **Statistics**: Quantitative analysis of the knowledge base
5. **Export Document**: Final formatted export in ${format} format

**Format Requirements**:
- Use clear headings and structure
- Include navigation/table of contents if appropriate
- Make it suitable for sharing or reference
- Optimize for the ${format} format`;

        return {
          description: `Create export summary (${format} format, grouped by ${groupBy})`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: prompt
              }
            }
          ]
        };
      }
      
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  } catch (err: any) {
    return {
      description: `Error: ${err?.message || String(err)}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Error processing prompt "${name}": ${err?.message || String(err)}`
          }
        }
      ]
    };
  }
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
      case 'index-bootstrap': {
        const parsed = z
          .object({
            keyLimit: z.number().int().positive().max(200).optional().default(20),
            notesPerKey: z.number().int().positive().max(20).optional().default(3),
            keys: z.array(z.string()).min(1).optional(),
          })
          .parse(args ?? {});
        const selectedKeys = parsed.keys && parsed.keys.length > 0
          ? parsed.keys
          : db
              .listKeys(parsed.keyLimit)
              .map((k) => k.key);
        const notes: Record<string, any[]> = {};
        for (const k of selectedKeys) {
          try {
            notes[k] = db.getByKey(k, parsed.notesPerKey).map((n) => ({ id: n.id, key: n.key, content: n.content, tags: n.tags, metadata: n.metadata, updated_at: n.updated_at }));
          } catch (e) {
            notes[k] = [];
          }
        }
        return { content: [{ type: 'text', text: JSON.stringify({ keys: selectedKeys, notes }) }] };
      }
      case 'index-bootstrap-summary': {
        const parsed = z
          .object({
            keyLimit: z.number().int().positive().max(200).optional().default(20),
            notesPerKey: z.number().int().positive().max(20).optional().default(3),
            keys: z.array(z.string()).min(1).optional(),
            maxCharsPerNote: z.number().int().positive().max(2000).optional().default(180),
            tagLimit: z.number().int().positive().max(20).optional().default(5),
            totalCharBudget: z.number().int().positive().max(20000).optional(),
          })
          .parse(args ?? {});
        const selectedKeys = parsed.keys && parsed.keys.length > 0
          ? parsed.keys
          : db.listKeys(parsed.keyLimit).map((k) => k.key);
        const summaries: Array<{ key: string; tags: string[]; snippets: string[] }> = [];
        let accumulated = 0;
        for (const k of selectedKeys) {
          const noteObjs = db.getByKey(k, parsed.notesPerKey);
          if (!noteObjs.length) continue;
            // Collect tag frequencies
          const tagFreq: Record<string, number> = {};
          for (const n of noteObjs) for (const t of n.tags ?? []) tagFreq[t] = (tagFreq[t] || 0) + 1;
          const topTags = Object.entries(tagFreq)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, parsed.tagLimit)
            .map(([t]) => t);
          const snippets: string[] = [];
          for (const n of noteObjs) {
            if (parsed.totalCharBudget && accumulated >= parsed.totalCharBudget) break;
            let snippet = n.content.replace(/\s+/g, ' ').trim();
            if (snippet.length > parsed.maxCharsPerNote) snippet = snippet.slice(0, parsed.maxCharsPerNote - 1) + '…';
            accumulated += snippet.length;
            if (parsed.totalCharBudget && accumulated > parsed.totalCharBudget) {
              // Trim overflow
              const overflow = accumulated - parsed.totalCharBudget;
              if (overflow > 0 && snippet.length > overflow) {
                snippet = snippet.slice(0, snippet.length - overflow - 1) + '…';
              }
              accumulated = parsed.totalCharBudget;
            }
            snippets.push(snippet);
            if (parsed.totalCharBudget && accumulated >= parsed.totalCharBudget) break;
          }
          summaries.push({ key: k, tags: topTags, snippets });
          if (parsed.totalCharBudget && accumulated >= parsed.totalCharBudget) break;
        }
        // Provide a single compact text field helpful for a system prompt
        const asText = summaries
          .map((s) => `Key: ${s.key}\nTags: ${s.tags.join(', ') || '-'}\nSnippets:\n- ${s.snippets.join('\n- ')}`)
          .join('\n\n');
        return { content: [{ type: 'text', text: JSON.stringify({ summaries, text: asText }) }] };
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
      
      case 'analysis-auto-tag': {
        const parsed = z.object({
          content: z.string(),
          max_tags: z.number().int().positive().max(20).optional().default(5),
          existing_tags_only: z.boolean().optional().default(false)
        }).parse(args);
        
        const allNotes = db.exportAll();
        const existingTags = Array.from(new Set(allNotes.flatMap(note => note.tags || [])));
        
        const suggestions = suggestTags(parsed.content, existingTags, parsed.max_tags);
        const filteredSuggestions = parsed.existing_tags_only 
          ? suggestions.filter(tag => existingTags.includes(tag))
          : suggestions;
        
        return { content: [{ type: 'text', text: JSON.stringify({ 
          suggestions: filteredSuggestions,
          existing_tags: existingTags.length,
          method: 'nlp_analysis'
        }) }] };
      }
      
      case 'analysis-find-duplicates': {
        const parsed = z.object({
          threshold: z.number().min(0).max(1).optional().default(0.8),
          key_filter: z.string().optional(),
          max_results: z.number().int().positive().max(50).optional().default(10)
        }).parse(args ?? {});
        
        const allNotes = db.exportAll();
        const notesToCheck = parsed.key_filter 
          ? allNotes.filter(note => note.key === parsed.key_filter)
          : allNotes;
        
        const duplicates = findDuplicates(notesToCheck, parsed.threshold)
          .slice(0, parsed.max_results);
        
        return { content: [{ type: 'text', text: JSON.stringify({
          duplicates: duplicates.map(dup => ({
            note1: { id: dup.note1.id, key: dup.note1.key, content: dup.note1.content.substring(0, 100) + '...' },
            note2: { id: dup.note2.id, key: dup.note2.key, content: dup.note2.content.substring(0, 100) + '...' },
            similarity: Math.round(dup.similarity * 100) / 100
          })),
          total_checked: notesToCheck.length,
          threshold_used: parsed.threshold
        }) }] };
      }
      
      case 'analysis-sentiment': {
        const parsed = z.object({
          note_id: z.number().int().positive().optional(),
          key: z.string().optional(),
          content: z.string().optional()
        }).parse(args ?? {});
        
        let results: any[] = [];
        
        if (parsed.note_id) {
          const allNotes = db.exportAll();
          const note = allNotes.find(n => n.id === parsed.note_id);
          if (note) {
            const sentiment = analyzeSentiment(note.content);
            results.push({ note_id: note.id, key: note.key, ...sentiment });
          }
        } else if (parsed.key) {
          const notes = db.getByKey(parsed.key, 20);
          results = notes.map(note => ({
            note_id: note.id,
            key: note.key,
            ...analyzeSentiment(note.content)
          }));
        } else if (parsed.content) {
          const sentiment = analyzeSentiment(parsed.content);
          results.push({ content: parsed.content.substring(0, 50) + '...', ...sentiment });
        }
        
        return { content: [{ type: 'text', text: JSON.stringify({ results, total_analyzed: results.length }) }] };
      }
      
      case 'analysis-extract-entities': {
        const parsed = z.object({
          note_id: z.number().int().positive().optional(),
          key: z.string().optional(),
          content: z.string().optional()
        }).parse(args ?? {});
        
        let results: any[] = [];
        
        if (parsed.note_id) {
          const allNotes = db.exportAll();
          const note = allNotes.find(n => n.id === parsed.note_id);
          if (note) {
            const entities = extractEntities(note.content);
            results.push({ note_id: note.id, key: note.key, entities });
          }
        } else if (parsed.key) {
          const notes = db.getByKey(parsed.key, 10);
          results = notes.map(note => ({
            note_id: note.id,
            key: note.key,
            entities: extractEntities(note.content)
          }));
        } else if (parsed.content) {
          const entities = extractEntities(parsed.content);
          results.push({ content: parsed.content.substring(0, 50) + '...', entities });
        }
        
        return { content: [{ type: 'text', text: JSON.stringify({ results }) }] };
      }
      
      case 'analysis-cluster-notes': {
        const parsed = z.object({
          max_clusters: z.number().int().positive().max(20).optional().default(5),
          key_filter: z.string().optional(),
          min_cluster_size: z.number().int().positive().optional().default(2)
        }).parse(args ?? {});
        
        const allNotes = db.exportAll();
        const notesToCluster = parsed.key_filter 
          ? allNotes.filter(note => note.key.startsWith(parsed.key_filter!))
          : allNotes;
        
        const clusters = clusterNotes(notesToCluster, parsed.max_clusters)
          .filter(cluster => cluster.notes.length >= parsed.min_cluster_size);
        
        return { content: [{ type: 'text', text: JSON.stringify({
          clusters: clusters.map(cluster => ({
            cluster_id: cluster.cluster,
            size: cluster.notes.length,
            centroid_keywords: cluster.centroid,
            notes: cluster.notes.map(note => ({
              id: note.id,
              key: note.key,
              content: note.content.substring(0, 100) + '...',
              tags: note.tags
            }))
          })),
          total_notes: notesToCluster.length,
          clusters_found: clusters.length
        }) }] };
      }
      
      case 'analysis-recommend-related': {
        const parsed = z.object({
          note_id: z.number().int().positive().optional(),
          content: z.string().optional(),
          max_recommendations: z.number().int().positive().max(20).optional().default(5),
          min_score: z.number().min(0).max(1).optional().default(0.1)
        }).parse(args ?? {});
        
        let targetNote: any = null;
        
        if (parsed.note_id) {
          const allNotes = db.exportAll();
          targetNote = allNotes.find(n => n.id === parsed.note_id);
        } else if (parsed.content) {
          targetNote = { id: 0, key: 'temp', content: parsed.content, tags: [], metadata: {} };
        }
        
        if (!targetNote) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'No target note found' }) }] };
        }
        
        const allNotes = db.exportAll();
        const recommendations = generateRecommendations(targetNote, allNotes, parsed.max_recommendations)
          .filter(rec => rec.score >= parsed.min_score);
        
        return { content: [{ type: 'text', text: JSON.stringify({
          recommendations: recommendations.map(rec => ({
            note: {
              id: rec.note.id,
              key: rec.note.key,
              content: rec.note.content.substring(0, 150) + '...',
              tags: rec.note.tags
            },
            score: Math.round(rec.score * 100) / 100,
            reasons: rec.reasons
          })),
          target_note: parsed.note_id ? `Note ${parsed.note_id}` : 'Provided content',
          total_candidates: allNotes.length
        }) }] };
      }
      
      case 'analysis-keyword-extraction': {
        const parsed = z.object({
          content: z.string().optional(),
          note_id: z.number().int().positive().optional(),
          key: z.string().optional(),
          max_keywords: z.number().int().positive().max(50).optional().default(10)
        }).parse(args ?? {});
        
        let results: any[] = [];
        
        if (parsed.content) {
          const keywords = extractKeywords(parsed.content, parsed.max_keywords);
          results.push({ content: parsed.content.substring(0, 50) + '...', keywords });
        } else if (parsed.note_id) {
          const allNotes = db.exportAll();
          const note = allNotes.find(n => n.id === parsed.note_id);
          if (note) {
            const keywords = extractKeywords(note.content, parsed.max_keywords);
            results.push({ note_id: note.id, key: note.key, keywords });
          }
        } else if (parsed.key) {
          const notes = db.getByKey(parsed.key, 10);
          results = notes.map(note => ({
            note_id: note.id,
            key: note.key,
            keywords: extractKeywords(note.content, parsed.max_keywords)
          }));
        }
        
        return { content: [{ type: 'text', text: JSON.stringify({ results }) }] };
      }
      
      case 'analysis-content-insights': {
        const parsed = z.object({
          note_id: z.number().int().positive().optional(),
          content: z.string().optional(),
          include_recommendations: z.boolean().optional().default(true)
        }).parse(args ?? {});
        
        let targetContent = '';
        let targetNote: any = null;
        
        if (parsed.note_id) {
          const allNotes = db.exportAll();
          targetNote = allNotes.find(n => n.id === parsed.note_id);
          if (targetNote) targetContent = targetNote.content;
        } else if (parsed.content) {
          targetContent = parsed.content;
          targetNote = { id: 0, key: 'temp', content: parsed.content, tags: [], metadata: {} };
        }
        
        if (!targetContent) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'No content to analyze' }) }] };
        }
        
        const insights = {
          keywords: extractKeywords(targetContent, 10),
          sentiment: analyzeSentiment(targetContent),
          entities: extractEntities(targetContent),
          content_length: targetContent.length,
          word_count: targetContent.split(/\s+/).length,
          analysis_timestamp: new Date().toISOString()
        };
        
        if (parsed.include_recommendations && targetNote) {
          const allNotes = db.exportAll();
          const recommendations = generateRecommendations(targetNote, allNotes, 3);
          (insights as any).recommendations = recommendations.map(rec => ({
            note: { id: rec.note.id, key: rec.note.key, content: rec.note.content.substring(0, 100) + '...' },
            score: Math.round(rec.score * 100) / 100,
            reasons: rec.reasons
          }));
        }
        
        return { content: [{ type: 'text', text: JSON.stringify({
          target: parsed.note_id ? `Note ${parsed.note_id}` : 'Provided content',
          insights
        }) }] };
      }

      case 'streaming-search': {
        const parsed = StreamingSearchSchema.parse(args ?? {});
        const config = {
          batchSize: parsed.config?.batchSize ?? 10,
          delayMs: parsed.config?.delayMs ?? 50,
          maxItems: parsed.config?.maxItems ?? 1000
        };
        
        const allNotes = db.exportAll();
        const streamingSearch = new StreamingSearch(config);
        
        // Note: This is a simplified streaming response 
        // In a real streaming implementation, we would need to stream chunks
        const results: any[] = [];
        
        for await (const chunk of streamingSearch.searchStream(allNotes, parsed.query, parsed.filters)) {
          results.push({
            chunk: chunk.chunk,
            batch_size: chunk.data.length,
            total: chunk.total,
            has_more: chunk.hasMore,
            progress: chunk.metadata?.progress,
            notes: chunk.data.map(note => ({
              id: note.id,
              key: note.key,
              content: note.content.substring(0, 100) + '...',
              tags: note.tags,
              score: (note as any)._score
            }))
          });
          
          if (results.length >= 5) break; // Limit for demo purposes
        }
        
        return { content: [{ type: 'text', text: JSON.stringify({
          query: parsed.query,
          config,
          chunks_processed: results.length,
          results
        }) }] };
      }

      case 'streaming-similarity': {
        const parsed = StreamingSimilaritySchema.parse(args ?? {});
        const config = {
          batchSize: 10,
          delayMs: 50,
          maxItems: parsed.config?.maxItems ?? 1000
        };
        
        const allNotes = db.exportAll();
        const targetNote = allNotes.find(note => note.key === parsed.targetKey);
        
        if (!targetNote) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Note with key "${parsed.targetKey}" not found` }) }] };
        }
        
        const streamingAnalysis = new StreamingAnalysis(config);
        const results: any[] = [];
        
        for await (const chunk of streamingAnalysis.findSimilarStream(targetNote, allNotes, parsed.threshold)) {
          results.push({
            chunk: chunk.chunk,
            batch_size: chunk.data.length,
            has_more: chunk.hasMore,
            progress: chunk.metadata?.progress,
            similarities: chunk.data.map(item => ({
              note: {
                id: item.note.id,
                key: item.note.key,
                content: item.note.content.substring(0, 80) + '...'
              },
              similarity: Math.round(item.similarity * 1000) / 1000
            }))
          });
          
          if (results.length >= 3) break; // Limit for demo purposes
        }
        
        return { content: [{ type: 'text', text: JSON.stringify({
          target_note: parsed.targetKey,
          threshold: parsed.threshold,
          chunks_processed: results.length,
          results
        }) }] };
      }

      case 'streaming-tag-analysis': {
        const parsed = z.object({
          batch_size: z.number().optional().default(10),
          min_count: z.number().optional().default(1)
        }).parse(args ?? {});
        
        const config = {
          batchSize: parsed.batch_size,
          delayMs: 50,
          maxItems: 1000
        };
        
        const allNotes = db.exportAll();
        const streamingAnalysis = new StreamingAnalysis(config);
        const results: any[] = [];
        
        for await (const chunk of streamingAnalysis.analyzeTagsStream(allNotes)) {
          const filteredData = chunk.data.filter(item => item.count >= parsed.min_count);
          
          if (filteredData.length > 0) {
            results.push({
              chunk: chunk.chunk,
              batch_size: filteredData.length,
              has_more: chunk.hasMore,
              progress: chunk.metadata?.progress,
              tag_analysis: filteredData.map(item => ({
                tag: item.tag,
                usage_count: item.count,
                notes_with_tag: item.notes.slice(0, 10), // Limit note keys for readability
                percentage: Math.round((item.count / allNotes.length) * 1000) / 10
              }))
            });
          }
          
          if (results.length >= 3) break; // Limit for demo purposes
        }
        
        return { content: [{ type: 'text', text: JSON.stringify({
          total_notes: allNotes.length,
          min_usage_filter: parsed.min_count,
          chunks_processed: results.length,
          results
        }) }] };
      }

      case 'streaming-export': {
        const parsed = StreamingExportSchema.parse(args ?? {});
        const config = {
          batchSize: parsed.config?.batchSize ?? 10,
          delayMs: 50,
          maxItems: 1000
        };
        
        let allNotes = db.exportAll();
        
        // Apply filters
        if (parsed.filters?.keys?.length) {
          allNotes = allNotes.filter(note => 
            parsed.filters!.keys!.some(keyPattern => note.key.includes(keyPattern))
          );
        }
        
        if (parsed.filters?.tags?.length) {
          allNotes = allNotes.filter(note =>
            note.tags?.some(tag => parsed.filters!.tags!.includes(tag))
          );
        }
        
        const streamingExport = new StreamingExport(config);
        const results: any[] = [];
        
        const formatter = (note: any) => {
          switch (parsed.format) {
            case 'markdown':
              return `# ${note.key}\n\n${note.content}\n\nTags: ${(note.tags || []).join(', ')}\n\n---\n`;
            case 'csv':
              return {
                key: note.key,
                content: note.content.replace(/\n/g, ' '),
                tags: (note.tags || []).join(';'),
                created: note.created_at || ''
              };
            default:
              return note;
          }
        };
        
        for await (const chunk of streamingExport.exportStream(allNotes, formatter)) {
          results.push({
            chunk: chunk.chunk,
            batch_size: chunk.data.length,
            format: parsed.format,
            has_more: chunk.hasMore,
            progress: chunk.metadata?.progress,
            data: chunk.data.slice(0, 3) // Show first 3 items only for demo
          });
          
          if (results.length >= 3) break; // Limit for demo purposes
        }
        
        return { content: [{ type: 'text', text: JSON.stringify({
          format: parsed.format,
          total_notes: allNotes.length,
          include_images: parsed.includeImages,
          chunks_processed: results.length,
          results
        }) }] };
      }

      case 'config-get': {
        const parsed = z.object({
          section: z.enum(['database', 'search', 'analysis', 'streaming', 'server', 'resources', 'prompts', 'logging']).optional(),
          path: z.string().optional()
        }).parse(args ?? {});
        
        const configManager = getConfig();
        let result: any;
        
        if (parsed.path) {
          result = configManager.getValue(parsed.path);
        } else if (parsed.section) {
          result = configManager.getSection(parsed.section);
        } else {
          result = configManager.getConfig();
        }
        
        return { content: [{ type: 'text', text: JSON.stringify({
          request: { section: parsed.section, path: parsed.path },
          configuration: result,
          timestamp: new Date().toISOString()
        }) }] };
      }

      case 'config-update': {
        const parsed = ConfigUpdateSchema.parse(args ?? {});
        const configManager = getConfig();
        let success = false;
        
        if (parsed.path) {
          success = configManager.setValue(parsed.path, parsed.value);
        } else if (parsed.section) {
          success = configManager.updateSection(parsed.section as any, parsed.value);
        } else {
          success = configManager.updateConfig(parsed.value);
        }
        
        return { content: [{ type: 'text', text: JSON.stringify({
          success,
          updated: { section: parsed.section, path: parsed.path, merge: parsed.merge },
          message: success ? 'Configuration updated successfully' : 'Failed to update configuration',
          timestamp: new Date().toISOString()
        }) }] };
      }

      case 'config-reset': {
        const parsed = z.object({
          section: z.enum(['database', 'search', 'analysis', 'streaming', 'server', 'resources', 'prompts', 'logging']).optional(),
          confirm: z.boolean().default(false)
        }).parse(args ?? {});
        
        if (!parsed.confirm) {
          return { content: [{ type: 'text', text: JSON.stringify({
            error: 'Reset operation requires confirmation. Set confirm: true to proceed.',
            warning: 'This action cannot be undone and will reset configuration to defaults.'
          }) }] };
        }
        
        const configManager = getConfig();
        const success = configManager.resetConfig();
        
        return { content: [{ type: 'text', text: JSON.stringify({
          success,
          section: parsed.section || 'all',
          message: success ? 'Configuration reset to defaults' : 'Failed to reset configuration',
          timestamp: new Date().toISOString()
        }) }] };
      }

      case 'config-export': {
        const parsed = ConfigExportSchema.parse(args ?? {});
        const configManager = getConfig();
        
        const exportData = configManager.exportConfig();
        let result = exportData;
        
        if (parsed.sections?.length) {
          const filteredConfig: any = {};
          for (const section of parsed.sections) {
            if (section in exportData.config) {
              filteredConfig[section] = (exportData.config as any)[section];
            }
          }
          result = {
            ...exportData,
            config: filteredConfig
          };
        }
        
        let finalResult: any = result;
        if (!parsed.includeMetadata) {
          finalResult = result.config;
        }
        
        return { content: [{ type: 'text', text: JSON.stringify({
          export: finalResult,
          format: 'json',
          exported_at: new Date().toISOString(),
          sections: parsed.sections || 'all'
        }) }] };
      }

      case 'config-import': {
        const parsed = ConfigImportSchema.parse(args ?? {});
        const configManager = getConfig();
        
        if (parsed.validateOnly) {
          const validation = configManager.validateConfig(parsed.config);
          return { content: [{ type: 'text', text: JSON.stringify({
            validation_result: validation,
            config_preview: parsed.config,
            timestamp: new Date().toISOString()
          }) }] };
        }
        
        const success = configManager.importConfig({ config: parsed.config });
        
        return { content: [{ type: 'text', text: JSON.stringify({
          success,
          overwrite: parsed.overwrite,
          message: success ? 'Configuration imported successfully' : 'Failed to import configuration',
          timestamp: new Date().toISOString()
        }) }] };
      }

      case 'config-validate': {
        const parsed = z.object({
          config: z.any().optional(),
          section: z.enum(['database', 'search', 'analysis', 'streaming', 'server', 'resources', 'prompts', 'logging']).optional()
        }).parse(args ?? {});
        
        const configManager = getConfig();
        let configToValidate: any;
        
        if (parsed.config) {
          configToValidate = parsed.config;
        } else if (parsed.section) {
          configToValidate = configManager.getSection(parsed.section);
        } else {
          configToValidate = configManager.getConfig();
        }
        
        const validation = configManager.validateConfig(configToValidate);
        
        return { content: [{ type: 'text', text: JSON.stringify({
          validation_result: validation,
          target: parsed.section || 'full_config',
          config_summary: {
            version: configToValidate.version || 'unknown',
            sections: Object.keys(configToValidate).filter(k => k !== 'version')
          },
          timestamp: new Date().toISOString()
        }) }] };
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
