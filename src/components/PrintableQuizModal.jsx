import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer, X, Scissors, RefreshCw, Copy, Check,
  FileText, Loader2, Download, Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import MathRenderer from './MathRenderer';

// ── Constants ──────────────────────────────────────────────────────────────────
const OPTION_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З'];
const A4_CSS_PX = 297 * (96 / 25.4); // 297 mm → CSS px ≈ 1122.5

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

/**
 * Builds a shuffled, limited question set for a given variant.
 * Guarantees ≥1 question with an image when the pool contains images.
 */
function buildVariantData(rawQ, quizId, variantIdx, salt, limit) {
  if (!rawQ?.length) return { questions: [], keys: [] };

  const seed = hashString(`${quizId || 'quiz'}_var_${variantIdx}_salt_${salt}`);
  const rng  = createSeededRandom(seed);

  // 1. Shuffle questions
  const cloned = rawQ.map(q => ({ ...q }));
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }

  const safeLimit = Math.min(Math.max(1, limit), cloned.length);

  // 2. Guarantee ≥1 image question (if any exist in pool)
  const poolHasImg = cloned.some(q => q.image || q.image_url);
  if (poolHasImg) {
    const chosenHasImg = cloned.slice(0, safeLimit).some(q => q.image || q.image_url);
    if (!chosenHasImg) {
      const srcIdx = cloned.findIndex((q, i) => i >= safeLimit && (q.image || q.image_url));
      if (srcIdx !== -1) {
        // Different position per variant for variety
        const dstIdx = Math.floor(rng() * safeLimit);
        [cloned[dstIdx], cloned[srcIdx]] = [cloned[srcIdx], cloned[dstIdx]];
      }
    }
  }

  const chosen = cloned.slice(0, safeLimit);

  // 3. Shuffle options within each question
  const finalQ = chosen.map((q, qi) => {
    const opts = (q.options || []).map((text, oi) => ({ text, isCorrect: oi === q.correctIndex }));
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    const corr = opts.findIndex(o => o.isCorrect);
    return {
      number: qi + 1,
      question: q.question,
      options: opts.map(o => o.text),
      image: q.image || q.image_url || null,
      correctIndex: corr,
      correctLetter: corr >= 0 ? OPTION_LETTERS[corr] : '?',
    };
  });

  return { questions: finalQ, keys: finalQ.map(q => ({ num: q.number, letter: q.correctLetter })) };
}

