/**
 * Server-side Gemini Embedding Utility
 * Uses Google's gemini-embedding-001 model with 768 dimensions
 */

const GEMINI_EMBED_MODEL = 'models/gemini-embedding-001';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

export const getGeminiApiKey = () => {
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
};

/**
 * Generate embedding for a single string using Gemini API
 * @param {string} text 
 * @returns {Promise<number[]>} 768-dimensional float vector
 */
export const generateGeminiEmbedding = async (text) => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const cleanText = (typeof text === 'string' ? text.trim() : JSON.stringify(text)) || 'empty';
  const url = `${GEMINI_API_URL}/${GEMINI_EMBED_MODEL}:embedContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: {
        parts: [{ text: cleanText }]
      },
      outputDimensionality: 768
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini Embedding API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  if (!data.embedding?.values) {
    throw new Error('Invalid embedding response from Gemini');
  }

  return data.embedding.values;
};

/**
 * Generate embeddings for multiple texts in batch using Gemini API
 * @param {string[]} texts 
 * @returns {Promise<number[][]>} Array of 768-dimensional float vectors
 */
export const generateGeminiEmbeddingsBatch = async (texts) => {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const batchSize = 80;
  const allVectors = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const url = `${GEMINI_API_URL}/${GEMINI_EMBED_MODEL}:batchEmbedContents?key=${apiKey}`;

    const requests = chunk.map(text => ({
      model: GEMINI_EMBED_MODEL,
      content: {
        parts: [{ text: (typeof text === 'string' ? text.trim() : JSON.stringify(text)) || 'empty' }]
      },
      outputDimensionality: 768
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini Batch Embedding API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    if (!data.embeddings || !Array.isArray(data.embeddings)) {
      throw new Error('Invalid batch embedding response from Gemini');
    }

    for (const item of data.embeddings) {
      allVectors.push(item.values);
    }
  }

  return allVectors;
};
