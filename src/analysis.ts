/**
 * Advanced analysis tools for MCP Index Notes
 * Includes NLP, text analysis, and machine learning features
 */

import { Note } from './types.js';

// Simple word frequency analysis
export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
  // Remove common stop words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
    'his', 'its', 'our', 'their', 'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves',
    'yourselves', 'themselves', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'any',
    'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now'
  ]);

  // Clean and tokenize text
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Count word frequencies
  const wordCount: Record<string, number> = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });

  // Return top keywords
  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

// Suggest tags based on content analysis
export function suggestTags(content: string, existingTags: string[], maxTags: number = 5): string[] {
  const keywords = extractKeywords(content, 20);
  const suggestions: string[] = [];
  
  // Programming language detection
  const programmingPatterns = {
    'javascript': /\b(javascript|js|node|react|vue|angular|typescript|ts)\b/i,
    'python': /\b(python|py|django|flask|pandas|numpy)\b/i,
    'java': /\b(java|spring|hibernate|maven|gradle)\b/i,
    'csharp': /\b(c#|csharp|dotnet|asp\.net|entity)\b/i,
    'sql': /\b(sql|database|query|select|insert|update|delete)\b/i,
    'html': /\b(html|css|dom|web|browser)\b/i,
    'docker': /\b(docker|container|kubernetes|k8s)\b/i,
    'aws': /\b(aws|amazon|s3|ec2|lambda|cloudformation)\b/i,
    'git': /\b(git|github|gitlab|version|commit|merge)\b/i
  };

  // Check for programming language indicators
  for (const [tag, pattern] of Object.entries(programmingPatterns)) {
    if (pattern.test(content) && !suggestions.includes(tag)) {
      suggestions.push(tag);
    }
  }

  // Technology/framework detection
  const techPatterns = {
    'api': /\b(api|rest|graphql|endpoint|service)\b/i,
    'database': /\b(database|db|table|index|query|sql)\b/i,
    'performance': /\b(performance|optimization|speed|cache|memory)\b/i,
    'security': /\b(security|auth|login|password|encryption|ssl)\b/i,
    'testing': /\b(test|testing|unit|integration|jest|mocha)\b/i,
    'deployment': /\b(deploy|deployment|production|staging|ci\/cd)\b/i,
    'architecture': /\b(architecture|design|pattern|microservice|monolith)\b/i,
    'tutorial': /\b(tutorial|guide|how-to|step|learn|example)\b/i,
    'best-practices': /\b(best.practice|guideline|standard|convention)\b/i,
    'troubleshooting': /\b(error|bug|fix|issue|problem|debug)\b/i
  };

  for (const [tag, pattern] of Object.entries(techPatterns)) {
    if (pattern.test(content) && !suggestions.includes(tag)) {
      suggestions.push(tag);
    }
  }

  // Add relevant existing tags if content matches
  for (const existingTag of existingTags) {
    if (content.toLowerCase().includes(existingTag.toLowerCase()) && !suggestions.includes(existingTag)) {
      suggestions.push(existingTag);
    }
  }

  // Add keywords as potential tags
  for (const keyword of keywords) {
    if (keyword.length > 3 && !suggestions.includes(keyword)) {
      suggestions.push(keyword);
    }
  }

  return suggestions.slice(0, maxTags);
}

// Calculate similarity between two texts using Jaccard similarity
export function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(extractKeywords(text1, 50));
  const words2 = new Set(extractKeywords(text2, 50));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// Find duplicate or very similar notes
export function findDuplicates(notes: Note[], threshold: number = 0.8): Array<{note1: Note, note2: Note, similarity: number}> {
  const duplicates: Array<{note1: Note, note2: Note, similarity: number}> = [];
  
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const similarity = calculateSimilarity(notes[i].content, notes[j].content);
      if (similarity >= threshold) {
        duplicates.push({
          note1: notes[i],
          note2: notes[j],
          similarity
        });
      }
    }
  }
  
  return duplicates.sort((a, b) => b.similarity - a.similarity);
}

// Simple sentiment analysis
export function analyzeSentiment(text: string): { sentiment: 'positive' | 'negative' | 'neutral', score: number, confidence: number } {
  const positiveWords = [
    'good', 'great', 'excellent', 'amazing', 'awesome', 'fantastic', 'wonderful', 'perfect',
    'love', 'like', 'enjoy', 'happy', 'pleased', 'satisfied', 'success', 'win', 'achieve',
    'improve', 'better', 'best', 'effective', 'efficient', 'useful', 'helpful', 'valuable',
    'easy', 'simple', 'clear', 'clean', 'fast', 'quick', 'reliable', 'stable', 'secure'
  ];
  
  const negativeWords = [
    'bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'annoying', 'frustrating',
    'difficult', 'hard', 'complex', 'complicated', 'confusing', 'unclear', 'messy', 'dirty',
    'slow', 'broken', 'failed', 'error', 'bug', 'issue', 'problem', 'trouble', 'wrong',
    'poor', 'weak', 'limited', 'restricted', 'expensive', 'costly', 'risky', 'dangerous'
  ];
  
  const words = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;
  
  words.forEach(word => {
    const cleanWord = word.replace(/[^\w]/g, '');
    if (positiveWords.includes(cleanWord)) positiveCount++;
    if (negativeWords.includes(cleanWord)) negativeCount++;
  });
  
  const totalSentimentWords = positiveCount + negativeCount;
  const score = totalSentimentWords === 0 ? 0 : (positiveCount - negativeCount) / totalSentimentWords;
  const confidence = Math.min(totalSentimentWords / words.length * 10, 1); // Scale confidence
  
  let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
  if (score > 0.1) sentiment = 'positive';
  else if (score < -0.1) sentiment = 'negative';
  
  return { sentiment, score, confidence };
}

