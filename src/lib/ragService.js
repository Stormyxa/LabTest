import { searchFacts, isQdrantConfigured, saveVectors } from './qdrantClient.js';
import { generateEmbedding, generateEmbeddingsBatch } from './embeddingService.js';
import { supabase } from './supabase';
import { extractAllFacts, limitFacts } from './factExtractor.js';

/**
 * RAG-enabled AI analysis service
 * Retrieves relevant facts from Qdrant instead of sending full JSON
 */

/**
 * Build RAG context for student analysis
 * @param {string} userId - User UUID
 */
export const buildStudentRagContext = async (userId) => {
  try {
    // Generate vector on client side to avoid server-side dependency
    const { generateEmbedding } = await import('./embeddingService');
    const queryVector = await generateEmbedding('student performance quiz results errors strengths weaknesses learning progress');

    // Search for relevant facts via centralized client
    const facts = await searchFacts({
      userId,
      queryVector,
      limit: 250,
      enableTimeDecay: true
    });

    if (!facts || facts.length === 0) {
      return null;
    }

    // Group facts by type
    const grouped = {
      errors: facts.filter(f => f.fact.includes('ошибся') || f.fact.includes('Выбрал ответ')),
      performance: facts.filter(f => f.fact.includes('результат') || f.fact.includes('балл') || f.fact.includes('%')),
      behavior: facts.filter(f => f.fact.includes('подозритель') || f.fact.includes('незавершен') || f.fact.includes('досрочно')),
      timing: facts.filter(f => f.fact.includes('сек') || f.fact.includes('времени')),
      context: facts.filter(f => f.fact.includes('Пользователь') || f.fact.includes('Класс'))
    };

    return {
      facts: facts.map(f => f.fact),
      grouped,
      summary: `Found ${facts.length} relevant facts from ${grouped.errors.length} errors, ${grouped.performance.length} performance metrics, and ${grouped.behavior.length} behavioral observations.`
    };
  } catch (error) {
    console.error('Failed to build RAG context for student:', error);
    throw error;
  }
};

/**
 * Build RAG context for quiz analysis
 * @param {string} quizId - Quiz UUID
 * @param {string} classId - Optional class ID filter
 * @returns {Promise<string>} Context string with relevant facts
 */
export const buildQuizRagContext = async (quizId, classId = null) => {
  try {
    // Get all students in the class if classId is provided
    let userIds = [];
    if (classId) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('class_id', classId)
        .eq('is_observer', false);
      
      userIds = profiles?.map(p => p.id) || [];
    }

    if (userIds.length === 0) {
      return null;
    }

    // Search facts for each student and aggregate via proxy
    const allFacts = [];
    const query = 'Анализ результатов теста: общие ошибки, проблемные вопросы, успеваемость класса';
    
    const batchSize = 10;
    
    const { generateEmbedding } = await import('./embeddingService');
    const queryVector = await generateEmbedding(query);
    
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        try {
          const facts = await searchFacts({
            userId,
            queryVector,
            quizId,
            limit: 25,
            enableTimeDecay: true
          });
          return facts || [];
        } catch (error) {
          console.error(`Failed to fetch facts for user ${userId}:`, error);
          return [];
        }
      });

      const batchResults = await Promise.all(batchPromises);
      allFacts.push(...batchResults.flat());
    }

    if (allFacts.length === 0) {
      return null;
    }

    // Sort by score and limit
    allFacts.sort((a, b) => b.score - a.score);
    const topFacts = allFacts.slice(0, 30);

    const context = `## Релевантные факты по тесту (из векторной памяти)\n\n` +
      topFacts.map((fact, idx) => 
        `${idx + 1}. ${fact.fact} (релевантность: ${Math.round(fact.score * 100)}%)`
      ).join('\n');

    return context;
  } catch (error) {
    console.error('Failed to build quiz RAG context:', error);
    return null;
  }
};

