import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer, X, Scissors, RefreshCw, Copy, Check,
  FileText, Loader2, Download, Users
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import MathRenderer from './MathRenderer';

// ── Constants ──────────────────────────────────────────────────────────────────
const OPTION_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З'];
// 297 mm in CSS pixels (at 96 dpi). Used for overflow detection.
const A4_CSS_PX = 297 * (96 / 25.4); // ≈ 1122.5 px

// ── Pure helpers ───────────────────────────────────────────────────────────────
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSeededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generates a shuffled, limited set of questions for a given variant.
 * salt=0 is always used for measurement/class-print (reproducible).
 */
function buildVariantData(rawQuestions, quizId, variantIndex, salt, limit) {
  if (!rawQuestions || rawQuestions.length === 0) return { questions: [], keys: [] };

  const seed = hashString(`${quizId || 'quiz'}_var_${variantIndex}_salt_${salt}`);
  const rng = createSeededRandom(seed);

  // 1. Shuffle questions
  const cloned = rawQuestions.map((q, idx) => ({ ...q, _idx: idx }));
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }

  // 2. Apply limit
  const chosen = cloned.slice(0, Math.max(1, limit));

  // 3. Shuffle options within each question
  const finalQuestions = chosen.map((q, qIdx) => {
    const opts = (q.options || []).map((text, oIdx) => ({
      text,
      isCorrect: oIdx === q.correctIndex,
    }));
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    const correctNewIdx = opts.findIndex(o => o.isCorrect);
    return {
      number: qIdx + 1,
      question: q.question,
      options: opts.map(o => o.text),
      image: q.image || q.image_url || null,
      correctIndex: correctNewIdx,
      correctLetter: correctNewIdx >= 0 ? OPTION_LETTERS[correctNewIdx] : '?',
    };
  });

  return {
    questions: finalQuestions,
    keys: finalQuestions.map(q => ({ num: q.number, letter: q.correctLetter })),
  };
}

