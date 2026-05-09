/**
 * Fact extraction utility for RAG implementation
 * Extracts meaningful learning facts from quiz attempts and results
 */

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
 * @returns {Promise<string[]>} Array of fact strings ready for embedding
 */
export const extractAllFacts = async ({ attempt, quiz, profile, subject }) => {
  const facts = [];

  // User context fact
  const userName = `${profile?.last_name || ''} ${profile?.first_name || ''} ${profile?.patronymic || ''}`.trim() || 'Ученик';
  facts.push(`Пользователь: ${userName}. Класс: ${profile?.class_id || 'не указан'}.`);

  // Extract attempt facts
  const attemptFacts = extractFactsFromAttempt(attempt, quiz, subject);
  facts.push(...attemptFacts);

  return facts;
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
 * @returns {string[]} Filtered facts
 */
export const limitFacts = (facts, maxFacts = 20) => {
  const grouped = groupFacts(facts);
  
  // Prioritize: errors > performance > behavior > timing > context
  const prioritized = [
    ...grouped.errors.slice(0, 8),
    ...grouped.performance.slice(0, 5),
    ...grouped.behavior.slice(0, 3),
    ...grouped.timing.slice(0, 3),
    ...grouped.context.slice(0, 1)
  ];

  return prioritized.slice(0, maxFacts);
};
