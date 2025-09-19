---

## Quick Tip: Copy-Paste Text and Images

You can simply copy and paste text or images into your favorite chat client (like Copilot or Anthropic) and say something like:

> Add all this to my notes

The LLM will index the information as it decides, using its own context and capabilities. This makes it easy to capture and organize information without manual formatting or tool calls.
# MCP Index Notes

A comprehensive MCP server for indexing, retrieving, and managing notes with advanced AI capabilities. Built with TypeScript, featuring SQLite (FTS5) storage, knowledge graphs, image management, and intelligent analysis tools.

## 🚀 Enhanced Features

### Core Functionality
- **Fast Local Storage**: SQLite with FTS5 full-text search
- **Flexible Data Management**: Upsert by ID/key, query by text/key/tags
- **Backup & Restore**: JSON export/import with versioning
- **Structured Logging**: Comprehensive logging via Pino

### Advanced MCP Capabilities
- **📋 Resources**: Direct data access without tool calls (7 endpoints)
- **🤖 Prompts**: Intelligent templates for complex workflows (7 prompts)
- **🧠 Analysis Tools**: Advanced NLP and machine learning features (8 tools)
- **⚡ Streaming**: Efficient processing for large datasets (4 streaming tools)
- **⚙️ Configuration**: Comprehensive server configuration management (6 tools)
- **🔗 Knowledge Graphs**: Build and query relationships between concepts
- **🖼️ Image Storage**: Store and manage images with metadata

## 🛠️ Tools Overview

### Basic Operations (7 tools)
- `index-upsert`: Create/update notes
- `index-query`: Search by key or full-text
- `index-delete`: Delete by ID or key
- `index-backup`: Export to JSON
- `index-restore`: Import from JSON
- `index-list-keys`: List keys with counts
- `index-health`: System health check

### Knowledge Graph (5 tools)
- `graph-node-upsert`: Create/update graph nodes
- `graph-neighbors`: Get connected nodes
- `graph-path`: Find paths between concepts
- `graph-import-from-notes`: Build graph from existing notes
- `graph-stats`: Graph analytics

### Image Management (4 tools)
- `image-upsert`: Store images (base64 or file)
- `image-get`: Retrieve with optional base64 data
- `image-delete`: Remove by ID or key
- `image-export`: Export to files

### Advanced Analysis (8 tools)
- `analysis-auto-tag`: AI-powered tag suggestions
- `analysis-find-duplicates`: Detect similar content
- `analysis-sentiment`: Emotional tone analysis
- `analysis-extract-entities`: Extract structured data
- `analysis-cluster-notes`: Automatic grouping
- `analysis-recommend-related`: Intelligent recommendations
- `analysis-keyword-extraction`: Key term extraction
- `analysis-content-insights`: Comprehensive analysis

### Streaming Operations (4 tools)
- `streaming-search`: Efficient large-scale search
- `streaming-similarity`: Batch similarity analysis
- `streaming-tag-analysis`: Bulk tag processing
- `streaming-export`: Progressive data export

### Configuration Management (6 tools)
- `config-get`: Retrieve configuration settings
- `config-update`: Update settings with dot notation
- `config-validate`: Schema validation
- `config-export`: Backup configuration
- `config-import`: Restore from backup
- `config-reset`: Reset to defaults

## 📋 Resources (Direct Data Access)

Access data without tool calls - automatically refreshed:

- `notes://keys` - All available note keys with counts
- `notes://key/{key}` - Notes under specific key
- `notes://search/{query}` - Full-text search results
- `notes://stats` - System statistics and health
- `graph://nodes` - Knowledge graph nodes
- `graph://stats` - Graph analytics
- `images://key/{key}` - Image metadata for key

## 🤖 Intelligent Prompts

Pre-built templates for complex knowledge management:

### Available Prompts
- **summarize-notes** - Generate comprehensive summaries
  - Parameters: `key`, `search`, `max_notes`
  
- **find-connections** - Discover concept relationships
  - Parameters: `concept1` (required), `concept2` (required), `depth`
  
- **generate-tags** - AI-powered tag suggestions
  - Parameters: `content` (required), `max_tags`
  
- **knowledge-qa** - Answer questions from your knowledge base
  - Parameters: `question` (required), `context_limit`
  
