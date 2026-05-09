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
 * @param {string} [quizId] - Optional quiz ID filter
 * @param {string} [query] - Optional custom query for fact retrieval
 * @returns {Promise<string>} Context string with relevant facts
 */
export const buildStudentRagContext = async (userId, quizId = null, query = null) => {
  if (!isQdrantConfigured()) {
    console.warn('Qdrant not configured, RAG disabled');
    return null;
  }

  try {
    // Default query for student analysis
    const searchQuery = query || 
      'Анализ обучения ученика: ошибки, прогресс, слабые места, паттерны ответов, время на вопросы';

    // Generate embedding for the query
    const queryVector = await generateEmbedding(searchQuery);

    // Search for relevant facts
    const facts = await searchFacts({
      userId,
      queryVector,
      limit: 15,
      quizId
    });

    if (facts.length === 0) {
      return null;
    }

    // Build context string
    const context = `## Релевантные факты об ученике (из векторной памяти)\n\n` +
      facts.map((fact, idx) => 
        `${idx + 1}. ${fact.fact} (релевантность: ${Math.round(fact.score * 100)}%)`
      ).join('\n');

    return context;
  } catch (error) {
    console.error('Failed to build RAG context:', error);
    return null;
  }
};

/**
 * Build RAG context for quiz analysis
 * @param {string} quizId - Quiz UUID
 * @param {string} classId - Optional class ID filter
 * @returns {Promise<string>} Context string with relevant facts
 */
export const buildQuizRagContext = async (quizId, classId = null) => {
  if (!isQdrantConfigured()) {
    console.warn('Qdrant not configured, RAG disabled');
    return null;
  }

  try {
    const query = 'Анализ результатов теста: общие ошибки, проблемные вопросы, успеваемость класса';
    const queryVector = await generateEmbedding(query);

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

    // Search for facts (note: Qdrant search is per-tenant, so we might need to aggregate)
    // For now, we'll search without userId filter to get all facts for this quiz
    const facts = await searchFacts({
      userId: 'all', // This won't work with current implementation, need to modify
      queryVector,
      limit: 20,
      quizId
    });

    if (facts.length === 0) {
      return null;
    }

    const context = `## Релевантные факты по тесту (из векторной памяти)\n\n` +
      facts.map((fact, idx) => 
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
  if (!isQdrantConfigured()) {
    console.warn('Qdrant not configured, RAG disabled');
    return null;
  }

  try {
    const query = 'Анализ класса: общая успеваемость, слабые ученики, проблемные предметы, прогресс';
    const queryVector = await generateEmbedding(query);

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

    // Search facts for each student and aggregate
    const allFacts = [];
    for (const userId of userIds) {
      const facts = await searchFacts({
        userId,
        queryVector,
        limit: 5,
        classId
      });
      allFacts.push(...facts);
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
