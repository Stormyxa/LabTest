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

  // Error facts are more important
  if (fact.includes('ошибся') || fact.includes('Ошибка') || fact.includes('Ошибка: выбрал')) {
    score += 0.3;
  }

  // Suspicious behavior is very important
  if (fact.includes('Подозрительная') || fact.includes('списыв') || fact.includes('⚠️')) {
    score += 0.4;
  }

  // Answer changes indicate hesitation - important for analysis
  if (fact.includes('Смена ответа') || fact.includes('изменил с')) {
    score += 0.25;
  }

  // Focus loss / tab switching is important behavior signal
  if (fact.includes('сворачивал страницу') || fact.includes('вне вкладки')) {
    score += 0.35;
  }

  // Incomplete attempts are important
  if (fact.includes('незавершен') || fact.includes('ранний выход')) {
    score += 0.3;
  }

  // Performance facts are moderately important
  if (fact.includes('Результат:') || fact.includes('%')) {
    score += 0.2;
  }

  // Quiz metadata (official/public) is important context
  if (fact.includes('официальный') || fact.includes('публичный')) {
    score += 0.15;
  }

  // Subject/class context is moderately important
  if (fact.includes('Предмет:') || fact.includes('Класс:')) {
    score += 0.1;
  }

  // Timing facts are less important but still relevant
  if (fact.includes('Время:') || fact.includes('сек') || fact.includes('медленный') || fact.includes('быстрый')) {
    score += 0.1;
  }

  // Historical summary facts
  if (fact.includes('Средний балл') || fact.includes('Лучший результат') || fact.includes('Прогресс')) {
    score += 0.2;
  }

  // Answer log is high signal for pedagogical analysis
  if (fact.includes('История смены ответов')) {
    score += 0.2;
  }

  // Explanations are valuable for learning
  if (fact.includes('Пояснение:')) {
    score += 0.15;
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
  if (quiz?.is_verified) quizType.push('официальный');
  if (quiz?.is_public) quizType.push('публичный');
  const quizTypeStr = quizType.length > 0 ? ` (${quizType.join(', ')})` : '';
  
  const subjectStr = sectionName || subject || 'неизвестный предмет';
  const classStr = quizClass ? `, Класс: ${quizClass}` : '';
  
  facts.push(`Тест: "${quiz?.title || 'Неизвестный'}"${quizTypeStr}. Предмет: ${subjectStr}${classStr}. Пройден: ${new Date(attempt.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })} (Алматы)`);

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

    // Base fact about this question
    let questionFact = `Вопрос ${idx + 1}: "${question.question}". `;
    questionFact += isCorrect 
      ? `Ответ верный: "${correctAnswer}". `
      : `Ошибка: выбрал "${userAnswer}", правильный "${correctAnswer}". `;
    questionFact += `Время: ${timeSpent} сек.`;
    
    // Add image info if present
    if (question.image) {
      questionFact += ` К вопросу прикреплена картинка.`;
    }
    
    // Add explanation if available
    if (question.explanation) {
      questionFact += ` Пояснение: ${question.explanation}`;
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

  // Suspicious behavior facts
  if (attempt.is_suspicious) {
    facts.push(`⚠️ Подозрительная попытка: ${attempt.suspicion_reason || 'причина не указана'}`);
  }
  
  if (attempt.is_incomplete) {
    facts.push(`⚠️ Незавершенная попытка: ученик вышел до завершения теста`);
  }

  // Focus and off-site time tracking
  const focusLost = attempt.focus_lost_cnt || 0;
  const offSiteMs = attempt.off_site_ms || 0;
  const offSiteSec = Math.round(offSiteMs / 1000);
  
  if (focusLost > 0) {
    facts.push(`Ученик сворачивал страницу ${focusLost} раз(а) во время теста`);
  }
  
  if (offSiteSec > 0) {
    facts.push(`Ученик провел ${offSiteSec} секунд вне вкладки теста`);
  }

  // Finish reason if available
  if (attempt.finish_reason) {
    facts.push(`Причина завершения: ${attempt.finish_reason}`);
  }

  // Add summary metrics if provided
  if (summary) {
    if (summary.avg_score !== undefined) {
      facts.push(`Средний балл по всем попыткам этого теста: ${summary.avg_score.toFixed(1)}%`);
    }
    if (summary.avg_time !== undefined) {
      facts.push(`Среднее время прохождения теста: ${Math.round(summary.avg_time)} сек.`);
    }
    if (summary.attempts_count) {
      facts.push(`Всего попыток по этому тесту: ${summary.attempts_count}`);
    }
    if (summary.is_first) {
      facts.push(`Это первая попытка пользователя по данному тесту.`);
    }
    if (summary.is_best) {
      facts.push(`Это лучший результат пользователя по данному тесту.`);
    }
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
    errors: facts.filter(f => f.includes('ошибся') || f.includes('Ошибка: выбрал') || f.includes('неверный')),
    timing: facts.filter(f => f.includes('Время:') || f.includes('сек') || f.includes('медленный') || f.includes('быстрый') || f.includes('Среднее время')),
    performance: facts.filter(f => f.includes('Результат:') || f.includes('балл') || f.includes('%') || f.includes('верных')),
    behavior: facts.filter(f => f.includes('Подозрительная') || f.includes('незавершен') || f.includes('⚠️') || f.includes('сворачивал') || f.includes('вне вкладки')),
    changes: facts.filter(f => f.includes('Смена ответа') || f.includes('изменил с')),
    metadata: facts.filter(f => f.includes('Тест:') || f.includes('Предмет:') || f.includes('официальный') || f.includes('публичный') || f.includes('Пользователь:')),
    summary: facts.filter(f => f.includes('Средний балл') || f.includes('Среднее время') || f.includes('Всего попыток') || f.includes('попытка пользователя')),
    explanations: facts.filter(f => f.includes('Пояснение:'))
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