// ── Component ──────────────────────────────────────────────────────────────────
const PrintableQuizModal = ({ isOpen, onClose, quiz, quizContent }) => {
  // UI state
  const [variantIndex, setVariantIndex] = useState(1);
  const [randomSalt, setRandomSalt] = useState(0);
  const [copiedKeys, setCopiedKeys] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);

  // Data
  const [loadedContent, setLoadedContent] = useState(null);
  const [loadedSection, setLoadedSection] = useState(null);

  // Auto-fit
  const [fittedLimit, setFittedLimit] = useState(14);
  const [measuring, setMeasuring] = useState(false);

  // Class print
  const [showClassModal, setShowClassModal] = useState(false);
  const [classCount, setClassCount] = useState('');
  const [classPrintSheets, setClassPrintSheets] = useState(null); // [{variantIndex}] | null
  const [isPrintingClass, setIsPrintingClass] = useState(false);

  // DOM refs
  const sheetRef = useRef(null);
  // 4 hidden measurement refs — one per variant
  const mRef1 = useRef(null);
  const mRef2 = useRef(null);
  const mRef3 = useRef(null);
  const mRef4 = useRef(null);
  const measureRefs = [mRef1, mRef2, mRef3, mRef4];

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !quiz?.id) return;
    const hasQ = quizContent?.questions?.length > 0;
    const hasInlineQ = quiz?.content?.questions?.length > 0;
    if (!hasQ && !hasInlineQ && !loadedContent) {
      setLoading(true);
      supabase
        .from('quizzes')
        .select('content, quiz_sections(name, quiz_classes(name))')
        .eq('id', quiz.id)
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            if (data.content) setLoadedContent(data.content);
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

  // ── Auto-fit: reset when questions change ──────────────────────────────────
  useEffect(() => {
    if (isOpen && rawQuestions.length > 0) {
      const max = Math.min(14, rawQuestions.length);
      setFittedLimit(max);
      setMeasuring(true);
    }
    if (!isOpen) setMeasuring(false);
  }, [isOpen, rawQuestions.length]);

  // ── Auto-fit: measure all 4 variants via hidden DOM refs ───────────────────
  // Runs after every render while measuring=true.
  // If ANY of the 4 hidden sheets overflows A4, reduce fittedLimit by 1.
  useLayoutEffect(() => {
    if (!isOpen || !measuring) return;
    const anyOverflow = measureRefs.some(
      r => r.current && r.current.scrollHeight > A4_CSS_PX + 2
    );
    if (anyOverflow && fittedLimit > 1) {
      setFittedLimit(prev => prev - 1); // keep measuring=true for next render
    } else {
      setMeasuring(false); // converged — no overflow at this limit
    }
  }); // no dep array → runs every render (safe because measuring flag guards it)

  // ── Variant data (displayed sheet) ────────────────────────────────────────
  const variantData = useMemo(
    () => buildVariantData(rawQuestions, quiz?.id, variantIndex, randomSalt, fittedLimit),
    [rawQuestions, quiz, variantIndex, randomSalt, fittedLimit]
  );

  // ── Measurement data: all 4 variants with salt=0 ─────────────────────────
  const measureData = useMemo(() => {
    if (!rawQuestions.length || !isOpen) return [null, null, null, null];
    return [1, 2, 3, 4].map(v => buildVariantData(rawQuestions, quiz?.id, v, 0, fittedLimit));
  }, [rawQuestions, quiz, fittedLimit, isOpen]);

  // ── Derived layout values ─────────────────────────────────────────────────
  const totalQuestions = variantData.questions.length;
  const midPoint = Math.ceil(totalQuestions / 2);
  const leftColQ  = variantData.questions.slice(0, midPoint);
  const rightColQ = variantData.questions.slice(midPoint);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  const handleSavePdf = async () => {
    if (!sheetRef.current) return;
    setSavingPdf(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const safeName = quiz.title.replace(/[^\u0430-\u044f\u0451a-z0-9_\-]/gi, '_');
      const filename = `${safeName}_Вариант_${variantIndex}.pdf`;

      // Clone the sheet to a fixed offscreen wrapper (position:fixed; top:0; left:0)
      // → getBoundingClientRect().top === 0 → no blank first page.
      const clone = sheetRef.current.cloneNode(true);
      const wrapper = document.createElement('div');
      wrapper.style.cssText =
        'position:fixed;left:0;top:0;width:794px;background:#fff;z-index:-99999;overflow:hidden;';
      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      try {
        await html2pdf()
          .set({
            margin: 0, // sheet has its own padding; external margins cause 2nd-page overflow
            filename,
            image: { type: 'jpeg', quality: 0.99 },
            html2canvas: {
              scale: 2,
              useCORS: true,
              logging: false,
              width: 794,       // 210 mm at 96 dpi — prevents right-side clip
              windowWidth: 794, // prevents right-side clip on HiDPI screens
              scrollY: 0,
              scrollX: 0,
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all'] },
          })
          .from(clone)
          .save();
      } finally {
        document.body.removeChild(wrapper);
      }
    } catch (e) {
      console.error('PDF error:', e);
    } finally {
      setSavingPdf(false);
    }
  };

  const handleCopyKeys = () => {
    const text = variantData.keys.map(k => `${k.num}: ${k.letter}`).join(' | ');
    const full  = `Ключи к тесту "${quiz.title}" (${subjectName ? subjectName + ', ' : ''}Вариант ${variantIndex}):\n${text}`;
    navigator.clipboard.writeText(full);
    setCopiedKeys(true);
    setTimeout(() => setCopiedKeys(false), 2000);
  };

  const handleShuffle = () => setRandomSalt(prev => prev + 1);

  // Distribute N students across 4 variants: cycle 1→2→3→4→1→…
  const buildClassSheets = (n) => {
    const sheets = [];
    for (let i = 0; i < n; i++) sheets.push({ variantIndex: (i % 4) + 1 });
    return sheets;
  };

  const handleClassPrint = () => {
    const n = Math.max(1, parseInt(classCount) || 1);
    const sheets = buildClassSheets(n);
    setClassPrintSheets(sheets);
    setShowClassModal(false);
    setIsPrintingClass(true);
    // Allow React to render the sheets before opening the print dialog
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        setClassPrintSheets(null);
        setIsPrintingClass(false);
      }, 1000);
    }, 500);
  };

  // ── Sub-renderers ─────────────────────────────────────────────────────────

  /** Single question row */
  const renderQuestion = (q) => (
    <div key={q.number} className="sheet-question-item">
      <div className="sheet-question-title">
        <span className="q-num">{q.number}.</span>
        <span className="q-text"><MathRenderer text={q.question} /></span>
      </div>
      {q.image && (
        <img
          className="sheet-question-image"
          src={q.image}
          alt=""
          crossOrigin="anonymous"
        />
      )}
      <div className="sheet-options-list">
        {q.options.map((optText, oIdx) => (
          <div key={oIdx} className="sheet-option-row">
            <span className="sheet-option-letter">{OPTION_LETTERS[oIdx]})</span>
            <span className="sheet-option-text"><MathRenderer text={optText} /></span>
          </div>
        ))}
      </div>
    </div>
  );

  /** Full A4 sheet (header + questions + cut strip) */
  const renderSheet = (data, vIdx, ref = null) => {
    const { questions, keys } = data;
    const mid   = Math.ceil(questions.length / 2);
    const left  = questions.slice(0, mid);
    const right = questions.slice(mid);

    return (
      <div ref={ref} className="a4-sheet">
        {/* ── Header ── */}
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
              <div className="grading-row">
                <span>Баллы:</span>
                <strong>____ / {questions.length}</strong>
              </div>
              <div className="grading-row">
                <span>Оценка:</span>
                <strong>________</strong>
              </div>
            </div>
          </div>
        </header>

        {/* ── 2-column questions ── */}
        <main className="sheet-questions-grid">
          <div className="sheet-column">{left.map(renderQuestion)}</div>
          <div className="sheet-column">{right.map(renderQuestion)}</div>
        </main>

        {/* ── Cut strip ── */}
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

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!isOpen || !quiz) return null;

  // ── Class print sheets (rendered but hidden until window.print()) ─────────
  const classSheetElements = classPrintSheets
    ? classPrintSheets.map((s, idx) => {
        const data = buildVariantData(rawQuestions, quiz?.id, s.variantIndex, 0, fittedLimit);
        return (
          <div key={idx} className={idx < classPrintSheets.length - 1 ? 'a4-page-break' : ''}>
            {renderSheet(data, s.variantIndex)}
          </div>
        );
      })
    : null;

  // ── Variant distribution preview for modal ────────────────────────────────
  const variantCounts = (() => {
    const n = parseInt(classCount) || 0;
    if (!n) return null;
    return [1, 2, 3, 4].map(v => ({
      v,
      count: Math.floor(n / 4) + (v <= n % 4 ? 1 : 0),
    })).filter(x => x.count > 0);
  })();

  // ── JSX ───────────────────────────────────────────────────────────────────
  const modalContent = (
    <div
      className={`printable-modal-backdrop${isPrintingClass ? ' class-print-active' : ''}`}
      onClick={isPrintingClass ? undefined : onClose}
    >
      {/* Class print container — hidden in screen, shown only in @media print */}
      {classSheetElements && (
        <div className="class-sheets-container">
          {classSheetElements}
        </div>
      )}

      {/* Main modal window */}
      <div className="printable-modal-window" onClick={e => e.stopPropagation()}>

        {/* ── Toolbar ── */}
        <div className="printable-toolbar no-print">
          <div className="printable-toolbar-left">
            <span className="printable-toolbar-title">
              <FileText size={18} style={{ color: 'var(--primary-color)' }} />
              Печать теста А4
              {measuring && (
                <span className="fitted-badge measuring">
                  <Loader2 size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> Подбор…
                </span>
              )}
              {!measuring && fittedLimit < Math.min(14, rawQuestions.length || 14) && (
                <span className="fitted-badge">📐 {fittedLimit} вопр.</span>
              )}
            </span>

            {/* Variant pills */}
            <div className="variant-pills">
              {[1, 2, 3, 4].map(num => (
                <button
                  key={num}
                  type="button"
                  className={`variant-pill ${variantIndex === num ? 'active' : ''}`}
                  onClick={() => setVariantIndex(num)}
                >
                  Вар. {num}
                </button>
              ))}
            </div>

            <button type="button" className="toolbar-btn" onClick={handleShuffle}
              title="Перемешать вопросы и ответы заново">
              <RefreshCw size={14} /> Перемешать
            </button>
          </div>

          <div className="printable-toolbar-right">
            {/* Class print */}
            <button
              type="button"
              className="toolbar-btn class-print-btn"
              onClick={() => setShowClassModal(true)}
              disabled={totalQuestions === 0}
              title="Напечатать тест на весь класс"
            >
              <Users size={14} /> На класс…
            </button>

            {/* Copy keys */}
            <button type="button" className="toolbar-btn" onClick={handleCopyKeys}
              disabled={totalQuestions === 0} title="Скопировать ключи в буфер обмена">
              {copiedKeys ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
              {copiedKeys ? 'Скопировано' : 'Ключи'}
            </button>

            {/* Save PDF */}
            <button type="button" className="toolbar-btn" onClick={handleSavePdf}
              disabled={loading || savingPdf || totalQuestions === 0}
              title="Скачать PDF без диалога печати">
              {savingPdf ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
              {savingPdf ? 'PDF…' : 'Сохранить PDF'}
            </button>

            {/* Print */}
            <button type="button" className="print-primary-btn" onClick={handlePrint}
              disabled={loading || totalQuestions === 0} title="Открыть диалог печати">
              <Printer size={16} /> Печать
            </button>

            <button type="button" className="close-btn" onClick={onClose} title="Закрыть">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── "Print for N students" modal ── */}
        {showClassModal && (
          <div className="class-modal-overlay" onClick={() => setShowClassModal(false)}>
            <div className="class-modal" onClick={e => e.stopPropagation()}>
              <h3 className="class-modal-title">
                <Users size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Печать на класс
              </h3>
              <p className="class-modal-desc">
                Укажите количество учеников. Варианты распределятся автоматически (1→2→3→4→1→…),
                чтобы соседи не могли списать.
              </p>
              <div className="class-modal-row">
                <input
                  type="number"
                  className="class-count-input"
                  min="1" max="120"
                  placeholder="Кол-во учеников"
                  value={classCount}
                  onChange={e => setClassCount(e.target.value)}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && parseInt(classCount) > 0) handleClassPrint();
                  }}
                />
                <button
                  type="button"
                  className="print-primary-btn"
                  onClick={handleClassPrint}
                  disabled={!classCount || parseInt(classCount) < 1}
                >
                  <Printer size={14} />
                  {classCount && parseInt(classCount) > 0
                    ? `Печать (${parseInt(classCount)} лист.)`
                    : 'Печать'}
                </button>
                <button type="button" className="toolbar-btn"
                  onClick={() => setShowClassModal(false)}>
                  Отмена
                </button>
              </div>
              {variantCounts && (
                <div className="class-modal-preview">
                  {variantCounts.map(({ v, count }) => (
                    <span key={v} className="variant-count-badge">
                      Вар.{v} × {count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Preview area ── */}
        <div className="printable-preview-area">
          {loading ? (
            <div className="printable-loading">
              <Loader2 size={32} className="spinner"
                style={{ color: '#4f46e5', marginBottom: '12px' }} />
              <div>Загрузка вопросов теста…</div>
            </div>
          ) : totalQuestions === 0 ? (
            <div className="printable-loading">
              <p style={{ margin: 0, fontWeight: 'bold' }}>В этом тесте пока нет вопросов.</p>
            </div>
          ) : (
            renderSheet(variantData, variantIndex, sheetRef)
          )}
        </div>
      </div>

      {/* ── Hidden measurement sheets (all 4 variants) — for auto-fit ── */}
      {isOpen && rawQuestions.length > 0 && (
        <div className="measurement-container" aria-hidden="true">
          {measureData.map((data, idx) =>
            data ? (
              <div key={idx} ref={measureRefs[idx]} className="a4-sheet">
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
                    <div className="variant-badge">ВАРИАНТ {idx + 1}</div>
                    <div className="grading-box" style={{ minWidth: '100px' }}>
                      <div className="grading-row"><span>Баллы:</span><strong>__ / {data.questions.length}</strong></div>
                    </div>
                  </div>
                </header>
                <main className="sheet-questions-grid">
                  <div className="sheet-column">
                    {data.questions.slice(0, Math.ceil(data.questions.length / 2)).map(renderQuestion)}
                  </div>
                  <div className="sheet-column">
                    {data.questions.slice(Math.ceil(data.questions.length / 2)).map(renderQuestion)}
                  </div>
                </main>
                <footer className="sheet-teacher-cut">
                  <div className="cut-line">
                    <Scissors size={13} /><span className="cut-dash"></span>
                  </div>
                  <div className="teacher-key-box">
                    <div className="key-grid">
                      {data.keys.map(k => (
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

      {/* ═══════════════════ STYLES ═══════════════════ */}
      <style>{`
        /* ── Backdrop / Window ──────────────────────────────────── */
        .printable-modal-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(6px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .printable-modal-window {
          background: #f1f5f9;
          width: 100%;
          max-width: 960px;
          height: 95vh;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
          position: relative;
        }

        /* ── Toolbar ──────────────────────────────────────────────── */
        .printable-toolbar {
          background: #ffffff;
          padding: 10px 16px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          flex-shrink: 0;
        }

        .printable-toolbar-left,
        .printable-toolbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .printable-toolbar-title {
          font-weight: 700;
          font-size: 0.92rem;
          color: #1e293b;
          display: flex;
          align-items: center;
          gap: 7px;
          margin-right: 4px;
        }

        .fitted-badge {
          font-size: 0.68rem;
          background: #e0e7ff;
          color: #4338ca;
          padding: 2px 7px;
          border-radius: 20px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .fitted-badge.measuring { background: #fef9c3; color: #854d0e; }

        .variant-pills {
          display: flex;
          background: #f1f5f9;
          padding: 3px;
          border-radius: 10px;
          gap: 3px;
        }
        .variant-pill {
          padding: 5px 11px;
          font-size: 0.73rem;
          font-weight: 600;
          border-radius: 7px;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          transition: all 0.15s;
        }
        .variant-pill.active {
          background: #ffffff;
          color: #4f46e5;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .toolbar-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 11px;
          font-size: 0.73rem;
          font-weight: 600;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          color: #334155;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s;
          box-shadow: none;
        }
        .toolbar-btn:hover { background: #e2e8f0; }
        .toolbar-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .class-print-btn {
          border-color: #a5b4fc;
          color: #4338ca;
        }
        .class-print-btn:hover { background: #eef2ff; }

        .print-primary-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 15px;
          font-size: 0.8rem;
          font-weight: 700;
          background: #4f46e5;
          color: #ffffff;
          border: none;
          border-radius: 9px;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
          transition: background 0.15s;
        }
        .print-primary-btn:hover { background: #4338ca; }
        .print-primary-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .close-btn {
          background: #f1f5f9;
          border: none;
          width: 32px; height: 32px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          cursor: pointer;
        }
        .close-btn:hover { background: #e2e8f0; color: #0f172a; }

        /* ── Preview area ─────────────────────────────────────────── */
        .printable-preview-area {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          justify-content: center;
          background: #cbd5e1;
        }

        .printable-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 300px;
          color: #334155;
          font-size: 0.9rem;
        }

        /* ── "Class" modal ────────────────────────────────────────── */
        .class-modal-overlay {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
        }
        .class-modal {
          background: #ffffff;
          border-radius: 14px;
          padding: 24px;
          max-width: 420px;
          width: 90%;
          box-shadow: 0 20px 40px rgba(0,0,0,0.18);
        }
        .class-modal-title {
          font-size: 1.05rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 8px 0;
          display: flex;
          align-items: center;
        }
        .class-modal-desc {
          font-size: 0.81rem;
          color: #64748b;
          margin: 0 0 16px 0;
          line-height: 1.55;
        }
        .class-modal-row {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .class-count-input {
          width: 115px;
          padding: 8px 12px;
          border: 1.5px solid #cbd5e1;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          color: #0f172a;
          outline: none;
          transition: border-color 0.15s;
        }
        .class-count-input:focus { border-color: #4f46e5; }
        .class-modal-preview {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 14px;
        }
        .variant-count-badge {
          font-size: 0.75rem;
          font-weight: 700;
          padding: 3px 9px;
          background: #e0e7ff;
          color: #4338ca;
          border-radius: 6px;
        }

        /* ── Measurement container (off-screen, invisible) ─────────── */
        .measurement-container {
          position: fixed;
          left: -9999px;
          top: 0;
          width: 210mm;
          visibility: hidden;
          pointer-events: none;
          z-index: -9999;
          overflow: hidden;
        }

        /* ── Class print container (screen: hidden; print: shown) ──── */
        .class-sheets-container {
          display: none;
        }
        .a4-page-break {
          page-break-after: always;
          break-after: page;
        }

        /* ═══ A4 SHEET STYLES ══════════════════════════════════════ */
        .a4-sheet {
          background: #ffffff;
          color: #000000;
          width: 210mm;
          min-height: 297mm;
          padding: 6mm 10mm 6mm 10mm;
          box-sizing: border-box;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            "Helvetica Neue", Arial, sans-serif;
        }

        /* Header */
        .sheet-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000000;
          padding-bottom: 6px;
          margin-bottom: 8px;
          gap: 12px;
        }
        .sheet-header-left { flex: 1; }
        .sheet-quiz-title {
          font-size: 14.5px;
          font-weight: 800;
          margin: 0 0 2px 0;
          color: #000000;
          line-height: 1.25;
          letter-spacing: -0.2px;
        }
        .sheet-subject-subtitle {
          font-size: 10.5px;
          color: #4b5563;
          margin-bottom: 6px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .subtitle-dot { opacity: 0.5; }
        .sheet-student-fields {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .field-row {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          width: 100%;
        }
        .field-row-split { display: flex; gap: 18px; }
        .field-inline { display: flex; align-items: flex-end; gap: 6px; }
        .field-label {
          font-size: 10.5px;
          font-weight: 700;
          color: #000000;
        }
        .field-line {
          flex: 1;
          border-bottom: 1px solid #000000;
          height: 12px;
          min-width: 130px;
        }
        .field-line.short { min-width: 65px; width: 75px; }

        .sheet-header-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 5px;
        }
        .variant-badge {
          background: #000000;
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 800;
          padding: 3px 9px;
          border-radius: 4px;
          letter-spacing: 0.5px;
        }
        .grading-box {
          border: 1.5px solid #000000;
          border-radius: 4px;
          padding: 3px 7px;
          font-size: 10.5px;
          min-width: 110px;
        }
        .grading-row {
          display: flex;
          justify-content: space-between;
          line-height: 1.35;
        }

        /* 2-column grid */
        .sheet-questions-grid {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 14px;
          align-content: start;
        }
        .sheet-column {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .sheet-question-item {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .sheet-question-title {
          display: flex;
          align-items: flex-start;
          gap: 4px;
          margin-bottom: 3px;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.25;
          color: #000000;
        }
        .q-num { font-weight: 800; flex-shrink: 0; }
        .q-text { flex: 1; }

        /* Question image — B&W + high contrast for print */
        .sheet-question-image {
          display: block;
          max-width: 100%;
          max-height: 44mm;
          object-fit: contain;
          filter: grayscale(100%) contrast(220%) brightness(95%);
          margin: 3px 0 5px 14px;
          border: 1px solid #ccc;
          background: #fff;
        }

        /* Options */
        .sheet-options-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding-left: 4px;
        }
        .sheet-option-row {
          display: flex;
          align-items: flex-start;
          gap: 5px;
          font-size: 10.5px;
          line-height: 1.25;
          color: #111111;
        }
        .sheet-option-letter {
          font-weight: 700;
          color: #000000;
          flex-shrink: 0;
          margin-right: 2px;
        }
        .sheet-option-text { flex: 1; }

        /* Cut strip */
        .sheet-teacher-cut {
          margin-top: auto;
          padding-top: 6px;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .cut-line {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 5px;
          color: #000000;
        }
        .cut-icon { flex-shrink: 0; color: #000000; }
        .cut-dash {
          flex: 1;
          border-bottom: 1.5px dashed #000000;
          height: 1px;
        }
        .teacher-key-box {
          border: 1.5px solid #000000;
          border-radius: 5px;
          padding: 5px 8px;
          background: #fafafa;
        }
        .key-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
          margin-bottom: 5px;
          border-bottom: 1px solid #dddddd;
          padding-bottom: 3px;
        }
        .key-subtitle { font-size: 9px; color: #444444; }
        .key-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
        }
        .key-badge {
          display: inline-flex;
          border: 1px solid #000000;
          border-radius: 3px;
          overflow: hidden;
          font-size: 9.5px;
          font-weight: 700;
        }
        .key-num {
          background: #eeeeee;
          padding: 2px 4px;
          border-right: 1px solid #000000;
          color: #222222;
        }
        .key-letter {
          background: #ffffff;
          padding: 2px 5px;
          color: #000000;
          font-weight: 800;
        }

        /* Spinner animation */
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }

        /* ═══════════════ PRINT MEDIA ══════════════════════════════ */
        @media print {
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Hide all body children except our modal */
          body > *:not(.printable-modal-backdrop) {
            display: none !important;
          }

          /* ── NORMAL single-sheet print ────────────────────────── */
          .printable-modal-backdrop:not(.class-print-active) {
            position: static !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .printable-modal-backdrop:not(.class-print-active) .printable-modal-window {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: transparent !important;
            max-width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            display: block !important;
          }
          .printable-modal-backdrop:not(.class-print-active) .printable-preview-area {
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            display: block !important;
          }
          .printable-modal-backdrop:not(.class-print-active) .class-sheets-container,
          .printable-modal-backdrop:not(.class-print-active) .measurement-container {
            display: none !important;
          }

          /* ── CLASS print mode ─────────────────────────────────── */
          .printable-modal-backdrop.class-print-active {
            position: static !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .printable-modal-backdrop.class-print-active .printable-modal-window,
          .printable-modal-backdrop.class-print-active .measurement-container {
            display: none !important;
          }
          .printable-modal-backdrop.class-print-active .class-sheets-container {
            display: block !important;
          }

          /* ── A4 sheet in print ────────────────────────────────── */
          .no-print { display: none !important; }

          .a4-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            width: 100% !important;
            /* Explicit height so flex margin-top:auto keeps cut strip at bottom.
               285mm = 297mm – 6mm top – 6mm bottom (@page margins) */
            height: 285mm !important;
            min-height: unset !important;
            padding: 0 !important;
          }

          /* Footer pinned to bottom — same as screen preview */
          .sheet-teacher-cut {
            margin-top: auto !important;
            padding-top: 6px !important;
          }

          /* Images in print: keep B&W+contrast filter */
          .sheet-question-image {
            -webkit-filter: grayscale(100%) contrast(220%) brightness(95%) !important;
            filter: grayscale(100%) contrast(220%) brightness(95%) !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page {
            size: A4 portrait;
            margin: 6mm 10mm 6mm 10mm;
          }
        }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default PrintableQuizModal;
