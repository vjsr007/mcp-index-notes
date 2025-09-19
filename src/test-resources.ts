#!/usr/bin/env node

import 'dotenv/config';
import { LiteNotesStore } from './store.lite.js';
import { logger } from './logger.js';

// Test resources functionality by simulating resource requests
async function testResources() {
  logger.info('Testing resources functionality...');
  
  const db = new LiteNotesStore({ filePath: process.env.DB_PATH?.replace(/\.db$/i, '.json') });
  
  // Add some test data
  logger.info('Adding test data...');
  db.upsert({ key: 'test.resource1', content: 'This is test content for resource testing', tags: ['test', 'resource'], metadata: {} });
  db.upsert({ key: 'test.resource2', content: 'Another test note with different content', tags: ['test', 'demo'], metadata: {} });
  db.upsert({ key: 'prod.config', content: 'Production configuration settings', tags: ['prod', 'config'], metadata: {} });
  
  // Test different resource endpoints
  logger.info('Testing notes://keys resource...');
  const keys = db.listKeys(10);
  console.log('Keys resource:', JSON.stringify(keys, null, 2));
  
  logger.info('Testing notes://key/{key} resource...');
  const testNotes = db.getByKey('test.resource1', 10);
  console.log('Notes by key resource:', JSON.stringify(testNotes, null, 2));
  
  logger.info('Testing notes://search/{query} resource...');
  const searchResults = db.search('test', 10);
  console.log('Search resource:', JSON.stringify(searchResults, null, 2));
  
  logger.info('Testing notes://stats resource...');
  const allKeys = db.listKeys(1000);
  const totalNotes = allKeys.reduce((sum, k) => sum + k.count, 0);
  const stats = {
    totalKeys: allKeys.length,
    totalNotes,
    timestamp: new Date().toISOString(),
    topKeys: allKeys.slice(0, 5)
  };
  console.log('Stats resource:', JSON.stringify(stats, null, 2));
  
  logger.info('Resources test completed successfully!');
}

testResources().catch(console.error);
