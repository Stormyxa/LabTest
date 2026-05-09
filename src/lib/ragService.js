import { searchFacts, isQdrantConfigured } from './qdrantClient.js';
import { generateEmbedding } from './embeddingService.js';
import { supabase } from './supabase';

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
    // Search for relevant facts via server proxy
    const response = await fetch('/api/search-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        query: 'student performance quiz results errors strengths weaknesses learning progress',
        limit: 15,
        enableTimeDecay: true
      })
    });

    if (!response.ok) {
      throw new Error('Failed to search facts');
    }

    const { facts } = await response.json();

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
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        try {
          const response = await fetch('/api/search-facts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              query,
              quizId,
              limit: 5,
              enableTimeDecay: true
            })
          });

          if (!response.ok) return [];
          const { facts } = await response.json();
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
    
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        try {
          const response = await fetch('/api/search-facts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              query,
              classId,
              limit: 5,
              enableTimeDecay: true
            })
          });

          if (!response.ok) return [];
          const { facts } = await response.json();
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
      hasRagContext: !!ragContext
    }
  };
};

const buildStudentRagInstruction = (name, geo, ragContext) => {
  const ragSection = ragContext 
    ? `\n${ragContext}\n\n**Примечание**: Используй эти факты для анализа. Они извлечены из векторной памяти ученика и содержат наиболее релевантную информацию об его обучении.`
    : '\n\n**Примечание**: Векторная память ученика пока пуста или недоступна. Анализ основан на базовой информации.';

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

const buildTeacherRagInstruction = (teacherProfile, studentName, geo, ragContext) => {
  const teacherName = teacherProfile
    ? `${teacherProfile.last_name || ''} ${teacherProfile.first_name || ''}`.trim()
    : 'Учитель';

  const ragSection = ragContext 
    ? `\n${ragContext}\n\n**Примечание**: Используй эти факты для анализа. Они извлечены из векторной памяти ученика и содержат наиболее релевантную информацию об его обучении.`
    : '\n\n**Примечание**: Векторная память ученика пока пуста или недоступна. Анализ основан на базовой информации.';

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

      // Search facts for each user and aggregate
      const allFacts = [];
      for (const userId of userIds.slice(0, 20)) { // Limit to 20 users for performance
        try {
          const facts = await searchFacts({
            userId,
            queryVector,
            limit: 3,
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
    data: { quizId, subject, scopeLabel, hasRagContext: !!ragContext }
  };
};

/**
 * Build RAG-enabled class prompt for class analysis
 * @param {string} classId - Class UUID
 * @returns {Promise<{instruction: string, data: object}>}
 */
export const buildClassRagPrompt = async (classId) => {
  if (!isQdrantConfigured()) {
    return null;
  }

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

    // Build RAG context for this class
    const ragContext = await buildClassRagContext(classId);

    if (!ragContext) {
      return null;
    }

    const ragSection = ragContext 
      ? `\n${ragContext}\n\n**Примечание**: Используй эти факты для анализа. Они извлечены из векторной памяти учеников класса.`
      : '';

    const instruction = `# Инструкция для ИИ (Аналитик Класса LabTest с RAG)

**Цель**: Провести детальный анализ класса на основе релевантных фактов из векторной памяти учеников.

**Класс**: ${cls.name}
**Школа**: ${cls.schools?.name || '—'}
**Город**: ${cityName}

${ragSection}

## Задание

На основе предоставленных фактов выполни:

1. **Общая успеваемость**: Оцени общую успеваемость класса на основе фактов.
2. **Слабые ученики**: Определи учеников с наибольшими трудностями (из фактов).
3. **Проблемные предметы**: Определи предметы/тесты с наименьшей успеваемостью (из фактов).
4. **Паттерны поведения**: Есть ли общие паттерны ошибок или подозрительной активности (из фактов)?
5. **Рекомендации**: 3-5 конкретных действий для улучшения результатов класса.

**Стиль**: Профессиональный, педагогический. Обращайся к учителю на «вы».`;

    return {
      instruction,
      data: { classId, className: cls.name, hasRagContext: true }
    };
  } catch (error) {
    console.error('Failed to build class RAG prompt:', error);
    return null;
  }
};
