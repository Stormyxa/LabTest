import { supabase } from './supabase';
import { fetchWithCache } from './cache';

// ─── Constants ───────────────────────────────────────────────────
const PROMPT_TTL_HOURS = 1;
const DATA_LIMIT_COUNT = 200;
const KZ_OFFSET_HOURS = 5;

// ─── Helpers ─────────────────────────────────────────────────────
/** Trigger download of a JSON file */
export const downloadJSON = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/** Convert a UTC date to KZ date string (YYYY-MM-DD) */
const toKZDate = (dateInput) => {
  const d = new Date(dateInput);
  d.setHours(d.getHours() + KZ_OFFSET_HOURS);
  return d.toISOString().slice(0, 10);
};

/** Format a KZ date to DD.MM.YY for display */
const formatDateShort = (isoDate) => {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y.slice(2)}`;
};

/** Get KZ time (HH:MM) from a date */
const toKZTime = (dateInput) => {
  const d = new Date(dateInput);
  d.setHours(d.getHours() + KZ_OFFSET_HOURS);
  return d.toISOString().slice(11, 16);
};

/** Calculate current streak (consecutive days with attempts, going back from today) */
const calcStreak = (attempts) => {
  if (!attempts.length) return 0;

  const uniqueDays = new Set(attempts.map(a => toKZDate(a.created_at)));
  const today = toKZDate(new Date());
  let streak = 0;
  let checkDate = new Date(today);

  while (true) {
    const dateStr = checkDate.toISOString().slice(0, 10);
    if (uniqueDays.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
};

/**
 * Extract error details from a single attempt's answers_data + quiz questions.
 * Returns only incorrect answers with question text, user/correct answer text, time, and explanation.
 */
const extractErrors = (answersData, questions) => {
  if (!answersData || !questions) return [];

  return answersData
    .filter(a => !a.isCorrect && a.chosenIndex !== null)
    .map(a => {
      const q = questions[a.originalIndex];
      if (!q) return null;
      return {
        q: q.question,
        ua: q.options?.[a.chosenIndex] || '—',
        ca: q.options?.[a.correctIndex ?? q.correctIndex] || '—',
        ts: a.timeSpent || 0,
        ...(q.explanation ? { ex: q.explanation } : {})
      };
    })
    .filter(Boolean)
    .slice(0, 5); // Max 5 errors per attempt to keep JSON compact
};

/**
 * Find question indices (1-based) with max and min time from answers_data.
 * Returns { m_t: [idx, ...], i_t: [idx, ...] }
 */
const getTimingExtremes = (answersData) => {
  if (!answersData || answersData.length === 0) return {};

  const withTime = answersData
    .filter(a => a.timeSpent !== undefined && a.timeSpent !== null)
    .map(a => ({ idx: (a.originalIndex ?? 0) + 1, t: a.timeSpent }));

  if (withTime.length < 2) return {};

  const sorted = [...withTime].sort((a, b) => b.t - a.t);
  const m_t = sorted.slice(0, 2).map(x => x.idx);
  const i_t = sorted.slice(-2).reverse().map(x => x.idx);

  return { m_t, i_t };
};

// ─── Main Builder: Per-Student Prompt ────────────────────────────

/**
 * Build AI prompt for a single student's analytics.
 * @param {string} userId - Student's user ID
 * @param {'student'|'teacher'} viewerRole - Who is viewing
 * @param {object} [viewerProfile] - Teacher's profile (if viewerRole === 'teacher')
 * @returns {Promise<{instruction: string, data: object, filename: string}>}
 */
export const buildStudentPrompt = async (userId, viewerRole = 'student', viewerProfile = null) => {
  const cacheKey = `ai_prompt_student_${userId}_${viewerRole}`;

  return await fetchWithCache(cacheKey, async () => {
    // ── 1. Fetch student profile with geo names ──
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, patronymic, city_id, school_id, class_id')
      .eq('id', userId)
      .single();

    if (!profile) return null;

    const [cityRes, schoolRes, classRes] = await Promise.all([
      profile.city_id ? supabase.from('cities').select('name').eq('id', profile.city_id).single() : { data: null },
      profile.school_id ? supabase.from('schools').select('name').eq('id', profile.school_id).single() : { data: null },
      profile.class_id ? supabase.from('classes').select('name').eq('id', profile.class_id).single() : { data: null }
    ]);

    const cityName = cityRes.data?.name || '—';
    const schoolName = schoolRes.data?.name || '—';
    const className = classRes.data?.name || '—';

    // Build names
    const initials = [profile.first_name, profile.patronymic].filter(Boolean).map(n => n.charAt(0).toUpperCase() + '.').join(' ');
    const displayName = `${profile.last_name || ''} ${initials}`.trim() || 'Ученик';
    const fullName = `${profile.last_name || ''} ${profile.first_name || ''} ${profile.patronymic || ''}`.trim() || 'Ученик';

    // ── 2. Fetch last 200 attempts ──
    const { data: fetchedAttempts } = await supabase
      .from('quiz_attempts')
      .select('*, quizzes(id, title, section_id, content, avg_success_rate)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(DATA_LIMIT_COUNT);

    const attempts = fetchedAttempts ? fetchedAttempts.reverse() : [];

    if (!attempts || attempts.length === 0) {
      const empty = buildEmptyPrompt(displayName, `${cityName}, ${schoolName}, ${className}`, viewerRole);
      return { instruction: empty, data: { status: 'no_data' }, filename: `analytics_${displayName.replace(/\s+/g, '_')}.json` };
    }

    if (attempts.length < 10) {
      const notEnough = viewerRole === 'teacher'
        ? `У ученика ${displayName} слишком мало данных для глубокого педагогического анализа (всего ${attempts.length} попыток). Необходимо минимум 10 прохождений для выявления паттернов обучения.`
        : `У вас пока недостаточно данных для ИИ-анализа (всего ${attempts.length} попыток). Пройдите еще несколько тестов (минимум 10), чтобы ИИ смог выявить ваши сильные и слабые стороны!`;
      return { instruction: notEnough, data: { status: 'not_enough_data', count: attempts.length }, filename: `analytics_${displayName.replace(/\s+/g, '_')}.json` };
    }

    // ── 3. Fetch section names for subjects ──
    const sectionIds = [...new Set(attempts.map(a => a.quizzes?.section_id).filter(Boolean))];
    let sectionsMap = {};
    if (sectionIds.length > 0) {
      const { data: sections } = await supabase
        .from('quiz_sections')
        .select('id, name, class_id')
        .in('id', sectionIds);
      if (sections) sections.forEach(s => { sectionsMap[s.id] = s.name; });
    }

    // ── 4. Compute global stats ──
    const uniqueQuizIds = new Set(attempts.map(a => a.quiz_id));
    const gs = {
      ut: uniqueQuizIds.size,
      att: attempts.length,
      ok: attempts.filter(a => a.is_passed && !a.is_incomplete).length,
      f: attempts.filter(a => !a.is_passed && !a.is_incomplete && !a.is_suspicious).length,
      s: attempts.filter(a => a.is_suspicious).length,
      ic: attempts.filter(a => a.is_incomplete).length,
      str: calcStreak(attempts)
    };

    // ── 5. Find the very first attempt per quiz (across ALL time, not just 30 days) ──
    // We use the loaded attempts since they're already sorted asc
    const firstAttemptPerQuiz = {};
    attempts.forEach(a => {
      if (!firstAttemptPerQuiz[a.quiz_id]) {
        firstAttemptPerQuiz[a.quiz_id] = a;
      }
    });

    // ── 6. Group attempts by day ──
    const dayGroups = {};
    attempts.forEach(a => {
      const dayKey = toKZDate(a.created_at);
      if (!dayGroups[dayKey]) dayGroups[dayKey] = [];
      dayGroups[dayKey].push(a);
    });

    // ── 7. Build days object ──
    const days = {};
    for (const [dayKey, dayAttempts] of Object.entries(dayGroups)) {
      const displayDay = formatDateShort(dayKey);

      // Group by quiz within this day
      const quizGroups = {};
      dayAttempts.forEach(a => {
        if (!quizGroups[a.quiz_id]) quizGroups[a.quiz_id] = [];
        quizGroups[a.quiz_id].push(a);
      });

      const dayEntries = [];
      for (const [quizId, quizAttempts] of Object.entries(quizGroups)) {
        const quiz = quizAttempts[0]?.quizzes;
        if (!quiz) continue;

        const questions = quiz.content?.questions || [];
        const subjectName = sectionsMap[quiz.section_id] || '—';

        // Stats for this quiz on this day
        const stats = {
          att: quizAttempts.length,
          ok: quizAttempts.filter(a => a.is_passed && !a.is_incomplete).length,
          f: quizAttempts.filter(a => !a.is_passed && !a.is_incomplete && !a.is_suspicious).length,
          s: quizAttempts.filter(a => a.is_suspicious).length,
          ic: quizAttempts.filter(a => a.is_incomplete).length
        };

        // Find key attempts
        const completed = quizAttempts.filter(a => !a.is_incomplete);
        const firstEver = firstAttemptPerQuiz[quizId];

        // Best (highest score, then lowest time)
        const best = completed.length > 0
          ? completed.reduce((b, a) => (a.score > b.score || (a.score === b.score && a.time_spent_total < b.time_spent_total)) ? a : b)
          : null;

        // Worst (lowest score)
        const worst = completed.length > 0
          ? completed.reduce((w, a) => a.score < w.score ? a : w)
          : null;

        // Suspicious
        const susp = quizAttempts.find(a => a.is_suspicious);

        // Build det (details)
        const det = {};

        if (firstEver) {
          const answersData = Array.isArray(firstEver.answers_data) ? firstEver.answers_data : [];
          det['1st'] = {
            t: toKZTime(firstEver.created_at),
            sc: `${firstEver.score}/${firstEver.max_score}`,
            dur: firstEver.time_spent_total,
            ...getTimingExtremes(answersData),
            err: extractErrors(answersData, questions)
          };
          // Remove empty arrays
          if (det['1st'].err.length === 0) delete det['1st'].err;
        }

        if (best && best.id !== firstEver?.id) {
          det.best = {
            t: toKZTime(best.created_at),
            sc: `${best.score}/${best.max_score}`,
            dur: best.time_spent_total,
            dp: firstEver ? `${best.score - firstEver.score >= 0 ? '+' : ''}${best.score - firstEver.score}` : undefined,
            dt: firstEver ? `${best.time_spent_total - firstEver.time_spent_total >= 0 ? '+' : ''}${best.time_spent_total - firstEver.time_spent_total}s` : undefined
          };
        }

        if (worst && worst.id !== firstEver?.id && worst.id !== best?.id) {
          det.worst = {
            t: toKZTime(worst.created_at),
            sc: `${worst.score}/${worst.max_score}`,
            dur: worst.time_spent_total
          };
        }

        if (susp) {
          det.susp = {
            t: toKZTime(susp.created_at),
            sc: `${susp.score}/${susp.max_score}`,
            rs: [susp.suspicion_reason].filter(Boolean)
          };
        }

        dayEntries.push({
          sub: subjectName,
          tn: quiz.title,
          c_avg: quiz.avg_success_rate || 0,
          stats,
          ...(Object.keys(det).length > 0 ? { det } : {})
        });
      }

      if (dayEntries.length > 0) {
        days[displayDay] = dayEntries;
      }
    }

    // ── 8. Build final JSON ──
    const json = {
      meta: {
        v: 1,
        generated: new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }) + ' (Алматы)',
        limit_count: DATA_LIMIT_COUNT
      },
      u: {
        n: fullName,
        geo: `${cityName}, ${schoolName}, ${className}`
      },
      gs,
      modes: '1st: контрольная (без подсказок, таймер +25с/вопрос); остальные: обучающие (мгновенная обратная связь + пояснения)',
      days
    };

    // ── 9. Wrap in instruction text ──
    const instruction = viewerRole === 'teacher'
      ? buildTeacherInstruction(viewerProfile)
      : buildStudentInstruction();

    return {
      instruction,
      data: json,
      filename: `analytics_${displayName.replace(/\s+/g, '_')}.json`
    };
  }, PROMPT_TTL_HOURS);
};

// ─── Instruction Texts ───────────────────────────────────────────

const DICTIONARY_BLOCK = `## Расшифровка мнемоники (Словарь)

