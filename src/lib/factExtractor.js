/**
 * Fact extraction utility for RAG implementation
 * Extracts meaningful learning facts from quiz attempts and results
 */

/**
 * Detect language of text (simple version)
 * @param {string} text - Text to analyze
 * @returns {string} Language code ('ru', 'kk', 'en', 'unknown')
 */
export const detectLanguage = (text) => {
  // Kazakh character ranges
  const kazakhChars = /[әіңғүұөһӘІҢҒҮҰӨҺ]/;
  // Cyrillic range (Russian, Kazakh)
  const cyrillicChars = /[а-яёА-ЯЁ]/;
  // Latin range (English)
  const latinChars = /[a-zA-Z]/;

  if (kazakhChars.test(text)) {
    return 'kk';
  }
  
  const cyrillicCount = (text.match(cyrillicChars) || []).length;
  const latinCount = (text.match(latinChars) || []).length;

  if (cyrillicCount > latinCount) {
    return 'ru';
  } else if (latinCount > cyrillicCount) {
    return 'en';
  }
  
  return 'unknown';
};

/**
 * Generate a unique hash for a fact to detect duplicates
 * @param {string} fact - Fact string
 * @returns {string} Hash string
 */
const generateFactHash = (fact) => {
  // Simple hash function for deduplication
  let hash = 0;
  for (let i = 0; i < fact.length; i++) {
    const char = fact.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
};

/**
 * Calculate importance score for a fact
 * @param {string} fact - Fact string
 * @returns {number} Importance score between 0 and 1
 */
export const calculateFactImportance = (fact) => {
  let score = 0.5; // Base score

  // Structured high-density facts
  if (fact.startsWith('[METADATA]')) score += 0.4;
  if (fact.startsWith('[BEHAVIOR]')) score += 0.45;
  if (fact.startsWith('[SUMMARY]')) score += 0.4;
  if (fact.startsWith('[QUESTION]')) {
    score += 0.4; // Increased base importance
    if (fact.includes('Correct: false')) score += 0.25; // Errors are much more important
    if (fact.includes('Changes:')) score += 0.15;
    if (fact.includes('Explanation:')) score += 0.1;
  }

  // Legacy/fallback checks
  if (fact.includes('ошибся') || fact.includes('Ошибка') || fact.includes('Ошибка: выбрал')) {
    score += 0.3;
  }
  
  if (fact.includes('Подозрительная') || fact.includes('списыв') || fact.includes('⚠️')) {
    score += 0.4;
  }

  return Math.min(1, score);
};

/**
 * Detect and remove duplicate facts
 * @param {string[]} facts - Array of fact strings
 * @param {number} [similarityThreshold=0.8] - Similarity threshold for deduplication
 * @returns {string[]} Deduplicated facts
 */
export const deduplicateFacts = (facts, similarityThreshold = 0.8) => {
  const seen = new Set();
  const deduplicated = [];

  for (const fact of facts) {
    const hash = generateFactHash(fact);
    
    // Check for exact hash match
    if (seen.has(hash)) {
      continue;
    }

    // Check for semantic similarity (simple version)
    let isDuplicate = false;
    for (const seenFact of deduplicated) {
      const similarity = calculateStringSimilarity(fact, seenFact);
      if (similarity > similarityThreshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.add(hash);
      deduplicated.push(fact);
    }
  }

  return deduplicated;
};

/**
 * Calculate string similarity (Jaccard-like)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity between 0 and 1
 */
const calculateStringSimilarity = (str1, str2) => {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
};

/**
 * Extract facts from a single quiz attempt
 * @param {object} attempt - Quiz attempt object with answers_data
 * @param {object} quiz - Quiz object with content.questions
 * @param {string} subject - Subject name
 * @param {string} sectionName - Section name
 * @param {string} quizClass - Class name
 * @param {object} summary - Summary metrics (avg_score, avg_time, etc.)
 * @returns {string[]} Array of fact strings
 */
export const extractFactsFromAttempt = (attempt, quiz, subject, sectionName = null, quizClass = null, summary = null) => {
  const facts = [];
  const questions = quiz?.content?.questions || [];
  const answersData = attempt?.answers_data || [];
  const answerLog = attempt?.answer_log || [];

  // Quiz metadata facts
  const quizType = [];
  if (quiz?.is_verified) quizType.push('verified');
  if (quiz?.is_public) quizType.push('public');
  const quizTypeStr = quizType.length > 0 ? ` (${quizType.join(', ')})` : '';
  
  const subjectStr = sectionName || subject || 'неизвестный предмет';
  const classStr = quizClass ? `, Grade: ${quizClass}` : '';
  const bookUrl = quiz?.quiz_sections?.book_url ? `, Book: ${quiz.quiz_sections.book_url}` : '';
  
  const kzTime = new Date(attempt.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });
  
  // Metadata fact
  const resources = quiz?.resources || [];
  const hasResources = resources.length > 0 || quiz?.quiz_sections?.book_url;
  const resourceStr = hasResources ? `, Has Resources: true (${resources.length + (quiz?.quiz_sections?.book_url ? 1 : 0)})` : '';
  
  facts.push(`[METADATA] Quiz: "${quiz?.title || 'Неизвестный'}"${quizTypeStr}, Subject: ${subjectStr}, Section ID: ${quiz?.section_id || '—'}${classStr}${bookUrl}${resourceStr}. Time: ${kzTime}`);

  if (!answersData.length || !questions.length) {
    return facts;
  }

  // Extract detailed facts for each question
  answersData.forEach((answer, idx) => {
    const question = questions[answer.originalIndex];
    if (!question) return;

    const userAnswer = question.options?.[answer.chosenIndex] || '—';
    const correctAnswer = question.options?.[answer.correctIndex ?? question.correctIndex] || '—';
    const timeSpent = answer.timeSpent || 0;
    const isCorrect = answer.isCorrect;
    const qType = question.type || (question.options ? 'test' : 'open');

    // Base fact about this question with structured prefix
    const hasImage = (question.images && question.images.length > 0) || question.image_url;
    const imgInfo = hasImage ? `Has Image: true (URL: ${question.images?.[0] || question.image_url}). ` : 'Has Image: false. ';
    const optionsStr = (question.options || []).map((o, i) => `${i}: "${o}"`).join(', ');
    const statusTag = isCorrect ? '[STATUS: CORRECT]' : '[STATUS: WRONG]';
    const isoDate = attempt.created_at || new Date().toISOString();
    
    let questionFact = `[QUESTION ${idx + 1}] ${statusTag} Type: ${qType}, Time: ${timeSpent}s, Date: ${isoDate}, ${imgInfo}`;
    questionFact += `Text: "${question.question}". Options: [${optionsStr}]. `;
    questionFact += isCorrect 
      ? `User Answer: "${correctAnswer}" (Index ${answer.chosenIndex}). `
      : `Error: User chose "${userAnswer}" (Index ${answer.chosenIndex}), Correct: "${correctAnswer}" (Index ${answer.correctIndex ?? question.correctIndex}). `;
    
    // Add explanation if available
    if (question.explanation) {
      questionFact += ` Explanation: "${question.explanation}"`;
    }
    
    // Add answer change history for THIS specific question
    const qLog = answerLog.filter(log => 
      (log.qIdx !== undefined ? log.qIdx === answer.originalIndex : log.qIndex === answer.originalIndex) ||
      (log.qText === question.question)
    );
    
    if (qLog.length > 0) {
      const changes = qLog.map(l => `${l.from || '—'} -> ${l.to || '—'} (${Math.round((l.ts || 0) / 1000)}s)`).join(', ');
      questionFact += ` Changes: [${changes}]`;
    }
    
    facts.push(questionFact);
  });

  // Calculate timing statistics
  const timeStats = answersData
    .filter(a => a.timeSpent !== undefined && a.timeSpent !== null)
    .map(a => ({
      idx: a.originalIndex,
      time: a.timeSpent,
      question: questions[a.originalIndex]?.question
    }))
    .filter(a => a.question);

  if (timeStats.length > 0) {
    const totalTime = timeStats.reduce((sum, t) => sum + t.time, 0);
    const avgTime = Math.round(totalTime / timeStats.length);
    
    facts.push(`Среднее время на вопрос: ${avgTime} сек. Общее время теста: ${attempt.time_spent_total || attempt.time_spent || 0} сек.`);
    
    if (timeStats.length > 2) {
      timeStats.sort((a, b) => b.time - a.time);
      
      // Slowest questions
      const slowest = timeStats.slice(0, 2);
      slowest.forEach(stat => {
        facts.push(
          `Самый медленный вопрос (${stat.time} сек): "${stat.question}"`
        );
      });

      // Fastest questions
      const fastest = timeStats.slice(-2).reverse();
      fastest.forEach(stat => {
        facts.push(
          `Самый быстрый вопрос (${stat.time} сек): "${stat.question}"`
        );
      });
    }
  }

  // Extract answer change history from answer_log
  if (answerLog && answerLog.length > 0) {
    answerLog.forEach((log, idx) => {
      const qIdx = log.qIdx !== undefined ? log.qIdx : (log.qIndex !== undefined ? log.qIndex : null);
      const question = qIdx !== null ? questions[qIdx] : null;
      const qText = log.qText || (question ? question.question : `Вопрос ${qIdx + 1}`);
      const fromAns = log.from || '—';
      const toAns = log.to || '—';
      const timeSec = Math.round((log.ts || 0) / 1000);
      
      facts.push(`Смена ответа на ${timeSec}с: вопрос "${qText}" — изменил с "${fromAns}" на "${toAns}"`);
    });
  }

  // Extract overall performance fact
  const correctCount = answersData.filter(a => a.isCorrect).length;
  const totalCount = answersData.length;
  const percentage = Math.round((correctCount / totalCount) * 100);
  const score = attempt.score || correctCount;
  const maxScore = attempt.max_score || totalCount;

  // Performance fact
  let perfFact = `Результат: ${score}/${maxScore} (${percentage}%). `;
  perfFact += correctCount === totalCount ? 'Все ответы верны. ' : `${correctCount} верных, ${totalCount - correctCount} ошибок. `;
  perfFact += `Статус: ${attempt.is_passed ? 'пройден' : 'не пройден'}.`;
  facts.push(perfFact);

  // Structured behavior telemetry
  const focusLost = attempt.focus_lost_cnt || 0;
  const offSiteMs = attempt.off_site_ms || 0;
  const offSiteSec = Math.round(offSiteMs / 1000);
  const suspicionFlags = attempt.is_suspicious ? (attempt.suspicion_reason || 'suspicious') : 'none';

  facts.push(`[BEHAVIOR] Focus lost: ${focusLost}, Off-page time: ${offSiteSec}s, Suspicious flags: "${suspicionFlags}", Incomplete: ${!!attempt.is_incomplete}`);

  // Finish reason if available
  if (attempt.finish_reason) {
    facts.push(`Причина завершения: ${attempt.finish_reason}`);
  }

  // Add summary metrics if provided
  if (summary) {
    const summaryKzTime = new Date(attempt.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });
    let summaryFact = `[SUMMARY] Total Attempts: ${summary.attempts_count || 0}, Avg Score: ${Math.round(summary.avg_score || 0)}%, Best Score: ${Math.round(summary.best_score || 0)}%, Avg Time: ${Math.round(summary.avg_time || 0)}s. Role in History: ${summary.is_first ? 'First (Diagnostic)' : (summary.is_best ? 'Personal Best' : 'Regular attempt')}. Time: ${summaryKzTime}.`;
    
    // Progress benchmark (compared to 1st attempt or overall avg)
    if (summary.progress !== undefined) {
      summaryFact += ` Progress: ${summary.progress >= 0 ? '+' : ''}${summary.progress}% since start.`;
    }

    if (summary.is_suspicious_user) summaryFact += ` User is marked as suspicious in this quiz overall.`;
    if (summary.is_incomplete_user) summaryFact += ` User frequently leaves this quiz incomplete.`;
    
    facts.push(summaryFact);
  }

  return facts;
};

