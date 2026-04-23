import { supabase } from './supabase';

export const evaluateAndSaveExpiredAttempt = async (att, userId) => {
  const qId = att.quiz_id;
  const uId = userId || att.user_id;
  const rawQuestions = att.quizzes?.content?.questions || [];
  const maxScore = rawQuestions.length;

  if (maxScore === 0) {
    console.error('Cant evaluate attempt: quiz content is missing/empty in attempt metadata', att);
    return;
  }

  const shuffleKey = `labtest_shuffle_${qId}`;
  const answersKey = `quiz_answers_${qId}`;

  // 1. Reconstruct fullyShuffled
  const indexedQuestions = rawQuestions.map((q, idx) => ({ ...q, originalIndex: idx }));
  let fullyShuffled = [...indexedQuestions];
  const storedShuffle = localStorage.getItem(shuffleKey);
  if (storedShuffle) {
    try {
      const shuffleMap = JSON.parse(storedShuffle);
      fullyShuffled = shuffleMap.map(entry => {
        const q = indexedQuestions[entry.qIdx];
        const optionsWithIndices = entry.oMap.map(oIdx => ({
          opt: q.options[oIdx],
          originalIndex: oIdx
        }));
        const newCorrectIndex = optionsWithIndices.findIndex(o => o.originalIndex === q.correctIndex);
        return {
          ...q,
          options: optionsWithIndices.map(o => o.opt),
          correctIndex: newCorrectIndex,
          optionMapping: optionsWithIndices.map(o => o.originalIndex)
        };
      });
    } catch (e) {}
  }

  // 2. Load answers
  let finalAnswers = {};
  const storedAnswers = localStorage.getItem(answersKey);
  if (storedAnswers) {
    try {
      finalAnswers = JSON.parse(storedAnswers);
    } catch (e) {}
  }

  // 3. Grade
  const originalAnswers = [];
  fullyShuffled.forEach((q, idx) => {
    if (q.originalIndex !== undefined) {
      const shuffledChoice = finalAnswers[idx] !== undefined ? finalAnswers[idx] : null;
      const isCorrect = shuffledChoice === q.correctIndex;
      originalAnswers[q.originalIndex] = isCorrect;
    }
  });

  const correctCount = fullyShuffled.filter((q, idx) => finalAnswers[idx] === q.correctIndex).length;
  const isPassed = (correctCount / maxScore) >= 0.5;

  const detailedAnswers = fullyShuffled.map((q, idx) => {
    const shuffledChoice = finalAnswers[idx] !== undefined ? finalAnswers[idx] : null;
    const originalChosenIndex = (shuffledChoice !== null && q.optionMapping) 
      ? q.optionMapping[shuffledChoice] 
      : null;
    const isCorrect = shuffledChoice === q.correctIndex;
    return {
      originalIndex: q.originalIndex,
      chosenIndex: originalChosenIndex,
      correctIndex: q.optionMapping ? q.optionMapping[q.correctIndex] : q.correctIndex,
      timeSpent: 25, // Fallback since we don't have per-question time
      isCorrect: isCorrect
    };
  });

  const totalSeconds = maxScore * 25; // Standard default time
  const finish_reason = 'timer_expired';

  const attemptData = {
    is_incomplete: false,
    finish_reason: finish_reason,
    score: correctCount,
    max_score: maxScore,
    time_spent_total: totalSeconds,
    is_passed: isPassed,
    is_suspicious: false,
    answers_data: detailedAnswers
  };

  // Update quiz_attempts
  await supabase.from('quiz_attempts').update(attemptData).eq('id', att.id);

  // Update quiz_results
  const now = new Date().toISOString();
  const { data: existing } = await supabase.from('quiz_results').select('id').eq('quiz_id', qId).eq('user_id', uId).maybeSingle();
  if (existing) {
    await supabase.from('quiz_results').update({
       score: correctCount, total_questions: maxScore, is_passed: isPassed, completed_at: now, answers_array: originalAnswers, is_incomplete_user: false
    }).eq('id', existing.id);
  } else {
    // Fetch profile class ID
    const { data: prof } = await supabase.from('profiles').select('class_id').eq('id', uId).single();
    await supabase.from('quiz_results').insert({
       quiz_id: qId, user_id: uId, score: correctCount, total_questions: maxScore,
       is_passed: isPassed, completed_at: now, first_score: correctCount, first_completed_at: now,
       answers_array: originalAnswers, first_answers_array: originalAnswers, is_incomplete_user: false,
       class_id: prof?.class_id || null
    });
  }

  // Clear local storage pending items
  localStorage.removeItem(`quiz_pending_${qId}`);
  localStorage.removeItem(`quiz_timer_${qId}`);
  localStorage.removeItem(`quiz_answers_${qId}`);

  // Also aggressively update catalog cache for instant UI feedback
  const catalogCacheKey = `labtest_cache_catalog_stats_${att.quizzes?.section_id}`;
  const rawCache = localStorage.getItem(catalogCacheKey);
  if (rawCache) {
    try {
      const parsed = JSON.parse(rawCache);
      if (parsed.data && parsed.data.passed) {
        parsed.data.passed[qId] = { is_passed: isPassed, score: correctCount, total: maxScore };
        localStorage.setItem(catalogCacheKey, JSON.stringify(parsed));
        // Dispatch event to trigger useCacheSync in QuizCatalog immediately
        window.dispatchEvent(new CustomEvent(`cache-update-catalog_stats_${att.quizzes?.section_id}`, { detail: parsed.data }));
      }
    } catch(e) {}
  }
};