/**
 * Build RAG context for class analysis
 * @param {string} classId - Class UUID
 * @returns {Promise<string>} Context string with relevant facts
 */
export const buildClassRagContext = async (classId) => {
  try {
    const query = 'Анализ класса: общая успеваемость, слабые ученики, проблемные предметы, прогресс';

    // Get all students in the class
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('class_id', classId)
      .eq('is_observer', false);
    
    const userIds = profiles?.map(p => p.id) || [];

    if (userIds.length === 0) {
      return null;
    }

    // Search facts for each student and aggregate via proxy
    const allFacts = [];
    const batchSize = 10;
    
    const { generateEmbedding } = await import('./embeddingService');
    const queryVector = await generateEmbedding(query);
    
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        try {
          const facts = await searchFacts({
            userId,
            queryVector,
            classId,
            limit: 25,
            enableTimeDecay: true
          });
          return facts || [];
        } catch (error) {
          console.error(`Failed to fetch facts for user ${userId}:`, error);
          return [];
        }
      });

      const batchResults = await Promise.all(batchPromises);
      allFacts.push(...batchResults.flat());
    }

    // Sort by score and limit
    allFacts.sort((a, b) => b.score - a.score);
    const topFacts = allFacts.slice(0, 30);

    if (topFacts.length === 0) {
      return null;
    }

    const context = `## Релевантные факты по классу (из векторной памяти)\n\n` +
      topFacts.map((fact, idx) => 
        `${idx + 1}. ${fact.fact} (релевантность: ${Math.round(fact.score * 100)}%)`
      ).join('\n');

    return context;
  } catch (error) {
    console.error('Failed to build class RAG context:', error);
    return null;
  }
};

/**
 * Build RAG-enabled student prompt
 * @param {string} userId - User UUID
 * @param {'student'|'teacher'} viewerRole - Who is viewing
 * @param {object} [viewerProfile] - Teacher's profile (if viewerRole === 'teacher')
 * @returns {Promise<{instruction: string, data: object}>}
 */
export const buildStudentRagPrompt = async (userId, viewerRole = 'student', viewerProfile = null) => {
  // Fetch basic user info
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, patronymic, city_id, school_id, class_id')
    .eq('id', userId)
    .single();

  if (!profile) {
    return null;
  }

  // Fetch geo names
  const [cityRes, schoolRes, classRes] = await Promise.all([
    profile.city_id ? supabase.from('cities').select('name').eq('id', profile.city_id).single() : { data: null },
    profile.school_id ? supabase.from('schools').select('name').eq('id', profile.school_id).single() : { data: null },
    profile.class_id ? supabase.from('classes').select('name').eq('id', profile.class_id).single() : { data: null }
  ]);

  const cityName = cityRes.data?.name || '—';
  const schoolName = schoolRes.data?.name || '—';
  const className = classRes.data?.name || '—';

  const initials = [profile.first_name, profile.patronymic].filter(Boolean).map(n => n.charAt(0).toUpperCase() + '.').join(' ');
  const displayName = `${profile.last_name || ''} ${initials}`.trim() || 'Ученик';
  const fullName = `${profile.last_name || ''} ${profile.first_name || ''} ${profile.patronymic || ''}`.trim() || 'Ученик';

  // Fetch full history for heavy JSON download
  const { data: results } = await supabase
    .from('quiz_results')
    .select('*, quizzes(title, quiz_sections(name))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const history = (results || []).map(r => ({
    quiz: r.quizzes?.title,
    section: r.quizzes?.quiz_sections?.name,
    score: r.score,
    total: r.total_questions,
    percent: Math.round((r.score / (r.total_questions || 1)) * 100),
    date: new Date(r.created_at).toLocaleDateString('ru-RU'),
    passed: r.is_passed,
    attempts: r.attempt_count || 1
  }));

  // Build RAG context
  const ragContext = await buildStudentRagContext(userId);

  // Build instruction with or without RAG
  const instruction = viewerRole === 'teacher'
    ? buildTeacherRagInstruction(viewerProfile, fullName, `${cityName}, ${schoolName}, ${className}`, ragContext)
    : buildStudentRagInstruction(displayName, `${cityName}, ${schoolName}, ${className}`, ragContext);

  return {
    instruction,
    data: {
      userId,
      displayName,
      fullName,
      geo: `${cityName}, ${schoolName}, ${className}`,
      hasRagContext: !!ragContext,
      history, // Full history for manual download
      meta: {
        v: 2,
        mode: 'HYBRID_RAG_FULL_JSON',
        generated: new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })
      }
    }
  };
};

