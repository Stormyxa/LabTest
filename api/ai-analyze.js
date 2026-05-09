import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// Model priority: Gemini -> Others -> OpenAI (last due to 0 free tries)
const MODELS = {
  google: ['gemini-3.1-flash-lite'], // Free plan model
  groq: ['llama-3.1-8b-instant'], // Best Groq model
  cerebras: ['llama-3.1-8b'], // Best Cerebras model  
  openrouter: ['meta-llama/llama-3.1-8b-instruct:free'], // Best OpenRouter free model
  openai: ['gpt-4o-mini'], // Smart and fast OpenAI model (last priority due to 0 free tries)
};

const ALL_MODELS = [
  ...MODELS.google,
  ...MODELS.groq, 
  ...MODELS.cerebras,
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
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  // Enhanced debugging and user role checking
  const userRole = req.body?.viewerRole;
  const isCreator = userRole === 'creator' || userRole === 'admin';
  const isTeacher = userRole === 'teacher';
  const isPlayer = userRole === 'player' || userRole === 'editor';
  const hasClass = req.body?.hasClass; // Player with class vs spectator
  const isAuthenticated = !!userRole;
  
  // User-based rate limits
  const getRateLimits = (role, hasClass) => {
    switch (role) {
      case 'player':
        if (!hasClass) return { daily: 0, perMinute: 0 }; // Spectator - no access
        return { daily: 50, perMinute: 10 }; // Player with class
      case 'teacher':
        return { daily: 300, perMinute: 30 };
      case 'admin':
        return { daily: 250, perMinute: 25 };
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
    openrouterKey: openrouterKey ? 'SET' : 'NOT SET',
    openaiKey: openaiKey ? 'SET' : 'NOT SET',
    availableModels: ALL_MODELS,
    bodySize: JSON.stringify(req.body || {}).length,
    userAgent: req.headers['user-agent']?.substring(0, 100),
    userRole,
    isCreator,
    hasClass,
    rateLimits: getRateLimits(userRole, hasClass)
  };
  
  if (isCreator) {
    console.log('🔍 AI API Debug (Creator):', debugInfo);
  }
  
  // Access control checks
  if (!isAuthenticated) {
    return res.status(403).json({ 
      error: 'NO_ACCESS',
      reason: 'NOT_AUTHENTICATED',
      message: 'Доступ к ИИ доступен только авторизованным пользователям'
    });
  }
  
  const rateLimits = getRateLimits(userRole, hasClass);
  if (rateLimits.daily === 0 && rateLimits.perMinute === 0) {
    const reason = isPlayer && !hasClass ? 'SPECTATOR' : 'NO_ACCESS';
    return res.status(403).json({ 
      error: 'NO_ACCESS',
      reason: reason,
      message: isPlayer && !hasClass 
        ? 'Наблюдатели (без класса) не имеют доступа к ИИ-анализу'
        : 'У вас нет доступа к ИИ-анализу'
    });
  }
  
  if (!geminiKey && !groqKey && !cerebrasKey && !openrouterKey && !openaiKey) {
    return res.status(500).json({ 
      error: 'API keys not configured. Please add at least one API key to your Vercel Environment Variables.',
      debug: {
        geminiKey: !!geminiKey,
        groqKey: !!groqKey,
        cerebrasKey: !!cerebrasKey,
        openrouterKey: !!openrouterKey,
        openaiKey: !!openaiKey,
        availableEnvVars: Object.keys(process.env).filter(k => k.includes('API_KEY') || k.includes('GEMINI') || k.includes('GROQ') || k.includes('CEREBRAS') || k.includes('OPENROUTER') || k.includes('OPENAI'))
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

    const systemPrompt = `Ты — элитный педагогический ИИ-аналитик LabTest. Твои ответы должны быть глубокими, профессиональными, но структурированными. Избегай лишней 'воды', чтобы ответ не обрывался. Если информации очень много, используй таблицы и списки. Всегда отвечай на языке пользователя (русский). ВАЖНО: Никогда не повторяй один и тот же символ или слово много раз подряд. Не создавай бесконечные повторения. Отвечай кратко и по существу.

ИНФОРМАЦИЯ О ДАННЫХ:
- Тебе предоставляются данные в двух форматах: JSON-сводка (userInfo) и список фактов из векторной памяти (RAG).
- Факты RAG имеют префиксы: [METADATA], [BEHAVIOR], [SUMMARY], [QUESTION].
- В фактах [QUESTION] теперь есть теги [STATUS: WRONG] или [STATUS: CORRECT]. Приоритетно анализируй WRONG для работы над ошибками.
- В JSON-сводке (contextData) есть объект 'questions' (словарь текстов, опций и пояснений) и 'attempts' (история с ISO-таймштампами).
- Время в системе указано в формате UTC или ISO, но для пользователя оно должно отображаться по времени Казахстана (GMT+5).

ТВОЯ РОЛЬ И СТИЛЬ:
- Ты — Персональный Цифровой Тьютор. Твоя задача не просто выдать отчет, а помочь ученику вырасти.
- Проявляй "педагогическую эмпатию": если ученик повторяет одну и ту же ошибку в разных попытках (смотри историю в JSON или RAG), мягко укажи на это: "Кажется, эта тема всё еще вызывает сложности, давай разберем её иначе".
- ИНТЕРПРЕТАЦИЯ ИЗОБРАЖЕНИЙ: Если в данных вопроса указано "Has Image: true" или есть URL, воспринимай это как критический визуальный контекст. Если ученик ошибся, возможно, он неверно считал информацию с картинки/графика.

КРИТИЧЕСКИ ВАЖНО - ПРАВИЛО ПРОТИВ ГАЛЛЮЦИНАЦИЙ:
- Если пользователь спрашивает о деталях, которые ЕСТЬ в RAG-фактах (например, "какой был 5-й вопрос?"), обязательно используй текст вопроса из [QUESTION 5].
- Если данных действительно нет, ЧЕСТНО скажи об этом. Но перед этим внимательно проверь весь предоставленный контекст RAG и JSON-словарь 'questions'.
- НЕ ВЫДУМЫВАЙ: баллы, даты и тексты вопросов, если их нет в предоставленных данных.
- Работай ТОЛЬКО с теми фактами, которые явно присутствуют в предоставленных данных. Если видишь [STATUS: WRONG], это твой главный сигнал для анализа.`;
    
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
    
    // Log token info for creators
    if (isCreator) {
      console.log(`🔍 Token Analysis: ${totalTokens} tokens, using models:`, modelsToTry);
    }
    
    let lastError = null;
    let isRateLimited = false;
    
    for (const model of modelsToTry) {
      try {
        // Google Gemini models
        if (MODELS.google.includes(model)) {
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
        
        // OpenRouter models
        else if (MODELS.openrouter.includes(model)) {
          if (!openrouterKey) continue;
          
          const openrouter = new OpenAI({ 
            apiKey: openrouterKey, 
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': 'https://labtest.kz',
              'X-Title': 'LabTest AI Analysis'
            }
          });
          
          const stream = await openrouter.chat.completions.create({
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
