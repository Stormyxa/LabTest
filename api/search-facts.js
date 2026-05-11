import { QdrantClient } from '@qdrant/js-client-rest';

// Initialize Qdrant client for server-side
const QDRANT_URL = process.env.QDRANT_URL || process.env.VITE_QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || process.env.VITE_QDRANT_API_KEY;

let qdrantClient = null;
if (QDRANT_URL && QDRANT_API_KEY) {
  qdrantClient = new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
  });
}

const COLLECTION_NAME = 'user_memory';

/**
 * Calculate time decay score for a fact
 */
const calculateTimeDecay = (timestamp, halfLifeDays = 90) => {
  const factDate = new Date(timestamp);
  const now = new Date();
  const daysSinceFact = (now - factDate) / (1000 * 60 * 60 * 24);
  const decay = Math.pow(0.5, daysSinceFact / halfLifeDays);
  return Math.max(0.1, Math.min(1, decay));
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, query, queryVector, limit = 10, quizId, classId, enableTimeDecay = true, halfLifeDays = 90 } = req.body;

  if (!userId || (!query && !queryVector)) {
    return res.status(400).json({ error: 'Missing required parameters: userId, query or queryVector' });
  }

  if (!qdrantClient) {
    console.warn('Qdrant not configured on server-side');
    return res.status(200).json({ facts: [], message: 'Qdrant not configured' });
  }

  try {
    // Use provided vector or return empty (server-side embedding disabled for performance)
    let vector = queryVector;
    
    if (!vector) {
      console.warn('⚠️ No query vector provided to search-facts');
      return res.status(200).json({ facts: [], message: 'No vector provided' });
    }

    // Build filter
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

    // Search in Qdrant
    const response = await qdrantClient.search(COLLECTION_NAME, {
      vector,
      limit: limit * 2,
      filter,
      with_payload: true
    });

    // Apply time decay
    const results = response.map(result => {
      const decayFactor = enableTimeDecay && result.payload.timestamp
        ? calculateTimeDecay(result.payload.timestamp, halfLifeDays)
        : 1;
      
      return {
        fact: result.payload.fact,
        score: result.score * decayFactor,
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
    const limitedResults = results.slice(0, limit);

    return res.status(200).json({ facts: limitedResults });
  } catch (error) {
    console.error('Failed to search facts:', error);
    return res.status(500).json({ error: 'Failed to search facts', details: error.message });
  }
}
