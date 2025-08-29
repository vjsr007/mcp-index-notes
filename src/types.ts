import { z } from 'zod';

export const NoteSchema = z.object({
  key: z.string().min(1, 'key is required'),
  content: z.string().min(1, 'content is required'),
  tags: z.array(z.string()).optional().default([]),
  metadata: z.record(z.any()).optional().default({}),
});

export type Note = z.infer<typeof NoteSchema> & { id?: number; created_at?: string; updated_at?: string };

export const QuerySchema = z.object({
  key: z.string().optional(),
  text: z.string().optional(),
  limit: z.number().int().positive().max(100).optional().default(10),
});

export type Query = z.infer<typeof QuerySchema>;

export const BackupOptionsSchema = z.object({
  enabled: z.boolean().optional().default(false),
  dir: z.string().optional(),
});

export type BackupOptions = z.infer<typeof BackupOptionsSchema>;

export const UpsertSchema = NoteSchema.extend({
  id: z.number().int().positive().optional(),
  backup: BackupOptionsSchema.optional(),
});

export type UpsertInput = z.infer<typeof UpsertSchema>;

export const DeleteSchema = z.object({
  id: z.number().int().positive().optional(),
  key: z.string().optional(),
});

export type DeleteInput = z.infer<typeof DeleteSchema>;

export const RestoreSchema = z.object({
  file: z.string(),
});

export type RestoreInput = z.infer<typeof RestoreSchema>;

export const HealthSchema = z.object({});

export type HealthInput = z.infer<typeof HealthSchema>;

// Graph-related schemas
export const GraphNodeSchema = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().min(1),
  type: z.string().optional(),
  props: z.record(z.any()).optional().default({}),
});
export type GraphNodeInput = z.infer<typeof GraphNodeSchema>;

export const GraphNeighborsSchema = z.object({
  node: z.union([
    z.number().int().positive(),
    z.object({ label: z.string(), type: z.string().optional() }),
  ]),
  depth: z.number().int().positive().max(6).optional().default(1),
  limit: z.number().int().positive().max(200).optional().default(50),
});
export type GraphNeighborsInput = z.infer<typeof GraphNeighborsSchema>;

export const GraphPathSchema = z.object({
  from: z.union([
    z.number().int().positive(),
    z.object({ label: z.string(), type: z.string().optional() }),
  ]),
  to: z.union([
    z.number().int().positive(),
    z.object({ label: z.string(), type: z.string().optional() }),
  ]),
  maxDepth: z.number().int().positive().max(10).optional().default(4),
});
export type GraphPathInput = z.infer<typeof GraphPathSchema>;

export const GraphImportSchema = z.object({
  source: z.enum(['all', 'key']).optional().default('all'),
  key: z.string().optional(),
});
export type GraphImportInput = z.infer<typeof GraphImportSchema>;

export const GraphStatsSchema = z.object({});
export type GraphStatsInput = z.infer<typeof GraphStatsSchema>;

// Image-related schemas
export const ImageUpsertSchema = z.object({
  key: z.string().min(1, 'key is required'),
  // Either provide raw base64 data (without data:mime prefix) or a file path to read
  data: z.string().optional(),
  file: z.string().optional(),
  mime: z.string().optional(),
  metadata: z.record(z.any()).optional().default({}),
});
export type ImageUpsertInput = z.infer<typeof ImageUpsertSchema>;

export const ImageGetSchema = z.object({
  id: z.number().int().positive().optional(),
  key: z.string().optional(),
  limit: z.number().int().positive().max(50).optional().default(10),
  includeData: z.boolean().optional().default(false),
});
export type ImageGetInput = z.infer<typeof ImageGetSchema>;

export const ImageDeleteSchema = z.object({
  id: z.number().int().positive().optional(),
  key: z.string().optional(),
});
export type ImageDeleteInput = z.infer<typeof ImageDeleteSchema>;

export const ImageExportSchema = z.object({
  id: z.number().int().positive().optional(),
  key: z.string().optional(),
  limit: z.number().int().positive().max(100).optional().default(20),
  dir: z.string().optional(),
  includeData: z.boolean().optional().default(true), // force include data if not provided
});
export type ImageExportInput = z.infer<typeof ImageExportSchema>;

export interface ImageRecord {
  id?: number;
  key: string;
  mime: string;
  size: number; // bytes
  metadata: Record<string, any>;
  created_at?: string;
  data?: string; // base64 when requested
}