/**
 * Extract facts from quiz results summary
 * @param {object} result - Quiz result object
 * @param {object} quiz - Quiz object
 * @param {string} subject - Subject name
 * @returns {string[]} Array of fact strings
 */
export const extractFactsFromResult = (result, quiz, subject) => {
  const facts = [];

  // Overall performance
  const percentage = Math.round((result.score / result.total_questions) * 100);
  facts.push(
    `Лучший результат по тесту "${quiz.title}" (${subject}): ${result.score}/${result.total_questions} (${percentage}%). ` +
    (result.is_suspicious_user ? 'Пользователь имеет подозрительные попытки.' : '') +
    (result.is_incomplete_user ? 'Пользователь часто завершает тесты досрочно.' : '')
  );

  // First attempt comparison
  if (result.first_score !== undefined && result.first_score !== result.score) {
    const improvement = result.score - result.first_score;
    facts.push(
      `Прогресс с первой попытки: было ${result.first_score}/${result.total_questions}, стало ${result.score}/${result.total_questions} ` +
      `(улучшение на ${improvement > 0 ? '+' : ''}${improvement} баллов).`
    );
  }

  return facts;
};

/**
 * Extract comprehensive facts from attempt data
 * This is the main function to call when saving a quiz result
 * @param {object} params
 * @param {object} params.attempt - Quiz attempt with answers_data
 * @param {object} params.quiz - Quiz with content.questions
 * @param {object} params.profile - User profile
 * @param {string} params.subject - Subject name
 * @param {string} params.sectionName - Section/subject name from quiz_sections
 * @param {string} params.quizClass - Class info (e.g. "10 класс")
 * @param {object} params.summary - Summary metrics from all attempts
 * @returns {Promise<{facts: string[], language: string}>} Facts and detected language
 */
