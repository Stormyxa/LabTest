/**
 * Qdrant client utility for RAG implementation (Client-side)
 * Communicates with the server-side API proxy to manage pedagogical memory.
 */

/**
 * Check if RAG functionality should be enabled
 */
export const isQdrantConfigured = () => {
  // On client, we assume the server-side proxy is available
  return true;
};

/**
 * Search for relevant facts for a user
 * @param {object} params
 * @param {string} params.userId - User ID
 * @param {string} [params.query] - Text search query (vectorized on server via Gemini)
 * @param {number[]} [params.queryVector] - Optional precomputed vector
 * @param {number} [params.limit=15] - Maximum facts to return
 * @param {string} [params.quizId] - Optional quiz ID filter
 * @param {string} [params.classId] - Optional class ID filter
 * @param {boolean} [params.enableTimeDecay=true] - Apply time decay scoring
 */
export const searchFacts = async ({
  userId,
  query = null,
  queryVector = null,
  limit = 15,
  quizId = null,
  classId = null,
  enableTimeDecay = true
}) => {
  try {
    const response = await fetch('/api/search-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId, 
        query,
        queryVector, 
        limit, 
        quizId, 
        classId, 
        enableTimeDecay 
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Search failed');
    }

    const data = await response.json();
    return data.facts || [];
  } catch (e) {
    console.error('❌ Qdrant: Proxy search failed:', e);
    return [];
  }
};

/**
 * Store facts with or without client-side vectors into Qdrant.
 * If vectors are omitted, the server generates them via Gemini Embeddings API.
 * @param {object} params
 */
export const saveVectors = async ({
  userId,
  facts,
  quizId = null,
  attemptId = null,
  subject = null,
  language = 'ru',
  profile = {}
}) => {
  try {
    const response = await fetch('/api/save-vectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        quizId,
        attemptId,
        subject,
        language,
        profile,
        facts // Array of { fact, metadata, [vector] } or strings
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Storage failed');
    }

    return await response.json();
  } catch (e) {
    console.error('❌ Qdrant: Proxy storage failed:', e);
    throw e;
  }
};

/**
 * Convenience alias for saving facts
 */
export const saveFacts = saveVectors;

/**
 * Delete facts for user (not implemented in proxy yet)
 */
export const deleteFactsForUser = async (userId) => {
  console.warn('Delete facts is not supported via proxy yet');
  return null;
};
