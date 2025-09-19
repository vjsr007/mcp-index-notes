/**
 * Streaming capabilities for MCP Index Notes
 * Provides efficient streaming for large operations like bulk searches, analysis, and exports
 */

import { z } from 'zod';
import type { Note, ImageRecord } from './types.js';

// Streaming configuration
export interface StreamingConfig {
  batchSize: number;
  delayMs: number;
  maxItems: number;
}

export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  batchSize: 10,
  delayMs: 50,
  maxItems: 1000
};

// Stream response types
export interface StreamChunk<T> {
  chunk: number;
  data: T[];
  total?: number;
  hasMore: boolean;
  metadata?: Record<string, any>;
}

export interface StreamProgress {
  processed: number;
  total: number;
  percentage: number;
  estimatedTimeMs?: number;
}

/**
 * Generic streaming processor for batch operations
 */
export class StreamProcessor<T> {
  private config: StreamingConfig;
  private startTime: number = 0;

  constructor(config: StreamingConfig = DEFAULT_STREAMING_CONFIG) {
    this.config = config;
  }

  /**
   * Process items in streaming fashion with progress tracking
   */
  async *processStream(
    items: T[],
    processor?: (item: T) => T | Promise<T>
  ): AsyncGenerator<StreamChunk<T>, void, unknown> {
    this.startTime = Date.now();
    const total = Math.min(items.length, this.config.maxItems);
    const effectiveItems = items.slice(0, this.config.maxItems);

    for (let i = 0; i < effectiveItems.length; i += this.config.batchSize) {
      const batch = effectiveItems.slice(i, i + this.config.batchSize);
      const chunkNumber = Math.floor(i / this.config.batchSize) + 1;
      
      // Process batch if processor provided
      let processedBatch = batch;
      if (processor) {
        processedBatch = await Promise.all(
          batch.map(item => processor(item))
        );
      }

      // Calculate progress
      const processed = Math.min(i + batch.length, total);
      const progress: StreamProgress = {
        processed,
        total,
        percentage: Math.round((processed / total) * 100),
        estimatedTimeMs: this.calculateETA(processed, total)
      };

      yield {
        chunk: chunkNumber,
        data: processedBatch,
        total,
        hasMore: processed < total,
        metadata: { progress }
      };

      // Throttle to prevent overwhelming the client
      if (this.config.delayMs > 0 && processed < total) {
        await new Promise(resolve => setTimeout(resolve, this.config.delayMs));
      }
    }
  }

  private calculateETA(processed: number, total: number): number {
    if (processed === 0) return 0;
    const elapsed = Date.now() - this.startTime;
    const rate = processed / elapsed;
    const remaining = total - processed;
    return Math.round(remaining / rate);
  }
}

/**
 * Streaming search with FTS5 and filtering
 */
export class StreamingSearch {
  constructor(private config: StreamingConfig = DEFAULT_STREAMING_CONFIG) {}

  /**
   * Stream search results with optional filtering and transformation
   */
  async *searchStream(
    notes: Note[],
    query: string,
    filters?: {
      tags?: string[];
      keys?: string[];
      metadata?: Record<string, any>;
    }
  ): AsyncGenerator<StreamChunk<Note>, void, unknown> {
    // Apply filters
    let filteredNotes = notes;
    
    if (filters?.tags?.length) {
      filteredNotes = filteredNotes.filter(note => 
        note.tags?.some(tag => filters.tags!.includes(tag))
      );
    }
    
    if (filters?.keys?.length) {
      filteredNotes = filteredNotes.filter(note => 
        filters.keys!.some(key => note.key.includes(key))
      );
    }
    
    if (filters?.metadata) {
      filteredNotes = filteredNotes.filter(note => {
        if (!note.metadata) return false;
        return Object.entries(filters.metadata!).every(([key, value]) => 
          note.metadata![key] === value
        );
      });
    }

    // Score and sort by relevance if query provided
    if (query.trim()) {
      const queryLower = query.toLowerCase();
      filteredNotes = filteredNotes.map(note => ({
        ...note,
        _score: this.calculateRelevanceScore(note, queryLower)
      })).sort((a, b) => (b._score || 0) - (a._score || 0));
    }

    const processor = new StreamProcessor<Note>(this.config);
    yield* processor.processStream(filteredNotes);
  }

