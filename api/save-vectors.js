import { createClient } from '@supabase/supabase-js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { generateGeminiEmbeddingsBatch } from './geminiEmbedding.js';

// Simple UUID generator for environments without crypto.randomUUID()
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getSupabaseClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return createClient(supabaseUrl, supabaseKey);
}

function getQdrantClient() {
  const QDRANT_URL = process.env.QDRANT_URL || process.env.VITE_QDRANT_URL;
  const QDRANT_API_KEY = process.env.QDRANT_API_KEY || process.env.VITE_QDRANT_API_KEY;
  if (QDRANT_URL && QDRANT_API_KEY) {
    return new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY,
      checkCompatibility: false
    });
  }
  return null;
}

const COLLECTION_NAME = 'user_memory';
let collectionEnsured = false;

async function ensureCollection(client) {
  if (collectionEnsured || !client) return;
  try {
    const collections = await client.getCollections();
    const exists = collections.collections?.some(c => c.name === COLLECTION_NAME);
    if (exists) {
      const info = await client.getCollection(COLLECTION_NAME);
      const currentSize = info.config?.params?.vectors?.size;
      if (currentSize && currentSize !== 768) {
        console.log(`⚠️ Qdrant: Existing collection has size ${currentSize}. Recreating for Gemini 768 dimensions...`);
        await client.deleteCollection(COLLECTION_NAME);
        await client.createCollection(COLLECTION_NAME, {
          vectors: { size: 768, distance: 'Cosine' }
        });
      }
    } else {
      await client.createCollection(COLLECTION_NAME, {
        vectors: { size: 768, distance: 'Cosine' }
      });
    }
    collectionEnsured = true;
  } catch (err) {
    console.warn('⚠️ Qdrant collection ensure warning:', err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { facts, userId, quizId, attemptId, subject, language, profile } = req.body;

  if (!facts || !Array.isArray(facts) || !userId) {
    return res.status(400).json({ error: 'Missing required parameters: facts (array), userId' });
  }

  const qdrantClient = getQdrantClient();
  if (!qdrantClient) {
    console.warn('Qdrant not configured on server-side');
    return res.status(200).json({ factsStored: 0, message: 'Qdrant not configured' });
  }

  try {
    await ensureCollection(qdrantClient);
    console.log(`🔄 Processing ${facts.length} facts for user ${userId}, quiz ${quizId || 'general'}`);

    // Standardize facts items
    const rawItems = facts.map(item => {
      if (typeof item === 'string') {
        return { fact: item, vector: null, metadata: {} };
      }
      return {
        fact: item.fact || item.text || '',
        vector: item.vector || null,
        metadata: item.metadata || {}
      };
    }).filter(item => item.fact && item.fact.trim().length > 0);

    if (rawItems.length === 0) {
      return res.status(200).json({ success: true, factsStored: 0 });
    }

    // Check if vectors need to be generated via Gemini Embeddings API on server
    const needEmbeddingIndices = [];
    const textsToEmbed = [];

    rawItems.forEach((item, idx) => {
      if (!item.vector || !Array.isArray(item.vector) || item.vector.length !== 768) {
        needEmbeddingIndices.push(idx);
        textsToEmbed.push(item.fact);
      }
    });

    if (textsToEmbed.length > 0) {
      console.log(`⚡ Generating server-side Gemini embeddings for ${textsToEmbed.length} facts...`);
      const generatedVectors = await generateGeminiEmbeddingsBatch(textsToEmbed);
      needEmbeddingIndices.forEach((itemIdx, i) => {
        rawItems[itemIdx].vector = generatedVectors[i];
      });
    }

    const points = rawItems.map(item => {
      const pointId = generateUUID();
      return {
        id: pointId,
        vector: item.vector,
        payload: {
          userId,
          quizId: quizId || null,
          attemptId: attemptId || null,
          classId: profile?.class_id || null,
          subject: subject || null,
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
    return res.status(200).json({ 
      success: false,
      factsStored: 0,
      error: 'Qdrant storage error',
      message: error.message 
    });
  }
}
