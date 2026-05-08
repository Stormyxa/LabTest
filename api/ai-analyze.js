import { GoogleGenAI } from '@google/genai';

const PRIMARY_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.0-flash';
const MAX_BODY_SIZE = 150 * 1024; // 150KB

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured. Please add it to .env.local as VITE_GEMINI_API_KEY for local development.' });
  }

  try {
    const bodyStr = JSON.stringify(req.body || {});
    if (bodyStr.length > MAX_BODY_SIZE) {
      return res.status(413).json({ error: 'Request too large' });
    }

    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    // Convert messages to Gemini format
    // messages: [{ role: 'user'|'assistant', content: string }]
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const ai = new GoogleGenAI({ apiKey });

    // Setup SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let model = PRIMARY_MODEL;
    let stream;

    try {
      stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      });
    } catch (primaryErr) {
      // Fallback to secondary model on rate limit or unavailability
      console.warn(`Primary model ${PRIMARY_MODEL} failed:`, primaryErr.message);
      model = FALLBACK_MODEL;

      try {
        stream = await ai.models.generateContentStream({
          model,
          contents,
          config: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        });
      } catch (fallbackErr) {
        console.error(`Fallback model ${FALLBACK_MODEL} also failed:`, fallbackErr.message);
        res.write(`data: ${JSON.stringify({ error: 'AI temporarily unavailable. Please try again later.' })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    }

    // Send model info
    res.write(`data: ${JSON.stringify({ model })}\n\n`);

    // Stream chunks
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('AI Analyze Error:', error);

    // If headers already sent (streaming started), end stream with error
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
