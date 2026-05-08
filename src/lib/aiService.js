import { supabase } from './supabase';

// ─── Constants ───────────────────────────────────────────────────
const ANALYSIS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 час — общий кэш
const LOCAL_CACHE_PREFIX = 'labtest_ai_';

// ─── Cache Key Builders ─────────────────────────────────────────

export const buildAiCacheKey = (type, contextId, viewerRole = 'student', quizId = null) => {
  switch (type) {
    case 'student': return `student_${contextId}_${viewerRole}`;
    case 'detailed_quiz': return `detailed_${contextId}_${quizId}_${viewerRole}`;
    case 'quiz': return `quiz_${contextId}`;
    case 'class': return `class_${contextId}`;
    default: return `${type}_${contextId}`;
  }
};

// ─── Local Cache (quick, 1hr TTL) ───────────────────────────────

const getLocalCache = (cacheKey) => {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_PREFIX + cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > ANALYSIS_CACHE_TTL_MS) {
      localStorage.removeItem(LOCAL_CACHE_PREFIX + cacheKey);
      return null;
    }
    return parsed.messages;
  } catch { return null; }
};

const setLocalCache = (cacheKey, messages) => {
  try {
    localStorage.setItem(LOCAL_CACHE_PREFIX + cacheKey, JSON.stringify({
      ts: Date.now(),
      messages,
    }));
  } catch { /* quota exceeded — ignore */ }
};

export const clearLocalAiCache = (cacheKey) => {
  try { localStorage.removeItem(LOCAL_CACHE_PREFIX + cacheKey); } catch {}
};

// ─── Supabase Cache (shared, 1 week TTL) ────────────────────────

const getSupabaseCache = async (cacheKey) => {
  try {
    const { data } = await supabase
      .from('ai_analyses')
      .select('*')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
      return data;
    }
    return null;
  } catch { return null; }
};

const upsertSupabaseCache = async (cacheKey, contextType, contextId, viewerRole, title, messages) => {
  try {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week

    await supabase.from('ai_analyses').upsert({
      cache_key: cacheKey,
      context_type: contextType,
      context_id: contextId,
      viewer_role: viewerRole,
      title: title || null,
      messages,
      updated_at: now,
      expires_at: expiresAt,
    }, { onConflict: 'cache_key' });
  } catch (e) {
    console.error('Failed to save AI analysis to Supabase:', e);
  }
};

// ─── Check if cached analysis exists (local → Supabase) ─────────

export const getCachedAnalysis = async (cacheKey) => {
  // 1. Check local cache first (fast)
  const local = getLocalCache(cacheKey);
  if (local) return { messages: local, source: 'local' };

  // 2. Check Supabase (shared)
  const remote = await getSupabaseCache(cacheKey);
  if (remote) {
    // Warm up local cache
    setLocalCache(cacheKey, remote.messages);
    return { messages: remote.messages, source: 'supabase' };
  }

  return null;
};

// ─── Streaming AI Analysis ──────────────────────────────────────

/**
 * Send messages to AI and stream the response.
 * @param {Object} params
 * @param {Array} params.messages - Message history [{role: 'user'|'assistant', content: string}]
 * @param {string} params.cacheKey - Cache key for storage
 * @param {string} params.contextType - 'student', 'quiz', 'class', 'detailed_quiz'
 * @param {string} params.contextId - Entity UUID
 * @param {string} params.viewerRole - 'student' or 'teacher'
 * @param {string} params.title - Human-readable title
 * @param {Function} params.onChunk - Called with each text chunk
 * @param {Function} params.onDone - Called when complete with full text
 * @param {Function} params.onError - Called on error
 * @param {AbortSignal} [params.signal] - For cancellation
 * @returns {Promise<void>}
 */
export const streamAiAnalysis = async ({
  messages,
  cacheKey,
  contextType,
  contextId,
  viewerRole,
  title,
  onChunk,
  onDone,
  onError,
  signal,
}) => {
  try {
    const response = await fetch('/api/ai-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    let usedModel = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();

        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);

          if (parsed.error) {
            throw new Error(parsed.error);
          }

          if (parsed.model && !usedModel) {
            usedModel = parsed.model;
            continue;
          }

          if (parsed.text) {
            fullText += parsed.text;
            onChunk?.(parsed.text, fullText);
          }
        } catch (parseErr) {
          if (parseErr.message !== 'Unexpected end of JSON input') {
            console.warn('SSE parse error:', parseErr);
          }
        }
      }
    }

    // Save to caches
    const assistantMessage = { role: 'assistant', content: fullText, ts: new Date().toISOString() };
    const allMessages = [...messages, assistantMessage];

    setLocalCache(cacheKey, allMessages);

    // Save to Supabase (async, don't block)
    upsertSupabaseCache(cacheKey, contextType, contextId, viewerRole, title, allMessages);

    onDone?.(fullText, allMessages, usedModel);
  } catch (err) {
    if (err.name === 'AbortError') return; // User cancelled
    console.error('AI streaming error:', err);
    onError?.(err.message || 'Ошибка подключения к AI');
  }
};

// ─── Build Initial Prompt Message ───────────────────────────────

/**
 * Build the initial user message combining instruction + data.
 * Uses existing aiPromptBuilder results.
 */
export const buildInitialMessage = (instruction, data) => {
  let content = instruction;

  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    content += '\n\n## Данные для анализа (JSON):\n```json\n' + JSON.stringify(data, null, 2) + '\n```';
  }

  return { role: 'user', content, ts: new Date().toISOString() };
};

// ─── Download Chat as Markdown ──────────────────────────────────

export const downloadChatAsMarkdown = (messages, title) => {
  let md = `# ${title || 'ИИ-Анализ LabTest'}\n\n`;
  md += `> Создано: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}\n\n---\n\n`;

  for (const msg of messages) {
    if (msg.role === 'user') {
      // Don't include the huge JSON data in download — just note it
      if (msg.content.length > 2000) {
        md += `## 📝 Запрос на анализ\n\n`;
        md += `*Отправлен запрос с данными аналитики*\n\n---\n\n`;
      } else {
        md += `## 💬 Вопрос\n\n${msg.content}\n\n---\n\n`;
      }
    } else if (msg.role === 'assistant') {
      md += `## 🤖 ИИ-Анализ\n\n${msg.content}\n\n---\n\n`;
    }
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'ai_analysis').replace(/\s+/g, '_')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
