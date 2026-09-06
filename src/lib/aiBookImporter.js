/**
 * AI Textbook Importer Service
 * Handles PDF extraction, Gemini Flash TOC analysis, Quiz Generation, and YouTube Search
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Thrown when all retries are exhausted due to rate limit (429).
 * The pipeline catches this and retries the item after a longer wait.
 */
export class QuotaExceededError extends Error {
  constructor(waitSec, message) {
    super(message);
    this.name = 'QuotaExceededError';
    this.waitSec = waitSec;
  }
}

export const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash'
];

export const DEFAULT_MODEL = 'gemini-2.5-flash';

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
  let pdfDoc;
  try {
    let loadingTask;
    if (source instanceof File) {
      const arrayBuffer = await source.arrayBuffer();
      loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    } else if (typeof source === 'string') {
      loadingTask = pdfjs.getDocument(source);
    } else {
      throw new Error('Неверный источник PDF.');
    }
    pdfDoc = await loadingTask.promise;
  } catch (pdfErr) {
    if (typeof source === 'string') {
      throw new Error(`Не удалось прочитать PDF по веб-ссылке (${pdfErr.message || 'ошибка структуры/CORS'}). Прикрепите локальный PDF-файл с диска в Блоке 2.`);
    }
    throw new Error(`Ошибка открытия PDF: ${pdfErr.message}`);
  }
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
  let pdfDoc;
  try {
    let loadingTask;
    if (source instanceof File) {
      const arrayBuffer = await source.arrayBuffer();
      loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    } else if (typeof source === 'string') {
      loadingTask = pdfjs.getDocument(source);
    } else {
      throw new Error('Неверный источник PDF.');
    }
    pdfDoc = await loadingTask.promise;
  } catch (pdfErr) {
    if (typeof source === 'string') {
      throw new Error(`Не удалось прочитать PDF по веб-ссылке (${pdfErr.message || 'ошибка структуры/CORS'}). Прикрепите файл PDF с диска или вставьте текст содержания.`);
    }
    throw new Error(`Ошибка открытия PDF: ${pdfErr.message}`);
  }
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
 * Call Gemini Flash API with automatic fallback on 503/overload and smart wait on 429
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
        maxOutputTokens: 16384,
        responseMimeType: useSearch ? undefined : 'application/json'
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

    // Retry current model up to 3 times with backoff on 429
    let attemptsLeft = 3;
    let last429WaitSec = 0;
    while (attemptsLeft-- > 0) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const rawMessage = errData.error?.message || errData.error?.status || `HTTP ${res.status}`;

          // On 429: parse retry-after hint and wait, then retry same model
          if (res.status === 429) {
            const retryAfterMatch = rawMessage.match(/(\d+(?:\.\d+)?)\s*s/i);
            const waitSec = retryAfterMatch ? Math.min(Math.ceil(parseFloat(retryAfterMatch[1])), 65) + 3 : 20;
            last429WaitSec = waitSec;
            console.warn(`[Gemini 429] Квота ${model}. Ждём ${waitSec}с (осталось попыток: ${attemptsLeft})...`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue; // retry same model
          }

          // On 503/500/overload: skip to next model immediately
          console.warn(`[Gemini Fallback] Модель ${model} вернула ошибку (${res.status}). Переключаемся...`);
          lastError = new Error(`Модель ${model} (${res.status}): ${rawMessage}`);
          attemptsLeft = 0; // skip remaining retries for this model
          break;
        }

        const data = await res.json();
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const text = parts
          .map(p => p.text || '')
          .filter(Boolean)
          .join('');

        if (!text) {
          lastError = new Error(`Пустой ответ от модели ${model}.`);
          break;
        }

        return text;
      } catch (fetchErr) {
        const errMsg = fetchErr.message || '';
        console.warn(`[Gemini Fallback] Сетевая ошибка ${model}: ${errMsg}.`);
        lastError = fetchErr;
        break;
      }
    }

    // If we exhausted 429 retries on this model, throw QuotaExceededError
    // (don't try other models — they share the same free-tier quota)
    if (last429WaitSec > 0 && attemptsLeft < 0) {
      throw new QuotaExceededError(last429WaitSec, `Квота исчерпана на ${model}. Все модели делят один лимит RPM.`);
    }
  }

  throw lastError || new Error('Не удалось получить ответ ни от одной модели Gemini.');
}

