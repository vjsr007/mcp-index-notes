#!/usr/bin/env node

/**
 * Example of how an MCP client would interact with prompts
 * This simulates the prompt request/response flow
 */

import 'dotenv/config';
import { LiteNotesStore } from './store.lite.js';

// Simulated prompt handler (this would normally be in the MCP server)
async function simulatePromptRequest(promptName: string, args: Record<string, any>) {
  const db = new LiteNotesStore({ filePath: process.env.DB_PATH?.replace(/\.db$/i, '.json') });
  
  // Setup test data
  db.upsert({ 
    key: 'react.hooks', 
    content: 'React hooks like useState and useEffect allow functional components to manage state and side effects. They replaced class components in modern React development.', 
    tags: ['react', 'hooks', 'functional-components', 'modern'], 
    metadata: { framework: 'react', version: '16.8+' } 
  });
  
  db.upsert({ 
    key: 'react.performance', 
    content: 'React.memo, useMemo, and useCallback are optimization techniques to prevent unnecessary re-renders. Use them when you have expensive calculations or complex child components.', 
    tags: ['react', 'performance', 'optimization', 'memoization'], 
    metadata: { framework: 'react', difficulty: 'intermediate' } 
  });

  // Simulate prompt processing (normally done by MCP server)
  switch (promptName) {
    case 'summarize-notes': {
      const key = args.key;
      const search = args.search;
      const maxNotes = parseInt(args.max_notes) || 10;
      
      let notes: any[] = [];
      let contextInfo = '';
      
      if (key) {
        notes = db.getByKey(key, maxNotes);
        contextInfo = `Notes under key "${key}"`;
      } else if (search) {
        notes = db.search(search, maxNotes);
        contextInfo = `Notes matching search "${search}"`;
      }
      
      return {
        description: `Summarize ${notes.length} notes`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please provide a comprehensive summary of the following notes.

**Context**: ${contextInfo}
**Total Notes**: ${notes.length}

**Instructions**:
1. Identify the main themes and topics
2. Highlight key insights and important information
3. Note any patterns or connections between the notes
4. Organize the summary in a clear, structured format

**Notes to Summarize**:
${notes.map((note, idx) => `
**Note ${idx + 1}** (Key: ${note.key})
Tags: [${note.tags?.join(', ') || 'none'}]
Content: ${note.content}
---`).join('\n')}

Please provide your summary now.`
            }
          }
        ]
      };
    }
    
    case 'generate-tags': {
      const content = args.content;
      if (!content) throw new Error('Content is required');
      
      const allNotes = db.exportAll();
      const existingTags = new Set<string>();
      allNotes.forEach(note => {
        note.tags?.forEach(tag => existingTags.add(tag));
      });
      
      return {
        description: `Generate tags for content`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please generate 5 relevant tags for the following content.

**Content to tag**:
${content}

**Existing tags in the system** (for consistency):
${Array.from(existingTags).sort().join(', ')}

**Instructions**:
1. Suggest 5 most relevant tags
2. Prefer existing tags when appropriate for consistency
3. Suggest new tags only when existing ones don't fit
4. Keep tags concise and descriptive
5. Consider both topic and category tags

**Output format**: Provide just the comma-separated list of suggested tags.`
            }
          }
        ]
      };
    }
    
    default:
      throw new Error(`Unknown prompt: ${promptName}`);
  }
}

async function demonstratePromptUsage() {
  console.log('🎯 MCP Prompt Usage Examples\n');
  
  // Example 1: Summarize notes by search
  console.log('📝 Example 1: Summarize React Notes');
  console.log('═'.repeat(50));
  try {
    const result1 = await simulatePromptRequest('summarize-notes', { 
      search: 'react',
      max_notes: 5 
    });
    
    console.log(`📋 Generated Prompt:`);
    console.log(`Description: ${result1.description}`);
    console.log(`\nPrompt Text:`);
    console.log(result1.messages[0].content.text);
    console.log('\n');
  } catch (error) {
    console.error('Error:', error);
  }
  
  // Example 2: Generate tags
  console.log('🏷️  Example 2: Generate Tags for New Content');
  console.log('═'.repeat(50));
  try {
    const newContent = 'Vue.js Composition API provides a more flexible way to organize component logic. It uses reactive references and computed properties for state management.';
    
    const result2 = await simulatePromptRequest('generate-tags', {
      content: newContent,
      max_tags: 5
    });
    
    console.log(`📋 Generated Prompt:`);
    console.log(`Description: ${result2.description}`);
    console.log(`\nPrompt Text:`);
    console.log(result2.messages[0].content.text);
    console.log('\n');
  } catch (error) {
    console.error('Error:', error);
  }
  
  console.log('✨ How MCP Clients Use Prompts:');
  console.log('1. Client calls: listPrompts() to see available prompts');
  console.log('2. Client calls: getPrompt(name, args) to get generated prompt');
  console.log('3. Client sends the prompt to LLM for processing');
  console.log('4. LLM returns intelligent response based on your data');
  console.log('\n💡 This creates context-aware, data-driven interactions!');
}

demonstratePromptUsage().catch(console.error);