export const extractAllFacts = async ({ attempt, quiz, profile, subject, sectionName = null, quizClass = null, summary = null }) => {
  const facts = [];

  // User context fact
  const userName = `${profile?.last_name || ''} ${profile?.first_name || ''} ${profile?.patronymic || ''}`.trim() || 'Ученик';
  facts.push(`Пользователь: ${userName}. Класс: ${profile?.class_id || 'не указан'}.`);

  // Extract attempt facts with detailed metadata
  const attemptFacts = extractFactsFromAttempt(attempt, quiz, subject, sectionName, quizClass, summary);
  facts.push(...attemptFacts);

  // Detect language from all facts
  const allText = facts.join(' ');
  const language = detectLanguage(allText);

  return { facts, language };
};

/**
 * Group facts by type for better organization
 * @param {string[]} facts - Array of fact strings
 * @returns {object} Grouped facts
 */
export const groupFacts = (facts) => {
  return {
    questions: facts.filter(f => f.startsWith('[QUESTION]')),
    metadata: facts.filter(f => f.startsWith('[METADATA]')),
    behavior: facts.filter(f => f.startsWith('[BEHAVIOR]')),
    summary: facts.filter(f => f.startsWith('[SUMMARY]')),
    legacy_errors: facts.filter(f => !f.startsWith('[') && (f.includes('ошибся') || f.includes('Ошибка'))),
    legacy_timing: facts.filter(f => !f.startsWith('[') && (f.includes('Время:') || f.includes('сек'))),
    legacy_performance: facts.filter(f => !f.startsWith('[') && (f.includes('Результат:') || f.includes('%')))
  };
};

