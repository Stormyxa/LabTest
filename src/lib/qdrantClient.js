import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Qdrant client utility for RAG implementation
 * Manages connection to user_memory collection
 */

const QDRANT_URL = import.meta.env.VITE_QDRANT_URL;
const QDRANT_API_KEY = import.meta.env.VITE_QDRANT_API_KEY;
const COLLECTION_NAME = 'user_memory';

let client = null;

// Initialize Qdrant client only if credentials are available
if (QDRANT_URL && QDRANT_API_KEY) {
  client = new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
  });
} else {
  console.warn('⚠️ Qdrant credentials not configured (VITE_QDRANT_URL, VITE_QDRANT_API_KEY). RAG features will be disabled.');
}

/**
 * Check if Qdrant is properly configured
 */
export const isQdrantConfigured = () => {
  return !!(QDRANT_URL && QDRANT_API_KEY && client);
};

/**
 * Get the Qdrant client (lazy initialization)
 */
const getClient = () => {
  if (!isQdrantConfigured()) {
    throw new Error('Qdrant is not configured. Please set VITE_QDRANT_URL and VITE_QDRANT_API_KEY environment variables.');
  }
  return client;
};

/**
 * Upsert a fact into Qdrant collection
 * @param {object} params
 * @param {string} params.userId - User UUID (tenant)
 * @param {string} params.quizId - Quiz UUID
 * @param {string} params.classId - Class UUID (optional)
 * @param {string} params.subject - Subject name
 * @param {string} params.fact - The fact text to embed
 * @param {number[]} params.vector - 384-dimensional embedding vector
 * @param {object} params.metadata - Additional metadata
 */
export const upsertFact = async ({
  userId,
  quizId,
  classId,
  subject,
  fact,
  vector,
  metadata = {}
}) => {
  if (!isQdrantConfigured()) {
    console.warn('Qdrant not configured, skipping fact upsert');
    return null;
  }

  try {
    const qdrant = getClient();
    const pointId = `${userId}_${quizId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const response = await qdrant.upsert(COLLECTION_NAME, {
      points: [
        {
          id: pointId,
          vector,
          payload: {
            userId,
            quizId,
            classId,
            subject,
            fact,
            timestamp: new Date().toISOString(),
            ...metadata
          }
        }
      ]
    });

    console.log(`✅ Fact upserted to Qdrant: ${pointId}`);
    return response;
  } catch (error) {
    console.error('❌ Failed to upsert fact to Qdrant:', error);
    throw error;
  }
};

/**
 * Calculate time decay score for a fact
 * @param {string} timestamp - ISO timestamp of the fact
 * @param {number} halfLifeDays - Half-life in days (default: 30)
 * @returns {number} Decay factor between 0 and 1
 */
export const calculateTimeDecay = (timestamp, halfLifeDays = 30) => {
  const factDate = new Date(timestamp);
  const now = new Date();
  const daysSinceFact = (now - factDate) / (1000 * 60 * 60 * 24);
  
  // Exponential decay: score = 0.5 ^ (days / halfLife)
  const decay = Math.pow(0.5, daysSinceFact / halfLifeDays);
  
  return Math.max(0.1, Math.min(1, decay)); // Clamp between 0.1 and 1
};

/**
 * Search for relevant facts for a user with time decay
 * @param {object} params
 * @param {string} params.userId - User UUID (tenant)
 * @param {number[]} params.queryVector - 384-dimensional query vector
 * @param {number} [params.limit=10] - Number of results to return
 * @param {string} [params.quizId] - Optional filter by quiz
 * @param {string} [params.classId] - Optional filter by class
 * @param {boolean} [params.enableTimeDecay=true] - Enable time decay scoring
 * @param {number} [params.halfLifeDays=30] - Half-life for time decay
 */
export const searchFacts = async ({
  userId,
  queryVector,
  limit = 10,
  quizId,
  classId,
  enableTimeDecay = true,
  halfLifeDays = 30
}) => {
  if (!isQdrantConfigured()) {
    console.warn('Qdrant not configured, returning empty search');
    return [];
  }

  try {
    const qdrant = getClient();
    const filter = {
      must: [
        { key: 'userId', match: { value: userId } }
      ]
    };

    if (quizId) {
      filter.must.push({ key: 'quizId', match: { value: quizId } });
    }

    if (classId) {
      filter.must.push({ key: 'classId', match: { value: classId } });
    }

    const response = await qdrant.search(COLLECTION_NAME, {
      vector: queryVector,
      limit: limit * 2, // Fetch more to account for decay filtering
      filter,
      with_payload: true
    });

    const results = response.map(result => {
      const decayFactor = enableTimeDecay && result.payload.timestamp
        ? calculateTimeDecay(result.payload.timestamp, halfLifeDays)
        : 1;
      
      return {
        fact: result.payload.fact,
        score: result.score * decayFactor, // Apply time decay
        originalScore: result.score,
        decayFactor,
        metadata: {
          quizId: result.payload.quizId,
          classId: result.payload.classId,
          subject: result.payload.subject,
          timestamp: result.payload.timestamp,
          language: result.payload.language || 'unknown',
          ...result.payload
        }
      };
    });

    // Sort by adjusted score and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  } catch (error) {
    console.error('❌ Failed to search facts in Qdrant:', error);
    throw error;
  }
};

/**
 * Delete all facts for a specific user
 * @param {string} userId - User UUID
 */
export const deleteFactsForUser = async (userId) => {
  if (!isQdrantConfigured()) {
    console.warn('Qdrant not configured, skipping delete');
    return;
  }

  try {
    const qdrant = getClient();
    const response = await qdrant.delete(COLLECTION_NAME, {
      filter: {
        must: [
          { key: 'userId', match: { value: userId } }
        ]
      }
    });

    console.log(`✅ Deleted all facts for user ${userId}`);
    return response;
  } catch (error) {
    console.error('❌ Failed to delete facts for user:', error);
    throw error;
  }
};

/**
 * Get collection info
 */
export const getCollectionInfo = async () => {
  if (!isQdrantConfigured()) {
    return null;
  }

  try {
    const qdrant = getClient();
    const response = await qdrant.getCollection(COLLECTION_NAME);
    return response;
  } catch (error) {
    console.error('❌ Failed to get collection info:', error);
    return null;
  }
};
