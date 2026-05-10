import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js to use local cache
env.allowLocalModels = false;
env.useBrowserCache = true;
env.disableRemoteModels = false;

let embeddingPipeline = null;
let isInitializing = false;

/**
 * Initialize the embedding pipeline with Xenova/multilingual-e5-small
 * This model produces 384-dimensional vectors
 */
const initializePipeline = async () => {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  if (isInitializing) {
    // Wait for initialization to complete
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return embeddingPipeline;
  }

  isInitializing = true;

  try {
    console.log('🔄 Initializing embedding pipeline with Xenova/multilingual-e5-small...');
    
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/multilingual-e5-small',
      {
        quantized: true,
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            const percent = Math.round(progress.progress || 0);
            if (percent % 10 === 0) {
              console.log(`📥 Loading model: ${percent}%`);
            }
          }
        }
      }
    );

    console.log('✅ Embedding pipeline initialized successfully');
    isInitializing = false;
    return embeddingPipeline;
  } catch (error) {
    console.error('❌ Failed to initialize embedding pipeline:', error);
    isInitializing = false;
    throw error;
  }
};

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} 384-dimensional vector
 */
export const generateEmbedding = async (text) => {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid text input for embedding');
  }

  try {
    const pipeline = await initializePipeline();
    
    // Add query prefix for better results (e5-small model expects this)
    const prefixedText = `query: ${text}`;
    
    const output = await pipeline(prefixedText, {
      pooling: 'mean',
      normalize: true
    });

    // Convert to array
    const vector = Array.from(output.data);
    
    if (vector.length !== 384) {
      console.warn(`⚠️ Unexpected vector dimension: ${vector.length} (expected 384)`);
    }

    return vector;
  } catch (error) {
    console.error('❌ Failed to generate embedding:', error);
    throw error;
  }
};

/**
 * Generate embeddings for multiple texts in batch
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} Array of 384-dimensional vectors
 */
export const generateEmbeddingsBatch = async (texts) => {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  try {
    const pipeline = await initializePipeline();
    
    // Add query prefix to all texts
    const prefixedTexts = texts.map(t => `query: ${t}`);
    
    const outputs = await pipeline(prefixedTexts, {
      pooling: 'mean',
      normalize: true
    });

    // transformers.js returns a flat Float32Array in .data
    // We need to split it into chunks of 384 dimensions
    const flatData = outputs.data;
    const batchSize = texts.length;
    const dimension = 384;
    
    const vectors = [];
    for (let i = 0; i < batchSize; i++) {
      const start = i * dimension;
      const end = start + dimension;
      vectors.push(Array.from(flatData.slice(start, end)));
    }
    
    return vectors;
  } catch (error) {
    console.error('❌ Failed to generate batch embeddings:', error);
    throw error;
  }
};

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} Similarity score between 0 and 1
 */
export const cosineSimilarity = (vecA, vecB) => {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Check if the embedding service is ready
 */
export const isEmbeddingReady = () => {
  return embeddingPipeline !== null;
};

/**
 * Preload the embedding model (useful for initialization)
 */
export const preloadEmbeddingModel = async () => {
  try {
    await initializePipeline();
    return true;
  } catch (error) {
    console.error('Failed to preload embedding model:', error);
    return false;
  }
};
