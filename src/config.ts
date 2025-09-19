/**
 * Configuration system for MCP Index Notes
 * Provides flexible configuration management for server behavior, limits, and features
 */

import { z } from 'zod';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import { logger } from './logger.js';

// Configuration schemas
export const DatabaseConfigSchema = z.object({
  filePath: z.string().optional(),
  backupEnabled: z.boolean().default(true),
  backupInterval: z.number().min(0).default(3600000), // 1 hour in ms
  maxBackups: z.number().min(1).max(50).default(10),
  autoVacuum: z.boolean().default(true)
});

export const SearchConfigSchema = z.object({
  defaultLimit: z.number().min(1).max(1000).default(10),
  maxResults: z.number().min(1).max(10000).default(1000),
  enableFuzzySearch: z.boolean().default(true),
  fuzzyThreshold: z.number().min(0).max(1).default(0.6),
  highlightResults: z.boolean().default(true)
});

export const AnalysisConfigSchema = z.object({
  nlp: z.object({
    enabled: z.boolean().default(true),
    minWordLength: z.number().min(1).max(10).default(3),
    maxKeywords: z.number().min(1).max(100).default(10),
    sentimentEnabled: z.boolean().default(true),
    entityExtractionEnabled: z.boolean().default(true)
  }),
  similarity: z.object({
    defaultThreshold: z.number().min(0).max(1).default(0.3),
    maxComparisons: z.number().min(1).max(10000).default(1000),
    algorithm: z.enum(['jaccard', 'cosine', 'levenshtein']).default('jaccard')
  }),
  clustering: z.object({
    enabled: z.boolean().default(true),
    defaultClusters: z.number().min(1).max(20).default(5),
    maxIterations: z.number().min(1).max(100).default(10),
    minClusterSize: z.number().min(1).max(100).default(2)
  })
});

export const StreamingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultBatchSize: z.number().min(1).max(100).default(10),
  maxBatchSize: z.number().min(1).max(1000).default(100),
  defaultDelay: z.number().min(0).max(5000).default(50),
  maxItems: z.number().min(1).max(100000).default(10000),
  progressTracking: z.boolean().default(true)
});

export const ServerConfigSchema = z.object({
  maxConcurrentOperations: z.number().min(1).max(100).default(10),
  requestTimeout: z.number().min(1000).max(300000).default(30000), // 30 seconds
  enableCaching: z.boolean().default(true),
  cacheSize: z.number().min(10).max(10000).default(1000),
  rateLimiting: z.object({
    enabled: z.boolean().default(false),
    requestsPerMinute: z.number().min(1).max(1000).default(100),
    burstLimit: z.number().min(1).max(100).default(20)
  })
});

export const ResourcesConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxResponseSize: z.number().min(1024).max(10485760).default(1048576), // 1MB
  enableCompression: z.boolean().default(true),
  cacheTTL: z.number().min(0).max(3600000).default(300000) // 5 minutes
});

export const PromptsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  customPrompts: z.array(z.object({
    name: z.string(),
    description: z.string(),
    template: z.string(),
    arguments: z.array(z.object({
      name: z.string(),
      description: z.string(),
      required: z.boolean().default(false)
    })).default([])
  })).default([]),
  enableTemplateVariables: z.boolean().default(true)
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  pretty: z.boolean().default(false),
  enableMetrics: z.boolean().default(true),
  metricsInterval: z.number().min(1000).max(300000).default(60000), // 1 minute
  auditLog: z.boolean().default(false)
});

// Main configuration schema
export const ConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  database: DatabaseConfigSchema.optional(),
  search: SearchConfigSchema.optional(),
  analysis: AnalysisConfigSchema.optional(),
  streaming: StreamingConfigSchema.optional(),
  server: ServerConfigSchema.optional(),
  resources: ResourcesConfigSchema.optional(),
  prompts: PromptsConfigSchema.optional(),
  logging: LoggingConfigSchema.optional()
});

export type Config = z.infer<typeof ConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type SearchConfig = z.infer<typeof SearchConfigSchema>;
export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;
export type StreamingConfig = z.infer<typeof StreamingConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type ResourcesConfig = z.infer<typeof ResourcesConfigSchema>;
export type PromptsConfig = z.infer<typeof PromptsConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

/**
 * Configuration manager for the MCP server
 */
export class ConfigManager {
  private config: Config;
  private configPath: string;
  private watchers: Map<string, (newValue: any, oldValue: any) => void> = new Map();