// Extract entities (simple pattern-based)
export function extractEntities(text: string): {
  emails: string[],
  urls: string[],
  dates: string[],
  numbers: string[],
  codeBlocks: string[],
  mentions: string[]
} {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const urlRegex = /https?:\/\/[^\s]+/g;
  const dateRegex = /\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g;
  const numberRegex = /\b\d+(?:\.\d+)?\b/g;
  const codeBlockRegex = /`([^`]+)`/g;
  const mentionRegex = /@([a-zA-Z0-9_]+)/g;
  
  return {
    emails: text.match(emailRegex) || [],
    urls: text.match(urlRegex) || [],
    dates: text.match(dateRegex) || [],
    numbers: text.match(numberRegex) || [],
    codeBlocks: [...text.matchAll(codeBlockRegex)].map(match => match[1]) || [],
    mentions: [...text.matchAll(mentionRegex)].map(match => match[1]) || []
  };
}

// Cluster notes by similarity
export function clusterNotes(notes: Note[], maxClusters: number = 5): Array<{cluster: number, notes: Note[], centroid: string[]}> {
  if (notes.length === 0) return [];
  
  // Simple k-means clustering based on keywords
  const noteKeywords = notes.map(note => extractKeywords(note.content, 10));
  
  // Initialize clusters with random notes
  const clusters: Array<{cluster: number, notes: Note[], centroid: string[]}> = [];
  const actualClusters = Math.min(maxClusters, notes.length);
  
  for (let i = 0; i < actualClusters; i++) {
    clusters.push({
      cluster: i,
      notes: [],
      centroid: noteKeywords[Math.floor(Math.random() * noteKeywords.length)]
    });
  }
  
  // Assign notes to closest cluster
  notes.forEach((note, idx) => {
    let bestCluster = 0;
    let bestSimilarity = 0;
    
    clusters.forEach((cluster, clusterIdx) => {
      const similarity = calculateKeywordSimilarity(noteKeywords[idx], cluster.centroid);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestCluster = clusterIdx;
      }
    });
    
    clusters[bestCluster].notes.push(note);
  });
  
  // Remove empty clusters
  return clusters.filter(cluster => cluster.notes.length > 0);
}

function calculateKeywordSimilarity(keywords1: string[], keywords2: string[]): number {
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// Generate content recommendations
export function generateRecommendations(targetNote: Note, allNotes: Note[], maxRecommendations: number = 5): Array<{note: Note, score: number, reasons: string[]}> {
  const recommendations: Array<{note: Note, score: number, reasons: string[]}> = [];
  
  allNotes.forEach(note => {
    if (note.id === targetNote.id) return; // Skip self
    
    const reasons: string[] = [];
    let score = 0;
    
    // Content similarity
    const contentSimilarity = calculateSimilarity(targetNote.content, note.content);
    if (contentSimilarity > 0.1) {
      score += contentSimilarity * 0.4;
      reasons.push(`Content similarity: ${(contentSimilarity * 100).toFixed(1)}%`);
    }
    
    // Tag overlap
    const targetTags = new Set(targetNote.tags || []);
    const noteTags = new Set(note.tags || []);
    const tagOverlap = new Set([...targetTags].filter(x => noteTags.has(x)));
    if (tagOverlap.size > 0) {
      const tagScore = tagOverlap.size / Math.max(targetTags.size, noteTags.size);
      score += tagScore * 0.3;
      reasons.push(`Shared tags: ${Array.from(tagOverlap).join(', ')}`);
    }
    
    // Key similarity
    if (targetNote.key.split('.')[0] === note.key.split('.')[0]) {
      score += 0.2;
      reasons.push('Same key prefix');
    }
    
    // Metadata similarity
    if (targetNote.metadata && note.metadata) {
      const metaKeys = Object.keys(targetNote.metadata).filter(key => 
        key in note.metadata && targetNote.metadata[key] === note.metadata[key]
      );
      if (metaKeys.length > 0) {
        score += metaKeys.length * 0.1;
        reasons.push(`Shared metadata: ${metaKeys.join(', ')}`);
      }
    }
    
    if (score > 0.05) { // Minimum threshold
      recommendations.push({ note, score, reasons });
    }
  });
  
  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRecommendations);
}