- **analyze-trends** - Pattern and trend analysis
  - Parameters: `time_period`, `focus_tags`
  
- **suggest-related** - Content-based recommendations
  - Parameters: `reference_note_id`, `reference_content`, `max_suggestions`
  
- **export-summary** - Organized knowledge base exports
  - Parameters: `format`, `include_metadata`, `group_by`

### Prompt Benefits
- **Dynamic Content**: Generated from your actual data
- **Contextual Intelligence**: Uses your knowledge base context
- **Parameterized Flexibility**: Customizable for different use cases
- **Quality Consistency**: Ensures structured, high-quality interactions

## ⚙️ Configuration System

Comprehensive configuration management with 8 sections:

### Configuration Sections
- **database**: Connection and storage settings
- **search**: Search behavior and pagination
- **analysis**: NLP and analysis features
- **streaming**: Streaming operation settings
- **server**: Server metadata and behavior
- **resources**: Resource endpoint configuration
- **prompts**: Prompt template settings
- **logging**: Logger configuration and levels

### Configuration Features
- **Dot Notation Updates**: `logging.level`, `search.resultsPerPage`
- **Schema Validation**: Comprehensive input validation
- **Export/Import**: Backup and restore configurations
- **Section Management**: Work with specific configuration sections
- **Default Reset**: Restore sections to default values
- **Real-time Updates**: Dynamic configuration changes

## Demo Scripts

The project includes comprehensive demonstration scripts to showcase all capabilities:

### Core Demos
```powershell
npm run demo-resources     # Resources system demo
npm run demo-prompts       # Intelligent prompts demo  
npm run demo-advanced      # NLP analysis tools demo
npm run demo-streaming     # Streaming operations demo
npm run demo-config        # Configuration management demo
```

Each demo showcases specific functionality and provides usage examples.

## 🚀 Quick Start

1) **Install Dependencies**
```powershell
npm install
```

2) **Build the Project**
```powershell
npm run build
```

3) **Run Development Server**
```powershell
npm run dev
```

4) **Test Core Functionality**
```powershell
npm run smoke
```

### Environment Variables
- `DB_PATH`: SQLite database path (default: `./data/notes.db`)
- `LOG_LEVEL`: Logging level (`trace|debug|info|warn|error`)
- `LOG_PRETTY`: Human-readable logs (`true|false`)

## 🔗 Integrations

### GitHub Copilot Chat (VS Code)

Add to VS Code Settings (JSON):

```json
{
  "mcpServers": {
    "notes-index": {
      "command": "node",
      "args": ["C:\\projects\\mcp-index-notes\\dist\\mcp.js"],
      "env": {
        "DB_PATH": "C:\\projects\\mcp-index-notes\\data\\notes.db",
        "LOG_LEVEL": "info",
        "LOG_PRETTY": "true"
      }
    }
  }
}
```

### Claude Desktop

Add to Claude Desktop's `settings.json`:

