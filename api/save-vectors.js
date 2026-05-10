import { createClient } from '@supabase/supabase-js';
import { QdrantClient } from '@qdrant/js-client-rest';

// Simple UUID generator for environments without crypto.randomUUID()
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { facts, userId, quizId, attemptId, subject, language, profile } = req.body;

  if (!facts || !Array.isArray(facts) || !userId || !quizId) {
    return res.status(400).json({ error: 'Missing required parameters: facts (array), userId, quizId' });
  }

  if (!qdrantClient) {
    console.warn('Qdrant not configured on server-side');
    return res.status(200).json({ factsStored: 0, message: 'Qdrant not configured' });
  }

  try {
    console.log(`🔄 Saving ${facts.length} ready-made vectors for user ${userId}, quiz ${quizId}`);

    const points = facts.map((item, idx) => {
      // Qdrant requires IDs to be either 64-bit integers or UUID strings
      const pointId = generateUUID();
      return {
        id: pointId,
        vector: item.vector,
        payload: {
          userId,
          quizId,
          attemptId,
          classId: profile?.class_id || null,
          subject,
          fact: item.fact,
          timestamp: new Date().toISOString(),
          language: language || 'ru',
          ...item.metadata
        }
      };
    });

    // Batch upsert to Qdrant
    const response = await qdrantClient.upsert(COLLECTION_NAME, {
      points: points
    });

    console.log(`✅ Successfully stored ${points.length} facts in Qdrant for user ${userId}`);

    return res.status(200).json({
      success: true,
      factsStored: points.length,
      response
    });

  } catch (error) {
    console.error('❌ Error in save-vectors API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
