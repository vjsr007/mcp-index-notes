#!/usr/bin/env node

/**
 * Demo script for MCP Prompts functionality
 * Shows how prompts work with sample data
 */

import 'dotenv/config';
import { LiteNotesStore } from './store.lite.js';
import { logger } from './logger.js';

async function demoPrompts() {
  console.log('🎯 MCP Index Notes - Prompts Demo\n');
  
  const db = new LiteNotesStore({ filePath: process.env.DB_PATH?.replace(/\.db$/i, '.json') });
  
  // Setup comprehensive demo data
  console.log('📝 Setting up comprehensive demo data...');
  
  // JavaScript/Programming notes
  db.upsert({ 
    key: 'javascript.patterns', 
    content: 'The Module Pattern in JavaScript provides encapsulation by using closures. It creates private and public methods, helping to avoid global namespace pollution.', 
    tags: ['javascript', 'patterns', 'encapsulation', 'modules'], 
    metadata: { author: 'demo', level: 'intermediate', date: '2025-01-15' } 
  });
  
  db.upsert({ 
    key: 'javascript.async', 
    content: 'Async/await makes asynchronous code more readable than promises chains. Always handle errors with try/catch blocks when using async/await.', 
    tags: ['javascript', 'async', 'promises', 'error-handling'], 
    metadata: { author: 'demo', level: 'advanced', date: '2025-01-20' } 
  });
  
  db.upsert({ 
    key: 'javascript.performance', 
    content: 'Debouncing and throttling are techniques to limit function execution frequency. Debouncing delays execution, throttling limits frequency.', 
    tags: ['javascript', 'performance', 'optimization', 'debouncing'], 
    metadata: { author: 'demo', level: 'intermediate', date: '2025-02-01' } 
  });
  
  // Python notes
  db.upsert({ 
    key: 'python.data-structures', 
    content: 'Python dictionaries are implemented as hash tables, providing O(1) average lookup time. Use sets for fast membership testing.', 
    tags: ['python', 'data-structures', 'performance', 'algorithms'], 
    metadata: { author: 'demo', level: 'intermediate', date: '2025-01-25' } 
  });
  
  db.upsert({ 
    key: 'python.decorators', 
    content: 'Decorators in Python are a powerful way to modify function behavior without changing the function itself. They implement the decorator pattern.', 
    tags: ['python', 'decorators', 'patterns', 'functional-programming'], 
    metadata: { author: 'demo', level: 'advanced', date: '2025-02-05' } 
  });
  
  // Database notes
  db.upsert({ 
    key: 'database.indexing', 
    content: 'Database indexes speed up SELECT queries but slow down INSERT/UPDATE/DELETE operations. Choose indexes based on query patterns.', 
    tags: ['database', 'indexing', 'performance', 'optimization'], 
    metadata: { author: 'demo', level: 'intermediate', date: '2025-01-30' } 
  });
  
  db.upsert({ 
    key: 'database.transactions', 
    content: 'ACID properties ensure database transaction reliability: Atomicity, Consistency, Isolation, Durability. Critical for data integrity.', 
    tags: ['database', 'transactions', 'acid', 'reliability'], 
    metadata: { author: 'demo', level: 'advanced', date: '2025-02-03' } 
  });
  
  // System Design notes
  db.upsert({ 
    key: 'system-design.caching', 
    content: 'Caching strategies include write-through, write-back, and write-around. Choose based on read/write patterns and consistency requirements.', 
    tags: ['system-design', 'caching', 'performance', 'architecture'], 
    metadata: { author: 'demo', level: 'advanced', date: '2025-02-10' } 
  });
  
  db.upsert({ 
    key: 'system-design.patterns', 
    content: 'Microservices architecture promotes loose coupling and independent deployment. However, it introduces complexity in service communication.', 
    tags: ['system-design', 'microservices', 'architecture', 'patterns'], 
    metadata: { author: 'demo', level: 'expert', date: '2025-02-12' } 
  });
  
  console.log('✅ Demo data created with 9 comprehensive notes\n');
  
  // Available prompts
  console.log('🎯 Available Prompts:');
  const availablePrompts = [
    'summarize-notes',
    'find-connections', 
    'generate-tags',
    'knowledge-qa',
    'analyze-trends',
    'suggest-related',
    'export-summary'
  ];
  
  availablePrompts.forEach((prompt, idx) => {
    console.log(`${idx + 1}. ${prompt}`);
  });
  console.log('');
  
  // Demo 1: Summarize JavaScript notes
  console.log('📋 Demo 1: Summarize JavaScript Notes');
  console.log('Prompt: summarize-notes (key: javascript.*)');
  console.log('This would generate a prompt to summarize all JavaScript-related notes...\n');
  
  // Demo 2: Find connections between concepts
  console.log('🔗 Demo 2: Find Connections');
  console.log('Prompt: find-connections (concept1: "performance", concept2: "patterns")');
  console.log('This would generate a prompt to find connections between performance and patterns...\n');
  
  // Demo 3: Generate tags for new content
  console.log('🏷️  Demo 3: Generate Tags');
  const newContent = 'React hooks provide a way to use state and lifecycle methods in functional components. useState and useEffect are the most common hooks.';
  console.log(`Prompt: generate-tags`);
  console.log(`Content: "${newContent}"`);
  console.log('This would generate a prompt to suggest tags for the new content...\n');
  
  // Demo 4: Knowledge Q&A
  console.log('❓ Demo 4: Knowledge Q&A');
  console.log('Prompt: knowledge-qa (question: "What are the best practices for database performance?")');
  console.log('This would generate a prompt to answer the question based on stored knowledge...\n');
  
  // Demo 5: Analyze trends
  console.log('📈 Demo 5: Analyze Trends');
  console.log('Prompt: analyze-trends (focus_tags: "performance,optimization")');
  console.log('This would generate a prompt to analyze trends in performance-related notes...\n');
  
  // Show actual prompt generation example
  console.log('💡 Example Generated Prompt (summarize-notes):');
  console.log('═'.repeat(60));
  
  const jsNotes = [
    ...db.search('javascript', 5)
  ];
  
  const examplePrompt = `Please provide a comprehensive summary of the following notes.

**Context**: Notes matching search "javascript"
**Total Notes**: ${jsNotes.length}

**Instructions**:
1. Identify the main themes and topics
2. Highlight key insights and important information  
3. Note any patterns or connections between the notes
4. Organize the summary in a clear, structured format

**Notes to Summarize**:
${jsNotes.map((note, idx) => `
**Note ${idx + 1}** (Key: ${note.key})
Tags: [${note.tags?.join(', ') || 'none'}]
Content: ${note.content}
---`).join('\n')}

Please provide your summary now.`;

  console.log(examplePrompt);
  console.log('═'.repeat(60));
  
  console.log('\n🎉 Prompts Demo Complete!');
  console.log('\n💡 Key Benefits of Prompts:');
  console.log('  • Pre-built intelligent templates for common tasks');
  console.log('  • Dynamic content based on actual data');
  console.log('  • Consistent, high-quality interactions');
  console.log('  • Parameterized for flexibility');
  console.log('  • Context-aware based on your knowledge base');
  console.log('  • Reduce cognitive load for complex tasks');
}

demoPrompts().catch(console.error);
