/**
 * AI Textbook Importer Service
 * Handles PDF extraction, Gemini Flash TOC analysis, Quiz Generation, and YouTube Search
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash'
];

const DEFAULT_MODEL = 'gemini-2.5-flash';

// Polyfill URL.parse for compatibility with all browsers
if (typeof URL !== 'undefined' && !URL.parse) {
  URL.parse = (url, base) => {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}

import * as pdfjs from 'pdfjs-dist';
// Set stable worker from CDN matching 3.11.174
pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export async function getPdfJs() {
  return pdfjs;
}

/**
 * Extract text from a PDF File object or URL
 * @param {File|string} source - File object or URL string
 * @param {number} startPage - 1-indexed start page
 * @param {number} endPage - 1-indexed end page
 * @param {function} onProgress - optional callback (curr, total)
 * @returns {Promise<{ fullText: string, numPages: number, pageTexts: { page: number, text: string }[] }>}
 */
export async function extractPdfText(source, startPage = 1, endPage = null, onProgress = null) {
  const pdfjs = await getPdfJs();
  let loadingTask;

  if (source instanceof File) {
    const arrayBuffer = await source.arrayBuffer();
    loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  } else if (typeof source === 'string') {
    loadingTask = pdfjs.getDocument(source);
  } else {
    throw new Error('Неверный источник PDF.');
  }

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const from = Math.max(1, startPage);
  const to = endPage ? Math.min(numPages, endPage) : numPages;

  const pageTexts = [];
  let fullText = '';

  for (let i = from; i <= to; i++) {
    try {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(item => item.str);
      const pageText = strings.join(' ').replace(/\s+/g, ' ').trim();
      pageTexts.push({ page: i, text: pageText });
      fullText += `\n[--- СТРАНИЦА ${i} ---]\n${pageText}\n`;
    } catch (pageErr) {
      console.warn(`Ошибка извлечения текста со страницы ${i}:`, pageErr);
      pageTexts.push({ page: i, text: '' });
    }

    if (onProgress) {
      onProgress(i - from + 1, to - from + 1);
    }
  }

  return {
    numPages,
    fullText,
    pageTexts,
    from,
    to
  };
}

/**
 * Automatically search for Table of Contents / "Содержание" / "Оглавление" in PDF
 * Checks beginning (pages 1-15) and end of document (last 10 pages)
 * @returns {Promise<{ detected: boolean, startPage: number, endPage: number, reason: string }>}
 */
export async function detectTocPages(source, onProgress = null) {
  const pdfjs = await getPdfJs();
  let loadingTask;

  if (source instanceof File) {
    const arrayBuffer = await source.arrayBuffer();
    loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  } else if (typeof source === 'string') {
    loadingTask = pdfjs.getDocument(source);
  } else {
    throw new Error('Неверный источник PDF.');
  }

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  // Pages to probe: first 15 pages and last 10 pages
  const pagesToProbe = [];
  for (let i = 1; i <= Math.min(15, numPages); i++) pagesToProbe.push(i);
  for (let i = Math.max(16, numPages - 10); i <= numPages; i++) {
    if (!pagesToProbe.includes(i)) pagesToProbe.push(i);
  }

  const tocKeywords = [
    'содержание',
    'оглавление',
    'мазмұны',
    'тақырыптар',
    'table of contents',
    'contents'
  ];

  const matchedPages = [];

  for (let idx = 0; idx < pagesToProbe.length; idx++) {
    const pageNum = pagesToProbe[idx];
    if (onProgress) {
      onProgress(idx + 1, pagesToProbe.length, `Поиск содержания (страница ${pageNum} из ${numPages})...`);
    }

    try {
      const page = await pdfDoc.getPage(pageNum);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(' ').toLowerCase();

      // Check if keyword is found or strong signal of TOC lines (dots/page numbers like '.... 14')
      const hasKeyword = tocKeywords.some(kw => text.includes(kw));
      const hasTocDots = /(\.{3,}|_{3,})\s*\d+/.test(text) || /(параграф|бөлүм|тарау|бөлім|раздел|глава|§)\s*\d+/.test(text);

      if (hasKeyword || (hasTocDots && matchedPages.length > 0 && Math.abs(pageNum - matchedPages[matchedPages.length - 1]) <= 2)) {
        matchedPages.push(pageNum);
      }
    } catch {
      // ignore single page probe errors
    }
  }

  if (matchedPages.length > 0) {
    // Find contiguous or near range
    const start = Math.min(...matchedPages);
    // Usually TOC takes 1 to 5 pages
    const end = Math.min(numPages, Math.max(...matchedPages) + 1);
    return {
      detected: true,
      startPage: start,
      endPage: end,
      numPages,
      reason: `Найдено на страницах ${start}–${end}`
    };
  }

  // Default fallback: pages 1 to 10
  return {
    detected: false,
    startPage: 1,
    endPage: Math.min(10, numPages),
    numPages,
    reason: 'Ключевые слова не найдены, установлен диапазон по умолчанию (1–10).'
  };
}