- **u** (User): Данные ученика. n — ФИО, geo — город, школа, класс.
- **gs** (Global Stats): Общая статистика. ut — уникальные тесты, att — всего попыток, ok — успешных, f — провалено, s — подозрительных, ic — незавершённых (ранний выход), str — стрик (дней подряд с активностью).
- **modes**: Правила системы. 1st (первая попытка) — контрольная (без обратной связи, +25с к таймеру на вопрос). Остальные — обучающие (с мгновенными подсказками и пояснениями).
- **days**: История, сгруппированная по датам.
- **sub / tn**: Предмет и Название теста.
- **c_avg**: Средний % успеваемости по системе для этого теста (для сравнения).
- **stats**: Сводка по тесту за день. att — попытки, ok — успех, f — провал, s — подозрительно, ic — незавершённых.
- **det** (Details): Разбор ключевых попыток:
  - **1st**: Первая попытка (чистые знания).
  - **best**: Лучшая.
  - **worst**: Худшая.
  - **susp**: Подозрительная (с причинами rs).
- **sc**: Балл (набрано/максимум). **dur**: Длительность в секундах.
- **m_t / i_t**: Номера вопросов (1-based), на которые ушло больше всего и меньше всего времени.
- **dp / dt**: Изменение балла и времени в best относительно 1st.
- **err**: Ошибки. q — вопрос, ua — ответ ученика, ca — верный ответ, ts — время на вопрос (сек), ex — пояснение.
- **rs** (Reasons): Коды подозрений: blind_guessing (слепое угадывание), high_skip_rate (пропуск >40% вопросов), rapid_fail (слишком быстро при низком балле), instant_zero (нулевой результат за <30с), incomplete_exit (выход до завершения).`;

const buildStudentInstruction = () => `# Инструкция для ИИ (Личный Наставник LabTest)

