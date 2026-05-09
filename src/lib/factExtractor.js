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
  if (fact.includes('ошибся') || fact.includes('Ошибка')) {
    score += 0.3;
  }

  // Suspicious behavior is very important
  if (fact.includes('подозритель') || fact.includes('списыв')) {
    score += 0.4;
  }

  // Performance facts are moderately important
  if (fact.includes('%') || fact.includes('балл')) {
    score += 0.2;
  }

  // Timing facts are less important
  if (fact.includes('сек') || fact.includes('времени')) {
    score += 0.1;
  }

  // Incomplete attempts are important
  if (fact.includes('незавершен') || fact.includes('ранний выход')) {
    score += 0.3;
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
 * @returns {string[]} Array of fact strings
 */
export const extractFactsFromAttempt = (attempt, quiz, subject) => {
  const facts = [];
  const questions = quiz?.content?.questions || [];
  const answersData = attempt?.answers_data || [];

  if (!answersData.length || !questions.length) {
    return facts;
  }

  // Extract error facts
  answersData.forEach((answer, idx) => {
    if (!answer.isCorrect && answer.chosenIndex !== null) {
      const question = questions[answer.originalIndex];
      if (!question) return;

      const userAnswer = question.options?.[answer.chosenIndex] || '—';
      const correctAnswer = question.options?.[answer.correctIndex ?? question.correctIndex] || '—';
      const timeSpent = answer.timeSpent || 0;

      // Fact about the error
      facts.push(
        `Ученик ошибся на вопрос "${question.question}". ` +
        `Выбрал ответ: "${userAnswer}". Правильный ответ: "${correctAnswer}". ` +
        `Время на вопрос: ${timeSpent} сек.` +
        (question.explanation ? ` Пояснение: ${question.explanation}` : '')
      );
    }
  });

  // Extract timing facts (questions with extreme times)
  const timeStats = answersData
    .filter(a => a.timeSpent !== undefined && a.timeSpent !== null)
    .map(a => ({
      idx: a.originalIndex,
      time: a.timeSpent,
      question: questions[a.originalIndex]?.question
    }))
    .filter(a => a.question);

  if (timeStats.length > 2) {
    timeStats.sort((a, b) => b.time - a.time);
    
    // Slowest questions
    const slowest = timeStats.slice(0, 2);
    slowest.forEach(stat => {
      facts.push(
        `Ученик потратил много времени (${stat.time} сек) на вопрос "${stat.question}"`
      );
    });

    // Fastest questions
    const fastest = timeStats.slice(-2).reverse();
    fastest.forEach(stat => {
      facts.push(
        `Ученик быстро ответил (${stat.time} сек) на вопрос "${stat.question}"`
      );
    });
  }

  // Extract overall performance fact
  const correctCount = answersData.filter(a => a.isCorrect).length;
  const totalCount = answersData.length;
  const percentage = Math.round((correctCount / totalCount) * 100);

  facts.push(
    `В попытке по тесту "${quiz.title}" (${subject}) ученик ответил правильно на ${correctCount} из ${totalCount} вопросов (${percentage}%). ` +
    `Общее время: ${attempt.time_spent_total} сек. ` +
    (attempt.is_suspicious ? `Попытка помечена как подозрительная: ${attempt.suspicion_reason || 'причина не указана'}.` : '') +
    (attempt.is_incomplete ? 'Попытка незавершена (ранний выход).' : '')
  );

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
 * @returns {Promise<{facts: string[], language: string}>} Facts and detected language
 */
export const extractAllFacts = async ({ attempt, quiz, profile, subject }) => {
  const facts = [];

  // User context fact
  const userName = `${profile?.last_name || ''} ${profile?.first_name || ''} ${profile?.patronymic || ''}`.trim() || 'Ученик';
  facts.push(`Пользователь: ${userName}. Класс: ${profile?.class_id || 'не указан'}.`);

  // Extract attempt facts
  const attemptFacts = extractFactsFromAttempt(attempt, quiz, subject);
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
    errors: facts.filter(f => f.includes('ошибся') || f.includes('Выбрал ответ')),
    timing: facts.filter(f => f.includes('потратил') || f.includes('времени') || f.includes('сек')),
    performance: facts.filter(f => f.includes('результат') || f.includes('балл') || f.includes('%')),
    behavior: facts.filter(f => f.includes('подозритель') || f.includes('незавершен') || f.includes('досрочно')),
    context: facts.filter(f => f.includes('Пользователь') || f.includes('Класс'))
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
    
    // Prioritize: errors > performance > behavior > timing > context
    const prioritized = [
      ...grouped.errors.slice(0, 8),
      ...grouped.performance.slice(0, 5),
      ...grouped.behavior.slice(0, 3),
      ...grouped.timing.slice(0, 3),
      ...grouped.context.slice(0, 1)
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