/**
 * Limit facts to most important ones (for efficiency)
 * @param {string[]} facts - Array of fact strings
 * @param {number} [maxFacts=20] - Maximum number of facts to keep
 * @param {boolean} [useImportanceScoring=true] - Use importance scoring
 * @returns {string[]} Filtered facts
 */
export const limitFacts = (facts, maxFacts = 20, useImportanceScoring = true) => {
  // First deduplicate
  const deduplicated = deduplicateFacts(facts);
  
  if (!useImportanceScoring) {
    const grouped = groupFacts(deduplicated);
    
    // Prioritize: errors > changes > performance > behavior > timing > metadata > explanations
    const prioritized = [
      ...grouped.errors.slice(0, 6),
      ...grouped.changes.slice(0, 4),
      ...grouped.performance.slice(0, 4),
      ...grouped.behavior.slice(0, 3),
      ...grouped.summary.slice(0, 3),
      ...grouped.timing.slice(0, 2),
      ...grouped.metadata.slice(0, 1),
      ...grouped.explanations.slice(0, 2)
    ];

    return prioritized.slice(0, maxFacts);
  }

  // Score and sort by importance
  const scored = deduplicated.map(fact => ({
    fact,
    importance: calculateFactImportance(fact)
  }));

  scored.sort((a, b) => b.importance - a.importance);
  return scored.slice(0, maxFacts).map(s => s.fact);
};