**Цель**: Провести без подобострастия и угодничества глубокий, честный анализ обучения ученика и дать персональные рекомендации. Ты — личный наставник, который видит полную картину.

${DICTIONARY_BLOCK}

## Задание

На основе загруженного JSON-файла выполни:

1. **Общий вердикт**: Оцени вовлеченность (стрик, количество тестов) и честность (подозрительные попытки, частые выходы ic).
2. **Анализ знаний**: Сравни первую попытку (1st) со средним по системе (c_avg). Насколько ученик реально владеет темой до подсказок?
3. **Поиск аномалий**: Проанализируй вопросы с максимальным временем (m_t). Сложность темы, невнимательность или попытка найти ответ?
4. **Оценка прогресса**: Используй dp и dt. Улучшается ли результат осознанно или за счёт механического запоминания?
5. **Персональный план**: Дай 3 конкретных совета. На какие темы нажать, а где поддерживать уровень.

**Стиль**: Обращайся к ученику на «ты», дружелюбно но честно. Используй эмодзи умеренно.

## Данные для анализа загружены из файла.`;

const buildTeacherInstruction = (teacherProfile) => {
  const teacherName = teacherProfile
    ? `${teacherProfile.last_name || ''} ${teacherProfile.first_name || ''}`.trim()
    : 'Учитель';

  return `# Инструкция для ИИ (Педагогический Аналитик LabTest)

**Цель**: Провести без подобострастия и угодничества профессиональный педагогический анализ данного ученика для учителя **${teacherName}**. Выявить проблемы, дать рекомендации по работе с учеником.

${DICTIONARY_BLOCK}

## Задание

На основе загруженного JSON-файла выполни:

1. **Диагностика**: Определи уровень ученика (высокий / средний / низкий / критический). Основывайся на 1st попытках и сравнении с c_avg.
2. **Честность**: Оцени наличие подозрительных попыток (s) и ранних выходов (ic). Есть ли паттерн списывания?
3. **Динамика**: Анализ прогресса через dp/dt. Ученик учится или механически перебирает ответы?
4. **Слабые зоны**: Конкретные темы/тесты, где ученик систематически ошибается. Какие вопросы вызывают наибольшую сложность?
5. **Рекомендации учителю**: 3-5 конкретных действий. Как построить работу с этим учеником? Нужна ли индивидуальная беседа?

**Стиль**: Профессиональный, педагогический. Используй термины: «зона ближайшего развития», «учебная мотивация», «самостоятельность». Обращайся к учителю на «вы».

## Данные для анализа загружены из файла.`;
};

