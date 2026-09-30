import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer, X, Copy, Check,
  FileText, Loader2, Download, Users, Key,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resolveImgUrl } from '../lib/imageUtils';
import MathRenderer from './MathRenderer';

// ── Constants ──────────────────────────────────────────────────────────────────
const OPTION_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З'];

// Target maximum content height: 284mm in CSS px.
// Total A4 is 297mm. With 6mm top and 6mm bottom @page print margins, 285mm is available.
// Target 284mm allows maximum questions while guaranteeing 1 page without spilling.
const A4_PRINT_MAX_PX = 284 * (96 / 25.4); // ≈ 1073.4 px

// ── Pure helpers ───────────────────────────────────────────────────────────────
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function createSeededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** Extracts and resolves all image URLs for a question from q.images or legacy fields */
export function extractQuestionImages(q) {
  if (!q) return [];
  if (Array.isArray(q.images) && q.images.length > 0) {
    return q.images.map(img => resolveImgUrl(img)).filter(Boolean);
  }
  if (typeof q.images === 'string' && q.images.trim()) {
    return [resolveImgUrl(q.images.trim())];
  }
  if (q.image) {
    return [resolveImgUrl(q.image)];
  }
  if (q.image_url) {
    return [resolveImgUrl(q.image_url)];
  }
  return [];
}

/**
 * Splits questions between left and right columns balancing visual heights.
 * Accounts for questions with images (which take ~130px more height).
 * Works for any number of questions (even or odd).
 */
export function splitQuestionsBalanced(questions) {
  if (!questions || questions.length === 0) return { left: [], right: [] };
  if (questions.length === 1) return { left: questions, right: [] };

  const getWeight = (q) => {
    let w = 40; // title & spacing
    if (q.question && q.question.length > 50) {
      w += Math.ceil((q.question.length - 50) / 45) * 14;
    }
    w += (q.options?.length || 4) * 16;
    if (q.images && q.images.length > 0) {
      w += 125; // image container + padding
    }
    return w;
  };

  const weights = questions.map(getWeight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let bestK = Math.ceil(questions.length / 2);
  let minDiff = Infinity;
  let runningLeft = 0;

  for (let i = 0; i < questions.length - 1; i++) {
    runningLeft += weights[i];
    const runningRight = totalWeight - runningLeft;
    const diff = Math.abs(runningLeft - runningRight);
    if (diff < minDiff) {
      minDiff = diff;
      bestK = i + 1;
    }
  }

  return {
    left: questions.slice(0, bestK),
    right: questions.slice(bestK),
  };
}

/**
 * Builds a deterministic, limited question set for a given variant.
 * Strictly deterministic based on quiz ID and variantIndex (1–4).
 * Guarantees ≥1 question with an image when the pool contains images.
 */
function buildVariantData(rawQ, quizId, variantIdx, limit) {
  if (!rawQ?.length) return { questions: [], keys: [] };

  const seed = hashString(`${quizId || 'quiz'}_var_${variantIdx}`);
  const rng  = createSeededRandom(seed);

  // 1. Shuffle questions deterministically
  const cloned = rawQ.map(q => ({ ...q }));
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }

  const safeLimit = Math.min(Math.max(1, limit), cloned.length);

  // 2. Guarantee ≥1 image question (if any exist in pool)
  const poolHasImg = cloned.some(q => extractQuestionImages(q).length > 0);
  if (poolHasImg) {
    const chosenHasImg = cloned.slice(0, safeLimit).some(q => extractQuestionImages(q).length > 0);
    if (!chosenHasImg) {
      const srcIdx = cloned.findIndex((q, i) => i >= safeLimit && extractQuestionImages(q).length > 0);
      if (srcIdx !== -1) {
        const dstIdx = Math.floor(rng() * safeLimit);
        [cloned[dstIdx], cloned[srcIdx]] = [cloned[srcIdx], cloned[dstIdx]];
      }
    }
  }

  const chosen = cloned.slice(0, safeLimit);

  // 3. Shuffle options within each question deterministically
  const finalQ = chosen.map((q, qi) => {
    const opts = (q.options || []).map((text, oi) => ({ text, isCorrect: oi === q.correctIndex }));
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    const corr = opts.findIndex(o => o.isCorrect);
    const resolvedImgs = extractQuestionImages(q);
    return {
      number: qi + 1,
      question: q.question,
      options: opts.map(o => o.text),
      images: resolvedImgs,
      image: resolvedImgs[0] || null,
      correctIndex: corr,
      correctLetter: corr >= 0 ? OPTION_LETTERS[corr] : '?',
    };
  });

  return { questions: finalQ, keys: finalQ.map(q => ({ num: q.number, letter: q.correctLetter })) };
}

