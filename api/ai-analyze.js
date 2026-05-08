import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// Model priorities - highest to lowest
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
const GPT_MODELS = ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5-mini', 'gpt-5-nano'];
const ALL_MODELS = [...GEMINI_MODELS, ...GPT_MODELS];

const MAX_BODY_SIZE = 150 * 1024; // 150KB

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  // Debug logging (remove in production)
  console.log('API Keys Debug:', {
    geminiKey: geminiKey ? 'SET' : 'NOT SET',
    openaiKey: openaiKey ? 'SET' : 'NOT SET',
    envGemini: process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET',
    envViteGemini: process.env.VITE_GEMINI_API_KEY ? 'SET' : 'NOT SET',
    envOpenAI: process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'
  });
  
  if (!geminiKey && !openaiKey) {
    return res.status(500).json({ 
      error: 'API keys not configured. Please add GEMINI_API_KEY and/or OPENAI_API_KEY to your Vercel Environment Variables.',
      debug: {
        geminiKey: !!geminiKey,
        openaiKey: !!openaiKey,
        availableEnvVars: Object.keys(process.env).filter(k => k.includes('API_KEY') || k.includes('GEMINI') || k.includes('OPENAI'))
      }
    });
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

    // Setup SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const systemPrompt = "Ты — элитный педагогический ИИ-аналитик LabTest. Твои ответы должны быть глубокими, профессиональными, но структурированными. Избегай лишней 'воды', чтобы ответ не обрывался. Если информации очень много, используй таблицы и списки. Всегда отвечай на языке пользователя (русский).";
    
    // Smart fallback: try Gemini first, then GPT
    let lastError = null;
    
    for (const model of ALL_MODELS) {
      try {
        if (GEMINI_MODELS.includes(model)) {
          if (!geminiKey) continue;
          
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }));

          const stream = await ai.models.generateContentStream({
            model,
            contents: [
              { role: 'user', parts: [{ text: `System: ${systemPrompt}` }] },
              ...contents
            ],
            config: {
              temperature: 0.7,
              maxOutputTokens: 8192,
            },
          });

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
          return;
          
        } else if (GPT_MODELS.includes(model)) {
          if (!openaiKey) continue;
          
          const openai = new OpenAI({ apiKey: openaiKey });
          
          const stream = await openai.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            temperature: 0.7,
            max_tokens: 8192,
            stream: true,
          });

          // Send model info
          res.write(`data: ${JSON.stringify({ model })}\n\n`);

          // Stream chunks
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          }
          
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} failed:`, err.message);
        continue; // Try next model
      }
    }

    // All models failed
    console.error('All models failed:', lastError?.message);
    res.write(`data: ${JSON.stringify({ error: 'All AI models temporarily unavailable. Please try again later.' })}\n\n`);
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