/**
 * Clean and parse JSON from Markdown code blocks or free text
 */
function cleanAndParseJson(raw) {
  let str = raw.trim();
  // 1. Remove markdown code fences if present
  str = str.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/g, '').trim();

  // 2. Direct JSON parse try
  try {
    return JSON.parse(str);
  } catch {}

  // 3. Extract JSON array [...] or object {...} if Gemini output extra commentary
  const firstBracket = str.indexOf('[');
  const lastBracket = str.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidateArray = str.substring(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(candidateArray);
    } catch {}
  }

  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidateObj = str.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidateObj);
    } catch {}
  }

  // 4. Relaxed cleanup for quotes, trailing commas, and unescaped linebreaks
  try {
    const cleaned = str
      .replace(/,\s*([\]}])/g, '$1')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    return JSON.parse(cleaned);
  } catch (err) {
    // 5. Auto-repair truncated JSON: if model stopped mid-string (Unterminated string)
    try {
      let repaired = str.trim();
      // If ends with unclosed string, close the string quote
      const quotesCount = (repaired.match(/(?<!\\)"/g) || []).length;
      if (quotesCount % 2 !== 0) {
        repaired += '"';
      }

      // 5a. If questions array was cut off, try slicing back to the last complete question object
      const lastCompleteObj = repaired.lastIndexOf('},');
      if (lastCompleteObj !== -1) {
        const truncatedSlice = repaired.substring(0, lastCompleteObj + 1) + ']}';
        try {
          const parsed = JSON.parse(truncatedSlice);
          if (parsed && (Array.isArray(parsed.questions) || Array.isArray(parsed))) {
            console.warn('[cleanAndParseJson] Успешно восстановлен обрезанный JSON ответ (отсечена неполная часть).');
            return parsed;
          }
        } catch {}
      }

      // 5b. Balance any remaining open brackets and braces
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;

      for (let i = 0; i < (openBrackets - closeBrackets); i++) repaired += ']';
      for (let i = 0; i < (openBraces - closeBraces); i++) repaired += '}';
      repaired = repaired.replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(repaired);
      if (parsed) return parsed;
    } catch {}

    console.error('Failed to parse JSON string:', str.substring(0, 300));
    throw new Error(`Ошибка разбора JSON от модели: ${err.message}`);
  }
}

/**
 * Analyze Table of Contents (TOC) and construct hierarchical structure
 * Supports Sections (Разделы), Chapters (Главы), and Paragraphs (Параграфы)
 */
/**
 * Deduplicate roadmap items and merge overlapping page ranges for identical topics
 */
export function deduplicateRoadmapItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const result = [];
  const seenQuizTitles = new Map(); // normalized title -> index in result

  for (let idx = 0; idx < rawItems.length; idx++) {
    const raw = rawItems[idx];
    const title = (raw.title || raw.text || '').trim();
    if (!title) continue;

    const isDivider = raw.type === 'divider';
    // Clean normalized title for matching: lowercased, spaces normalized, punctuation trimmed
    const norm = title.toLowerCase().replace(/[\s\-_–—\.]+/g, ' ').trim();

    if (isDivider) {
      // Check if previous item was a divider with identical title
      const last = result[result.length - 1];
      if (last && last.type === 'divider' && last.title.toLowerCase().replace(/[\s\-_–—\.]+/g, ' ').trim() === norm) {
        continue; // skip identical consecutive divider
      }
      // Check if identical divider exists in recent history (within 4 items)
      const recent = result.slice(-4).filter(r => r.type === 'divider');
      if (recent.some(r => r.title.toLowerCase().replace(/[\s\-_–—\.]+/g, ' ').trim() === norm)) {
        continue;
      }
      result.push({
        id: `item-${Date.now()}-${result.length}`,
        type: 'divider',
        title,
        startPage: null,
        endPage: null,
        enabled: true,
        status: 'pending',
        error: null,
        createdQuizId: null
      });
    } else {
      // Quiz item
      const start = parseInt(raw.start_page || raw.startPage) || 1;
      const end = parseInt(raw.end_page || raw.endPage) || (start + 4);

      if (seenQuizTitles.has(norm)) {
        // SAME TOPIC ALREADY EXISTS! Merge the page range instead of creating a duplicate!
        const existingIdx = seenQuizTitles.get(norm);
        const existing = result[existingIdx];
        existing.startPage = Math.min(existing.startPage, start);
        existing.endPage = Math.max(existing.endPage, end);
        console.log(`[Importer] Объединены страницы для темы "${title}": стр. ${existing.startPage}–${existing.endPage}`);
      } else {
        seenQuizTitles.set(norm, result.length);
        result.push({
          id: `item-${Date.now()}-${result.length}`,
          type: 'quiz',
          title,
          startPage: start,
          endPage: Math.max(start, end),
          enabled: true,
          status: 'pending',
          error: null,
          createdQuizId: null
        });
      }
    }
  }

  return result;
}