const buildEmptyPrompt = (name, geo, viewerRole) => {
  return viewerRole === 'teacher'
    ? `Ученик ${name} (${geo}) еще не проходил тесты. Данных для анализа нет.`
    : `У вас пока нет данных о прохождении тестов. Пройдите несколько тестов, и здесь появится персональный анализ!`;
};

// ─── Cache Key Helper ────────────────────────────────────────────

export const getPromptCacheKey = (type, id, viewerRole = 'student', quizId = null) => {
  switch (type) {
    case 'student': return `ai_prompt_student_${id}_${viewerRole}`;
    case 'student_detailed': return `ai_prompt_student_detailed_${id}_${quizId}_${viewerRole}`;
    case 'quiz': return `ai_prompt_quiz_${id}`;
    case 'class': return `ai_prompt_class_${id}`;
    default: return `ai_prompt_${type}_${id}`;
  }
};

// ─── Builder: Per-Quiz Prompt (Analytics page) ──────────────────

const QUIZ_DICTIONARY_BLOCK = `## Расшифровка мнемоники (Словарь)

- **quiz**: Данные теста. tn — название, sub — предмет, q_count — кол-во вопросов, c_avg — средний % успеваемости.
- **scope**: Текущий фильтр (город, школа, класс).
- **q_stats**: Успеваемость по каждому вопросу. idx — номер, q — текст, ok% — процент правильных ответов.
- **students**: Результаты учеников.
  - n — ФИО, cls — класс.
  - 1st — первая попытка (sc — балл, dur — время в секундах).
  - best — лучшая попытка (sc — балл, dp — разница с 1st).
  - att — общее количество попыток.
  - s — количество подозрительных попыток, ic — незавершённых.
  - err — основные ошибки (idx — номер вопроса, ua — ответ ученика, ca — правильный ответ).
- **rs** (Reasons): Коды подозрений: blind_guessing, high_skip_rate, rapid_fail, instant_zero, incomplete_exit.`;

/**
 * Build AI prompt for per-quiz analysis from already-loaded data.
 * Called from Analytics page — avoids redundant API calls.
 * @param {object} params
 * @param {object} params.quiz - Quiz object with content.questions
 * @param {Array} params.filteredResults - Quiz results (with profiles joined) matching current filters
 * @param {string} params.scopeLabel - Human-readable scope description (e.g. "Тараз, Ш-12, 10А")
 * @param {Array} params.cities - Cities array
 * @param {Array} params.schools - Schools array
 * @param {Array} params.classes - Classes array
 * @returns {{instruction: string, data: object, filename: string}}
 */
