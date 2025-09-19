#!/usr/bin/env node

/**
 * Demo script for Advanced Analysis Tools
 * Shows auto-tagging, duplicate detection, sentiment analysis, and more
 */

import 'dotenv/config';
import { LiteNotesStore } from './store.lite.js';
import { suggestTags, findDuplicates, analyzeSentiment, extractEntities, clusterNotes, generateRecommendations, extractKeywords } from './analysis.js';

async function demoAdvancedTools() {
  console.log('🧠 MCP Index Notes - Advanced Analysis Tools Demo\n');
  
  const db = new LiteNotesStore({ filePath: process.env.DB_PATH?.replace(/\.db$/i, '.json') });
  
  // Setup comprehensive test data
  console.log('📝 Setting up test data for analysis...');
  
  const testNotes = [
    {
      key: 'react.performance',
      content: 'React performance optimization is crucial for large applications. Use React.memo, useMemo, and useCallback to prevent unnecessary re-renders. Profiling with React DevTools helps identify bottlenecks.',
      tags: ['react', 'performance', 'optimization'],
      metadata: { difficulty: 'intermediate', category: 'frontend' }
    },
    {
      key: 'react.hooks',
      content: 'React hooks revolutionized functional components. useState manages local state, useEffect handles side effects, and custom hooks enable logic reuse across components.',
      tags: ['react', 'hooks', 'functional-components'],
      metadata: { difficulty: 'beginner', category: 'frontend' }
    },
    {
      key: 'database.performance',
      content: 'Database performance optimization involves proper indexing, query optimization, and connection pooling. Monitor slow queries and use EXPLAIN to understand execution plans.',
      tags: ['database', 'performance', 'sql'],
      metadata: { difficulty: 'advanced', category: 'backend' }
    },
    {
      key: 'security.best-practices',
      content: 'Security best practices include input validation, SQL injection prevention, XSS protection, and proper authentication. Always sanitize user input and use parameterized queries.',
      tags: ['security', 'best-practices', 'web'],
      metadata: { difficulty: 'intermediate', category: 'security' }
    },
    {
      key: 'node.performance',
      content: 'Node.js performance can be improved through clustering, caching, and avoiding blocking operations. Use async/await properly and profile memory usage regularly.',
      tags: ['nodejs', 'performance', 'javascript'],
      metadata: { difficulty: 'intermediate', category: 'backend' }
    },
    {
      key: 'duplicate.content.1',
      content: 'React performance optimization is essential for large applications. Use React.memo, useMemo, and useCallback to avoid unnecessary re-renders.',
      tags: ['react', 'performance'],
      metadata: { category: 'frontend' }
    },
    {
      key: 'troubleshooting.debug',
      content: 'Debugging is frustrating when errors are unclear. Always check logs, use proper error handling, and reproduce issues in controlled environments. This process can be time-consuming but necessary.',
      tags: ['debugging', 'troubleshooting', 'errors'],
      metadata: { difficulty: 'intermediate', category: 'general' }
    },
    {
      key: 'api.design.excellent',
      content: 'Excellent API design follows REST principles, uses consistent naming, and provides clear documentation. Well-designed APIs are intuitive and easy to use, making development a joy.',
      tags: ['api', 'design', 'rest'],
      metadata: { difficulty: 'intermediate', category: 'backend' }
    }
  ];

  // Clear existing data and add test notes
  try {
    const existingNotes = db.exportAll();
    existingNotes.forEach(note => {
      if (note.id) db.deleteById(note.id);
    });
  } catch (e) {
    // Database might be empty
  }

  testNotes.forEach(note => {
    db.upsert(note);
  });

  console.log(`✅ Added ${testNotes.length} test notes\n`);

  // Demo 1: Auto-tagging
  console.log('🏷️  Demo 1: Auto-Tagging with NLP Analysis');
  console.log('═'.repeat(60));
  
  const newContent = 'This tutorial covers Vue.js composition API with TypeScript. Learn reactive state management, computed properties, and component lifecycle in modern Vue development.';
  console.log(`Content: "${newContent}"\n`);
  
  const allNotes = db.exportAll();
  const existingTags = Array.from(new Set(allNotes.flatMap(note => note.tags || [])));
  const suggestedTags = suggestTags(newContent, existingTags, 5);
  
  console.log(`Existing tags in system: ${existingTags.join(', ')}`);
  console.log(`Suggested tags: ${suggestedTags.join(', ')}\n`);

  // Demo 2: Duplicate Detection
  console.log('🔍 Demo 2: Duplicate Detection');
  console.log('═'.repeat(60));
  
  const duplicates = findDuplicates(allNotes, 0.7);
  console.log(`Found ${duplicates.length} potential duplicates:\n`);
  
  duplicates.forEach((dup, idx) => {
    console.log(`${idx + 1}. Similarity: ${(dup.similarity * 100).toFixed(1)}%`);
    console.log(`   Note 1 [${dup.note1.key}]: ${dup.note1.content.substring(0, 80)}...`);
    console.log(`   Note 2 [${dup.note2.key}]: ${dup.note2.content.substring(0, 80)}...\n`);
  });

  // Demo 3: Sentiment Analysis
  console.log('😊 Demo 3: Sentiment Analysis');
  console.log('═'.repeat(60));
  
  const sentimentResults = allNotes.slice(0, 4).map(note => {
    const sentiment = analyzeSentiment(note.content);
    return { key: note.key, ...sentiment };
  });
  
  sentimentResults.forEach(result => {
    const emoji = result.sentiment === 'positive' ? '😊' : result.sentiment === 'negative' ? '😟' : '😐';
    console.log(`${emoji} [${result.key}]: ${result.sentiment} (score: ${result.score.toFixed(2)}, confidence: ${(result.confidence * 100).toFixed(1)}%)`);
  });
  console.log('');

  // Demo 4: Entity Extraction
  console.log('📋 Demo 4: Entity Extraction');
  console.log('═'.repeat(60));
  
  const testContentWithEntities = 'Contact john.doe@example.com for API documentation at https://api.example.com. The project deadline is 2025-12-31. Use version 2.4.1 for @teamlead review.';
  const entities = extractEntities(testContentWithEntities);
  
  console.log(`Content: "${testContentWithEntities}"\n`);
  console.log('Extracted entities:');
  console.log(`  📧 Emails: ${entities.emails.join(', ') || 'none'}`);
  console.log(`  🔗 URLs: ${entities.urls.join(', ') || 'none'}`);
  console.log(`  📅 Dates: ${entities.dates.join(', ') || 'none'}`);
  console.log(`  🔢 Numbers: ${entities.numbers.slice(0, 5).join(', ') || 'none'}`);
  console.log(`  💬 Mentions: ${entities.mentions.join(', ') || 'none'}\n`);

  // Demo 5: Keyword Extraction
  console.log('🔤 Demo 5: Keyword Extraction');
  console.log('═'.repeat(60));
  
  const sampleNote = allNotes[0];
  const keywords = extractKeywords(sampleNote.content, 8);
  
  console.log(`Note [${sampleNote.key}]: ${sampleNote.content.substring(0, 100)}...`);
  console.log(`Keywords: ${keywords.join(', ')}\n`);

  // Demo 6: Note Clustering
  console.log('📊 Demo 6: Smart Note Clustering');
  console.log('═'.repeat(60));
  
  const clusters = clusterNotes(allNotes, 3);
  
  clusters.forEach((cluster, idx) => {
    console.log(`Cluster ${idx + 1} (${cluster.notes.length} notes):`);
    console.log(`  Keywords: ${cluster.centroid.slice(0, 5).join(', ')}`);
    cluster.notes.forEach(note => {
      console.log(`    - [${note.key}]: ${note.content.substring(0, 60)}...`);
    });
    console.log('');
  });

  // Demo 7: Intelligent Recommendations
  console.log('💡 Demo 7: Intelligent Recommendations');
  console.log('═'.repeat(60));
  
  const targetNote = allNotes.find(note => note.key === 'react.performance');
  if (targetNote) {
    const recommendations = generateRecommendations(targetNote, allNotes, 3);
    
    console.log(`Target note [${targetNote.key}]: ${targetNote.content.substring(0, 80)}...\n`);
    console.log('Recommended related notes:');
    
    recommendations.forEach((rec, idx) => {
      console.log(`${idx + 1}. [${rec.note.key}] (Score: ${(rec.score * 100).toFixed(1)}%)`);
      console.log(`   Content: ${rec.note.content.substring(0, 70)}...`);
      console.log(`   Reasons: ${rec.reasons.join(', ')}\n`);
    });
  }

  console.log('🎉 Advanced Analysis Demo Complete!\n');
  console.log('💡 Available Advanced Tools:');
  console.log('  • analysis-auto-tag - Automatic tag suggestions using NLP');
  console.log('  • analysis-find-duplicates - Detect similar/duplicate content');
  console.log('  • analysis-sentiment - Analyze emotional tone of notes');
  console.log('  • analysis-extract-entities - Extract emails, URLs, dates, etc.');
  console.log('  • analysis-cluster-notes - Group similar notes automatically');
  console.log('  • analysis-recommend-related - Smart content recommendations');
  console.log('  • analysis-keyword-extraction - Extract key terms and phrases');
  console.log('  • analysis-content-insights - Comprehensive content analysis');
}

demoAdvancedTools().catch(console.error);
