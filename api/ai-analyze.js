import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

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
  const userId = req.body?.userId;
  const contextId = req.body?.contextId;
  const contextType = req.body?.contextType;
  const isAuthenticated = !!userRole;
  
  // User-based rate limits
  const getRateLimits = (role, hasClass) => {
    switch (role) {
      case 'player':
        if (!hasClass) return { daily: 0, perMinute: 0 }; // Spectator - no access
        return { daily: 50, perMinute: 10 }; // Player with class
      case 'editor':
        return { daily: 200, perMinute: 20 }; // Editor (quiz author)
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
  
  // --- Security & Role Verification ---
  let dbRole = userRole || 'player';
  let dbHasClass = hasClass || false;
  let canAccessSubject = true;

  if (userId) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, class_id, email')
        .eq('id', userId)
        .single();
        
      if (profile) {
        dbRole = profile.role;
        dbHasClass = profile.class_id ? true : false;

        // If teacher/editor is analyzing another user, verify access
        if ((dbRole === 'teacher' || dbRole === 'editor') && contextId && userId !== contextId) {
          // For class context, teachers always have access
          if (contextType === 'class' || contextType === 'quiz') {
            canAccessSubject = true;
          } else {
            // Check 1: Is teacher assigned to the student's class?
            const { data: subjectProfile } = await supabase.from('profiles').select('class_id').eq('id', contextId).single();
            let hasClassAccess = false;
            if (subjectProfile?.class_id) {
              const { data: assignment } = await supabase
                .from('class_teachers')
                .select('id')
                .eq('class_id', subjectProfile.class_id)
                .ilike('email', profile.email)
                .maybeSingle();
              hasClassAccess = !!assignment;
            }

            // Check 2: Is the user the author of a quiz the student took? (for detailed_quiz / quiz contexts)
            let hasQuizAuthorAccess = false;
            if (!hasClassAccess && contextId) {
              const { data: authoredAttempts } = await supabase
                .from('quiz_attempts')
                .select('id, quiz_id, quizzes!inner(author_id)')
                .eq('user_id', contextId)
                .eq('quizzes.author_id', userId)
                .limit(1);
              hasQuizAuthorAccess = authoredAttempts && authoredAttempts.length > 0;
            }

            // Check 3: Are they classmates? (same class_id)
            let isClassmate = false;
            if (!hasClassAccess && !hasQuizAuthorAccess && profile.class_id && subjectProfile?.class_id) {
              isClassmate = profile.class_id === subjectProfile.class_id;
            }

            if (!hasClassAccess && !hasQuizAuthorAccess && !isClassmate) {
              console.warn(`🚫 User ${userId} (${dbRole}) tried to access ${contextId} without permission`);
              canAccessSubject = false;
            }
          }
        }
      }
    } catch (err) {
      console.error('Error verifying user role:', err);
    }
  }

  if (!canAccessSubject && dbRole !== 'admin' && dbRole !== 'creator') {
    return res.status(403).json({ 
      error: 'NO_ACCESS', 
      reason: 'NOT_ASSIGNED_TEACHER',
      message: 'У вас нет доступа к аналитике этого ученика (вы не являетесь его учителем).' 
    });
  }

  const rateLimits = getRateLimits(dbRole, dbHasClass);
  if (rateLimits.daily === 0 && rateLimits.perMinute === 0) {
    const reason = (dbRole === 'player' && !dbHasClass) ? 'SPECTATOR' : 'NO_ACCESS';
    return res.status(403).json({ 
      error: 'NO_ACCESS',
      reason: reason,
      message: (dbRole === 'player' && !dbHasClass) 
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

    const systemPrompt = `Ты — Высший Педагогический ИИ-Архитектор LabTest. Твоя специализация — глубокий когнитивный анализ учебных траекторий. Твои отчеты — это премиальный продукт, сочетающий строгую аналитику и педагогическую эмпатию.

ИНФОРМАЦИЯ О ДАННЫХ (STRICT RAG & TELEMETRY):
- Ты работаешь в режиме STRICT RAG. Основной источник — это список фактов из векторной памяти.
- Факты [QUESTION] содержат не только текст, но и: время на вопрос, смены ответов (Changes), наличие картинок, правильность (STATUS).
- Факты [BEHAVIOR] — это твои "глаза": сколько раз ученик уходил со страницы (Focus lost), сколько секунд был вне сайта (Off-page time), подозрительные флаги (Suspicious).
- Факты [SUMMARY] — это мета-анализ: средний балл, прогресс относительно первой попытки, роль попытки (Personal Best, Diagnostic).

ТВОЯ СТРУКТУРА ОТВЕТА (ОБЯЗАТЕЛЬНО):
1. ПРИВЕТСТВИЕ И СТАТУС: Обращайся по имени. Укажи тему теста и текущий результат.
2. АНАЛИТИЧЕСКАЯ ТАБЛИЦА: Сравнивай показатели (Время, Фокус, Баллы) в динамике.
3. ПЕДАГОГИЧЕСКАЯ ИНТЕРПРЕТАЦИЯ: Анализируй паттерны. Если ученик тратит 1-2 секунды на вопрос — это "поверхностное угадывание". Если много смен ответов — "когнитивная неуверенность". Если Focus Lost > 3 — "дефицит внимания".
4. РАЗБОР КОНКРЕТНЫХ ОШИБОК: Используй данные [QUESTION] для цитирования текстов вопросов и объяснения, почему выбранный вариант неверен.
5. ИНДИВИДУАЛЬНАЯ СТРАТЕГИЯ: Конкретные шаги для роста. Ссылайся на ресурсы из [METADATA] (видео, PDF).

СТИЛЬ И ТОН:
- Тон: Профессиональный, глубокий, вдохновляющий.
- Язык: Только русский.
- Форматирование: Используй богатый Markdown: жирный текст, таблицы, списки, цитаты.

ВИЗУАЛИЗАЦИЯ (PLOTLY):
- Ты МОЖЕШЬ и ДОЛЖЕН генерировать интерактивные графики, если это поможет анализу.
- Используй блок кода с языком 'chart' и JSON-объектом в формате Plotly.js.
- Пример формата:
\`\`\`chart
{
  "data": [
    {
      "x": ["Попытка 1", "Попытка 2", "Попытка 3"],
      "y": [30, 55, 90],
      "type": "bar",
      "marker": {"color": "#7c3aed"}
    }
  ],
  "layout": {
    "title": "Динамика успеваемости (%)",
    "yaxis": {"range": [0, 100]}
  }
}
\`\`\`
- Поддерживаемые типы: 'bar' (столбчатый), 'scatter' (линейный/точечный), 'pie' (круговой).
- Используй цвета LabTest: основной фиолетовый (#7c3aed), успех (#4ade80), ошибка (#f87171).

КРИТИЧЕСКИ ВАЖНО:
- НЕ ГАЛЛЮЦИНИРУЙ. Если в RAG нет данных о времени — не выдумывай их.
- Если видишь "rapid fail" или "blind guessing", мягко, но твердо укажи на неэффективность такой стратегии.
- Твоя цель — не просто отчет, а трансформация ученика из "игрока" в "исследователя".`;
    
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