export const buildQuizPromptFromData = ({ quiz, filteredResults, scopeLabel, cities, schools, classes, missingStudents = [] }) => {
  if (!quiz || !filteredResults || filteredResults.length === 0) {
    return { instruction: 'Нет данных для анализа.', data: null, filename: 'quiz_analysis.json' };
  }

  const questions = quiz.content?.questions || [];

  // Per-question success rates
  const q_stats = questions.map((q, idx) => {
    const correctCount = filteredResults.reduce((acc, r) => {
      const answers = r.first_answers_array || r.answers_array;
      if (!answers || !answers[idx]) return acc;
      return acc + 1;
    }, 0);
    return {
      idx: idx + 1,
      q: q.question,
      'ok%': Math.round((correctCount / filteredResults.length) * 100)
    };
  });

  // Per-student summaries (limit to first 50 students to keep JSON manageable)
  const studentList = filteredResults.slice(0, 50).map(r => {
    const p = r.profiles;
    const hasName = p?.first_name || p?.last_name;
    const fullName = p?.is_anonymous ? 'Анонимный' : (hasName ? `${p.last_name || ''} ${p.first_name || ''} ${p.patronymic || ''}`.trim() : 'Неизвестный');
    const cls = classes?.find(c => c.id === p?.class_id)?.name || '—';

    const firstScore = r.first_score ?? r.score;
    const currentScore = r.score;

    // Extract top 3 errors from answers_array
    const answers = r.first_answers_array || r.answers_array || [];
    const errors = [];
    answers.forEach((isCorrect, idx) => {
      if (!isCorrect && questions[idx] && errors.length < 3) {
        errors.push({
          idx: idx + 1,
          ua: '—', // We don't have chosen option in quiz_results, only correct/incorrect
          ca: questions[idx].options?.[questions[idx].correctIndex] || '—'
        });
      }
    });

    const entry = {
      n: fullName,
      cls,
      '1st': { sc: `${firstScore}/${r.total_questions}` },
      best: { sc: `${currentScore}/${r.total_questions}`, dp: `${currentScore - firstScore >= 0 ? '+' : ''}${currentScore - firstScore}` },
      att: r.attempt_count || 1
    };

    if (r.is_suspicious_user) entry.s = 1;
    if (r.is_incomplete_user) entry.ic = 1;
    if (errors.length > 0) entry.err = errors;

    return entry;
  });

  const json = {
    meta: {
      v: 1,
      generated: new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }) + ' (Алматы)'
    },
    quiz: {
      tn: quiz.title,
      sub: quiz.quiz_sections?.name || '—',
      q_count: questions.length,
      c_avg: quiz.avg_success_rate || 0
    },
    scope: scopeLabel,
    q_stats,
    students: studentList,
    missing_students: Array.isArray(missingStudents) ? missingStudents.map(s => `${s.last_name || ''} ${s.first_name || ''} ${s.patronymic || ''}`.trim() || 'Ученик') : []
  };

  const instruction = `# Инструкция для ИИ (Аналитик Теста LabTest)

**Цель**: Провести детальный, честный, без подобострастия и угодничества анализ результатов одного теста по группе учеников. Помочь учителю понять, какие вопросы/темы вызывают затруднения и как скорректировать обучение.

${QUIZ_DICTIONARY_BLOCK}

## Задание

На основе загруженного JSON-файла выполни:

1. **Обзор теста**: Оцени общую сложность теста (c_avg). Адекватна ли сложность для данного уровня учеников?
2. **Проблемные вопросы**: Определи вопросы с ok% ниже 50%. Почему ученики ошибаются? Неясная формулировка, сложная тема или недостаточная подготовка?
3. **Группировка учеников**: Раздели учеников на группы по уровню (сильные / средние / слабые / подозрительные). Кто нуждается в дополнительной помощи?
4. **Невыполненные**: Список missing_students содержит тех, кто еще не приступал к тесту. Перечисли их.
5. **Паттерны ошибок**: Есть ли вопросы, где БОЛЬШИНСТВО ошибается? Это может указывать на проблему в подаче материала.
6. **Рекомендации учителю**: 3-5 конкретных действий. Что повторить на уроке? Нужно ли переформулировать вопросы? Кому уделить внимание?

**Стиль**: Профессиональный, педагогический. Обращайся к учителю на «вы».

## Данные для анализа загружены из файла.`;

  return {
    instruction,
    data: json,
    filename: `test_${quiz.title.replace(/\s+/g, '_')}.json`
  };
};

// ─── Builder: Per-Class Prompt (Dashboard) ──────────────────────

/**
 * Build AI prompt for a class-level summary.
 * @param {string} classId - Class UUID
 * @returns {Promise<{instruction: string, data: object, filename: string}>}
 */