  private calculateRelevanceScore(note: Note, query: string): number {
    let score = 0;
    
    // Title/key match (highest weight)
    if (note.key.toLowerCase().includes(query)) {
      score += 10;
    }
    
    // Content match
    const contentMatches = (note.content.toLowerCase().match(new RegExp(query, 'g')) || []).length;
    score += contentMatches * 2;
    
    // Tag match
    if (note.tags?.some(tag => tag.toLowerCase().includes(query))) {
      score += 5;
    }
    
    // Metadata match
    if (note.metadata) {
      const metadataStr = JSON.stringify(note.metadata).toLowerCase();
      if (metadataStr.includes(query)) {
        score += 3;
      }
    }
    
    return score;
  }
}

/**
 * Streaming analysis operations
 */
export class StreamingAnalysis {
  constructor(private config: StreamingConfig = DEFAULT_STREAMING_CONFIG) {}

  /**
   * Stream similarity analysis between notes
   */
  async *findSimilarStream(
    targetNote: Note,
    allNotes: Note[],
    threshold: number = 0.3
  ): AsyncGenerator<StreamChunk<{ note: Note; similarity: number }>, void, unknown> {
    const targetWords = this.extractWords(targetNote.content);
    const filteredNotes = allNotes.filter(note => note.id !== targetNote.id);
    
    const processor = new StreamProcessor<{ note: Note; similarity: number }>(this.config);
    
    // Transform notes to similarity objects
    const similarityData = filteredNotes.map(note => {
      const similarity = this.calculateSimilarity(targetWords, this.extractWords(note.content));
      return { note, similarity };
    }).filter(item => item.similarity >= threshold);

    yield* processor.processStream(similarityData);
  }

  /**
   * Stream tag analysis across all notes
   */
  async *analyzeTagsStream(
    notes: Note[]
  ): AsyncGenerator<StreamChunk<{ tag: string; count: number; notes: string[] }>, void, unknown> {
    // Collect all tags
    const tagMap = new Map<string, { count: number; notes: string[] }>();
    
    for (const note of notes) {
      if (note.tags) {
        for (const tag of note.tags) {
          if (!tagMap.has(tag)) {
            tagMap.set(tag, { count: 0, notes: [] });
          }
          const tagData = tagMap.get(tag)!;
          tagData.count++;
          tagData.notes.push(note.key);
        }
      }
    }

    // Convert to array and stream
    const tagAnalysis = Array.from(tagMap.entries()).map(([tag, data]) => ({
      tag,
      count: data.count,
      notes: data.notes
    })).sort((a, b) => b.count - a.count);

    const processor = new StreamProcessor<{ tag: string; count: number; notes: string[] }>(this.config);
    yield* processor.processStream(tagAnalysis);
  }

  private extractWords(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  private calculateSimilarity(words1: string[], words2: string[]): number {
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

/**
 * Streaming export operations
 */
export class StreamingExport {
  constructor(private config: StreamingConfig = DEFAULT_STREAMING_CONFIG) {}

  /**
   * Stream export with format transformation
   */
  async *exportStream<T>(
    items: T[],
    formatter?: (item: T) => any
  ): AsyncGenerator<StreamChunk<any>, void, unknown> {
    const processor = new StreamProcessor<T>(this.config);
    
    yield* processor.processStream(items, formatter);
  }

  /**
   * Stream backup creation with progress
   */
  async *createBackupStream(
    notes: Note[],
    images?: ImageRecord[]
  ): AsyncGenerator<StreamChunk<{ type: 'note' | 'image'; data: any }>, void, unknown> {
    const allItems: { type: 'note' | 'image'; data: any }[] = [
      ...notes.map(note => ({ type: 'note' as const, data: note })),
      ...(images || []).map(image => ({ type: 'image' as const, data: image }))
    ];

    const processor = new StreamProcessor<{ type: 'note' | 'image'; data: any }>(this.config);
    yield* processor.processStream(allItems);
  }
}

// Validation schemas for streaming operations
export const StreamingConfigSchema = z.object({
  batchSize: z.number().min(1).max(100).default(10),
  delayMs: z.number().min(0).max(1000).default(50),
  maxItems: z.number().min(1).max(10000).default(1000)
});

export const StreamingSearchSchema = z.object({
  query: z.string(),
  config: StreamingConfigSchema.optional(),
  filters: z.object({
    tags: z.array(z.string()).optional(),
    keys: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional()
  }).optional()
});

export const StreamingSimilaritySchema = z.object({
  targetKey: z.string(),
  threshold: z.number().min(0).max(1).default(0.3),
  config: StreamingConfigSchema.optional()
});

export const StreamingExportSchema = z.object({
  format: z.enum(['json', 'csv', 'markdown']).default('json'),
  includeImages: z.boolean().default(false),
  config: StreamingConfigSchema.optional(),
  filters: z.object({
    keys: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional()
  }).optional()
});