/** Attempt to fetch an image and return its base64 data-URL (for PDF). */
async function imageToBase64(src) {
  if (!src || src.startsWith('data:')) return src;
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(src)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(src)}`,
  ];
  for (const url of proxies) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) continue;
      const blob = await res.blob();
      const b64 = await new Promise((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = fail;
        r.readAsDataURL(blob);
      });
      if (b64) return b64;
    } catch { /* try next proxy */ }
  }
  return null; // give up — will be blank in PDF only
}

// ── Component ──────────────────────────────────────────────────────────────────
const PrintableQuizModal = ({ isOpen, onClose, quiz, quizContent }) => {
  // ── state ──────────────────────────────────────────────────────────────────
  const [variantIndex, setVariantIndex]   = useState(1);
  const [randomSalt, setRandomSalt]       = useState(0);
  const [copiedKeys, setCopiedKeys]       = useState(false);
  const [loading, setLoading]             = useState(false);
  const [savingPdf, setSavingPdf]         = useState(false);
  const [loadedContent, setLoadedContent] = useState(null);
  const [loadedSection, setLoadedSection] = useState(null);

  // Auto-fit
  const [fittedLimit, setFittedLimit]     = useState(14);
  const [measuring, setMeasuring]         = useState(false);
  const [remeasureToken, setRemeasureToken] = useState(0); // bumped after images load

  // Image sizes: { [q.number]: 'sm'|'md'|'lg' }
  const [imageSizes, setImageSizes]       = useState({});

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
      setFittedLimit(Math.min(14, rawQuestions.length));
      setMeasuring(true);
      setImageSizes({});
    }
    if (!isOpen) setMeasuring(false);
  }, [isOpen, rawQuestions.length]);

  // ── auto-fit: DOM measurement (runs after every render while measuring) ─────
  useLayoutEffect(() => {
    if (!isOpen || !measuring) return;
    const anyOverflow = measureRefs.some(
      r => r.current && r.current.scrollHeight > A4_CSS_PX + 2
    );
    if (anyOverflow && fittedLimit > 1) {
      setFittedLimit(prev => prev - 1);
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
  const variantData = useMemo(
    () => buildVariantData(rawQuestions, quiz?.id, variantIndex, randomSalt, fittedLimit),
    [rawQuestions, quiz, variantIndex, randomSalt, fittedLimit]
  );

  const measureData = useMemo(() => {
    if (!rawQuestions.length || !isOpen) return [null, null, null, null];
    return [1, 2, 3, 4].map(v => buildVariantData(rawQuestions, quiz?.id, v, 0, fittedLimit));
  }, [rawQuestions, quiz, fittedLimit, isOpen]);

  const totalQ   = variantData.questions.length;
  const midPoint = Math.ceil(totalQ / 2);
  const leftColQ = variantData.questions.slice(0, midPoint);
  const rightColQ = variantData.questions.slice(midPoint);

  // ── handlers ────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  const handleSavePdf = async () => {
    if (!sheetRef.current) return;
    setSavingPdf(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const safeName = quiz.title.replace(/[^\u0430-\u044f\u0451a-z0-9_\-]/gi, '_');
      const filename = `${safeName}_Вариант_${variantIndex}.pdf`;

      // Clone to offscreen (top:0 → no blank first page)
      const clone   = sheetRef.current.cloneNode(true);
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:fixed;left:0;top:0;width:794px;background:#fff;z-index:-99999;overflow:hidden;';
      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      // Convert cross-origin images to base64 so html2canvas can render them
      const imgs = Array.from(clone.querySelectorAll('img.sheet-question-image'));
      await Promise.all(imgs.map(async img => {
        const b64 = await imageToBase64(img.src);
        if (b64) img.src = b64;
        else img.style.display = 'none'; // graceful fallback
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
              width: 794, windowWidth: 794,
              scrollY: 0, scrollX: 0,
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all'] },
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
    const text = variantData.keys.map(k => `${k.num}: ${k.letter}`).join(' | ');
    navigator.clipboard.writeText(
      `Ключи к тесту "${quiz.title}" (${subjectName ? subjectName + ', ' : ''}Вариант ${variantIndex}):\n${text}`
    );
    setCopiedKeys(true);
    setTimeout(() => setCopiedKeys(false), 2000);
  };

  const handleShuffle = () => { setRandomSalt(p => p + 1); setImageSizes({}); };

  const handleClassPrint = () => {
    const n = Math.max(1, parseInt(classCount) || 1);
    setClassPrintSheets(Array.from({ length: n }, (_, i) => ({ variantIndex: (i % 4) + 1 })));
    setShowClassModal(false);
    setIsPrintingClass(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => { setClassPrintSheets(null); setIsPrintingClass(false); }, 1000);
    }, 500);
  };

  // ── sub-renderers ───────────────────────────────────────────────────────────
  /**
   * Renders one question. Pass forMeasurement=true in hidden sheets
   * to skip interactive size controls and always use 'md'.
   */
  const renderQuestion = (q, forMeasurement = false) => {
    const size = forMeasurement ? 'md' : (imageSizes[q.number] || 'md');

    return (
      <div key={q.number} className="sheet-question-item">
        {/* Question text */}
        <div className="sheet-question-title">
          <span className="q-num">{q.number}.</span>
          <span className="q-text"><MathRenderer text={q.question} /></span>
        </div>

        {/* Image (shown above options) */}
        {q.image && (
          <div className="question-image-wrap">
            <div className="question-image-bg">
              <img
                className={`sheet-question-image img-${size}`}
                src={q.image}
                alt=""
                crossOrigin="anonymous"
                onLoad={forMeasurement ? triggerImgRemeasure : undefined}
                onError={forMeasurement ? triggerImgRemeasure : undefined}
              />
            </div>
            {/* Size controls — preview only */}
            {!forMeasurement && (
              <div className="image-size-controls no-print">
                {['sm', 'md', 'lg'].map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`img-size-btn${size === s ? ' active' : ''}`}
                    onClick={e => { e.stopPropagation(); setImageSizes(p => ({ ...p, [q.number]: s })); }}
                    title={{ sm: 'Малое', md: 'Среднее', lg: 'Большое' }[s]}
                  >
                    {s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}
                  </button>
                ))}
              </div>
            )}
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
  const renderSheet = (data, vIdx, ref = null, forMeasurement = false) => {
    const { questions, keys } = data;
    const mid   = Math.ceil(questions.length / 2);
    const left  = questions.slice(0, mid);
    const right = questions.slice(mid);

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

        {/* Cut strip */}
        <footer className="sheet-teacher-cut">
          <div className="cut-line">
            <Scissors size={13} className="cut-icon" />
            <span className="cut-dash"></span>
          </div>
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
        </footer>
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
            const d = buildVariantData(rawQuestions, quiz?.id, s.variantIndex, 0, fittedLimit);
            return (
              <div key={i} className={i < classPrintSheets.length - 1 ? 'a4-page-break' : ''}>
                {renderSheet(d, s.variantIndex, null, true)}
              </div>
            );
          })}
        </div>
      )}

      {/* Main modal */}
      <div className="printable-modal-window" onClick={e => e.stopPropagation()}>

        {/* Toolbar */}
        <div className="printable-toolbar no-print">
          <div className="printable-toolbar-left">
            <span className="printable-toolbar-title">
              <FileText size={18} style={{ color: 'var(--primary-color)' }} />
              Печать А4
              {measuring && (
                <span className="fitted-badge measuring">
                  <Loader2 size={9} style={{ display:'inline', verticalAlign:'middle' }} /> Подбор…
                </span>
              )}
              {!measuring && fittedLimit < Math.min(14, rawQuestions.length || 14) && (
                <span className="fitted-badge">📐 {fittedLimit} вопр.</span>
              )}
            </span>
            <div className="variant-pills">
              {[1, 2, 3, 4].map(n => (
                <button key={n} type="button"
                  className={`variant-pill${variantIndex === n ? ' active' : ''}`}
                  onClick={() => { setVariantIndex(n); setImageSizes({}); }}>
                  Вар. {n}
                </button>
              ))}
            </div>
            <button type="button" className="toolbar-btn" onClick={handleShuffle}>
              <RefreshCw size={14} /> Перемешать
            </button>
          </div>

          <div className="printable-toolbar-right">
            <button type="button" className="toolbar-btn class-print-btn"
              onClick={() => setShowClassModal(true)} disabled={totalQ === 0}>
              <Users size={14} /> На класс…
            </button>
            <button type="button" className="toolbar-btn" onClick={handleCopyKeys} disabled={totalQ === 0}>
              {copiedKeys ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
              {copiedKeys ? 'Скопировано' : 'Ключи'}
            </button>
            <button type="button" className="toolbar-btn" onClick={handleSavePdf}
              disabled={loading || savingPdf || totalQ === 0}>
              {savingPdf ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
              {savingPdf ? 'PDF…' : 'Сохранить PDF'}
            </button>
            <button type="button" className="print-primary-btn" onClick={handlePrint}
              disabled={loading || totalQ === 0}>
              <Printer size={16} /> Печать
            </button>
            <button type="button" className="close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Class-print dialog */}
        {showClassModal && (
          <div className="class-modal-overlay" onClick={() => setShowClassModal(false)}>
            <div className="class-modal" onClick={e => e.stopPropagation()}>
              <h3 className="class-modal-title">
                <Users size={17} style={{ marginRight: 7, verticalAlign: 'middle' }} />
                Печать на класс
              </h3>
              <p className="class-modal-desc">
                Введите количество учеников. Варианты чередуются (1→2→3→4→1…), чтобы соседи не списали.
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
              <div key={i} ref={measureRefs[i]} className="a4-sheet">
                <header className="sheet-header">
                  <div className="sheet-header-left">
                    <h1 className="sheet-quiz-title">{quiz.title}</h1>
                    <div className="sheet-student-fields">
                      <div className="field-row">
                        <span className="field-label">ФИО:</span>
                        <span className="field-line"></span>
                      </div>
                    </div>
                  </div>
                  <div className="sheet-header-right">
                    <div className="variant-badge">ВАРИАНТ {i + 1}</div>
                    <div className="grading-box" style={{ minWidth: 90 }}>
                      <div className="grading-row"><span>Баллы:</span><strong>__ / {d.questions.length}</strong></div>
                    </div>
                  </div>
                </header>
                <main className="sheet-questions-grid">
                  <div className="sheet-column">
                    {d.questions.slice(0, Math.ceil(d.questions.length / 2))
                      .map(q => renderQuestion(q, true))}
                  </div>
                  <div className="sheet-column">
                    {d.questions.slice(Math.ceil(d.questions.length / 2))
                      .map(q => renderQuestion(q, true))}
                  </div>
                </main>
                <footer className="sheet-teacher-cut">
                  <div className="cut-line"><Scissors size={13} /><span className="cut-dash"></span></div>
                  <div className="teacher-key-box">
                    <div className="key-grid">
                      {d.keys.map(k => (
                        <div key={k.num} className="key-badge">
                          <span className="key-num">{k.num}</span>
                          <span className="key-letter">{k.letter}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </footer>
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
        .printable-toolbar-left, .printable-toolbar-right {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
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

        .toolbar-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 11px; font-size: 0.73rem; font-weight: 600;
          background: #f8fafc; border: 1px solid #cbd5e1; color: #334155;
          border-radius: 8px; cursor: pointer; transition: background 0.15s;
        }
        .toolbar-btn:hover { background: #e2e8f0; }
        .toolbar-btn:disabled { opacity: 0.45; cursor: not-allowed; }
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

        /* ── Hidden containers ──────────────────────────────────── */
        .measurement-container {
          position: fixed; left: -9999px; top: 0;
          width: 210mm; visibility: hidden;
          pointer-events: none; z-index: -9999; overflow: hidden;
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

        /* ── IMAGE BLOCK ──────────────────────────────────────── */
        .question-image-wrap {
          position: relative;
          margin: 4px 0 5px 0;
        }
        /* White background under image — handles transparent PNGs cleanly */
        .question-image-bg {
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 3px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          overflow: hidden;
        }
        .sheet-question-image {
          display: block;
          max-width: 100%;
          object-fit: contain;
          /* B&W + high contrast for legible printing */
          filter: grayscale(100%) contrast(190%) brightness(105%);
          margin: 0 auto;
        }
        /* Size variants */
        .sheet-question-image.img-sm { max-height: 22mm; }
        .sheet-question-image.img-md { max-height: 42mm; }
        .sheet-question-image.img-lg { max-height: 66mm; }

        /* S/M/L controls (visible in preview only, hidden on print) */
        .image-size-controls {
          position: absolute; top: 4px; right: 4px;
          display: flex;
          background: rgba(255,255,255,0.92);
          border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;
          opacity: 0; transition: opacity 0.15s;
          box-shadow: 0 1px 4px rgba(0,0,0,0.12);
        }
        .question-image-wrap:hover .image-size-controls { opacity: 1; }
        .img-size-btn {
          padding: 3px 8px; font-size: 0.63rem; font-weight: 800;
          border: none; background: transparent; color: #475569;
          cursor: pointer; border-right: 1px solid #e2e8f0;
          transition: background 0.1s;
        }
        .img-size-btn:last-child { border-right: none; }
        .img-size-btn.active { background: #4f46e5; color: #fff; }
        .img-size-btn:hover:not(.active) { background: #f1f5f9; }

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

        /* Cut strip */
        .sheet-teacher-cut {
          margin-top: auto; padding-top: 6px;
          page-break-inside: avoid; break-inside: avoid;
        }
        .cut-line {
          display: flex; align-items: center; gap: 6px;
          margin-bottom: 5px; color: #000;
        }
        .cut-icon { flex-shrink: 0; color: #000; }
        .cut-dash { flex: 1; border-bottom: 1.5px dashed #000; height: 1px; }
        .teacher-key-box {
          border: 1.5px solid #000; border-radius: 5px;
          padding: 5px 8px; background: #fafafa;
        }
        .key-header {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 10px; margin-bottom: 5px;
          border-bottom: 1px solid #ddd; padding-bottom: 3px;
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

        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }

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

          /* A4 sheet in print: fixed height → flex margin-top:auto keeps footer at bottom */
          .a4-sheet {
            box-shadow: none !important; border: none !important;
            margin: 0 !important; width: 100% !important;
            height: 285mm !important;   /* 297 − 6 top − 6 bottom @page margins */
            min-height: unset !important; padding: 0 !important;
          }
          .sheet-teacher-cut { margin-top: auto !important; padding-top: 6px !important; }

          /* Image sizing preserved in print */
          .sheet-question-image {
            filter: grayscale(100%) contrast(190%) brightness(105%) !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Keep size classes working in print */
          .sheet-question-image.img-sm { max-height: 22mm !important; }
          .sheet-question-image.img-md { max-height: 42mm !important; }
          .sheet-question-image.img-lg { max-height: 66mm !important; }

          @page { size: A4 portrait; margin: 6mm 10mm 6mm 10mm; }
        }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default PrintableQuizModal;
