import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// Model priorities - highest to lowest (Gemini only)
// const GPT_MODELS = ['gpt-4o-mini', 'gpt-4o']; // Disabled - never used
const GPT_MODELS = []; // Completely disabled
const GEMINI_MODELS = ['gemini-3.0-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemma-27b', 'gemma-21b'];
const ALL_MODELS = [...GEMINI_MODELS]; // Only Gemini models

const MAX_BODY_SIZE = 1024 * 1024; // 1MB - increased for large JSON content

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  // Enhanced debugging for creators
  const isCreator = req.body?.viewerRole === 'creator' || req.body?.viewerRole === 'admin';
  const debugInfo = {
    timestamp: new Date().toISOString(),
    geminiKey: geminiKey ? 'SET' : 'NOT SET',
    openaiKey: openaiKey ? 'SET' : 'NOT SET',
    envGemini: process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET',
    envViteGemini: process.env.VITE_GEMINI_API_KEY ? 'SET' : 'NOT SET',
    envOpenAI: process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET',
    availableModels: ALL_MODELS,
    bodySize: JSON.stringify(req.body || {}).length,
    userAgent: req.headers['user-agent']?.substring(0, 100),
    isCreator
  };
  
  if (isCreator) {
    console.log('🔍 AI API Debug (Creator):', debugInfo);
  }
  
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

    const systemPrompt = "Ты — элитный педагогический ИИ-аналитик LabTest. Твои ответы должны быть глубокими, профессиональными, но структурированными. Избегай лишней 'воды', чтобы ответ не обрывался. Если информации очень много, используй таблицы и списки. Всегда отвечай на языке пользователя (русский). ВАЖНО: Никогда не повторяй один и тот же символ или слово много раз подряд. Не создавай бесконечные повторения. Отвечай кратко и по существу.";
    
    // Token estimation (rough approximation: 1 token ≈ 4 characters for English, 1 token ≈ 1 character for Russian)
    const estimateTokens = (text) => {
      // Russian text typically uses ~1 token per character, English ~4 chars per token
      const russianChars = (text.match(/[а-яёА-ЯЁ]/g) || []).length;
      const otherChars = text.length - russianChars;
      return Math.ceil(russianChars + otherChars / 4);
    };
    
    const totalTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
    
    // Smart switching: Gemini for analysis, GPT for continued chat, token-based selection
    const isInitialAnalysis = messages.length === 1 && (
      messages[0].content.includes('Анализ:') || 
      messages[0].content.includes('Проведи детальный анализ') ||
      messages[0].content.includes('анализ попыток')
    );
    const isContinuedChat = messages.length > 1;
    const hasAnalysisContext = messages.some(msg => 
      msg.content.includes('Анализ:') || 
      msg.content.includes('анализ попыток')
    );
    
    let modelsToTry;
    if (isInitialAnalysis) {
      // Use Gemini for initial analysis, but consider token count
      if (totalTokens > 50000) {
        // Very large content - use models with better token limits
        modelsToTry = ['gemini-2.5-flash', 'gemini-3.0-flash', 'gpt-5.4-mini', 'gpt-5.4-nano'];
      } else {
        // Normal analysis - use specified priority
        modelsToTry = GEMINI_MODELS;
      }
    } else if (isContinuedChat && hasAnalysisContext) {
      // After analysis - always switch to GPT for continued conversation
      if (totalTokens > 20000) {
        // Large conversation - use models with better limits
        modelsToTry = ['gpt-5.4-mini', 'gpt-5.4-nano', 'gemini-2.5-flash'];
      } else {
        // Normal chat after analysis - use GPT models
        modelsToTry = GPT_MODELS;
      }
    } else if (isContinuedChat) {
      // Regular chat without analysis context - use GPT for better limits
      modelsToTry = GPT_MODELS;
    } else {
      // Default fallback: try all models
      modelsToTry = ALL_MODELS;
    }
    
    // Log token info for creators
    if (isCreator) {
      console.log(`🔍 Token Analysis: ${totalTokens} tokens, using models:`, modelsToTry);
    }
    
    let lastError = null;
    
    for (const model of modelsToTry) {
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
              maxOutputTokens: 32768, // Increased for large content analysis
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
            max_tokens: 32768, // Increased for large content analysis
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
        const errorInfo = {
          model,
          error: err.message,
          stack: err.stack?.substring(0, 200),
          timestamp: new Date().toISOString()
        };
        
        if (isCreator) {
          console.warn(`🔴 Model ${model} failed:`, errorInfo);
          console.warn('🔍 Full error details:', {
            geminiKey: geminiKey ? 'SET' : 'NOT SET',
            model,
            errorMessage: err.message,
            errorStack: err.stack,
            requestBody: JSON.stringify(req.body).substring(0, 500)
          });
        } else {
          console.warn(`Model ${model} failed:`, err.message);
        }
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
