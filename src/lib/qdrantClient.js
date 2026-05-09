import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Qdrant client utility for RAG implementation
 * Manages connection to user_memory collection
 */

const QDRANT_URL = process.env.QDRANT_URL || process.env.VITE_QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || process.env.VITE_QDRANT_API_KEY;
const COLLECTION_NAME = 'user_memory';

if (!QDRANT_URL || !QDRANT_API_KEY) {
  console.warn('Qdrant credentials not configured. RAG features will be disabled.');
}

// Initialize Qdrant client
const client = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

/**
 * Check if Qdrant is properly configured
 */
export const isQdrantConfigured = () => {
  return !!(QDRANT_URL && QDRANT_API_KEY);
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
    const pointId = `${userId}_${quizId}_${Date.now()}`;
    
    const response = await client.upsert(COLLECTION_NAME, {
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
            ...metadata,
            timestamp: new Date().toISOString()
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
 * Search for relevant facts for a user
 * @param {object} params
 * @param {string} params.userId - User UUID (tenant)
 * @param {number[]} params.queryVector - 384-dimensional query vector
 * @param {number} [params.limit=10] - Number of results to return
 * @param {string} [params.quizId] - Optional filter by quiz
 * @param {string} [params.classId] - Optional filter by class
 */
export const searchFacts = async ({
  userId,
  queryVector,
  limit = 10,
  quizId,
  classId
}) => {
  if (!isQdrantConfigured()) {
    console.warn('Qdrant not configured, returning empty search');
    return [];
  }

  try {
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

    const response = await client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit,
      filter,
      with_payload: true
    });

    return response.map(result => ({
      fact: result.payload.fact,
      score: result.score,
      metadata: {
        quizId: result.payload.quizId,
        classId: result.payload.classId,
        subject: result.payload.subject,
        timestamp: result.payload.timestamp,
        ...result.payload
      }
    }));
  } catch (error) {
    console.error('❌ Failed to search facts in Qdrant:', error);
    throw error;
  }
};

/**
 * Delete all facts for a specific user
 * @param {string} userId - User UUID
 */
export const deleteUserFacts = async (userId) => {
  if (!isQdrantConfigured()) {
    console.warn('Qdrant not configured, skipping delete');
    return null;
  }

  try {
    const response = await client.delete(COLLECTION_NAME, {
      filter: {
        must: [
          { key: 'userId', match: { value: userId } }
        ]
      }
    });

    console.log(`✅ Deleted all facts for user: ${userId}`);
    return response;
  } catch (error) {
    console.error('❌ Failed to delete user facts:', error);
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
    const response = await client.getCollection(COLLECTION_NAME);
    return response;
  } catch (error) {
    console.error('❌ Failed to get collection info:', error);
    return null;
  }
};

export default client;