export function getEffectiveApiKey(customKey = null) {
  return customKey || import.meta.env.VITE_GEMINI_API_KEY || '';
}

/**
 * Call Gemini Flash API with automatic fallback on 503 / high demand
 */
async function callGemini(prompt, apiKey, systemInstruction = '', preferredModel = null, useSearch = false) {
  const key = getEffectiveApiKey(apiKey);
  if (!key) {
    throw new Error('Ключ Gemini API не найден. Укажите его в настройках или .env.local (VITE_GEMINI_API_KEY).');
  }

  const modelsToTry = preferredModel
    ? [preferredModel, ...CANDIDATE_MODELS.filter(m => m !== preferredModel)]
    : CANDIDATE_MODELS;

  let lastError = null;

  for (const model of modelsToTry) {
    const url = `${GEMINI_API_URL}/${model}:generateContent?key=${key}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    if (useSearch) {
      requestBody.tools = [{ googleSearch: {} }];
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const rawMessage = errData.error?.message || errData.error?.status || `HTTP ${res.status}`;
        const isTemporaryUnavailable =
          res.status === 503 ||
          res.status === 500 ||
          res.status === 404 ||
          String(rawMessage).includes('demand') ||
          String(rawMessage).includes('UNAVAILABLE') ||
          String(rawMessage).includes('capacity') ||
          String(rawMessage).includes('overloaded');

        if (isTemporaryUnavailable) {
          console.warn(`[Gemini Fallback] Модель ${model} временно недоступна (${rawMessage}). Переключаемся на следующую модель...`);
          lastError = new Error(`Модель ${model} перегружена: ${rawMessage}`);
          continue;
        }

        if (res.status === 429) {
          throw new Error('Превышен лимит запросов Gemini (Rate Limit 429). Пожалуйста, подождите несколько секунд.');
        }

        throw new Error(`Gemini API Error (${model}): ${rawMessage}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error(`Пустой ответ от модели ${model}.`);
      }

      return text;
    } catch (fetchErr) {
      const errMsg = fetchErr.message || '';
      if (errMsg.includes('429') || errMsg.includes('Лимит')) {
        throw fetchErr;
      }

      // If it is our fallback signal, keep trying
      if (errMsg.includes('перегружена') || errMsg.includes('UNAVAILABLE') || errMsg.includes('demand')) {
        lastError = fetchErr;
        continue;
      }

      lastError = fetchErr;
      console.warn(`Ошибка запроса к ${model}:`, errMsg);
    }
  }

  throw lastError || new Error('Не удалось получить ответ ни от одной модели Gemini.');
}

/**
 * Clean and parse JSON from Markdown code blocks
 */
function cleanAndParseJson(raw) {
  let str = raw.trim();
  // Remove markdown code fences if present
  str = str.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/g, '').trim();
  try {
    return JSON.parse(str);
  } catch (err) {
    // Attempt relaxed cleanup for trailing commas
    const cleaned = str
      .replace(/,\s*([\]}])/g, '$1')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    return JSON.parse(cleaned);
  }
}

/**
 * Analyze Table of Contents (TOC) and construct hierarchical structure
 * Supports Sections (Разделы), Chapters (Главы), and Paragraphs (Параграфы)
 */
