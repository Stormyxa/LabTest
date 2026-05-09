import { supabase } from './supabase';

/**
 * Builds a consistent cache key for AI analyses
 */
export const buildAiCacheKey = (type, id, role, extra = null) => {
  let key = `${type}_${id}_${role}`;
  if (extra) key += `_${extra}`;
  return key;
};

/**
 * Fetches previous AI analyses for a specific user.
 */
export const getAiHistory = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('ai_analyses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }); // Using created_at which is standard

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('History fetch failed:', e);
    return [];
  }
};

/**
 * Saves or updates an AI analysis record.
 */
export const saveAiAnalysis = async ({
  user_id,
  context_type,
  context_id,
  title,
  messages,
  cache_key
}) => {
  try {
    const finalCacheKey = cache_key || buildAiCacheKey(context_type, context_id, 'history', Date.now());
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from('ai_analyses').upsert({
      cache_key: finalCacheKey,
      user_id,
      content: messages[messages.length - 1].content,
      data: { messages, title: title || 'AI Chat' }, // Store title inside data as well
      expires_at: expiresAt
    }, { onConflict: 'cache_key' });

    if (error) throw error;
  } catch (e) {
    console.error('Save AI analysis failed:', e);
  }
};

export const deleteAiAnalysis = async (id) => {
  await supabase.from('ai_analyses').delete().eq('id', id);
};

/**
 * Builds initial message for AI analysis (hidden from user)
 */
export const buildInitialMessage = (instruction, data) => {
  // System message with instruction and data (not shown to user)
  const systemContent = `${instruction}

Данные для анализа:
${JSON.stringify(data, null, 2)}`;
  
  return {
    role: 'system',
    content: systemContent,
    ts: new Date().toISOString()
  };
};

/**
 * Get cached analysis from localStorage or Supabase
 */
export const getCachedAnalysis = async (cacheKey) => {
  try {
    // First check localStorage (user-specific cache)
    const localKey = `ai_analysis_${cacheKey}`;
    const localData = localStorage.getItem(localKey);
    
    if (localData) {
      const parsed = JSON.parse(localData);
      if (parsed.expiresAt > Date.now()) {
        return { messages: parsed.data.messages, title: parsed.data.title };
      }
      localStorage.removeItem(localKey);
    }
    
    // Then check Supabase (shared cache)
    const { data, error } = await supabase
      .from('ai_analyses')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .single();
    
    if (error) return null;
    
    if (new Date(data.expires_at) > new Date()) {
      // Cache in localStorage for faster access
      localStorage.setItem(localKey, JSON.stringify({
        data: data.data,
        expiresAt: new Date(data.expires_at).getTime()
      }));
      return { messages: data.data.messages, title: data.data.title };
    }
    
    return null;
  } catch (e) {
    console.error('Cache check failed:', e);
    return null;
  }
};

/**
 * Clear local AI cache
 */
export const clearLocalAiCache = (cacheKey) => {
  const localKey = `ai_analysis_${cacheKey}`;
  localStorage.removeItem(localKey);
};

/**
 * Download chat as markdown file
 */
export const downloadChatAsMarkdown = (messages, title) => {
  const content = `# ${title}\n\n${messages.map(msg => {
    if (msg.role === 'system') return ''; // Skip system messages
    const role = msg.role === 'user' ? '👤 **Пользователь**' : '🤖 **AI**';
    return `${role}:\n${msg.content}\n\n---\n\n`;
  }).join('')}`;
  
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Send messages to AI and stream the response.
 */
export const streamAiAnalysis = async ({
  messages,
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch('/api/ai-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        messages, 
        contextType, 
        contextId, 
        viewerRole 
      }),
      signal
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'AI request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            // Save to history before calling onDone
            await saveAiAnalysis({
              user_id: session.user.id,
              context_type: contextType,
              context_id: contextId,
              title: title || 'AI Chat',
              messages: [...messages, { role: 'assistant', content: fullText }]
            });
            if (onDone) onDone(fullText);
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              // Check for recursion patterns (repeated characters/words)
              const repeatedPattern = /(.)\1{10,}|(.{2,})\2{5,}/;
              if (repeatedPattern.test(parsed.text)) {
                console.warn('Detected potential AI recursion, stopping stream');
                throw new Error('AI response contains repetitive patterns - possible recursion');
              }
              
              fullText += parsed.text;
              if (onChunk) onChunk(parsed.text);
            } else if (parsed.error) {
              throw new Error(parsed.error);
            } else if (parsed.model) {
              // Model info, can be ignored or handled
              console.log('Using model:', parsed.model);
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', data, e);
          }
        }
      }
    }

    if (onDone) onDone(fullText);
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('AI streaming error:', err);
    if (onError) onError(err);
  }
};
