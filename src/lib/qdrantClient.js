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
 */
export const searchFacts = async ({
  userId,
  queryVector,
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
 * Store facts with vectors into Qdrant
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
        facts // Array of { fact, vector, metadata }
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
 * Delete facts for user (not implemented in proxy yet)
 */
export const deleteFactsForUser = async (userId) => {
  console.warn('Delete facts is not supported via proxy yet');
  return null;
};