export async function analyzeTextbookStructure(tocOrPagesText, apiKey, totalPdfPages = 200, preferredModel = null) {
  const systemInstruction = `Ты — эксперт по анализу оглавления и структуры школьных учебников (включая учебники Казахстана).
Твоя задача — извлечь строго хронологическую последовательность разделителей и тестов.

СТРОЖАЙШИЕ ПРАВИЛА УНИКАЛЬНОСТИ И СТРУКТУРЫ:
1. Каждая тема/параграф (quiz) обязана присутствовать в итоговом массиве СТРОГО ОДИН РАЗ.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО дублировать параграфы, даже если их заголовки или колонтитулы повторяются на нескольких страницах текста.
   - Для каждого параграфа определи полный непрерывный диапазон его страниц: "start_page" (первая страница) и "end_page" (последняя страница перед началом следующего параграфа).
2. Разделителями (type: "divider") являются:
   - Разделы (например: "I РАЗДЕЛ. ЦИВИЛИЗАЦИЯ: ОСОБЕННОСТИ РАЗВИТИЯ")
   - Главы (например: "Глава 1. Традиционная система жизнеобеспечения казахов")
   - Разделители не должны повторяться или идти дублями подряд. Один раздел — строго один разделитель.
3. Тестами (type: "quiz") являются конкретные параграфы и темы:
   - Например: "§ 1–2. Развитие кочевого скотоводства и земледелия на территории Казахстана"
   - Например: "§ 3. Традиционное ремесло казахов"
4. Если параграф очень большой (охватывает более 8-10 страниц, либо содержит сдвоенный параграф вроде "§ 1–2"), разбей его на части:
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

  const prompt = `Вот текст первых страниц учебника и оглавления (всего страниц в файле: ${totalPdfPages}):\n\n${tocOrPagesText}\n\nСформируй полную хронологическую структуру книги в виде JSON-массива объектов БЕЗ дублирования параграфов.`;

  const rawJson = await callGemini(prompt, apiKey, systemInstruction, preferredModel);
  const items = cleanAndParseJson(rawJson);

  if (!Array.isArray(items)) {
    throw new Error('Ответ от Gemini не является массивом элементов.');
  }

  // Deduplicate and merge page ranges
  return deduplicateRoadmapItems(items);
}

/**
 * Generate academic quiz for a specific paragraph text
 */
export async function generateQuizForParagraph(paragraphText, paragraphTitle, options = {}, apiKey) {
  const {
    questionsCount = 15,
    questionLimit = 10,
    authorName = 'Афанасиади Анастас',
    preferredModel = null
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

  const rawJson = await callGemini(prompt, apiKey, systemInstruction, preferredModel);
  const quizObj = cleanAndParseJson(rawJson);

  if (!quizObj || !Array.isArray(quizObj.questions) || quizObj.questions.length === 0) {
    throw new Error('Сгенерированный объект теста не содержит валидного списка вопросов.');
  }

  return quizObj;
}

/**
 * Search YouTube educational video for a topic
 */
export async function searchYouTubeVideo(topicTitle, subjectName = 'История Казахстана', apiKey, preferredModel = null) {
  try {
    const cleanTopic = topicTitle.replace(/^§\s*[\d–\-]+(\s*\(ч\.\s*\d+\))?\.?\s*/i, '').trim();
    const prompt = `Найди актуальный, качественный образовательный видеоурок на YouTube по теме:
"${cleanTopic}" (Предмет: ${subjectName}).
Выдай результат строго в JSON формате:
{
  "url": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
  "title": "Видеоурок: ${cleanTopic}"
}`;

    const raw = await callGemini(prompt, apiKey, 'Ты поисковый ассистент образовательного контента на YouTube. Верни строго валидный JSON с реальной ссылкой.', preferredModel || DEFAULT_MODEL, true);
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
