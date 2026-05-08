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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      fullText += chunk;
      if (onChunk) onChunk(chunk);
    }

    // Save to history automatically
    await saveAiAnalysis({
      user_id: session.user.id,
      context_type: contextType,
      context_id: contextId,
      title: title || 'AI Chat',
      messages: [...messages, { role: 'assistant', content: fullText }]
    });

    if (onDone) onDone(fullText);
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('AI streaming error:', err);
    if (onError) onError(err);
  }
};
