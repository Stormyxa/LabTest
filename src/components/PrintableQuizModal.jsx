import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Scissors, RefreshCw, Copy, Check, FileText, Loader2, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import MathRenderer from './MathRenderer';

// Letters for answer options (Cyrillic)
const OPTION_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З'];

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
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const PrintableQuizModal = ({ isOpen, onClose, quiz, quizContent }) => {
  const [variantIndex, setVariantIndex] = useState(1);
  const [randomSalt, setRandomSalt] = useState(0);
  const [copiedKeys, setCopiedKeys] = useState(false);
  const [loadedContent, setLoadedContent] = useState(null);
  const [loadedSection, setLoadedSection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const sheetRef = useRef(null);

  // Fetch quiz content if not passed or empty
  useEffect(() => {
    if (!isOpen || !quiz?.id) return;

    const hasQuestions = quizContent?.questions && quizContent.questions.length > 0;
    const hasInlineQuestions = quiz?.content?.questions && quiz.content.questions.length > 0;

    if (!hasQuestions && !hasInlineQuestions && !loadedContent) {
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

  const rawQuestions = useMemo(() => {
    return quizContent?.questions || loadedContent?.questions || quiz?.content?.questions || [];
  }, [quizContent, loadedContent, quiz]);

  const subjectName = quiz?.quiz_sections?.name || loadedSection?.name || '';
  const className = quiz?.quiz_sections?.quiz_classes?.name || loadedSection?.quiz_classes?.name || '';

  // Generate variant questions (shuffled questions + shuffled options, max 14)
  const variantData = useMemo(() => {
    if (!rawQuestions || rawQuestions.length === 0) {
      return { questions: [], keys: [] };
    }

    const seed = hashString(`${quiz?.id || 'quiz'}_var_${variantIndex}_salt_${randomSalt}`);
    const rng = createSeededRandom(seed);

    // 1. Clone questions
    const cloned = rawQuestions.map((q, idx) => ({ ...q, originalQuestionIndex: idx }));

    // 2. Shuffle questions
    for (let i = cloned.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
    }

    // 3. Limit to max 14 questions (or quiz limit if smaller)
    const configuredLimit = quiz?.content?.question_limit || loadedContent?.question_limit || quizContent?.question_limit;
    const parsedLimit = configuredLimit ? parseInt(configuredLimit, 10) : 14;
    const limit = Math.min(14, parsedLimit > 0 ? parsedLimit : 14, cloned.length);
    const chosenQuestions = cloned.slice(0, limit);

    // 4. Shuffle options within each question and compute new correct answer
    const finalQuestions = chosenQuestions.map((q, qIdx) => {
      const opts = (q.options || []).map((text, oIdx) => ({
        text,
        isCorrect: oIdx === q.correctIndex
      }));

      // Shuffle options
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }

      const correctNewIdx = opts.findIndex(o => o.isCorrect);
      const correctLetter = correctNewIdx >= 0 ? OPTION_LETTERS[correctNewIdx] : '?';

      return {
        number: qIdx + 1,
        question: q.question,
        options: opts.map(o => o.text),
        correctIndex: correctNewIdx,
        correctLetter
      };
    });

    const keys = finalQuestions.map(q => ({
      num: q.number,
      letter: q.correctLetter
    }));

    return { questions: finalQuestions, keys };
  }, [rawQuestions, quiz, loadedContent, quizContent, variantIndex, randomSalt]);

  if (!isOpen || !quiz) return null;

  const totalQuestions = variantData.questions.length;
  const midPoint = Math.ceil(totalQuestions / 2);
  const leftColQuestions = variantData.questions.slice(0, midPoint);
  const rightColQuestions = variantData.questions.slice(midPoint);

  const handlePrint = () => {
    window.print();
  };

  const handleSavePdf = async () => {
    if (!sheetRef.current) return;
    setSavingPdf(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const filename = `${quiz.title.replace(/[^а-яёa-z0-9_\-]/gi, '_')}_Вариант_${variantIndex}.pdf`;
      await html2pdf()
        .set({
          margin: [6, 10, 6, 10],
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all'] }
        })
        .from(sheetRef.current)
        .save();
    } catch (e) {
      console.error('PDF error:', e);
    } finally {
      setSavingPdf(false);
    }
  };

  const handleCopyKeys = () => {
    const text = variantData.keys.map(k => `${k.num}: ${k.letter}`).join(' | ');
    const fullText = `Ключи к тесту "${quiz.title}" (${subjectName ? subjectName + ', ' : ''}Вариант ${variantIndex}):\n${text}`;
    navigator.clipboard.writeText(fullText);
    setCopiedKeys(true);
    setTimeout(() => setCopiedKeys(false), 2000);
  };

  const handleShuffle = () => {
    setRandomSalt(prev => prev + 1);
  };

  const modalContent = (
    <div className="printable-modal-backdrop" onClick={onClose}>
      <div className="printable-modal-window" onClick={e => e.stopPropagation()}>
        {/* Controls Toolbar (Hidden when printing) */}
        <div className="printable-toolbar no-print">
          <div className="printable-toolbar-left">
            <span className="printable-toolbar-title">
              <FileText size={18} style={{ color: 'var(--primary-color)' }} />
              Печать теста А4
            </span>

            {/* Variant Switcher */}
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

            {/* Shuffle Button */}
            <button
              type="button"
              className="toolbar-btn"
              onClick={handleShuffle}
              title="Перемешать вопросы и ответы заново"
            >
              <RefreshCw size={14} /> Перемешать
            </button>
          </div>

          <div className="printable-toolbar-right">
            <button
              type="button"
              className="toolbar-btn"
              onClick={handleCopyKeys}
              disabled={totalQuestions === 0}
              title="Скопировать ключи в буфер обмена"
            >
              {copiedKeys ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
              {copiedKeys ? 'Ключи скопированы' : 'Копировать ключи'}
            </button>

            <button
              type="button"
              className="toolbar-btn"
              onClick={handleSavePdf}
              disabled={loading || savingPdf || totalQuestions === 0}
              title="Скачать PDF без диалога печати"
            >
              {savingPdf ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
              {savingPdf ? 'Создание PDF...' : 'Сохранить в PDF'}
            </button>

            <button
              type="button"
              className="print-primary-btn"
              onClick={handlePrint}
              disabled={loading || totalQuestions === 0}
              title="Открыть диалог печати"
            >
              <Printer size={16} /> Печать
            </button>

            <button
              type="button"
              className="close-btn"
              onClick={onClose}
              title="Закрыть"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Preview Area */}
        <div className="printable-preview-area">
          {loading ? (
            <div className="printable-loading">
              <Loader2 size={32} className="spinner" style={{ color: '#4f46e5', marginBottom: '12px' }} />
              <div>Загрузка вопросов теста...</div>
            </div>
          ) : totalQuestions === 0 ? (
            <div className="printable-loading">
              <p style={{ margin: 0, fontWeight: 'bold' }}>В этом тесте пока нет вопросов.</p>
            </div>
          ) : (
            /* Exact A4 Printable Sheet */
            <div ref={sheetRef} className="a4-sheet" id="printable-quiz-sheet">
              {/* SHEET HEADER */}
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
                  <div className="variant-badge">
                    ВАРИАНТ {variantIndex}
                  </div>
                  <div className="grading-box">
                    <div className="grading-row">
                      <span>Баллы:</span>
                      <strong>____ / {totalQuestions}</strong>
                    </div>
                    <div className="grading-row">
                      <span>Оценка:</span>
                      <strong>________</strong>
                    </div>
                  </div>
                </div>
              </header>

              {/* QUESTIONS 2-COLUMN GRID */}
              <main className="sheet-questions-grid">
                {/* Left Column */}
                <div className="sheet-column">
                  {leftColQuestions.map(q => (
                    <div key={q.number} className="sheet-question-item">
                      <div className="sheet-question-title">
                        <span className="q-num">{q.number}.</span>
                        <span className="q-text"><MathRenderer text={q.question} /></span>
                      </div>
                      <div className="sheet-options-list">
                        {q.options.map((optText, oIdx) => (
                          <div key={oIdx} className="sheet-option-row">
                            <span className="sheet-option-letter">{OPTION_LETTERS[oIdx]})</span>
                            <span className="sheet-option-text">
                              <MathRenderer text={optText} />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right Column */}
                <div className="sheet-column">
                  {rightColQuestions.map(q => (
                    <div key={q.number} className="sheet-question-item">
                      <div className="sheet-question-title">
                        <span className="q-num">{q.number}.</span>
                        <span className="q-text"><MathRenderer text={q.question} /></span>
                      </div>
                      <div className="sheet-options-list">
                        {q.options.map((optText, oIdx) => (
                          <div key={oIdx} className="sheet-option-row">
                            <span className="sheet-option-letter">{OPTION_LETTERS[oIdx]})</span>
                            <span className="sheet-option-text">
                              <MathRenderer text={optText} />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </main>

              {/* CUT-OFF STRIP FOR TEACHER (BOTTOM) */}
              <footer className="sheet-teacher-cut">
                <div className="cut-line">
                  <Scissors size={13} className="cut-icon" />
                  <span className="cut-dash"></span>
                </div>

                <div className="teacher-key-box">
                  <div className="key-header">
                    <strong>🔑 КЛЮЧИ ДЛЯ ПРОВЕРКИ</strong>
                    <span className="key-subtitle">
                      «{quiz.title}» • {subjectName ? `${subjectName} • ` : ''}<strong>ВАРИАНТ {variantIndex}</strong> • Всего: {totalQuestions} вопр.
                    </span>
                  </div>

                  <div className="key-grid">
                    {variantData.keys.map(k => (
                      <div key={k.num} className="key-badge">
                        <span className="key-num">{k.num}</span>
                        <span className="key-letter">{k.letter}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </footer>
            </div>
          )}
        </div>
      </div>

      {/* Embedded Component & Print Styles */}
      <style>{`
        .printable-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
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
        }

        .printable-toolbar {
          background: #ffffff;
          padding: 12px 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          flex-shrink: 0;
        }

        .printable-toolbar-left,
        .printable-toolbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .printable-toolbar-title {
          font-weight: 700;
          font-size: 0.95rem;
          color: #1e293b;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-right: 6px;
        }

        .variant-pills {
          display: flex;
          background: #f1f5f9;
          padding: 3px;
          border-radius: 10px;
          gap: 3px;
        }

        .variant-pill {
          padding: 5px 12px;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          transition: all 0.15s;
          box-shadow: none;
        }

        .variant-pill.active {
          background: #ffffff;
          color: #4f46e5;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .toolbar-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 0.75rem;
          font-weight: 600;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          color: #334155;
          border-radius: 8px;
          cursor: pointer;
          box-shadow: none;
          transition: background 0.15s;
        }

        .toolbar-btn:hover {
          background: #e2e8f0;
        }

        .print-primary-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          font-size: 0.82rem;
          font-weight: 700;
          background: #4f46e5;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
          transition: transform 0.1s, background 0.15s;
        }

        .print-primary-btn:hover {
          background: #4338ca;
        }

        .close-btn {
          background: #f1f5f9;
          border: none;
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          cursor: pointer;
          box-shadow: none;
        }

        .close-btn:hover {
          background: #e2e8f0;
          color: #0f172a;
        }

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

        /* --- SHEET STYLING (A4 RATIO) --- */
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
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        .sheet-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000000;
          padding-bottom: 6px;
          margin-bottom: 8px;
          gap: 12px;
        }

        .sheet-header-left {
          flex: 1;
        }

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

        .subtitle-dot {
          opacity: 0.5;
        }

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

        .field-row-split {
          display: flex;
          gap: 18px;
        }

        .field-inline {
          display: flex;
          align-items: flex-end;
          gap: 6px;
        }

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

        .field-line.short {
          min-width: 65px;
          width: 75px;
        }

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

        /* --- 2-COLUMN QUESTIONS GRID --- */
        .sheet-questions-grid {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 14px;
          row-gap: 6px;
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

        .q-num {
          font-weight: 800;
          flex-shrink: 0;
        }

        .q-text {
          flex: 1;
        }

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

        .sheet-option-text {
          flex: 1;
        }

        /* --- TEACHER CUT STRIP --- */
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

        .cut-icon {
          flex-shrink: 0;
          color: #000000;
        }

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

        .key-subtitle {
          font-size: 9px;
          color: #444444;
        }

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

        /* --- PRINT MEDIA RULES (100% Vector Quality A4) --- */
        @media print {
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Hide everything in body except the modal — fixes blank first page */
          body > *:not(.printable-modal-backdrop) {
            display: none !important;
          }

          /* Hide toolbar and non-print elements */
          .app-shell,
          .navbar,
          .printable-toolbar,
          .no-print {
            display: none !important;
          }

          .printable-modal-backdrop {
            position: static !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }

          .printable-modal-window {
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

          .printable-preview-area {
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            display: block !important;
          }

          .a4-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
            width: 100% !important;
            min-height: auto !important;
            padding: 0 !important;
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
