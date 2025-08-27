---

## Quick Tip: Copy-Paste Text and Images

You can simply copy and paste text or images into your favorite chat client (like Copilot or Anthropic) and say something like:

> Add all this to my notes

The LLM will index the information as it decides, using its own context and capabilities. This makes it easy to capture and organize information without manual formatting or tool calls.
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


## Prompt Examples (How to use MCP tools in chat)
### Advanced LLM Prompts

You can leverage advanced LLMs to interact with MCP tools for more intelligent workflows. Here are some example prompts:

#### Semantic Search

```
Call tool index-query with { text: "Find all notes about database security" }
```
Expected result: Returns notes relevant to database security using full-text search.

#### Summarize Notes

```
Summarize the content of all notes tagged "meeting" using index-query and LLM summarization.
```
Expected workflow: The client calls `index-query` with `{ tags: "meeting" }`, then uses the LLM to summarize the returned notes.

#### Generate Knowledge Graph

```
Build a graph of all notes related to "AI" and show connections between their tags using graph-import-from-notes and graph-stats.
```
Expected workflow: The client calls `graph-import-from-notes` and `graph-stats` to visualize relationships between notes and tags.

#### Find Shortest Path Between Concepts

```
Find the shortest path in the knowledge graph between "SQL" and "Security" using graph-path.
```
Expected result: Returns the path of related notes/tags between the two concepts.

#### Context-Aware Upsert

```
Add a new note about "PostgreSQL performance tuning" and link it to existing notes about "SQL" and "optimization" using index-upsert and graph-node-upsert.
```
Expected workflow: The client upserts the note and updates the graph to connect related concepts.

#### Multi-step Reasoning

```
Query all notes about "API design", summarize them, and suggest improvements using index-query and LLM reasoning.
```
Expected workflow: The client queries notes, summarizes with LLM, and generates actionable suggestions.

You can interact with the MCP server using natural language prompts in your chat client. Here are some example prompts:

### Health Check
```
Call tool index-health
```
Expected result: `{ "ok": true }`

### Add a Note
```
Call tool index-upsert with { key: "sql.connection", content: "Server=localhost;User=admin;" }
```
Expected result: `{ "id": ... }`

### Query a Note by Key
```
Call tool index-query with { key: "sql.connection" }
```
Expected result: Returns stored entries for that key

### Full-Text Search
```
Call tool index-query with { text: "connection" }
```
Expected result: Returns notes containing the word "connection"

### List All Keys
```
Call tool index-list-keys
```
Expected result: List of all note keys with counts

### Delete a Note
```
Call tool index-delete with { key: "sql.connection" }
```
Expected result: Confirmation of deletion

### Backup Notes to JSON
```
Call tool index-backup
```
Expected result: JSON export of all notes

### Restore Notes from JSON
```
Call tool index-restore with { path: "C:/path/to/backup.json" }
```
Expected result: Notes imported from backup

### Graph Tools
```
Call tool graph-node-upsert with { id: "node1", label: "Start" }
Call tool graph-neighbors with { id: "node1" }
Call tool graph-path with { from: "node1", to: "node2" }
```
Expected result: Graph operations as described

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
