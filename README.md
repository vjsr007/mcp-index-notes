# MCP Index Notes

A simple, fast MCP server to index and retrieve notes using SQLite (FTS5) with optional JSON backups. Written in TypeScript with verbose logging.

## Features

- Fast local storage using better-sqlite3
- Full-text search (FTS5) across content, key, tags, metadata
- Upsert by id or insert by key
- Query by key or text
- Delete by id or key
- Backup to JSON and restore
- Structured, verbose logging via pino

## Tools

- index-upsert: Create/update a note
- index-query: Query by key or full-text search
- index-delete: Delete by id or key
- index-backup: Export all notes to JSON
- index-restore: Import notes from JSON
- index-list-keys: Return keys with counts
- index-health: Health check

Graph tools:
- graph-node-upsert: Create/update a graph node
- graph-neighbors: Get neighbors of a node
- graph-path: Find a path between nodes
- graph-import-from-notes: Build graph from existing notes (note->key, note->tags)
- graph-stats: Node/edge counts

## Quick start

1) Install deps

```powershell
npm install
```

2) Dev run (stdio MCP server)

```powershell
npm run dev
```

3) Smoke test (local DB only)

```powershell
npm run smoke
```

Environment vars:

- DB_PATH: path for SQLite db (default ./data/notes.db)
- LOG_LEVEL: pino level (trace|debug|info|warn|error)
- LOG_PRETTY: true for human-readable logs

## Integrations

Below are ready-to-copy examples for popular MCP hosts and clients. Replace paths with your local ones on Windows. All examples run this server via Node and pass optional env vars.

Tip: Build once so the dist entry exists.

```powershell
npm run build
```

### GitHub Copilot Chat (VS Code)

Copilot Chat supports MCP servers. Add a new MCP server entry pointing to your built script.

- Open VS Code Settings (JSON) and add an MCP server entry under the Copilot MCP section (exact setting label may vary by version). Use this structure:

```json
{
  "mcpServers": {
    "notes-index": {
      "command": "node",
      "args": [
        "C:\\projects\\mcp-index-notes\\dist\\mcp.js"
      ],
      "env": {
        "DB_PATH": "C:\\projects\\mcp-index-notes\\data\\notes.db",
        "LOG_LEVEL": "info",
        "LOG_PRETTY": "true"
      }
    }
  }
}
```

Then in Copilot Chat, ask it to call a tool, e.g.: “Call tool index-health”. You should see `{ "ok": true }` in the result.

### Claude Desktop

Add to Claude Desktop’s settings.json (Help → Open config file). Example:

```json
{
  "mcpServers": {
    "notes-index": {
      "command": "node",
      "args": [
        "C:\\projects\\mcp-index-notes\\dist\\mcp.js"
      ],
      "env": {
        "DB_PATH": "C:\\projects\\mcp-index-notes\\data\\notes.db",
        "LOG_LEVEL": "info",
        "LOG_PRETTY": "true"
      }
    }
  }
}
```

### Cursor

Create or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "notes-index": {
      "command": "node",
      "args": [
        "C:\\projects\\mcp-index-notes\\dist\\mcp.js"
      ],
      "env": {
        "DB_PATH": "C:\\projects\\mcp-index-notes\\data\\notes.db",
        "LOG_LEVEL": "info",
        "LOG_PRETTY": "true"
      }
    }
  }
}
```

### Continue.dev

Add to `~/.continue/config.json` under `mcpServers` (structure may vary by version):

```json
{
  "mcpServers": [
    {
      "name": "notes-index",
      "command": "node",
      "args": [
        "C:\\projects\\mcp-index-notes\\dist\\mcp.js"
      ],
      "env": {
        "DB_PATH": "C:\\projects\\mcp-index-notes\\data\\notes.db",
        "LOG_LEVEL": "info",
        "LOG_PRETTY": "true"
      }
    }
  ]
}
```

### Verify the connection

From your client’s chat, try these tool calls:

- index-health → `{ ok: true }`
- index-upsert with arguments `{ key: "sql.connection", content: "Server=..." }` → returns `{ id }`
- index-query with `{ key: "sql.connection" }` → returns stored entries

If your client shows a tools list, you should see all tools from this server.

## JSON backup format

```
{
  "generatedAt": "2025-08-25T12:00:00.000Z",
  "notes": [ { id, key, content, tags, metadata, created_at, updated_at } ]
}
```

## Notes

- The MCP server communicates via stdio. Integrate with your LLM runtime that supports MCP.
- The DB uses WAL mode for concurrency and performance.