```json
{
  "mcpServers": {
    "notes-index": {
      "command": "node", 
      "args": ["C:\\projects\\mcp-index-notes\\dist\\mcp.js"],
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
      "args": ["C:\\projects\\mcp-index-notes\\dist\\mcp.js"],
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

Add to `~/.continue/config.json`:

```json
{
  "mcpServers": [
    {
      "name": "notes-index",
      "command": "node",
      "args": ["C:\\projects\\mcp-index-notes\\dist\\mcp.js"],
      "env": {
        "DB_PATH": "C:\\projects\\mcp-index-notes\\data\\notes.db",
        "LOG_LEVEL": "info",
        "LOG_PRETTY": "true"
      }
    }
  ]
}
```

## 💡 Usage Examples

### Basic Operations
```
Call tool index-health
Call tool index-upsert with { key: "sql.tips", content: "Use EXPLAIN ANALYZE for performance tuning" }
Call tool index-query with { text: "performance" }
Call tool index-backup
```

### Advanced Analysis
```
Call tool analysis-auto-tag with { content: "React hooks provide state management in functional components" }
Call tool analysis-find-duplicates with { threshold: 0.8 }
Call tool analysis-sentiment with { note_ids: [1, 2, 3] }
Call tool analysis-cluster-notes with { k: 5 }
```

### Configuration Management
```
Call tool config-get with { sections: ["logging", "search"] }
Call tool config-update with { updates: { "logging.level": "debug", "search.resultsPerPage": 25 } }
Call tool config-export with { format: "json", sections: ["server"] }
```

### Streaming Operations
```
Call tool streaming-search with { query: "javascript", batch_size: 100 }
Call tool streaming-similarity with { reference_content: "React development", threshold: 0.7 }
```

### Knowledge Graph
```
Call tool graph-import-from-notes
Call tool graph-path with { from: "javascript", to: "performance" }
Call tool graph-neighbors with { id: "react", depth: 2 }
```

## 📊 System Architecture

### Enhanced MCP Server Structure
- **Core Engine**: TypeScript with MCP SDK v1.1.0
- **Storage**: SQLite with FTS5 full-text search
- **Analysis**: Advanced NLP and machine learning
- **Streaming**: Efficient batch processing
- **Configuration**: Comprehensive management system
- **Graph**: Knowledge relationship mapping
- **Images**: Metadata and binary storage

### Performance Features
- **WAL Mode**: Concurrent access support
- **FTS5 Search**: High-performance full-text indexing
- **Streaming APIs**: Memory-efficient large dataset processing
- **Graph Algorithms**: Efficient path finding and clustering
- **Caching**: Intelligent configuration and analysis caching

## 🎯 What Makes This Special

### Comprehensive MCP Implementation
- **✅ All MCP Features**: Tools, Resources, Prompts fully implemented
- **🧠 Intelligence**: Advanced NLP analysis and recommendations
- **⚡ Performance**: Streaming operations for large datasets
- **🔧 Flexibility**: Comprehensive configuration management
- **📊 Analytics**: Knowledge graph and content insights
- **🔗 Integration**: Ready-to-use with popular AI clients

### Real-World Applications
- **Personal Knowledge Management**: Organize and search personal notes
- **Team Documentation**: Collaborative knowledge sharing
- **Research Projects**: Academic and technical research organization  
- **Content Analysis**: Advanced text analysis and insights
- **AI Workflows**: Enhanced LLM interactions with structured data
- **Data Mining**: Pattern discovery and relationship mapping

## 📁 Data Formats

### JSON Backup Format
```json
{
  "generatedAt": "2025-01-20T12:00:00.000Z",
  "version": "2.0.0",
  "notes": [
    {
      "id": 1,
      "key": "javascript.tips",
      "content": "Use const for immutable references",
      "tags": ["javascript", "best-practices"],
      "metadata": { "category": "programming" },
      "created_at": "2025-01-20T10:00:00.000Z",
      "updated_at": "2025-01-20T11:00:00.000Z"
    }
  ],
  "graph": {
    "nodes": [...],
    "edges": [...]
  },
  "images": [...],
  "config": {...}
}
```

## 🔮 Enhancement Summary

This MCP server has been systematically enhanced from a basic note indexing tool to a comprehensive knowledge management system:

### Phase 1: Resources System ✅
- 7 resource endpoints for direct data access
- Automatic refresh and caching
- No tool calls required for data retrieval

### Phase 2: Intelligent Prompts ✅  
- 7 dynamic prompt templates
- Context-aware generation based on actual data
- Parameterized flexibility for different use cases

### Phase 3: Advanced Analysis Tools ✅
- 8 NLP and machine learning analysis functions
- Auto-tagging, sentiment analysis, duplicate detection
- Clustering, recommendations, and content insights

### Phase 4: Streaming Capabilities ✅
- 4 streaming tools for efficient large-scale operations
- Progress tracking and memory optimization
- Batch processing with configurable parameters

### Phase 5: Configuration Management ✅
- 6 configuration tools with full CRUD operations
- 8 configuration sections with validation
- Export/import, reset, and real-time updates

### Total Enhancement
- **35+ Tools**: From 7 basic tools to 35+ advanced capabilities
- **Modern MCP**: Full implementation of Resources, Prompts, Tools
- **Production Ready**: Comprehensive error handling and validation
- **Extensible**: Modular architecture for future enhancements

---

*Your simple note indexer is now a powerful, intelligent knowledge management system! 🎉*
Showcases NLP analysis tools including auto-tagging, duplicate detection, sentiment analysis, entity extraction, clustering, and intelligent recommendations.
