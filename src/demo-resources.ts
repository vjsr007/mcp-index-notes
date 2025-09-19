#!/usr/bin/env node

/**
 * Demo script showing MCP Resources functionality
 * This simulates how an LLM client would interact with resources
 */

import 'dotenv/config';
import { LiteNotesStore } from './store.lite.js';
import { logger } from './logger.js';

async function demoResources() {
  console.log('🚀 MCP Index Notes - Resources Demo\n');
  
  const db = new LiteNotesStore({ filePath: process.env.DB_PATH?.replace(/\.db$/i, '.json') });
  
  // Setup demo data
  console.log('📝 Setting up demo data...');
  db.upsert({ 
    key: 'javascript.tips', 
    content: 'Use const for immutable variables, let for mutable ones. Avoid var in modern JS.', 
    tags: ['javascript', 'best-practices', 'variables'], 
    metadata: { author: 'demo', difficulty: 'beginner' } 
  });
  
  db.upsert({ 
    key: 'javascript.tips', 
    content: 'Destructuring assignment makes code more readable: const {name, age} = person;', 
    tags: ['javascript', 'es6', 'destructuring'], 
    metadata: { author: 'demo', difficulty: 'intermediate' } 
  });
  
  db.upsert({ 
    key: 'python.tips', 
    content: 'Use list comprehensions for simple transformations: [x*2 for x in numbers]', 
    tags: ['python', 'comprehensions', 'performance'], 
    metadata: { author: 'demo', difficulty: 'intermediate' } 
  });
  
  db.upsert({ 
    key: 'database.optimization', 
    content: 'Index your foreign keys and frequently queried columns for better performance', 
    tags: ['database', 'performance', 'indexing'], 
    metadata: { author: 'demo', difficulty: 'advanced' } 
  });
  
  console.log('✅ Demo data created\n');
  
  // Simulate MCP Resource requests
  console.log('🔍 Available Resources:');
  console.log('- notes://keys');
  console.log('- notes://key/{key}');
  console.log('- notes://search/{query}');
  console.log('- notes://stats');
  console.log('- graph://stats');
  console.log('- images://key/{key}\n');
  
  // Resource: notes://keys
  console.log('📊 Resource: notes://keys');
  const keys = db.listKeys(10);
  console.log(JSON.stringify(keys, null, 2));
  console.log('');
  
  // Resource: notes://key/javascript.tips
  console.log('📝 Resource: notes://key/javascript.tips');
  const jsNotes = db.getByKey('javascript.tips', 10);
  console.log(JSON.stringify(jsNotes.map(n => ({
    id: n.id,
    content: n.content.substring(0, 50) + '...',
    tags: n.tags,
    metadata: n.metadata
  })), null, 2));
  console.log('');
  
  // Resource: notes://search/performance
  console.log('🔎 Resource: notes://search/performance');
  const searchResults = db.search('performance', 5);
  console.log(JSON.stringify(searchResults.map(n => ({
    key: n.key,
    content: n.content.substring(0, 50) + '...',
    tags: n.tags
  })), null, 2));
  console.log('');
  
  // Resource: notes://stats
  console.log('📈 Resource: notes://stats');
  const allKeys = db.listKeys(100);
  const totalNotes = allKeys.reduce((sum, k) => sum + k.count, 0);
  const stats = {
    totalKeys: allKeys.length,
    totalNotes,
    timestamp: new Date().toISOString(),
    topKeys: allKeys.slice(0, 5),
    tagFrequency: getTagFrequency(db)
  };
  console.log(JSON.stringify(stats, null, 2));
  console.log('');
  
  console.log('🎉 Resources Demo Complete!');
  console.log('\n💡 Key Benefits of Resources:');
  console.log('  • Direct data access without tool calls');
  console.log('  • Automatic refresh of data');
  console.log('  • Perfect for LLM context building');
  console.log('  • Supports URI-based querying');
  console.log('  • JSON format for easy parsing');
}

function getTagFrequency(db: any): Record<string, number> {
  const allNotes = db.exportAll();
  const tagFreq: Record<string, number> = {};
  
  for (const note of allNotes) {
    for (const tag of note.tags || []) {
      tagFreq[tag] = (tagFreq[tag] || 0) + 1;
    }
  }
  
  return Object.fromEntries(
    Object.entries(tagFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
  );
}

demoResources().catch(console.error);
