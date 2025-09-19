#!/usr/bin/env node

/**
 * Demo script for Streaming Capabilities
 * Shows efficient streaming for large operations like searches, analysis, and exports
 */

import 'dotenv/config';
import { LiteNotesStore } from './store.lite.js';
import { StreamingSearch, StreamingAnalysis, StreamingExport } from './streaming.js';

async function demoStreamingCapabilities() {
  console.log('🌊 MCP Index Notes - Streaming Capabilities Demo\n');
  
  const db = new LiteNotesStore({ filePath: process.env.DB_PATH?.replace(/\.db$/i, '.json') });
  
  // Setup comprehensive test data for streaming
  console.log('📝 Setting up large dataset for streaming demo...');
  
  const largeTestDataset = [];
  
  // Generate diverse test notes for streaming scenarios
  const topics = [
    'react', 'vue', 'angular', 'svelte', 'node', 'python', 'java', 'rust',
    'database', 'mongodb', 'postgresql', 'redis', 'elasticsearch',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform',
    'machine-learning', 'ai', 'data-science', 'analytics', 'visualization',
    'security', 'authentication', 'authorization', 'encryption', 'compliance',
    'performance', 'optimization', 'caching', 'scaling', 'monitoring',
    'testing', 'debugging', 'deployment', 'ci-cd', 'automation'
  ];
  
  const difficulties = ['beginner', 'intermediate', 'advanced', 'expert'];
  const categories = ['frontend', 'backend', 'devops', 'data', 'security', 'mobile'];
  
  // Generate 50 diverse notes
  for (let i = 1; i <= 50; i++) {
    const primaryTopic = topics[Math.floor(Math.random() * topics.length)];
    const secondaryTopic = topics[Math.floor(Math.random() * topics.length)];
    const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
    const category = categories[Math.floor(Math.random() * categories.length)];
    
    const contentTemplates = [
      `${primaryTopic} is essential for modern ${category} development. Understanding ${secondaryTopic} integration helps build scalable applications. Key concepts include proper architecture, performance optimization, and security best practices.`,
      `Advanced ${primaryTopic} techniques involve ${secondaryTopic} patterns and methodologies. This ${difficulty} level content covers implementation strategies, common pitfalls, and optimization approaches for production environments.`,
      `Best practices for ${primaryTopic} development include ${secondaryTopic} considerations. Learn about testing strategies, deployment pipelines, and monitoring solutions that ensure reliability and maintainability.`,
      `Deep dive into ${primaryTopic} with ${secondaryTopic} integration. Explore advanced concepts, architectural patterns, and real-world applications that demonstrate professional ${category} development standards.`,
      `Comprehensive guide to ${primaryTopic} covering ${secondaryTopic} fundamentals. From basic concepts to advanced implementations, this content provides thorough coverage for ${difficulty} level developers.`
    ];
    
    const content = contentTemplates[Math.floor(Math.random() * contentTemplates.length)];
    
    largeTestDataset.push({
      key: `${category}.${primaryTopic}.${i.toString().padStart(3, '0')}`,
      content,
      tags: [primaryTopic, secondaryTopic, category, difficulty],
      metadata: { 
        difficulty, 
        category, 
        priority: Math.floor(Math.random() * 5) + 1,
        estimated_read_time: Math.floor(Math.random() * 20) + 5,
        last_updated: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()
      }
    });
  }

  // Clear existing data and add large test dataset
  try {
    const existingNotes = db.exportAll();
    existingNotes.forEach(note => {
      if (note.id) db.deleteById(note.id);
    });
  } catch (e) {
    // Database might be empty
  }

  largeTestDataset.forEach(note => {
    db.upsert(note);
  });

  console.log(`✅ Generated ${largeTestDataset.length} diverse notes for streaming demo\n`);

  // Demo 1: Streaming Search with Progress Tracking
  console.log('🔍 Demo 1: Streaming Search with Progress Tracking');
  console.log('═'.repeat(70));
  
  const searchConfig = { batchSize: 8, delayMs: 100, maxItems: 30 };
  const streamingSearch = new StreamingSearch(searchConfig);
  
  console.log('Searching for "react" with streaming...\n');
  
  let chunkCount = 0;
  for await (const chunk of streamingSearch.searchStream(
    db.exportAll(), 
    'react',
    { tags: ['frontend', 'react'] }
  )) {
    chunkCount++;
    const progress = chunk.metadata?.progress;
    
    console.log(`📦 Chunk ${chunk.chunk}: ${chunk.data.length} results`);
    console.log(`   Progress: ${progress?.processed}/${progress?.total} (${progress?.percentage}%)`);
    console.log(`   ETA: ${progress?.estimatedTimeMs}ms`);
    console.log(`   Has more: ${chunk.hasMore ? 'Yes' : 'No'}`);
    
    // Show sample results
    chunk.data.slice(0, 2).forEach(note => {
      console.log(`   • [${note.key}]: ${note.content.substring(0, 60)}...`);
    });
    console.log('');
    
    if (chunkCount >= 3) break; // Limit for demo
  }

  // Demo 2: Streaming Similarity Analysis
  console.log('🎯 Demo 2: Streaming Similarity Analysis');
  console.log('═'.repeat(70));
  
  const allNotes = db.exportAll();
  const targetNote = allNotes.find(note => note.key.includes('react'));
  
  if (targetNote) {
    const analysisConfig = { batchSize: 6, delayMs: 80, maxItems: 20 };
    const streamingAnalysis = new StreamingAnalysis(analysisConfig);
    
    console.log(`Target note: [${targetNote.key}]`);
    console.log(`Content: ${targetNote.content.substring(0, 80)}...\n`);
    
    chunkCount = 0;
    for await (const chunk of streamingAnalysis.findSimilarStream(targetNote, allNotes, 0.2)) {
      chunkCount++;
      const progress = chunk.metadata?.progress;
      
      console.log(`📊 Similarity Chunk ${chunk.chunk}: ${chunk.data.length} matches`);
      console.log(`   Progress: ${progress?.processed}/${progress?.total} (${progress?.percentage}%)`);
      
      chunk.data.slice(0, 3).forEach(item => {
        console.log(`   • [${item.note.key}] Similarity: ${(item.similarity * 100).toFixed(1)}%`);
        console.log(`     ${item.note.content.substring(0, 60)}...`);
      });
      console.log('');
      
      if (chunkCount >= 2) break; // Limit for demo
    }
  }

  // Demo 3: Streaming Tag Analysis
  console.log('🏷️  Demo 3: Streaming Tag Analysis');
  console.log('═'.repeat(70));
  
  const tagAnalysisConfig = { batchSize: 5, delayMs: 60, maxItems: 25 };
  const tagStreamingAnalysis = new StreamingAnalysis(tagAnalysisConfig);
  
  chunkCount = 0;
  for await (const chunk of tagStreamingAnalysis.analyzeTagsStream(allNotes)) {
    chunkCount++;
    const progress = chunk.metadata?.progress;
    
    console.log(`📈 Tag Analysis Chunk ${chunk.chunk}: ${chunk.data.length} tags`);
    console.log(`   Progress: ${progress?.processed}/${progress?.total} (${progress?.percentage}%)`);
    
    chunk.data.slice(0, 4).forEach(tagData => {
      console.log(`   • Tag "${tagData.tag}": ${tagData.count} uses (${tagData.notes.length} notes)`);
      console.log(`     Notes: ${tagData.notes.slice(0, 3).join(', ')}${tagData.notes.length > 3 ? '...' : ''}`);
    });
    console.log('');
    
    if (chunkCount >= 2) break; // Limit for demo
  }

  // Demo 4: Streaming Export with Format Transformation
  console.log('📤 Demo 4: Streaming Export with Format Transformation');
  console.log('═'.repeat(70));
  
  const exportConfig = { batchSize: 4, delayMs: 50, maxItems: 15 };
  const streamingExport = new StreamingExport(exportConfig);
  
  // Filter for specific category
  const filteredNotes = allNotes.filter(note => 
    note.tags?.includes('frontend') || note.tags?.includes('react')
  );
  
  console.log(`Exporting ${filteredNotes.length} frontend/react notes in Markdown format...\n`);
  
  const markdownFormatter = (note: any) => ({
    markdown: `# ${note.key}\n\n${note.content}\n\n**Tags:** ${(note.tags || []).join(', ')}\n**Difficulty:** ${note.metadata?.difficulty || 'N/A'}\n\n---\n`,
    metadata: {
      key: note.key,
      word_count: note.content.split(/\s+/).length,
      tags: note.tags || []
    }
  });
  
  chunkCount = 0;
  for await (const chunk of streamingExport.exportStream(filteredNotes, markdownFormatter)) {
    chunkCount++;
    const progress = chunk.metadata?.progress;
    
    console.log(`📋 Export Chunk ${chunk.chunk}: ${chunk.data.length} formatted items`);
    console.log(`   Progress: ${progress?.processed}/${progress?.total} (${progress?.percentage}%)`);
    console.log(`   ETA: ${progress?.estimatedTimeMs}ms`);
    
    // Show first item sample
    if (chunk.data.length > 0) {
      const sample = chunk.data[0];
      console.log(`   Sample export (${sample.metadata.key}):`);
      console.log(`   ${sample.markdown.split('\n')[0]}`); // Show title
      console.log(`   Word count: ${sample.metadata.word_count}, Tags: ${sample.metadata.tags.slice(0, 3).join(', ')}`);
    }
    console.log('');
    
    if (chunkCount >= 3) break; // Limit for demo
  }

  // Demo 5: Performance Comparison
  console.log('⚡ Demo 5: Performance Comparison - Batch vs. Streaming');
  console.log('═'.repeat(70));
  
  // Measure batch processing time
  const batchStart = Date.now();
  const batchResults = allNotes.filter(note => 
    note.content.toLowerCase().includes('performance') || 
    note.tags?.includes('optimization')
  );
  const batchTime = Date.now() - batchStart;
  
  console.log(`Batch processing: Found ${batchResults.length} results in ${batchTime}ms`);
  
  // Measure streaming processing time
  const streamStart = Date.now();
  let streamResults = 0;
  let streamChunks = 0;
  
  for await (const chunk of streamingSearch.searchStream(allNotes, 'performance optimization')) {
    streamResults += chunk.data.length;
    streamChunks++;
    if (streamChunks >= 3) break; // Limit for fair comparison
  }
  
  const streamTime = Date.now() - streamStart;
  
  console.log(`Streaming processing: Found ${streamResults} results in ${streamChunks} chunks, ${streamTime}ms`);
  console.log(`\n💡 Streaming benefits:`);
  console.log(`   • Progressive results delivery`);
  console.log(`   • Memory efficiency for large datasets`);
  console.log(`   • Better user experience with progress tracking`);
  console.log(`   • Ability to process results as they arrive\n`);

  console.log('🎉 Streaming Capabilities Demo Complete!\n');
  console.log('🌊 Available Streaming Tools:');
  console.log('  • streaming-search - Progressive search with filtering and progress');
  console.log('  • streaming-similarity - Similarity analysis with real-time progress');
  console.log('  • streaming-tag-analysis - Tag usage analysis in manageable chunks');
  console.log('  • streaming-export - Format transformation with progress tracking');
  console.log('\n💫 Features:');
  console.log('  • Configurable batch sizes and delays');
  console.log('  • Progress tracking with ETA calculation');
  console.log('  • Memory-efficient processing of large datasets');
  console.log('  • Real-time result delivery');
  console.log('  • Graceful handling of large operations');
}

demoStreamingCapabilities().catch(console.error);