export async function analyzeTextbookStructure(tocOrPagesText, apiKey, totalPdfPages = 200) {
  const systemInstruction = `Ты — эксперт по анализу оглавления и структуры школьных учебников (включая учебники Казахстана).
Твоя задача — извлечь строго хронологическую последовательность разделителей и тестов.

Важные правила структуры:
1. Разделителями (type: "divider") являются:
   - Разделы (например: "I РАЗДЕЛ. ЦИВИЛИЗАЦИЯ: ОСОБЕННОСТИ РАЗВИТИЯ")
   - Главы (например: "Глава 1. Традиционная система жизнеобеспечения казахов")
   - Подразделы или крупные блоки тем.
2. Тестами (type: "quiz") являются конкретные параграфы и темы:
   - Например: "§ 1–2. Развитие кочевого скотоводства и земледелия на территории Казахстана"
   - Например: "§ 3. Традиционное ремесло казахов"
3. Для каждого теста обязательно определи диапазон страниц (start_page, end_page) на основе номеров страниц в оглавлении или соседних тем.
4. Если параграф очень большой (охватывает более 8-10 страниц, либо содержит сдвоенный параграф вроде "§ 1–2" или "§ 1-4"), разбей его на части:
   - "§ 1–2 (ч. 1). Название темы" (первая половина страниц)
   - "§ 1–2 (ч. 2). Название темы" (вторая половина страниц)
   Если тема стандартного размера (3-7 страниц), оставь в одной части.
5. Выведи результат ИСКЛЮЧИТЕЛЬНО в формате валидного JSON-массива объектов, без вступлений и пояснений.

Формат элемента:
{
  "type": "divider" | "quiz",
  "title": "Точное название с номером (например: 'I РАЗДЕЛ. ...', 'Глава 1. ...', '§ 1–2. ...')",
  "start_page": 5, // только для quiz (число)
  "end_page": 12   // только для quiz (число)
}`;

  const prompt = `Вот текст первых страниц учебника и оглавления (всего страниц в файле: ${totalPdfPages}):\n\n${tocOrPagesText}\n\nСформируй полную хронологическую структуру книги в виде JSON-массива объектов.`;

  const rawJson = await callGemini(prompt, apiKey, systemInstruction);
  const items = cleanAndParseJson(rawJson);

  if (!Array.isArray(items)) {
    throw new Error('Ответ от Gemini не является массивом элементов.');
  }

  // Normalize items
  return items.map((item, idx) => ({
    id: `item-${Date.now()}-${idx}`,
    type: item.type === 'divider' ? 'divider' : 'quiz',
    title: (item.title || item.text || '').trim(),
    startPage: item.start_page || item.startPage || 1,
    endPage: item.end_page || item.endPage || (item.start_page ? item.start_page + 4 : 5),
    enabled: true,
    status: 'pending', // 'pending' | 'generating' | 'completed' | 'error'
    error: null,
    createdQuizId: null
  }));
}

/**
 * Generate academic quiz for a specific paragraph text
 */
