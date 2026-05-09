import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// Model priority: Gemini -> Others -> OpenAI (last due to 0 free tries)
const MODELS = {
  google: ['gemini-3.1-flash-lite'], // Free plan model with good performance
  groq: ['llama3-8b-8192'], // Correct Groq model name
  cerebras: ['llama3.1-8b'], // Correct Cerebras model name  
  siliconflow: ['Qwen/Qwen2.5-7B-Instruct'], // Best Silicon Flow model
  openrouter: ['meta-llama/llama-3.1-8b-instruct:free'], // Best OpenRouter free model
  openai: ['gpt-4o-mini'], // Smart and fast OpenAI model (last priority due to 0 free tries)
};

const ALL_MODELS = [
  ...MODELS.google,
  ...MODELS.groq, 
  ...MODELS.cerebras,
  ...MODELS.siliconflow,
  ...MODELS.openrouter,
  ...MODELS.openai
];

const MAX_BODY_SIZE = 1024 * 1024; // 1MB - increased for large JSON content

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  const siliconflowKey = process.env.SILICON_FLOW_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  // Enhanced debugging and user role checking
  const userRole = req.body?.viewerRole;
  const isCreator = userRole === 'creator' || userRole === 'admin';
  const isTeacher = userRole === 'teacher';
  const isPlayer = userRole === 'player';
  const isAuthenticated = userRole && userRole !== 'player';
  
  // User-based rate limits
  const getRateLimits = (role) => {
    switch (role) {
      case 'player':
        return { daily: 50, perMinute: { min: 5, max: 10 } };
      case 'teacher':
        return { daily: 300, perMinute: { min: 15, max: 20 } };
      case 'admin':
      return { daily: 250, perMinute: 100 };
      case 'creator':
        return { daily: Infinity, perMinute: Infinity }; // No limits
      default:
        return { daily: 0, perMinute: 0 }; // No access
    }
  };
  
  const debugInfo = {
    timestamp: new Date().toISOString(),
    geminiKey: geminiKey ? 'SET' : 'NOT SET',
    groqKey: groqKey ? 'SET' : 'NOT SET',
    cerebrasKey: cerebrasKey ? 'SET' : 'NOT SET',
    siliconflowKey: siliconflowKey ? 'SET' : 'NOT SET',
    openrouterKey: openrouterKey ? 'SET' : 'NOT SET',
    openaiKey: openaiKey ? 'SET' : 'NOT SET',
    availableModels: ALL_MODELS,
    bodySize: JSON.stringify(req.body || {}).length,
    userAgent: req.headers['user-agent']?.substring(0, 100),
    userRole,
    isCreator,
    rateLimits: getRateLimits(userRole)
  };
  
  if (isCreator) {
    console.log('🔍 AI API Debug (Creator):', debugInfo);
  }
  
  if (!geminiKey && !groqKey && !cerebrasKey && !siliconflowKey && !openrouterKey && !openaiKey) {
    return res.status(500).json({ 
      error: 'API keys not configured. Please add at least one API key to your Vercel Environment Variables.',
      debug: {
        geminiKey: !!geminiKey,
        groqKey: !!groqKey,
        cerebrasKey: !!cerebrasKey,
        siliconflowKey: !!siliconflowKey,
        openrouterKey: !!openrouterKey,
        openaiKey: !!openaiKey,
        availableEnvVars: Object.keys(process.env).filter(k => k.includes('API_KEY') || k.includes('GEMINI') || k.includes('GROQ') || k.includes('CEREBRAS') || k.includes('SILICON_FLOW') || k.includes('OPENROUTER') || k.includes('OPENAI'))
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
    
    // Use priority order: Gemini -> OpenAI -> Others
    let modelsToTry = ALL_MODELS;
    
    // Check authentication and provide explicit reason for non-authed users
    if (!isAuthenticated) {
      return res.status(403).json({ 
        error: 'Доступ к ИИ-анализу доступен только авторизованным пользователям. Пожалуйста, войдите в систему, чтобы использовать эту функцию.',
        reason: 'NON_AUTHENTICATED_USER',
        userRole: userRole || 'unknown'
      });
    }
    
    // Creator role bypass - unlimited access
    if (isCreator) {
      console.log('🚀 Creator detected - bypassing all rate limits');
      console.log('🔍 Creator debug:', { userRole, isCreator, reqBody: req.body });
      // Continue to model execution without any rate limiting
    } else {
      console.log('🔍 Non-creator user detected:', { userRole, isCreator, reqBody: req.body });
      // Apply rate limiting for non-creator roles
      const rateLimits = getRateLimits(userRole);
      if (rateLimits.daily === 0 && rateLimits.perMinute === 0) {
        return res.status(403).json({ 
          error: 'Доступ к ИИ-анализу ограничен. Пожалуйста, свяжитесь с администратором.',
          reason: 'NO_ACCESS_ROLE',
          userRole: userRole || 'unknown'
        });
      }
    }
    
    // Log token info and API key status for debugging
    console.log('🔍 API Key Status:', {
      geminiKey: geminiKey ? 'SET' : 'NOT SET',
      groqKey: groqKey ? 'SET' : 'NOT SET',
      cerebrasKey: cerebrasKey ? 'SET' : 'NOT SET',
      siliconflowKey: siliconflowKey ? 'SET' : 'NOT SET',
      openrouterKey: openrouterKey ? 'SET' : 'NOT SET',
      openaiKey: openaiKey ? 'SET' : 'NOT SET',
      modelsToTry,
      userRole
    });
    
    if (isCreator) {
      console.log(`🔍 Token Analysis: ${totalTokens} tokens, using models:`, modelsToTry);
    }
    
    let lastError = null;
    let isRateLimited = false;
    
    for (const model of modelsToTry) {
      console.log(`🔄 Trying model: ${model}`);
      try {
        // Google Gemini models
        if (MODELS.google.includes(model)) {
          if (!geminiKey) continue;
          
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }));

          const stream = await ai.generateContentStream({
            model,
            contents: [
              { role: 'user', parts: [{ text: `System: ${systemPrompt}` }] },
              ...contents
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 32768,
            },
          });

          res.write(`data: ${JSON.stringify({ model })}\n\n`);
          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          }
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        
        // Groq models
        else if (MODELS.groq.includes(model)) {
          if (!groqKey) continue;
          
          const groq = new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' });
          
          const stream = await groq.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 32768
          });

          res.write(`data: ${JSON.stringify({ model })}\n\n`);
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
        
        // Cerebras models
        else if (MODELS.cerebras.includes(model)) {
          if (!cerebrasKey) continue;
          
          const cerebras = new OpenAI({ apiKey: cerebrasKey, baseURL: 'https://api.cerebras.ai/v1' });
          
          const stream = await cerebras.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 32768
          });

          res.write(`data: ${JSON.stringify({ model })}\n\n`);
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
        
        // Silicon Flow models
        else if (MODELS.siliconflow.includes(model)) {
          if (!siliconflowKey) continue;
          
          const siliconflow = new OpenAI({ 
            apiKey: siliconflowKey, 
            baseURL: 'https://api.siliconflow.cn/v1'
          });
          
          const stream = await siliconflow.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 32768
          });

          res.write(`data: ${JSON.stringify({ model })}\n\n`);
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
        
        // OpenRouter models
        else if (MODELS.openrouter.includes(model)) {
          if (!openrouterKey) continue;
          
          const openRouter = new OpenAI({ 
            apiKey: openrouterKey, 
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': 'https://labtest.kz',
              'X-Title': 'LabTest AI Analysis'
            }
          });
          
          const stream = await openRouter.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 32768
          });

          res.write(`data: ${JSON.stringify({ model })}\n\n`);
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
        
        // OpenAI models (fallback)
        else if (openaiKey && model.includes('gpt')) {
          const openai = new OpenAI({ apiKey: openaiKey });
          
          const stream = await openai.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 32768
          });

          res.write(`data: ${JSON.stringify({ model })}\n\n`);
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
        console.error(`🔴 Model ${model} failed with error:`, {
          message: err.message,
          status: err.status,
          stack: err.stack?.substring(0, 300),
          name: err.name,
          code: err.code
        });
        
        // Check for 429 rate limit error
        if (err.status === 429 || err.message?.includes('429') || err.message?.includes('rate limit')) {
          isRateLimited = true;
          if (isCreator) {
            console.warn(`🔴 Model ${model} rate limited (429):`, err.message);
          }
          continue; // Try next model only on 429
        }
        
        // For other errors, continue trying models
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
            groqKey: groqKey ? 'SET' : 'NOT SET',
            cerebrasKey: cerebrasKey ? 'SET' : 'NOT SET',
            siliconflowKey: siliconflowKey ? 'SET' : 'NOT SET',
            openrouterKey: openrouterKey ? 'SET' : 'NOT SET',
            openaiKey: openaiKey ? 'SET' : 'NOT SET',
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