  constructor(configPath: string = './config.json') {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file or create default
   */
  private loadConfig(): Config {
    try {
      if (existsSync(this.configPath)) {
        const configData = JSON.parse(readFileSync(this.configPath, 'utf-8'));
        const parsed = ConfigSchema.parse(configData);
        logger.info(`Configuration loaded successfully from ${this.configPath}`);
        return parsed;
      } else {
        // Create default configuration
        const defaultConfig = ConfigSchema.parse({});
        this.saveConfig(defaultConfig);
        logger.info(`Default configuration created at ${this.configPath}`);
        return defaultConfig;
      }
    } catch (error: any) {
      logger.error(`Failed to load configuration, using defaults: ${error.message}`);
      return ConfigSchema.parse({});
    }
  }

  /**
   * Save configuration to file
   */
  private saveConfig(config: Config): void {
    try {
      // Ensure directory exists
      const dir = dirname(this.configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
      logger.info(`Configuration saved to ${this.configPath}`);
    } catch (error: any) {
      logger.error(`Failed to save configuration: ${error.message}`);
    }
  }

  /**
   * Get full configuration
   */
  public getConfig(): Config {
    return { ...this.config };
  }

  /**
   * Get section of configuration
   */
  public getSection<K extends keyof Config>(section: K): Config[K] {
    return JSON.parse(JSON.stringify(this.config[section]));
  }

  /**
   * Update entire configuration
   */
  public updateConfig(newConfig: Partial<Config>): boolean {
    try {
      const oldConfig = { ...this.config };
      const mergedConfig = { ...this.config, ...newConfig };
      const validated = ConfigSchema.parse(mergedConfig);
      
      this.config = validated;
      this.saveConfig(this.config);
      
      // Notify watchers
      this.notifyWatchers(oldConfig, this.config);
      
      return true;
    } catch (error: any) {
      logger.error(`Failed to update configuration: ${error.message}`);
      return false;
    }
  }

  /**
   * Update specific section of configuration
   */
  public updateSection<K extends keyof Config>(section: K, sectionConfig: Partial<Config[K]>): boolean {
    try {
      const oldConfig = { ...this.config };
      const currentSection = this.config[section] || {};
      const updatedSection = { ...currentSection, ...sectionConfig };
      
      return this.updateConfig({ [section]: updatedSection } as Partial<Config>);
    } catch (error: any) {
      logger.error(`Failed to update configuration section ${String(section)}: ${error.message}`);
      return false;
    }
  }

  /**
   * Reset configuration to defaults
   */
  public resetConfig(): boolean {
    try {
      const defaultConfig = ConfigSchema.parse({});
      this.config = defaultConfig;
      this.saveConfig(this.config);
      logger.info('Configuration reset to defaults');
      return true;
    } catch (error: any) {
      logger.error(`Failed to reset configuration: ${error.message}`);
      return false;
    }
  }

  /**
   * Watch for configuration changes
   */
  public watch(path: string, callback: (newValue: any, oldValue: any) => void): void {
    this.watchers.set(path, callback);
  }

  /**
   * Remove configuration watcher
   */
  public unwatch(path: string): void {
    this.watchers.delete(path);
  }

  /**
   * Notify watchers of configuration changes
   */
  private notifyWatchers(oldConfig: Config, newConfig: Config): void {
    for (const [path, callback] of this.watchers) {
      const oldValue = this.getValueByPath(oldConfig, path);
      const newValue = this.getValueByPath(newConfig, path);
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        try {
          callback(newValue, oldValue);
        } catch (error: any) {
          logger.error(`Configuration watcher callback failed for ${path}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Get configuration value by dot-notation path
   */
  public getValue(path: string): any {
    return this.getValueByPath(this.config, path);
  }

  /**
   * Set configuration value by dot-notation path
   */
  public setValue(path: string, value: any): boolean {
    try {
      const pathParts = path.split('.');
      const newConfig = JSON.parse(JSON.stringify(this.config));
      
      let current: any = newConfig;
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (!(pathParts[i] in current)) {
          current[pathParts[i]] = {};
        }
        current = current[pathParts[i]];
      }
      
      current[pathParts[pathParts.length - 1]] = value;
      
      return this.updateConfig(newConfig);
    } catch (error: any) {
      logger.error(`Failed to set configuration value ${path}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get value by dot-notation path
   */
  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Validate configuration schema
   */
  public validateConfig(config: any): { valid: boolean; errors?: string[] } {
    try {
      ConfigSchema.parse(config);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        return { valid: false, errors };
      }
      return { valid: false, errors: [(error as Error).message] };
    }
  }

  /**
   * Get configuration schema for documentation
   */
  public getSchema(): any {
    return ConfigSchema;
  }

  /**
   * Export configuration with metadata
   */
  public exportConfig(): { config: Config; metadata: { version: string; exportedAt: string; path: string } } {
    return {
      config: this.getConfig(),
      metadata: {
        version: this.config.version,
        exportedAt: new Date().toISOString(),
        path: this.configPath
      }
    };
  }

  /**
   * Import configuration from exported data
   */
  public importConfig(exportedData: { config: Config; metadata?: any }): boolean {
    try {
      const validated = ConfigSchema.parse(exportedData.config);
      this.config = validated;
      this.saveConfig(this.config);
      logger.info('Configuration imported successfully');
      return true;
    } catch (error: any) {
      logger.error(`Failed to import configuration: ${error.message}`);
      return false;
    }
  }
}

// Global configuration instance
let globalConfig: ConfigManager | null = null;

/**
 * Get or create global configuration manager
 */
export function getConfig(configPath?: string): ConfigManager {
  if (!globalConfig) {
    globalConfig = new ConfigManager(configPath);
  }
  return globalConfig;
}

/**
 * Configuration validation schemas for API endpoints
 */
export const ConfigUpdateSchema = z.object({
  section: z.enum(['database', 'search', 'analysis', 'streaming', 'server', 'resources', 'prompts', 'logging']).optional(),
  path: z.string().optional(),
  value: z.any(),
  merge: z.boolean().default(true)
});

export const ConfigExportSchema = z.object({
  includeMetadata: z.boolean().default(true),
  sections: z.array(z.string()).optional()
});

export const ConfigImportSchema = z.object({
  config: z.any(),
  overwrite: z.boolean().default(false),
  validateOnly: z.boolean().default(false)
});