export const buildClassPrompt = async (classId) => {
  const cacheKey = `ai_prompt_class_${classId}`;

  return await fetchWithCache(cacheKey, async () => {
    // 1. Fetch class + school + city
    const { data: cls } = await supabase.from('classes').select('*, schools(name, city_id)').eq('id', classId).single();
    if (!cls) return null;

    let cityName = '—';
    if (cls.schools?.city_id) {
      const { data: city } = await supabase.from('cities').select('name').eq('id', cls.schools.city_id).single();
      cityName = city?.name || '—';
    }

    // 2. Fetch students in this class
    const { data: students } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, is_observer')
      .eq('class_id', classId)
      .eq('is_observer', false)
      .order('last_name');

    if (!students || students.length === 0) return `Класс ${cls.name} пуст. Нет учеников для анализа.`;

    const studentIds = students.map(s => s.id);

    // ── 3. Fetch last 200 results for these students ──
    const { data: results } = await supabase
      .from('quiz_results')
      .select('user_id, quiz_id, score, total_questions, is_passed, first_score, is_suspicious_user, is_incomplete_user, completed_at, quizzes(title, section_id, avg_success_rate)')
      .in('user_id', studentIds)
      .order('completed_at', { ascending: false })
      .limit(DATA_LIMIT_COUNT);

    if (!results || results.length === 0) {
      const msg = `Класс ${cls.name} — нет результатов попыток для анализа.`;
      return { instruction: msg, data: { status: 'no_data' }, filename: `class_${cls.name.replace(/\s+/g, '_')}.json` };
    }

    // 4. Aggregate quiz stats
    const quizMap = {};
    results.forEach(r => {
      if (!quizMap[r.quiz_id]) {
        quizMap[r.quiz_id] = {
          tn: r.quizzes?.title || '—',
          c_avg: r.quizzes?.avg_success_rate || 0,
          scores: [],
          susp: 0
        };
      }
      quizMap[r.quiz_id].scores.push(Math.round((r.score / r.total_questions) * 100));
      if (r.is_suspicious_user) quizMap[r.quiz_id].susp++;
    });

    const quizList = Object.values(quizMap).map(q => ({
      tn: q.tn, c_avg: q.c_avg,
      cls_avg: Math.round(q.scores.reduce((a, b) => a + b, 0) / q.scores.length),
      att: q.scores.length,
      ...(q.susp > 0 ? { s: q.susp } : {})
    }));

    // Sort: weakest first
    const weakest = [...quizList].sort((a, b) => a.cls_avg - b.cls_avg).slice(0, 5);
    const strongest = [...quizList].sort((a, b) => b.cls_avg - a.cls_avg).slice(0, 5);

    // 5. Per-student summary
    const studentSummaries = students.map(st => {
      const myResults = results.filter(r => r.user_id === st.id);
      if (myResults.length === 0) return { n: `${st.last_name} ${st.first_name?.charAt(0) || ''}.`, att: 0, 'avg%': 0, inactive: true };

      const avgPct = Math.round(myResults.reduce((acc, r) => acc + (r.score / r.total_questions) * 100, 0) / myResults.length);
      const suspCount = myResults.filter(r => r.is_suspicious_user).length;
      const icCount = myResults.filter(r => r.is_incomplete_user).length;

      // Find weak/strong subjects
      const byQuiz = {};
      myResults.forEach(r => {
        if (!byQuiz[r.quiz_id]) byQuiz[r.quiz_id] = { tn: r.quizzes?.title || '—', scores: [] };
        byQuiz[r.quiz_id].scores.push(Math.round((r.score / r.total_questions) * 100));
      });
      const quizAvgs = Object.values(byQuiz).map(q => ({ tn: q.tn, avg: Math.round(q.scores.reduce((a, b) => a + b, 0) / q.scores.length) }));
      const weak = quizAvgs.filter(q => q.avg < 50).sort((a, b) => a.avg - b.avg).slice(0, 3).map(q => q.tn);
      const strong = quizAvgs.filter(q => q.avg >= 80).sort((a, b) => b.avg - a.avg).slice(0, 3).map(q => q.tn);

      const entry = {
        n: `${st.last_name || ''} ${st.first_name || ''} ${st.patronymic || ''}`.trim() || 'Ученик',
        att: myResults.length,
        'avg%': avgPct
      };
      if (suspCount > 0) entry.s = suspCount;
      if (icCount > 0) entry.ic = icCount;
      if (weak.length > 0) entry.weak = weak;
      if (strong.length > 0) entry.strong = strong;

      return entry;
    });

    // 6. Overview
    const allScores = results.map(r => Math.round((r.score / r.total_questions) * 100));
    const inactiveCount = students.length - new Set(results.map(r => r.user_id)).size;

    const json = {
      meta: {
        v: 1,
        generated: new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }) + ' (Алматы)',
        limit_count: DATA_LIMIT_COUNT
      },
      class: {
        name: cls.name,
        school: cls.schools?.name || '—',
        city: cityName,
        students: students.length
      },
      overview: {
        total_results: results.length,
        'avg%': Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length),
        susp_students: new Set(results.filter(r => r.is_suspicious_user).map(r => r.user_id)).size,
        inactive: inactiveCount
      },
      weakest_quizzes: weakest,
      strongest_quizzes: strongest,
      students: studentSummaries
    };

    const instruction = `# Инструкция для ИИ (Классный Аналитик LabTest)

**Цель**: Провести без подобострастия и угодничества комплексный анализ успеваемости всего класса. Помочь учителю увидеть общую картину, выявить системные проблемы и составить план работы.

## Расшифровка мнемоники (Словарь)

- **class**: Данные класса. name — название, school — школа, city — город, students — кол-во учеников.
- **overview**: Общая картина. total_results — общее кол-во результатов, avg% — средний % по классу, susp_students — кол-во учеников с подозрительными результатами, inactive — неактивные (без результатов за период).
- **weakest_quizzes / strongest_quizzes**: Тесты с наихудшими/наилучшими результатами. tn — название, c_avg — средний % по системе, cls_avg — средний % по классу, att — кол-во результатов, s — подозрительных.
- **students**: Данные по каждому ученику. n — ФИО, att — кол-во результатов, avg% — средний %, s — подозрительных, ic — незавершённых, weak — слабые тесты, strong — сильные тесты, inactive — нет результатов.

## Задание

На основе загруженного JSON-файла выполни:

1. **Общая оценка**: Каков уровень класса? Сравни cls_avg с c_avg — класс выше или ниже среднего по системе?
2. **Проблемные тесты**: Какие темы (weakest_quizzes) требуют повторного объяснения? Почему cls_avg сильно отличается от c_avg?
3. **Рейтинг учеников**: Выдели лидеров, середнячков и отстающих. Кто требует срочной помощи?
4. **Подозрительная активность**: Есть ли ученики с систематическими подозрительными результатами? Что рекомендуется?
5. **Неактивные ученики**: ${inactiveCount > 0 ? `${inactiveCount} учеников не прошли ни одного теста. Как их вовлечь?` : 'Все ученики активны — отлично!'}
6. **План действий**: 5 конкретных шагов для учителя на ближайшую неделю.

**Стиль**: Профессиональный, конструктивный. Обращайся к учителю на «вы».

## Данные для анализа загружены из файла.`;

    return {
      instruction,
      data: json,
      filename: `class_${cls.name.replace(/\s+/g, '_')}.json`
    };
  }, PROMPT_TTL_HOURS);
};