/**
 * Process and store facts for an attempt on the client side.
 * This offloads embedding generation from the server.
 */
export const processAndStoreAttemptFacts = async (attemptId, quizId, userId, sectionName = null, quizClass = null) => {
  try {
    const dispatchStatus = (status, message, progress) => {
      window.dispatchEvent(new CustomEvent('rag-status', { 
        detail: { status, message, progress } 
      }));
    };

    console.log(`🔄 RAG: Starting client-side processing for attempt ${attemptId}`);
    dispatchStatus('extracting', 'Анализ попытки...', 10);

    // 1. Fetch data from Supabase (client-side has session)
    const [attemptRes, quizRes, profileRes] = await Promise.all([
      supabase.from('quiz_attempts').select('*, profiles(*)').eq('id', attemptId).single(),
      supabase.from('quizzes').select('*, quiz_sections(name, class_id, book_url, section_folders(name))').eq('id', quizId).single(),
      supabase.from('profiles').select('*').eq('id', userId).single()
    ]);

    if (attemptRes.error || !attemptRes.data) throw new Error('Attempt not found');
    if (quizRes.error || !quizRes.data) throw new Error('Quiz not found');
    if (profileRes.error || !profileRes.data) throw new Error('Profile not found');

    const attempt = attemptRes.data;
    const quiz = quizRes.data;
    const profile = profileRes.data;

    // 2. Fetch all attempts for stats
    const { data: allAttempts } = await supabase
      .from('quiz_attempts')
      .select('score, max_score, time_spent_total, created_at')
      .eq('quiz_id', quizId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    let summary = null;
    if (allAttempts && allAttempts.length > 0) {
      const totalScorePercent = allAttempts.reduce((sum, a) => sum + (a.score / (a.max_score || 1)) * 100, 0);
      const totalTime = allAttempts.reduce((sum, a) => sum + (a.time_spent_total || 0), 0);
      const bestScorePercent = Math.max(...allAttempts.map(a => (a.score / (a.max_score || 1)) * 100));
      const firstScorePercent = (allAttempts[0].score / (allAttempts[0].max_score || 1)) * 100;
      const currentScorePercent = (attempt.score / (attempt.max_score || 1)) * 100;

      summary = {
        avg_score: totalScorePercent / allAttempts.length,
        avg_time: totalTime / allAttempts.length,
        attempts_count: allAttempts.length,
        best_score: bestScorePercent,
        is_first: allAttempts.length === 1 || (allAttempts[0]?.id === attempt.id),
        is_best: currentScorePercent >= bestScorePercent,
        progress: currentScorePercent - firstScorePercent,
        benchmark: quiz.avg_success_rate || null
      };
    }

    // 3. Extract facts
    const sName = sectionName || quiz.quiz_sections?.name || null;
    const subject = sName || 'Неизвестный предмет';
    const folderName = quiz.quiz_sections?.section_folders?.name || '—';

    const { facts, language } = await extractAllFacts({
      attempt,
      quiz,
      profile,
      subject,
      sectionName: sName,
      quizClass,
      summary,
      folderName
    });

    const limitedFacts = limitFacts(facts, 100, true);
    console.log(`📝 RAG: Extracted ${facts.length} facts, limited to ${limitedFacts.length}`);
    dispatchStatus('vectorizing', 'Векторизация фактов...', 40);

    const { generateEmbeddingsBatch } = await import('./embeddingService');
    const vectors = await generateEmbeddingsBatch(limitedFacts);
    
    dispatchStatus('storing', 'Сохранение в память...', 80);
    const readyFacts = limitedFacts.map((fact, i) => ({
      fact,
      vector: vectors[i],
      metadata: {
        attemptId,
        score: attempt.score,
        maxScore: attempt.max_score,
        isPassed: attempt.is_passed,
        isSuspicious: attempt.is_suspicious,
        isIncomplete: attempt.is_incomplete
      }
    }));

    // 5. Send to centralized save-vectors API
    const result = await saveVectors({
      userId,
      quizId,
      attemptId,
      subject,
      language,
      profile: { class_id: profile.class_id },
      facts: readyFacts
    });

    if (result) {
      console.log(`✅ RAG: Successfully stored ${facts.length} facts via client-side pipeline`);
      dispatchStatus('done', `Память обновлена (${facts.length} фактов)`, 100);

      return { success: true, factsStored: facts.length };
    } else {
      throw new Error('Failed to save vectors');
    }

  } catch (error) {
    console.error('❌ RAG: Client-side storage failed:', error);
    throw error;
  }
};

export const buildStudentRagInstruction = (name, geo, ragContext) => {
  let ragContent = '';
  if (ragContext) {
    if (typeof ragContext === 'string') {
      ragContent = ragContext;
    } else if (ragContext.facts && Array.isArray(ragContext.facts)) {
      ragContent = `## Релевантные факты (из векторной памяти)\n\n` + 
        ragContext.facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
    }
  }

  const ragSection = ragContent 
    ? `\n### ИСТОРИЧЕСКИЙ КОНТЕКСТ ИЗ ПАМЯТИ (RAG)\n*Внимание: эти факты извлечены из твоей прошлой активности. Используй их для оценки прогресса, но приоритет отдавай текущим данным.*\n${ragContent}`
    : '\n\n**Примечание**: Векторная память пока пуста или недоступна. Анализ основан на текущей информации.';

  return `# Инструкция для ИИ (Личный Наставник LabTest с RAG)

**Цель**: Провести без подобострастия и угодничества глубокий, честный анализ обучения ученика и дать персональные рекомендации на основе релевантных фактов из векторной памяти.

**Ученик**: ${name}
**Локация**: ${geo}

${ragSection}

## Задание

На основе предоставленных фактов выполни:

1. **Общий вердикт**: Оцени вовлеченность и честность на основе фактов о подозрительных попытках и ранних выходах.
2. **Анализ знаний**: Проанализируй конкретные ошибки и паттерны ответов. На какие темы ученик систематически ошибается?
3. **Поиск аномалий**: Проанализируй факты о времени на вопросы. Есть ли вопросы, на которые ученик тратит слишком много или слишком мало времени?
4. **Оценка прогресса**: Используй факты о прогрессе с первой попытки. Улучшается ли результат осознанно?
5. **Персональный план**: Дай 3 конкретных совета на основе выявленных слабых мест.

**Стиль**: Обращайся к ученику на «ты», дружелюбно но честно. Используй эмодзи умеренно.`;
};

export const buildTeacherRagInstruction = (teacherProfile, studentName, geo, ragContext) => {
  const teacherName = teacherProfile
    ? `${teacherProfile.last_name || ''} ${teacherProfile.first_name || ''}`.trim()
    : 'Учитель';

  let ragContent = '';
  if (ragContext) {
    if (typeof ragContext === 'string') {
      ragContent = ragContext;
    } else if (ragContext.facts && Array.isArray(ragContext.facts)) {
      ragContent = `## Релевантные факты (из векторной памяти)\n\n` + 
        ragContext.facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
    }
  }

  const ragSection = ragContent 
    ? `\n### ИСТОРИЧЕСКИЙ КОНТЕКСТ ИЗ ПАМЯТИ (RAG)\n*Внимание: эти факты извлечены из долгосрочной памяти ученика. Используй их для выявления системных проблем и трендов.*\n${ragContent}`
    : '\n\n**Примечание**: Векторная память ученика пока пуста или недоступна. Анализ основан на текущей информации.';

  return `# Инструкция для ИИ (Педагогический Аналитик LabTest с RAG)

**Цель**: Провести без подобострастия и угодничества профессиональный педагогический анализ данного ученика для учителя **${teacherName}** на основе релевантных фактов из векторной памяти.

**Ученик**: ${studentName}
**Локация**: ${geo}

${ragSection}

## Задание

На основе предоставленных фактов выполни:

1. **Диагностика**: Определи уровень ученика на основе фактов об ошибках и успеваемости.
2. **Честность**: Оцени наличие подозрительных попыток и ранних выходов на основе фактов.
3. **Динамика**: Анализ прогресса через факты об улучшении результатов.
4. **Слабые зоны**: Конкретные темы/тесты, где ученик систематически ошибается (из фактов).
5. **Рекомендации учителю**: 3-5 конкретных действий на основе выявленных проблем.

**Стиль**: Профессиональный, педагогический. Используй термины: «зона ближайшего развития», «учебная мотивация», «самостоятельность». Обращайся к учителю на «вы».`;
};

/**
 * Build RAG-enabled quiz prompt for test analysis
 * @param {object} quiz - Quiz object
 * @param {Array} filteredResults - Quiz results
 * @param {string} scopeLabel - Scope description
 * @returns {Promise<{instruction: string, data: object}>}
 */
export const buildQuizRagPrompt = async (quiz, filteredResults, scopeLabel) => {
  if (!quiz || !filteredResults || filteredResults.length === 0) {
    return { instruction: 'Нет данных для анализа.', data: null };
  }

  const subject = quiz.quiz_sections?.name || '—';
  const quizId = quiz.id;

  // Build RAG context for this quiz
  let ragContext = null;
  if (isQdrantConfigured()) {
    try {
      const query = `Анализ теста "${quiz.title}" (${subject}): общие ошибки, проблемные вопросы, успеваемость учеников`;
      const queryVector = await generateEmbedding(query);

      // Get all user IDs from results
      const userIds = [...new Set(filteredResults.map(r => r.user_id))];

      // Search facts for more users and aggregate
      const allFacts = [];
      for (const userId of userIds.slice(0, 50)) { // Increased to 50 users
        try {
          const facts = await searchFacts({
            userId,
            queryVector,
            limit: 5, // Increased facts per user
            quizId
          });
          allFacts.push(...facts);
        } catch (e) {
          // Skip users with errors
        }
      }

      // Sort by score and limit
      allFacts.sort((a, b) => b.score - a.score);
      const topFacts = allFacts.slice(0, 15);

      if (topFacts.length > 0) {
        ragContext = `## Релевантные факты по тесту (из векторной памяти)\n\n` +
          topFacts.map((fact, idx) => 
            `${idx + 1}. ${fact.fact} (релевантность: ${Math.round(fact.score * 100)}%)`
          ).join('\n');
      }
    } catch (error) {
      console.warn('Failed to build quiz RAG context:', error);
    }
  }

  // Import buildQuizPromptFromData dynamically to avoid circular dependency if needed, 
  // but here we just need a detailed data object for download
  const { buildQuizPromptFromData } = await import('./aiPromptBuilder');
  const legacyData = buildQuizPromptFromData({ quiz, filteredResults, scopeLabel });

  const ragSection = ragContext 
    ? `\n${ragContext}\n\n**Примечание**: Используй эти факты для анализа. Они извлечены из векторной памяти и содержат наиболее релевантную информацию об учениках.`
    : '\n\n**Примечание**: Векторная память недоступна. Анализ основан на агрегированных данных.';

  const instruction = `# Инструкция для ИИ (Аналитик Теста LabTest с RAG)

**Цель**: Провести детальный, честный, без подобострастия и угодничества анализ результатов одного теста по группе учеников на основе релевантных фактов из векторной памяти.

**Тест**: ${quiz.title}
**Предмет**: ${subject}
**Область**: ${scopeLabel}

${ragSection}

## Задание

На основе предоставленных фактов выполни:

1. **Обзор теста**: Оцени общую сложность теста на основе фактов об успеваемости.
2. **Проблемные вопросы**: Определи вопросы с наибольшим количеством ошибок (из фактов).
3. **Группировка учеников**: Раздели учеников на группы по уровню на основе фактов об их результатах.
4. **Паттерны ошибок**: Есть ли вопросы, где большинство ошибается (из фактов)?
5. **Рекомендации учителю**: 3-5 конкретных действий на основе выявленных проблем.

**Стиль**: Профессиональный, педагогический. Обращайся к учителю на «вы».`;

  return {
    instruction,
    data: {
      quizId,
      title: quiz.title,
      subject,
      scope: scopeLabel,
      hasRagContext: !!ragContext
    },
    downloadData: legacyData.data,
    filename: legacyData.filename
  };
};

/**
 * Build RAG-enabled class prompt for class analysis
 * @param {string} classId - Class UUID
 * @returns {Promise<{instruction: string, data: object}>}
 */
export const buildClassRagPrompt = async (classId) => {
  try {
    // Fetch class info
    const { data: cls } = await supabase
      .from('classes')
      .select('*, schools(name, city_id)')
      .eq('id', classId)
      .single();

    if (!cls) return null;

    let cityName = '—';
    if (cls.schools?.city_id) {
      const { data: city } = await supabase
        .from('cities')
        .select('name')
        .eq('id', cls.schools.city_id)
        .single();
      cityName = city?.name || '—';
    }

    // Fetch students in this class for basic info
    const { data: students } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, patronymic')
      .eq('class_id', classId)
      .eq('is_observer', false)
      .order('last_name');

    const studentList = (students || []).map(s => 
      `${s.last_name || ''} ${s.first_name || ''} ${s.patronymic || ''}`.trim()
    );

    // Try to build RAG context (optional, won't fail the whole flow)
    let ragContext = null;
    if (isQdrantConfigured()) {
      try {
        ragContext = await buildClassRagContext(classId);
      } catch (e) {
        console.warn('RAG context failed, continuing without it:', e);
      }
    }

    const ragSection = ragContext 
      ? `\n${ragContext}\n\n**Примечание**: Используй эти факты для детального анализа. Они извлечены из векторной памяти учеников класса.`
      : '';

    const studentSection = studentList.length > 0
      ? `\n**Ученики (${studentList.length})**: ${studentList.join(', ')}`
      : '';

    const instruction = `# Инструкция для ИИ (Аналитик Класса LabTest)

**Цель**: Провести детальный анализ класса${ragContext ? ' на основе релевантных фактов из векторной памяти учеников' : ''}.

**Класс**: ${cls.name}
**Школа**: ${cls.schools?.name || '—'}
**Город**: ${cityName}
${studentSection}
${ragSection}

## Задание

На основе предоставленных данных выполни:

1. **Общая успеваемость**: Оцени общую успеваемость класса.
2. **Слабые ученики**: Определи учеников с наибольшими трудностями.
3. **Проблемные предметы**: Определи предметы/тесты с наименьшей успеваемостью.
4. **Паттерны поведения**: Есть ли общие паттерны ошибок или подозрительной активности?
5. **Рекомендации**: 3-5 конкретных действий для улучшения результатов класса.

**Стиль**: Профессиональный, педагогический. Обращайся к учителю на «вы».`;

    return {
      instruction,
      data: { classId, className: cls.name, studentCount: studentList.length, hasRagContext: !!ragContext }
    };
  } catch (error) {
    console.error('Failed to build class RAG prompt:', error);
    return null;
  }
};
/**
 * Trigger fact storage to Qdrant for RAG
 * Runs asynchronously in the background
 */
export const triggerFactStorage = async (attemptId, quizId, userId, sectionName = null, quizClass = null) => {
  try {
    // New Flow: Process and embed on client, then save to server
    await processAndStoreAttemptFacts(attemptId, quizId, userId, sectionName, quizClass);
  } catch (error) {
    console.warn('RAG fact storage failed (non-critical):', error);
    
    // Fallback to legacy server-side flow if client-side fails
    try {
      console.log('🔄 RAG: Falling back to server-side processing...');
      const response = await fetch('/api/store-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, quizId, userId, sectionName, quizClass })
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ RAG: Stored ${result.factsStored} facts (server-side fallback)`);
      }
    } catch (fallbackError) {
      console.warn('RAG server-side fallback also failed:', fallbackError);
    }
  }
};
/**
 * Vectorize a conversation session to provide "Memory" for future chats.
 * @param {string} userId - User ID
 * @param {string} title - Chat title
 * @param {Array} messages - Chat messages
 * @param {string} [contextId] - Optional context ID (quiz or class)
 */
export const vectorizeConversation = async (userId, title, messages, contextId = null) => {
  if (!messages || messages.length < 2) return;

  try {
    const lastMsgs = messages.slice(-4).map(m => `${m.role === 'user' ? 'Ученик' : 'ИИ'}: ${m.content}`).join('\n');
    const summaryFact = `В чате "${title}" обсуждали: ${lastMsgs.slice(0, 500)}...`;
    
    const { generateEmbedding } = await import('./embeddingService');
    const vector = await generateEmbedding(summaryFact);

    await saveVectors({
      userId,
      facts: [{
        fact: summaryFact,
        vector,
        metadata: {
          type: 'chat_memory',
          title,
          contextId,
          timestamp: new Date().toISOString()
        }
      }]
    });
    console.log('🧠 RAG: Conversation vectorized into memory');
  } catch (e) {
    console.warn('Failed to vectorize conversation:', e);
  }
};
/**
 * Simple utility to store a single fact into Qdrant memory
 */
export const storeUserFact = async (userId, fact, score = 1, metadata = {}) => {
  try {
    const { generateEmbedding } = await import('./embeddingService');
    const vector = await generateEmbedding(fact);
    
    await saveVectors({
      userId,
      facts: [{
        fact,
        vector,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString()
        }
      }]
    });
    return true;
  } catch (e) {
    console.error('Failed to store user fact:', e);
    return false;
  }
};

/**
 * Migrate student history to RAG memory (Qdrant)
 */
export const migrateHistoryToRag = async ({ userId = null, classId = null, limit = 100 }) => {
  try {
    const { supabase } = await import('./supabase');
    let query = supabase
      .from('quiz_results')
      .select('*, quizzes(title, quiz_sections(name))')
      .order('created_at', { ascending: false });

    if (userId) query = query.eq('user_id', userId);
    if (classId) {
      const { data: students } = await supabase.from('profiles').select('id').eq('class_id', classId);
      const studentIds = students?.map(s => s.id) || [];
      if (studentIds.length === 0) return { success: true, count: 0 };
      query = query.in('user_id', studentIds);
    }

    const { data: attempts, error } = await query.limit(limit);
    if (error) throw error;
    if (!attempts || attempts.length === 0) return { success: true, count: 0 };

    let totalStored = 0;
    for (const attempt of attempts) {
      try {
        const result = await processAndStoreAttemptFacts(
          attempt.id,
          attempt.quiz_id,
          attempt.user_id,
          attempt.quizzes?.quiz_sections?.name,
          classId
        );
        if (result?.success) totalStored += result.factsStored;
      } catch (e) {
        console.warn(`Failed to migrate attempt ${attempt.id}:`, e);
      }
    }

    return { success: true, count: totalStored };
  } catch (error) {
    console.error('RAG Migration failed:', error);
    throw error;
  }
};