/** Attempt to fetch an image and return its base64 data-URL (for html2canvas / PDF). */
async function imageToBase64(src) {
  if (!src || src.startsWith('data:')) return src;

  // 1. Direct fetch (handles same-origin and relative proxy /api/get-image)
  try {
    const res = await fetch(src);
    if (res.ok) {
      const blob = await res.blob();
      const b64 = await new Promise((ok) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = () => ok(null);
        r.readAsDataURL(blob);
      });
      if (b64) return b64;
    }
  } catch { /* proceed to external proxies */ }

  // 2. Proxies if external image blocked by CORS
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(src)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(src)}`,
  ];
  for (const url of proxies) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) continue;
      const blob = await res.blob();
      const b64 = await new Promise((ok) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = () => ok(null);
        r.readAsDataURL(blob);
      });
      if (b64) return b64;
    } catch { /* try next proxy */ }
  }
  return src; // keep src as fallback
}

// ── Component ──────────────────────────────────────────────────────────────────
const PrintableQuizModal = ({ isOpen, onClose, quiz, quizContent, initialShowKeys = false }) => {
  // ── state ──────────────────────────────────────────────────────────────────
  const [variantIndex, setVariantIndex]   = useState(1);
  const [keysMode, setKeysMode]           = useState('none'); // 'none' (default, clean sheet) | 'all' (all 4 variants) | 'single' (only this variant)
  const [classTeacherMasterKey, setClassTeacherMasterKey] = useState(false); // default: false (all class sheets without keys)
  const [showKeysView, setShowKeysView]   = useState(initialShowKeys);
  const [keysViewVariant, setKeysViewVariant] = useState('all'); // 'all' | 1 | 2 | 3 | 4
  const [copiedKeys, setCopiedKeys]       = useState(false);
  const [loading, setLoading]             = useState(false);
  const [savingPdf, setSavingPdf]         = useState(false);
  const [loadedContent, setLoadedContent] = useState(null);
  const [loadedSection, setLoadedSection] = useState(null);

  // Sync initialShowKeys when modal opens
  useEffect(() => {
    if (isOpen && initialShowKeys) {
      setShowKeysView(true);
    }
  }, [isOpen, initialShowKeys]);

  // Auto-fit (no 14-question limit: auto-fits maximum questions that fit on one A4 sheet)
  const [fittedLimit, setFittedLimit]     = useState(14);
  const [measuring, setMeasuring]         = useState(false);
  const [remeasureToken, setRemeasureToken] = useState(0); // bumped after images load

  // Class print
  const [showClassModal, setShowClassModal]     = useState(false);
  const [classCount, setClassCount]             = useState('');
  const [classPrintSheets, setClassPrintSheets] = useState(null);
  const [isPrintingClass, setIsPrintingClass]   = useState(false);

  // DOM refs
  const sheetRef = useRef(null);
  const mRef1 = useRef(null); const mRef2 = useRef(null);
  const mRef3 = useRef(null); const mRef4 = useRef(null);
  const measureRefs = [mRef1, mRef2, mRef3, mRef4];

  // debounce helper for image-load re-trigger
  const imgLoadTimer = useRef(null);
  const triggerImgRemeasure = () => {
    clearTimeout(imgLoadTimer.current);
    imgLoadTimer.current = setTimeout(() => setRemeasureToken(t => t + 1), 120);
  };

  // ── data fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !quiz?.id) return;
    const hasQ       = quizContent?.questions?.length > 0;
    const hasInlineQ = quiz?.content?.questions?.length > 0;
    if (!hasQ && !hasInlineQ && !loadedContent) {
      setLoading(true);
      supabase
        .from('quizzes')
        .select('content, quiz_sections(name, quiz_classes(name))')
        .eq('id', quiz.id).single()
        .then(({ data, error }) => {
          if (!error && data) {
            if (data.content)       setLoadedContent(data.content);
            if (data.quiz_sections) setLoadedSection(data.quiz_sections);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, quiz?.id, quizContent, quiz?.content, loadedContent]);

  const rawQuestions = useMemo(
    () => quizContent?.questions || loadedContent?.questions || quiz?.content?.questions || [],
    [quizContent, loadedContent, quiz]
  );
  const subjectName = quiz?.quiz_sections?.name || loadedSection?.name || '';
  const className   = quiz?.quiz_sections?.quiz_classes?.name || loadedSection?.quiz_classes?.name || '';

  // ── auto-fit: reset when questions/modal change ────────────────────────────
  useEffect(() => {
    if (isOpen && rawQuestions.length > 0) {
      // Start at maximum available questions — let the auto-fit finder detect true physical capacity
      setFittedLimit(rawQuestions.length);
      setMeasuring(true);
    }
    if (!isOpen) setMeasuring(false);
  }, [isOpen, rawQuestions.length]);

  // Re-measure when keysMode changes (reset to rawQuestions.length to find true maximum for this mode)
  useEffect(() => {
    if (!isOpen || !rawQuestions.length) return;
    setFittedLimit(rawQuestions.length);
    setMeasuring(true);
  }, [keysMode]);

  // ── auto-fit: DOM measurement (runs after every render while measuring) ─────
  useLayoutEffect(() => {
    if (!isOpen || !measuring) return;
    const overflows = measureRefs.map(
      r => (r.current ? r.current.scrollHeight - A4_PRINT_MAX_PX : 0)
    );
    const maxOverflow = Math.max(...overflows, 0);

    if (maxOverflow > 1 && fittedLimit > 1) {
      // Step down proportional to overflow, avoiding React max update depth
      const step = maxOverflow > 120 ? Math.ceil(maxOverflow / 60) : 1;
      setFittedLimit(prev => Math.max(1, prev - step));
    } else {
      setMeasuring(false);
    }
  }); // intentionally no dep array — runs every render while measuring=true

  // Re-run measurement when images finish loading (remeasureToken changes)
  useEffect(() => {
    if (remeasureToken === 0 || !isOpen) return;
    setMeasuring(true);
  }, [remeasureToken, isOpen]);

  // ── derived data ────────────────────────────────────────────────────────────
  // Compute all 4 deterministic variants once
  const allVariantData = useMemo(() => {
    if (!rawQuestions.length) return [];
    return [1, 2, 3, 4].map(v => buildVariantData(rawQuestions, quiz?.id, v, fittedLimit));
  }, [rawQuestions, quiz, fittedLimit]);

  const variantData = allVariantData[variantIndex - 1] || { questions: [], keys: [] };
  const measureData = allVariantData;
  const totalQ = variantData.questions.length;

  // ── handlers ────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  const handleSavePdf = async () => {
    if (!sheetRef.current) return;
    setSavingPdf(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const safeName = quiz.title.replace(/[^\u0430-\u044f\u0451a-z0-9_\-]/gi, '_');
      const filename = `${safeName}_Вариант_${variantIndex}.pdf`;

      // Clone to offscreen with strict 1-page constraints
      const clone   = sheetRef.current.cloneNode(true);
      clone.style.maxHeight = '284mm';
      clone.style.overflow = 'hidden';
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:fixed;left:0;top:0;width:794px;height:1120px;max-height:1120px;background:#fff;z-index:-99999;overflow:hidden;';
      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      // Convert images to base64 so html2canvas can render them cleanly
      const imgs = Array.from(clone.querySelectorAll('img.sheet-question-image'));
      await Promise.all(imgs.map(async img => {
        const b64 = await imageToBase64(img.src);
        if (b64) img.src = b64;
      }));

      try {
        await html2pdf()
          .set({
            margin: 0,
            filename,
            image: { type: 'jpeg', quality: 0.99 },
            html2canvas: {
              scale: 2, useCORS: true, allowTaint: false,
              logging: false,
              width: 794, height: 1120,
              windowWidth: 794, windowHeight: 1120,
              scrollY: 0, scrollX: 0,
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css'] },
          })
          .from(clone)
          .save();
      } finally {
        document.body.removeChild(wrapper);
      }
    } catch (e) { console.error('PDF error:', e); }
    finally { setSavingPdf(false); }
  };

  const handleCopyKeys = () => {
    if (keysMode === 'all') {
      const lines = allVariantData.map((d, i) => {
        const str = d.keys.map(k => `${k.num}: ${k.letter}`).join(' | ');
        return `ВАРИАНТ ${i + 1}:\n${str}`;
      });
      navigator.clipboard.writeText(
        `Ключи к тесту "${quiz.title}" (${subjectName ? subjectName + ', ' : ''}Все 4 варианта):\n\n${lines.join('\n\n')}`
      );
    } else {
      const text = variantData.keys.map(k => `${k.num}: ${k.letter}`).join(' | ');
      navigator.clipboard.writeText(
        `Ключи к тесту "${quiz.title}" (${subjectName ? subjectName + ', ' : ''}Вариант ${variantIndex}):\n${text}`
      );
    }
    setCopiedKeys(true);
    setTimeout(() => setCopiedKeys(false), 2000);
  };

  const handleClassPrint = () => {
    const n = Math.max(1, parseInt(classCount) || 1);
    const sheets = Array.from({ length: n }, (_, i) => ({
      variantIndex: (i % 4) + 1,
      sheetKeysMode: classTeacherMasterKey ? (i === 0 ? 'all' : 'none') : keysMode,
    }));
    setClassPrintSheets(sheets);
    setShowClassModal(false);
    setIsPrintingClass(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => { setClassPrintSheets(null); setIsPrintingClass(false); }, 1000);
    }, 500);
  };

  // ── sub-renderers ───────────────────────────────────────────────────────────
  /**
   * Renders one question with automatic image sizing.
   */
  const renderQuestion = (q, forMeasurement = false) => {
    return (
      <div key={q.number} className="sheet-question-item">
        {/* Question text */}
        <div className="sheet-question-title">
          <span className="q-num">{q.number}.</span>
          <span className="q-text"><MathRenderer text={q.question} /></span>
        </div>

        {/* Image(s) (shown above options, auto-sized) */}
        {q.images && q.images.length > 0 && (
          <div className="question-image-wrap">
            <div className="question-image-bg">
              {q.images.map((imgSrc, imgIdx) => (
                <img
                  key={imgIdx}
                  className="sheet-question-image"
                  src={imgSrc}
                  alt={`Q${q.number} img ${imgIdx + 1}`}
                  onLoad={forMeasurement ? triggerImgRemeasure : undefined}
                  onError={forMeasurement ? triggerImgRemeasure : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Options */}
        <div className="sheet-options-list">
          {q.options.map((optText, oi) => (
            <div key={oi} className="sheet-option-row">
              <span className="sheet-option-letter">{OPTION_LETTERS[oi]})</span>
              <span className="sheet-option-text"><MathRenderer text={optText} /></span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /** Renders a full A4 sheet. Pass ref for the displayed sheet. */
  const renderSheet = (data, vIdx, ref = null, forMeasurement = false, customKeysMode = null) => {
    const { questions, keys } = data;
    const { left, right } = splitQuestionsBalanced(questions);
    const effectiveKeysMode = customKeysMode !== null ? customKeysMode : keysMode;

    return (
      <div ref={ref} className="a4-sheet">
        {/* Header */}
        <header className="sheet-header">
          <div className="sheet-header-left">
            <h1 className="sheet-quiz-title">{quiz.title}</h1>
            {(subjectName || className) && (
              <div className="sheet-subject-subtitle">
                {subjectName && <span>{subjectName}</span>}
                {subjectName && className && <span className="subtitle-dot">•</span>}
                {className && <span>{className}</span>}
              </div>
            )}
            <div className="sheet-student-fields">
              <div className="field-row">
                <span className="field-label">ФИО:</span>
                <span className="field-line"></span>
              </div>
              <div className="field-row-split">
                <div className="field-inline">
                  <span className="field-label">Класс:</span>
                  <span className="field-line short"></span>
                </div>
                <div className="field-inline">
                  <span className="field-label">Дата:</span>
                  <span className="field-line short"></span>
                </div>
              </div>
            </div>
          </div>
          <div className="sheet-header-right">
            <div className="variant-badge">ВАРИАНТ {vIdx}</div>
            <div className="grading-box">
              <div className="grading-row"><span>Баллы:</span><strong>____ / {questions.length}</strong></div>
              <div className="grading-row"><span>Оценка:</span><strong>________</strong></div>
            </div>
          </div>
        </header>

        {/* 2-column questions */}
        <main className="sheet-questions-grid">
          <div className="sheet-column">{left.map(q => renderQuestion(q, forMeasurement))}</div>
          <div className="sheet-column">{right.map(q => renderQuestion(q, forMeasurement))}</div>
        </main>

        {/* Teacher keys footer */}
        {effectiveKeysMode !== 'none' && (
          <footer className="sheet-teacher-cut">
            {effectiveKeysMode === 'all' ? (
              <div className="teacher-key-box all-variants-key-box">
                <div className="key-header">
                  <strong>🔑 КЛЮЧИ ДЛЯ ПРОВЕРКИ (ВСЕ 4 ВАРИАНТА)</strong>
                  <span className="key-subtitle">
                    «{quiz.title}» • {subjectName ? `${subjectName} • ` : ''}Всего: {questions.length} вопр.
                  </span>
                </div>
                <div className="all-keys-list">
                  {allVariantData.map((vData, vi) => (
                    <div key={vi} className="all-keys-row">
                      <span className="all-keys-var-badge">ВАР. {vi + 1}:</span>
                      <div className="all-keys-items">
                        {vData.keys.map(k => (
                          <span key={k.num} className="all-keys-item">
                            <span className="k-n">{k.num}</span>
                            <span className="k-sep">:</span>
                            <span className="k-l">{k.letter}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="teacher-key-box">
                <div className="key-header">
                  <strong>🔑 КЛЮЧИ ДЛЯ ПРОВЕРКИ</strong>
                  <span className="key-subtitle">
                    «{quiz.title}» • {subjectName ? `${subjectName} • ` : ''}
                    <strong>ВАРИАНТ {vIdx}</strong> • Всего: {questions.length} вопр.
                  </span>
                </div>
                <div className="key-grid">
                  {keys.map(k => (
                    <div key={k.num} className="key-badge">
                      <span className="key-num">{k.num}</span>
                      <span className="key-letter">{k.letter}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </footer>
        )}
      </div>
    );
  };

  // ── guard ──────────────────────────────────────────────────────────────────
  if (!isOpen || !quiz) return null;

  // Variant distribution for class modal preview
  const variantCounts = (() => {
    const n = parseInt(classCount) || 0;
    if (!n) return null;
    return [1, 2, 3, 4].map(v => ({
      v, count: Math.floor(n / 4) + (v <= n % 4 ? 1 : 0),
    })).filter(x => x.count > 0);
  })();

  // ── JSX ────────────────────────────────────────────────────────────────────
  const modalContent = (
    <div
      className={`printable-modal-backdrop${isPrintingClass ? ' class-print-active' : ''}`}
      onClick={isPrintingClass ? undefined : onClose}
    >
      {/* Class print sheets (hidden on screen, shown in print) */}
      {classPrintSheets && (
        <div className="class-sheets-container">
          {classPrintSheets.map((s, i) => {
            const d = buildVariantData(rawQuestions, quiz?.id, s.variantIndex, fittedLimit);
            return (
              <div key={i} className={i < classPrintSheets.length - 1 ? 'a4-page-break' : ''}>
                {renderSheet(d, s.variantIndex, null, true, s.sheetKeysMode)}
              </div>
            );
          })}
        </div>
      )}

      {/* Main modal */}
      <div className="printable-modal-window" onClick={e => e.stopPropagation()}>

        {/* Toolbar */}
        <div className="printable-toolbar no-print">
          <div className="printable-toolbar-top">
            <div className="printable-toolbar-brand">
              <span className="printable-toolbar-title">
                <FileText size={18} style={{ color: 'var(--primary-color)' }} />
                Печать А4
              </span>
              {measuring && (
                <span className="fitted-badge measuring">
                  <Loader2 size={9} style={{ display:'inline', verticalAlign:'middle' }} /> Подбор…
                </span>
              )}
              {!measuring && fittedLimit < (rawQuestions.length || 0) && (
                <span className="fitted-badge">📐 {fittedLimit} из {rawQuestions.length} вопр.</span>
              )}
              {!measuring && rawQuestions.length > 0 && fittedLimit >= rawQuestions.length && (
                <span className="fitted-badge fitted-badge-all">✓ Все {fittedLimit} вопр.</span>
              )}
            </div>
            <button type="button" className="close-btn mobile-close-btn" onClick={onClose} aria-label="Закрыть">
              <X size={18} />
            </button>
          </div>

          <div className="printable-toolbar-controls">
            <div className="variant-pills">
              {[1, 2, 3, 4].map(n => (
                <button key={n} type="button"
                  className={`variant-pill${variantIndex === n ? ' active' : ''}`}
                  onClick={() => setVariantIndex(n)}>
                  Вар. {n}
                </button>
              ))}
            </div>
            <div className="keys-mode-selector">
              <span className="keys-mode-label">Ключи:</span>
              <button
                type="button"
                className={`keys-pill${keysMode === 'none' ? ' active' : ''}`}
                onClick={() => setKeysMode('none')}
                title="Печать без ключей (по умолчанию)"
              >
                Без ключей
              </button>
              <button
                type="button"
                className={`keys-pill${keysMode === 'all' ? ' active' : ''}`}
                onClick={() => setKeysMode('all')}
                title="Ключи для всех 4 вариантов внизу листа"
              >
                Все 4 вар.
              </button>
              <button
                type="button"
                className={`keys-pill${keysMode === 'single' ? ' active' : ''}`}
                onClick={() => setKeysMode('single')}
                title="Ключи только для выбранного варианта"
              >
                1 вар.
              </button>
            </div>
          </div>

          <div className="printable-toolbar-actions">
            <button
              type="button"
              className="toolbar-btn keys-view-btn"
              onClick={() => setShowKeysView(true)}
              disabled={totalQ === 0}
              title="Открыть ключи для проверки на экране телефона или ПК"
            >
              <Key size={14} style={{ color: '#d97706' }} /> Ключи
            </button>
            <button type="button" className="toolbar-btn class-print-btn"
              onClick={() => setShowClassModal(true)} disabled={totalQ === 0}>
              <Users size={14} /> На класс…
            </button>
            <button type="button" className="toolbar-btn" onClick={handleCopyKeys} disabled={totalQ === 0}>
              {copiedKeys ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
              {copiedKeys ? 'Скопировано' : 'Скопировать'}
            </button>
            <button type="button" className="toolbar-btn" onClick={handleSavePdf}
              disabled={loading || savingPdf || totalQ === 0}>
              {savingPdf ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
              {savingPdf ? 'PDF…' : 'PDF'}
            </button>
            <button type="button" className="print-primary-btn" onClick={handlePrint}
              disabled={loading || totalQ === 0}>
              <Printer size={16} /> Печать
            </button>
            <button type="button" className="close-btn desktop-close-btn" onClick={onClose} aria-label="Закрыть">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Teacher Keys View (mobile-friendly digital answer sheet) */}
        {showKeysView && (
          <div className="class-modal-overlay" onClick={() => setShowKeysView(false)}>
            <div className="teacher-keys-dialog" onClick={e => e.stopPropagation()}>
              <div className="keys-dialog-header">
                <div className="keys-dialog-title-block">
                  <h3 className="keys-dialog-title">
                    <Key size={18} style={{ color: '#d97706', marginRight: 7, verticalAlign: 'middle' }} />
                    Ключи для проверки
                  </h3>
                  <div className="keys-dialog-subtitle">
                    «{quiz.title}» • {totalQ} вопр.
                  </div>
                </div>
                <div className="keys-dialog-header-actions">
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={handleCopyKeys}
                  >
                    {copiedKeys ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                    {copiedKeys ? 'Скопировано' : 'Скопировать'}
                  </button>
                  <button
                    type="button"
                    className="close-btn"
                    onClick={() => setShowKeysView(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Variant Selector Tabs */}
              <div className="keys-dialog-tabs">
                <button
                  type="button"
                  className={`keys-tab${keysViewVariant === 'all' ? ' active' : ''}`}
                  onClick={() => setKeysViewVariant('all')}
                >
                  Все 4 варианта
                </button>
                {[1, 2, 3, 4].map(v => (
                  <button
                    key={v}
                    type="button"
                    className={`keys-tab${keysViewVariant === v ? ' active' : ''}`}
                    onClick={() => setKeysViewVariant(v)}
                  >
                    Вар. {v}
                  </button>
                ))}
              </div>

              {/* Keys Cards Container */}
              <div className="keys-cards-container">
                {allVariantData.map((vData, vi) => {
                  const varNum = vi + 1;
                  if (keysViewVariant !== 'all' && keysViewVariant !== varNum) return null;

                  return (
                    <div key={vi} className="teacher-key-card">
                      <div className="key-card-header">
                        <span className="key-card-badge">ВАРИАНТ {varNum}</span>
                        <span className="key-card-count">{vData.keys.length} ответов</span>
                      </div>
                      <div className="key-card-grid">
                        {vData.keys.map(k => (
                          <div key={k.num} className="key-tile">
                            <span className="key-tile-num">{k.num}</span>
                            <span className="key-tile-letter">{k.letter}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Class-print dialog */}
        {showClassModal && (
          <div className="class-modal-overlay" onClick={() => setShowClassModal(false)}>
            <div className="class-modal" onClick={e => e.stopPropagation()}>
              <h3 className="class-modal-title">
                <Users size={17} style={{ marginRight: 7, verticalAlign: 'middle' }} />
                Печать на класс
              </h3>
              <p className="class-modal-desc">
                Введите количество учеников. Варианты чередуются (1→2→3→4→1…), чтобы соседи не списали. По стандарту все листы печатаются без ключей.
              </p>
              <div className="class-modal-row">
                <input type="number" className="class-count-input"
                  min="1" max="120" placeholder="Кол-во учеников"
                  value={classCount} onChange={e => setClassCount(e.target.value)} autoFocus
                  onKeyDown={e => e.key === 'Enter' && parseInt(classCount) > 0 && handleClassPrint()}
                />
                <button type="button" className="print-primary-btn" onClick={handleClassPrint}
                  disabled={!classCount || parseInt(classCount) < 1}>
                  <Printer size={14} />
                  {classCount && parseInt(classCount) > 0
                    ? `Печать (${parseInt(classCount)} лист.)` : 'Печать'}
                </button>
                <button type="button" className="toolbar-btn"
                  onClick={() => setShowClassModal(false)}>Отмена</button>
              </div>

              <div className="class-modal-options">
                <label className="class-checkbox-label">
                  <input
                    type="checkbox"
                    checked={classTeacherMasterKey}
                    onChange={e => setClassTeacherMasterKey(e.target.checked)}
                  />
                  <span>
                    Добавить <strong>1-й лист с ключами для всех 4-х вариантов</strong> (для учителя), остальные без ключей
                  </span>
                </label>
              </div>

              {variantCounts && (
                <div className="class-modal-preview">
                  {variantCounts.map(({ v, count }) => (
                    <span key={v} className="variant-count-badge">Вар.{v} × {count}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Preview area */}
        <div className="printable-preview-area">
          {loading ? (
            <div className="printable-loading">
              <Loader2 size={32} className="spinner" style={{ color: '#4f46e5', marginBottom: 12 }} />
              <div>Загрузка вопросов…</div>
            </div>
          ) : totalQ === 0 ? (
            <div className="printable-loading">
              <p style={{ margin: 0, fontWeight: 'bold' }}>В этом тесте пока нет вопросов.</p>
            </div>
          ) : (
            renderSheet(variantData, variantIndex, sheetRef, false)
          )}
        </div>
      </div>

      {/* Hidden measurement sheets (4 variants, forMeasurement=true) */}
      {isOpen && rawQuestions.length > 0 && (
        <div className="measurement-container" aria-hidden="true">
          {measureData.map((d, i) =>
            d ? (
              <div key={i}>
                {renderSheet(d, i + 1, measureRefs[i], true)}
              </div>
            ) : null
          )}
        </div>
      )}

      {/* ════════════════ STYLES ════════════════ */}
      <style>{`
        /* ── Backdrop / Window ──────────────────────────────────── */
        .printable-modal-backdrop {
          position: fixed; inset: 0;
          background: rgba(15,23,42,0.75);
          backdrop-filter: blur(6px);
          z-index: 99999;
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
        }
        .printable-modal-window {
          background: #f1f5f9;
          width: 100%; max-width: 960px; height: 95vh;
          border-radius: 16px;
          display: flex; flex-direction: column;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);
          position: relative;
        }

        /* ── Toolbar ────────────────────────────────────────────── */
        .printable-toolbar {
          background: #fff;
          padding: 10px 16px;
          border-bottom: 1px solid #e2e8f0;
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 10px; flex-shrink: 0;
        }
        .printable-toolbar-top {
          display: flex; align-items: center; gap: 8px;
        }
        .printable-toolbar-brand {
          display: flex; align-items: center; gap: 7px;
        }
        .printable-toolbar-controls, .printable-toolbar-actions {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .mobile-close-btn { display: none; }
        .desktop-close-btn { display: flex; }
        .printable-toolbar-title {
          font-weight: 700; font-size: 0.92rem; color: #1e293b;
          display: flex; align-items: center; gap: 7px; margin-right: 4px;
        }
        .fitted-badge {
          font-size: 0.68rem; padding: 2px 7px; border-radius: 20px;
          font-weight: 600; display: inline-flex; align-items: center; gap: 3px;
          background: #e0e7ff; color: #4338ca;
        }
        .fitted-badge.measuring { background: #fef9c3; color: #854d0e; }
        .fitted-badge.fitted-badge-all { background: #dcfce7; color: #15803d; }

        .variant-pills {
          display: flex; background: #f1f5f9;
          padding: 3px; border-radius: 10px; gap: 3px;
        }
        .variant-pill {
          padding: 5px 11px; font-size: 0.73rem; font-weight: 600;
          border-radius: 7px; border: none; background: transparent;
          color: #64748b; cursor: pointer; transition: all 0.15s;
        }
        .variant-pill.active {
          background: #fff; color: #4f46e5;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .keys-mode-selector {
          display: flex; align-items: center; background: #f1f5f9;
          padding: 3px; border-radius: 10px; gap: 3px;
        }
        .keys-mode-label {
          font-size: 0.72rem; font-weight: 700; color: #64748b;
          padding: 0 4px 0 6px;
        }
        .keys-pill {
          padding: 5px 9px; font-size: 0.72rem; font-weight: 600;
          border-radius: 7px; border: none; background: transparent;
          color: #64748b; cursor: pointer; transition: all 0.15s;
          white-space: nowrap;
        }
        .keys-pill:hover { color: #1e293b; }
        .keys-pill.active {
          background: #fff; color: #0284c7;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          font-weight: 700;
        }

        .toolbar-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 11px; font-size: 0.73rem; font-weight: 600;
          background: #f8fafc; border: 1px solid #cbd5e1; color: #334155;
          border-radius: 8px; cursor: pointer; transition: background 0.15s;
        }
        .toolbar-btn:hover { background: #e2e8f0; }
        .toolbar-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .keys-view-btn { border-color: #fcd34d; background: #fffbeb; color: #b45309; }
        .keys-view-btn:hover { background: #fef3c7; }
        .class-print-btn { border-color: #a5b4fc; color: #4338ca; }
        .class-print-btn:hover { background: #eef2ff; }

        .print-primary-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 7px 15px; font-size: 0.8rem; font-weight: 700;
          background: #4f46e5; color: #fff; border: none;
          border-radius: 9px; cursor: pointer;
          box-shadow: 0 4px 12px rgba(79,70,229,0.3);
          transition: background 0.15s;
        }
        .print-primary-btn:hover { background: #4338ca; }
        .print-primary-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .close-btn {
          background: #f1f5f9; border: none;
          width: 32px; height: 32px; border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          color: #64748b; cursor: pointer;
        }
        .close-btn:hover { background: #e2e8f0; color: #0f172a; }

        /* ── Preview ────────────────────────────────────────────── */
        .printable-preview-area {
          flex: 1; overflow-y: auto; padding: 20px;
          display: flex; justify-content: center;
          background: #cbd5e1;
        }
        .printable-loading {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          min-height: 300px; color: #334155; font-size: 0.9rem;
        }

        /* ── Class-print modal ──────────────────────────────────── */
        .class-modal-overlay {
          position: absolute; inset: 0;
          background: rgba(15,23,42,0.45);
          z-index: 10; display: flex; align-items: center; justify-content: center;
          border-radius: 16px;
        }
        .class-modal {
          background: #fff; border-radius: 14px; padding: 24px;
          max-width: 420px; width: 90%;
          box-shadow: 0 20px 40px rgba(0,0,0,0.18);
        }
        .class-modal-title {
          font-size: 1.05rem; font-weight: 700; color: #0f172a;
          margin: 0 0 8px; display: flex; align-items: center;
        }
        .class-modal-desc {
          font-size: 0.81rem; color: #64748b; margin: 0 0 16px; line-height: 1.55;
        }
        .class-modal-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .class-count-input {
          width: 115px; padding: 8px 12px;
          border: 1.5px solid #cbd5e1; border-radius: 8px;
          font-size: 0.9rem; font-weight: 600; color: #0f172a; outline: none;
          transition: border-color 0.15s;
        }
        .class-count-input:focus { border-color: #4f46e5; }
        .class-modal-preview { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 14px; }
        .variant-count-badge {
          font-size: 0.75rem; font-weight: 700; padding: 3px 9px;
          background: #e0e7ff; color: #4338ca; border-radius: 6px;
        }
        .class-modal-options {
          margin-top: 14px; padding-top: 12px;
          border-top: 1px solid #e2e8f0;
        }
        .class-checkbox-label {
          display: flex; align-items: flex-start; gap: 9px;
          font-size: 0.81rem; color: #334155; cursor: pointer;
          user-select: none; line-height: 1.4;
        }
        .class-checkbox-label input[type="checkbox"] {
          margin-top: 2px; width: 16px; height: 16px;
          accent-color: #4f46e5; cursor: pointer; flex-shrink: 0;
        }

        /* ── Teacher Keys Dialog ────────────────────────────────── */
        .teacher-keys-dialog {
          background: #fff; border-radius: 16px; padding: 20px;
          max-width: 660px; width: 92%; max-height: 85vh;
          display: flex; flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35);
          overflow: hidden;
        }
        .keys-dialog-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 12px; gap: 10px;
        }
        .keys-dialog-title {
          margin: 0; font-size: 1.1rem; font-weight: 700; color: #0f172a;
          display: flex; align-items: center;
        }
        .keys-dialog-subtitle { font-size: 0.8rem; color: #64748b; margin-top: 2px; }
        .keys-dialog-header-actions { display: flex; align-items: center; gap: 8px; }
        .keys-dialog-tabs {
          display: flex; gap: 5px; background: #f1f5f9; padding: 4px;
          border-radius: 10px; margin-bottom: 14px; overflow-x: auto; flex-shrink: 0;
        }
        .keys-tab {
          padding: 6px 12px; font-size: 0.78rem; font-weight: 600;
          border-radius: 7px; border: none; background: transparent;
          color: #64748b; cursor: pointer; white-space: nowrap; transition: all 0.15s;
        }
        .keys-tab:hover { color: #1e293b; }
        .keys-tab.active {
          background: #fff; color: #d97706;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-weight: 700;
        }
        .keys-cards-container {
          flex: 1; overflow-y: auto; display: flex; flex-direction: column;
          gap: 12px; padding-right: 4px;
        }
        .teacher-key-card {
          border: 1.5px solid #e2e8f0; border-radius: 12px;
          padding: 12px; background: #f8fafc;
        }
        .key-card-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 10px;
        }
        .key-card-badge {
          font-size: 0.78rem; font-weight: 800; background: #1e293b;
          color: #fff; padding: 3px 8px; border-radius: 6px;
        }
        .key-card-count { font-size: 0.75rem; color: #64748b; font-weight: 600; }
        .key-card-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .key-tile {
          display: inline-flex; border: 1.5px solid #0f172a; border-radius: 6px;
          overflow: hidden; font-size: 0.85rem; font-weight: 700; background: #fff;
        }
        .key-tile-num {
          background: #f1f5f9; padding: 4px 7px; color: #475569;
          border-right: 1.5px solid #0f172a; min-width: 18px; text-align: center;
        }
        .key-tile-letter {
          background: #fff; padding: 4px 8px; color: #d97706;
          font-weight: 800; min-width: 18px; text-align: center;
        }

        /* ── Hidden containers ──────────────────────────────────── */
        .measurement-container {
          position: fixed; left: -9999px; top: 0;
          width: 210mm; visibility: hidden;
          pointer-events: none; z-index: -9999; overflow: hidden;
        }
        .measurement-container .a4-sheet {
          min-height: 0 !important;
          height: auto !important;
          max-height: none !important;
          box-shadow: none !important;
          padding: 0 10mm !important;
        }
        .class-sheets-container { display: none; }
        .a4-page-break { page-break-after: always; break-after: page; }

        /* ════════════════ A4 SHEET STYLES ══════════════════════ */
        .a4-sheet {
          background: #fff; color: #000;
          width: 210mm; min-height: 297mm;
          padding: 6mm 10mm 6mm 10mm;
          box-sizing: border-box;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
          display: flex; flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            "Helvetica Neue", Arial, sans-serif;
        }

        /* Header */
        .sheet-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #000;
          padding-bottom: 6px; margin-bottom: 8px; gap: 12px;
        }
        .sheet-header-left { flex: 1; }
        .sheet-quiz-title {
          font-size: 14.5px; font-weight: 800; margin: 0 0 2px;
          color: #000; line-height: 1.25; letter-spacing: -0.2px;
        }
        .sheet-subject-subtitle {
          font-size: 10.5px; color: #4b5563; margin-bottom: 6px;
          font-weight: 600; display: flex; align-items: center; gap: 5px;
        }
        .subtitle-dot { opacity: 0.5; }
        .sheet-student-fields { display: flex; flex-direction: column; gap: 4px; }
        .field-row { display: flex; align-items: flex-end; gap: 6px; width: 100%; }
        .field-row-split { display: flex; gap: 18px; }
        .field-inline { display: flex; align-items: flex-end; gap: 6px; }
        .field-label { font-size: 10.5px; font-weight: 700; color: #000; }
        .field-line {
          flex: 1; border-bottom: 1px solid #000;
          height: 12px; min-width: 130px;
        }
        .field-line.short { min-width: 65px; width: 75px; }
        .sheet-header-right {
          display: flex; flex-direction: column; align-items: flex-end; gap: 5px;
        }
        .variant-badge {
          background: #000; color: #fff;
          font-size: 10.5px; font-weight: 800; padding: 3px 9px;
          border-radius: 4px; letter-spacing: 0.5px;
        }
        .grading-box {
          border: 1.5px solid #000; border-radius: 4px;
          padding: 3px 7px; font-size: 10.5px; min-width: 110px;
        }
        .grading-row { display: flex; justify-content: space-between; line-height: 1.35; }

        /* Questions grid */
        .sheet-questions-grid {
          flex: 1;
          display: grid; grid-template-columns: 1fr 1fr;
          column-gap: 14px; align-content: start;
        }
        .sheet-column { display: flex; flex-direction: column; gap: 7px; }
        .sheet-question-item { page-break-inside: avoid; break-inside: avoid; }
        .sheet-question-title {
          display: flex; align-items: flex-start; gap: 4px;
          margin-bottom: 3px;
          font-size: 11px; font-weight: 700; line-height: 1.25; color: #000;
        }
        .q-num { font-weight: 800; flex-shrink: 0; }
        .q-text { flex: 1; }

        /* ── IMAGE BLOCK (auto-adjusting) ────────────────────────── */
        .question-image-wrap {
          margin: 3px 0 4px 0;
          display: flex;
          justify-content: flex-start;
          width: 100%;
        }
        /* White background under image — handles transparent PNGs cleanly */
        .question-image-bg {
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 2px;
          box-sizing: border-box;
          max-width: 100%;
          height: 30mm;
          max-height: 30mm;
          overflow: hidden;
        }
        .sheet-question-image {
          display: block;
          max-width: 100%;
          max-height: 28mm;
          width: auto;
          height: auto;
          object-fit: contain;
          margin: 0 auto;
        }

        /* Options */
        .sheet-options-list {
          display: flex; flex-direction: column; gap: 2px; padding-left: 4px;
        }
        .sheet-option-row {
          display: flex; align-items: flex-start; gap: 5px;
          font-size: 10.5px; line-height: 1.25; color: #111;
        }
        .sheet-option-letter { font-weight: 700; color: #000; flex-shrink: 0; margin-right: 2px; }
        .sheet-option-text { flex: 1; }

        /* Teacher keys footer */
        .sheet-teacher-cut {
          margin-top: auto; padding-top: 3px;
          page-break-inside: avoid; break-inside: avoid;
        }
        .teacher-key-box {
          border-top: 1.5px dashed #374151;
          padding: 3px 2px 0 2px;
        }
        .key-header {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 9px; margin-bottom: 3px;
          border-bottom: 1px solid #e5e7eb; padding-bottom: 2px;
        }
        .key-subtitle { font-size: 9px; color: #444; }
        .key-grid { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
        .key-badge {
          display: inline-flex; border: 1px solid #000;
          border-radius: 3px; overflow: hidden; font-size: 9.5px; font-weight: 700;
        }
        .key-num {
          background: #eee; padding: 2px 4px;
          border-right: 1px solid #000; color: #222;
        }
        .key-letter { background: #fff; padding: 2px 5px; color: #000; font-weight: 800; }

        .all-variants-key-box {
          border-top: 1.5px dashed #374151;
          padding: 3px 2px 0 2px !important;
        }
        .all-keys-list {
          display: flex; flex-direction: column; gap: 3px;
        }
        .all-keys-row {
          display: flex; align-items: center; gap: 6px;
          font-size: 8.5px; line-height: 1.15;
        }
        .all-keys-var-badge {
          font-weight: 800; font-size: 8px;
          color: #000; background: #e5e7eb;
          padding: 1px 4px; border-radius: 3px;
          border: 1px solid #9ca3af;
          white-space: nowrap; flex-shrink: 0;
        }
        .all-keys-items {
          display: flex; flex-wrap: wrap; gap: 3px; align-items: center;
        }
        .all-keys-item {
          display: inline-flex; align-items: center;
          border: 1px solid #000; border-radius: 2.5px;
          font-size: 8.5px; font-weight: 700; overflow: hidden;
          background: #fff;
        }
        .all-keys-item .k-n {
          background: #eee; padding: 1px 3px;
          border-right: 1px solid #000; color: #222;
        }
        .all-keys-item .k-sep { display: none; }
        .all-keys-item .k-l {
          padding: 1px 4px; color: #000; font-weight: 800;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }

        /* ── Mobile / PWA Responsive styles ─────────────────────── */
        @media (max-width: 768px) {
          .printable-modal-backdrop {
            padding: 0 !important;
            align-items: stretch !important;
            justify-content: stretch !important;
          }
          .printable-modal-window {
            width: 100vw !important;
            max-width: 100% !important;
            height: 100% !important;
            height: 100dvh !important;
            max-height: 100dvh !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding-top: env(safe-area-inset-top, 0px) !important;
            padding-bottom: env(safe-area-inset-bottom, 0px) !important;
            padding-left: env(safe-area-inset-left, 0px) !important;
            padding-right: env(safe-area-inset-right, 0px) !important;
          }

          .mobile-close-btn { display: flex !important; }
          .desktop-close-btn { display: none !important; }

          .printable-toolbar {
            padding: 8px 12px !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 7px !important;
          }
          .printable-toolbar-top {
            width: 100% !important;
            justify-content: space-between !important;
          }
          .printable-toolbar-controls {
            width: 100% !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            scrollbar-width: none !important;
            padding-bottom: 2px !important;
            flex-wrap: nowrap !important;
            gap: 6px !important;
          }
          .printable-toolbar-controls::-webkit-scrollbar { display: none; }
          .printable-toolbar-actions {
            width: 100% !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            scrollbar-width: none !important;
            padding-bottom: 2px !important;
            flex-wrap: nowrap !important;
            gap: 6px !important;
          }
          .printable-toolbar-actions::-webkit-scrollbar { display: none; }
          .printable-toolbar-actions .toolbar-btn,
          .printable-toolbar-actions .print-primary-btn {
            white-space: nowrap !important;
            flex-shrink: 0 !important;
          }

          .printable-preview-area {
            padding: 10px !important;
            overflow: auto !important;
            -webkit-overflow-scrolling: touch !important;
            display: flex !important;
            justify-content: flex-start !important;
            align-items: flex-start !important;
          }

          .teacher-keys-dialog {
            width: 95% !important;
            max-width: 95% !important;
            height: auto !important;
            max-height: 86dvh !important;
            max-height: 86vh !important;
            padding: 14px !important;
            border-radius: 14px !important;
          }
          .class-modal {
            width: 92% !important;
            max-width: 92% !important;
            padding: 16px !important;
            border-radius: 14px !important;
          }
        }

        /* ════════════════ PRINT MEDIA ═══════════════════════════ */
        @media print {
          html, body {
            background: #fff !important; margin: 0 !important; padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body > *:not(.printable-modal-backdrop) { display: none !important; }

          /* ── Normal single-sheet print ── */
          .printable-modal-backdrop:not(.class-print-active) {
            position: static !important; background: transparent !important;
            padding: 0 !important; margin: 0 !important; display: block !important;
          }
          .printable-modal-backdrop:not(.class-print-active) .printable-modal-window {
            box-shadow: none !important; border: none !important;
            border-radius: 0 !important; background: transparent !important;
            max-width: 100% !important; height: auto !important;
            margin: 0 !important; padding: 0 !important;
            overflow: visible !important; display: block !important;
          }
          .printable-modal-backdrop:not(.class-print-active) .printable-preview-area {
            background: transparent !important; padding: 0 !important;
            margin: 0 !important; overflow: visible !important; display: block !important;
          }
          .printable-modal-backdrop:not(.class-print-active) .class-sheets-container,
          .printable-modal-backdrop:not(.class-print-active) .measurement-container {
            display: none !important;
          }

          /* ── Class print mode ── */
          .printable-modal-backdrop.class-print-active {
            position: static !important; background: transparent !important;
            padding: 0 !important; margin: 0 !important; display: block !important;
          }
          .printable-modal-backdrop.class-print-active .printable-modal-window,
          .printable-modal-backdrop.class-print-active .measurement-container {
            display: none !important;
          }
          .printable-modal-backdrop.class-print-active .class-sheets-container {
            display: block !important;
          }

          .no-print { display: none !important; }

          /* A4 sheet in print: exact height for 297mm paper with 6mm margins */
          .a4-sheet {
            box-shadow: none !important; border: none !important;
            margin: 0 !important; width: 100% !important;
            height: 284mm !important;
            max-height: 284mm !important;
            min-height: unset !important; padding: 0 !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .a4-page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          .sheet-teacher-cut { margin-top: auto !important; padding-top: 5px !important; }

          /* Image sizing preserved in print */
          .question-image-bg {
            height: 28mm !important;
            max-height: 28mm !important;
            padding: 1px !important;
          }
          .sheet-question-image {
            max-height: 26mm !important;
            max-width: 100% !important;
            object-fit: contain !important;
          }

          @page { size: A4 portrait; margin: 6mm 10mm 6mm 10mm; }
        }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default PrintableQuizModal;