export async function generateQuizForParagraph(paragraphText, paragraphTitle, options = {}, apiKey) {
  const {
    questionsCount = 15,
    questionLimit = 10,
    authorName = 'Афанасиади Анастас'
  } = options;

  const systemInstruction = `Без подобострастия, угодничества и лишних вступлений составь сложный, академически строгий тест в стиле ЕНТ для глубокой проверки знаний учащихся. Текст должен полностью и детально охватывать содержание предоставленного параграфа.

Логика вопросов и вариантов ответов:
1. Язык вопросов лаконичный, точный, энциклопедический и не прощающий невнимательности. Никаких подсказок, наводящих слов или размытых формулировок.
2. Формат вариантов ответа: Варианты должны быть предельно лаконичными (предпочтительно 1–4 слова: термин, дата, имя, понятие, краткая категория). Все 4 варианта обязаны быть строго однородными грамматически (одна часть речи, одна форма, один падеж).
3. Длина ответов: Не допускать пространных описаний в вариантах ответа. Вся фактологическая и описательная часть переносится в тело вопроса, а варианты ответа остаются краткими маркерами выбора.
4. Дистракторы (неверные ответы) должны быть исторически или научно реальными терминами, фактами или цифрами из той же эпохи/контекста, чтобы исключить угадывание методом исключения, но строго неверными в контексте конкретного вопроса. Взаимоисключающие, абсурдные или очевидно глупые варианты запрещены.
5. Запрещено использовать формулировки "все варианты верны", "ни один из предложенных" или ссылки на позицию автора. Вопросы должны быть полностью автономными.
6. Избегай лингвистических подсказок, метафор и смысловых параллелей между текстом вопроса и правильным вариантом ответа, которые позволяют угадать ответ методом логического исключения.
7. Все 4 варианта ответа должны иметь строго одинаковую грамматическую структуру. Недопустимо смешивать разные части речи или синтаксические конструкции.
8. СТРОЖАЙШИЙ ЗАПРЕТ на фразы-маркеры: ни в вопросах, ни в вариантах, ни в объяснениях не должно быть фраз: "согласно тексту", "в соответствии с учебником", "как указано в параграфе", "по словам автора", "в данном блоке текста" и их синонимов. Пиши так, будто тест составляется по объективным историческим фактам, а не по конкретной книге.

Работа с иллюстрациями (рисунки, карты, схемы):
Если вопрос составляется по изображению из параграфа, обязательно начни поле "question" с префикса [ИЗОБРАЖЕНИЕ]. В самом тексте вопроса ЗАПРЕЩЕНО ссылаться на номера страниц или рисунков. Вместо этого текстом четко опиши, ЧТО ИМЕННО изображено на иллюстрации (например: "[ИЗОБРАЖЕНИЕ] На схеме, демонстрирующей расселение гоминид...").

Требования к полю "explanation":
Объяснение должно быть глубоким и академическим. Запрещено писать "Вариант Х верен, потому что так написано". Структура:
- Первое предложение: Раскрытие исторической сути и фактов, подтверждающих единственную верность правильного ответа.
- Второе предложение: Научное аргументированное опровержение дистракторов (почему остальные термины/даты относятся к другим событиям или эпохам).

Технические требования к JSON:
1. Выведи результат ИСКЛЮЧИТЕЛЬНО в формате валидного JSON-объекта, без какого-либо текстового вступления или разметки.
2. СТРОГО ЗАПРЕЩЕНО использовать висячие запятые (trailing commas).
3. Для выделения терминов внутри строк разрешено использовать только одинарные кавычки ' '.

Объем теста: Составь СТРОГО ${questionsCount} вопросов. В поле "question_limit" укажи ${questionLimit > 0 ? questionLimit : questionsCount}.`;

  const prompt = `Тема теста: ${paragraphTitle}
Автор-составитель: ${authorName}

Материал параграфа из учебника:
${paragraphText}

Сформируй JSON-объект с тестом по структуре:
{
  "title": "${paragraphTitle}",
  "time_limit": null,
  "question_limit": ${questionLimit > 0 ? questionLimit : questionsCount},
  "questions": [
    {
      "question": "Текст вопроса...",
      "options": ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"],
      "correctIndex": 0,
      "explanation": "Первое предложение... Второе предложение..."
    }
  ]
}`;

  const rawJson = await callGemini(prompt, apiKey, systemInstruction);
  const quizObj = cleanAndParseJson(rawJson);

  if (!quizObj || !Array.isArray(quizObj.questions) || quizObj.questions.length === 0) {
    throw new Error('Сгенерированный объект теста не содержит валидного списка вопросов.');
  }

  return quizObj;
}

/**
 * Search YouTube educational video for a topic
 */
export async function searchYouTubeVideo(topicTitle, subjectName = 'История Казахстана', apiKey) {
  try {
    const cleanTopic = topicTitle.replace(/^§\s*[\d–\-]+(\s*\(ч\.\s*\d+\))?\.?\s*/i, '').trim();
    const prompt = `Найди актуальный, качественный образовательный видеоурок на YouTube по теме:
"${cleanTopic}" (Предмет: ${subjectName}).
Выдай результат строго в JSON формате:
{
  "url": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
  "title": "Видеоурок: ${cleanTopic}"
}`;

    const raw = await callGemini(prompt, apiKey, 'Ты поисковый ассистент образовательного контента на YouTube. Верни строго валидный JSON с реальной ссылкой.', DEFAULT_MODEL, true);
    const parsed = cleanAndParseJson(raw);
    if (parsed?.url && (parsed.url.includes('youtube.com') || parsed.url.includes('youtu.be'))) {
      return [{
        url: parsed.url,
        title: parsed.title || `Видеоурок: ${cleanTopic}`
      }];
    }
  } catch (err) {
    console.warn('YouTube search with Grounding failed, falling back:', err);
  }

  return [];
}