/** 
 * Builder: Detailed Quiz Attempt History for one student
 * Fetches first, best, and last 10 attempts for a specific quiz.
 */
export const buildDetailedQuizPrompt = async (userId, quizId, viewerRole = 'student', viewerProfile = null) => {
  return await fetchWithCache(getPromptCacheKey('student_detailed', userId, viewerRole, quizId), async () => {
    // 1. Fetch Profile & Quiz info
    const [{ data: profile }, { data: quiz }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('quizzes').select('*, quiz_sections(name)').eq('id', quizId).single()
    ]);

    if (!profile || !quiz) return null;

    const initials = [profile.first_name, profile.patronymic].filter(Boolean).map(n => n.charAt(0).toUpperCase() + '.').join(' ');
    const displayName = `${profile.last_name || ''} ${initials}`.trim() || 'Ученик';
    const fullName = `${profile.last_name || ''} ${profile.first_name || ''} ${profile.patronymic || ''}`.trim() || 'Ученик';

    // 2. Fetch Attempts: First, Best, Last 10
    const [{ data: first }, { data: best }, { data: last10 }] = await Promise.all([
      supabase.from('quiz_attempts').select('*').eq('user_id', userId).eq('quiz_id', quizId).order('created_at', { ascending: true }).limit(1).single(),
      supabase.from('quiz_attempts').select('*').eq('user_id', userId).eq('quiz_id', quizId).order('score', { ascending: false }).order('time_spent', { ascending: true }).limit(1).single(),
      supabase.from('quiz_attempts').select('*').eq('user_id', userId).eq('quiz_id', quizId).order('created_at', { ascending: false }).limit(10)
    ]);

    const allAttempts = [];
    const seenIds = new Set();
    [first, best, ...(last10 || [])].forEach(a => {
      if (a && !seenIds.has(a.id)) {
        allAttempts.push(a);
        seenIds.add(a.id);
      }
    });

    // Sort chronologically
    allAttempts.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (allAttempts.length < 3) {
      const msg = viewerRole === 'teacher'
        ? `У ученика ${displayName} слишком мало попыток прохождения этого теста для детального анализа (всего ${allAttempts.length}). Необходимо минимум 3 прохождения.`
        : `У вас пока недостаточно попыток по этому тесту для детального ИИ-анализа (всего ${allAttempts.length}). Пройдите тест еще несколько раз (минимум 3), чтобы ИИ увидел ваш прогресс!`;
      return { instruction: msg, data: { status: 'not_enough_data', count: allAttempts.length }, filename: `detailed_${displayName.replace(/\s+/g, '_')}.json` };
    }

    // 3. Process attempt data & Build Question Dictionary
    const qDict = {}; // hash -> { key, text, correct }
    let qCounter = 1;

    const getQKey = (qText, cAns) => {
      const hash = `${qText}|${cAns}`;
      if (!qDict[hash]) {
        const key = `Q${qCounter++}`;
        qDict[hash] = { key, text: qText, correct: cAns };
      }
      return qDict[hash].key;
    };

    const quizQuestions = quiz.content?.questions || [];

    const processedAttempts = allAttempts.map(a => {
      const answers = Array.isArray(a.answers_data) ? a.answers_data : [];
      return {
        id: a.id.slice(0, 8),
        ts: toKZTime(a.created_at) + ' ' + formatDateShort(toKZDate(a.created_at)),
        sc: a.score,
        dur: a.time_spent,
        is_passed: a.is_passed,
        ic: a.is_incomplete,
        s: a.is_suspicious,
        ans: answers.map(ans => {
          // Resolve question data from index if string is missing
          const qObj = (ans.originalIndex !== undefined) ? quizQuestions[ans.originalIndex] : null;
          const qText = ans.question || qObj?.question || '—';
          
          let cText = ans.correct_answer;
          if (!cText && qObj) {
            const cIdx = ans.correctIndex !== undefined ? ans.correctIndex : qObj.correctIndex;
            cText = qObj.options?.[cIdx] || '—';
          }
          if (!cText) cText = '—';

          let uText = ans.user_answer;
          if (!uText && qObj && ans.chosenIndex !== undefined) {
            uText = qObj.options?.[ans.chosenIndex] || '—';
          }
          if (!uText) uText = '—';

          const qKey = getQKey(qText, cText);
          return {
            qid: qKey,
            ok: !!ans.is_correct,
            t: ans.time_spent || 0,
            u: uText
          };
        })
      };
    });

    // 4. Final questions dictionary for JSON
    const questions = {};
    Object.values(qDict).forEach(q => {
      questions[q.key] = { text: q.text, correct: q.correct };
    });

    // 5. Compute global question stats
    const qStats = {};
    processedAttempts.forEach(a => {
      a.ans.forEach(ans => {
        if (!qStats[ans.qid]) qStats[ans.qid] = { ok: 0, total: 0, t: 0 };
        qStats[ans.qid].total++;
        if (ans.ok) qStats[ans.qid].ok++;
        qStats[ans.qid].t += ans.t;
      });
    });

    const json = {
      meta: { v: 1, generated: new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }), limit: '1st+Best+Last10' },
      student: { n: fullName, id: userId.slice(0, 8) },
      quiz: { tn: quiz.title, q_count: quiz.total_questions, c_avg: quiz.avg_success_rate || 0 },
      questions,
      attempts: processedAttempts,
      q_summary: Object.keys(qStats).map(qid => ({
        qid,
        'ok%': Math.round((qStats[qid].ok / qStats[qid].total) * 100),
        avg_t: Math.round(qStats[qid].t / qStats[qid].total)
      }))
    };

    const teacherName = viewerProfile ? `${viewerProfile.last_name || ''} ${viewerProfile.first_name || ''}`.trim() : 'учителя';

    const instruction = viewerRole === 'teacher'
      ? `# Инструкция для ИИ (Педагогический Аналитик — Детальный Разбор)

**Цель**: Провести без подобострастия и угодничества глубокий педагогический анализ прогресса ученика **${fullName}** в конкретном тесте «${quiz.title}».

## Расшифровка мнемоники
- **questions**: Словарь вопросов. Ключ (Q1, Q2...) -> { text, correct }.
- **attempts**: Список попыток. ts — время, sc — баллы, dur — длительность (сек), s — подозрительно, ic — не до конца.
- **ans**: Ответы в попытке. qid — ссылка на вопрос из словаря, ok — верно/неверно, t — время на вопрос, u — ответ ученика.

## Задание
На основе хронологии попыток из JSON-файла выполни:
1. **Динамика обучения**: Как менялся результат от первой попытки к последней? Есть ли реальное усвоение материала или «зазубривание»?
2. **Анализ времени**: Соответствует ли время выполнения сложности вопросов? Где ученик «зависает», а где отвечает слишком быстро (подозрение на угадывание)?
3. **Паттерны ошибок**: Проанализируй неверные ответы (u) в сравнении с правильными (correct) из словаря. Ошибки случайны или системны?
4. **Честность**: Оцени попытки с флагом s (suspicious) и ic (incomplete).
5. **Рекомендации**: Дай учителю ${teacherName} конкретные советы, на что обратить внимание при работе с этим учеником по данной теме.

**Стиль**: Профессиональный, честный, педагогический. Обращайся к учителю на «вы».

## Данные загружены из файла.`
      : `# Инструкция для ИИ (Личный Наставник — Разбор Теста)

**Цель**: Провести без подобострастия и угодничества честный и глубокий разбор твоих попыток в тесте «${quiz.title}». Ты — персональный ментор.

## Расшифровка мнемоники
- **questions**: Словарь вопросов. Ключ (Q1, Q2...) -> { text, correct }.
- **attempts**: Список попыток. ts — время, sc — баллы, dur — длительность (сек), s — подозрительно, ic — не до конца.
- **ans**: Ответы в попытке. qid — ссылка на вопрос из словаря, ok — верно/неверно, t — время на вопрос, u — твой ответ.

## Задание
На основе твоей истории попыток из JSON-файла выполни:
1. **Твой прогресс**: Похвали за реальные успехи и честно укажи на слабые места. Как изменилось твое понимание темы?
2. **Работа над ошибками**: Проанализируй неверные ответы (u) в сравнении с правильными (correct). В чем суть твоих заблуждений?
3. **Тайм-менеджмент**: На какие вопросы ты тратишь слишком много времени? Как оптимизировать процесс?
4. **Стратегия**: Конкретный план из 3 шагов: что повторить и как подойти к следующей попытке, чтобы улучшить результат.

**Стиль**: Дружелюбный, но строгий и честный наставник. Мотивируй к осознанному обучению. Обращайся на «ты».

## Данные загружены из файла.`;

    return { instruction, data: json, filename: `detailed_${quiz.title.replace(/\s+/g, '_')}_${displayName.replace(/\s+/g, '_')}.json` };
  }, PROMPT_TTL_HOURS);
};
