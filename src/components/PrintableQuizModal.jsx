import React, { useState, useMemo, useRef } from 'react';
import { Printer, X, Scissors, RefreshCw, Copy, Check, CheckSquare, Circle, FileText } from 'lucide-react';
import MathRenderer from './MathRenderer';

// Letters for answer options (Cyrillic by default)
const OPTION_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З'];

// Simple deterministic hash & PRNG for consistent variant generation
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

const PrintableQuizModal = ({ isOpen, onClose, quiz }) => {
  const [variantIndex, setVariantIndex] = useState(1);
  const [randomSalt, setRandomSalt] = useState(0);
  const [bubbleShape, setBubbleShape] = useState('circle'); // 'circle' | 'square'
  const [copiedKeys, setCopiedKeys] = useState(false);
  const sheetRef = useRef(null);

  const rawQuestions = useMemo(() => {
    return quiz?.content?.questions || [];
  }, [quiz]);

  // Generate variant questions (shuffled questions + shuffled options, max 14)
  const variantData = useMemo(() => {
    if (!rawQuestions || rawQuestions.length === 0) {
      return { questions: [], keys: [] };
    }

    const seed = hashString(`${quiz?.id || 'quiz'}_var_${variantIndex}_salt_${randomSalt}`);
    const rng = createSeededRandom(seed);

    // 1. Clone and assign original index
    const cloned = rawQuestions.map((q, idx) => ({ ...q, originalQuestionIndex: idx }));

    // 2. Shuffle questions
    for (let i = cloned.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
    }

    // 3. Limit to max 14 questions (or quiz limit if smaller)
    const limit = Math.min(14, quiz?.content?.question_limit ? parseInt(quiz.content.question_limit, 10) : 14, cloned.length);
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
  }, [rawQuestions, quiz, variantIndex, randomSalt]);

  if (!isOpen || !quiz) return null;

  const totalQuestions = variantData.questions.length;
  const midPoint = Math.ceil(totalQuestions / 2);
  const leftColQuestions = variantData.questions.slice(0, midPoint);
  const rightColQuestions = variantData.questions.slice(midPoint);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyKeys = () => {
    const text = variantData.keys.map(k => `${k.num}: ${k.letter}`).join(' | ');
    const fullText = `Ключи к тесту "${quiz.title}" (Вариант ${variantIndex}):\n${text}`;
    navigator.clipboard.writeText(fullText);
    setCopiedKeys(true);
    setTimeout(() => setCopiedKeys(false), 2000);
  };

  const handleShuffle = () => {
    setRandomSalt(prev => prev + 1);
  };

  return (
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

            {/* Shape Toggle */}
            <div className="shape-toggle" title="Форма маркера для ответа">
              <button
                type="button"
                className={`shape-btn ${bubbleShape === 'circle' ? 'active' : ''}`}
                onClick={() => setBubbleShape('circle')}
              >
                <Circle size={13} /> Кружки
              </button>
              <button
                type="button"
                className={`shape-btn ${bubbleShape === 'square' ? 'active' : ''}`}
                onClick={() => setBubbleShape('square')}
              >
                <CheckSquare size={13} /> Квадраты
              </button>
            </div>
          </div>

          <div className="printable-toolbar-right">
            <button
              type="button"
              className="toolbar-btn"
              onClick={handleCopyKeys}
              title="Скопировать ключи в буфер обмена"
            >
              {copiedKeys ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
              {copiedKeys ? 'Ключи скопированы' : 'Копировать ключи'}
            </button>

            <button
              type="button"
              className="print-primary-btn"
              onClick={handlePrint}
            >
              <Printer size={16} /> Печать / Сохранить в PDF
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
          {/* Exact A4 Printable Sheet */}
          <div ref={sheetRef} className="a4-sheet" id="printable-quiz-sheet">
            {/* SHEET HEADER */}
            <header className="sheet-header">
              <div className="sheet-header-left">
                <h1 className="sheet-quiz-title">{quiz.title}</h1>
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
                          <span className={`sheet-bubble ${bubbleShape}`}>
                            {OPTION_LETTERS[oIdx]}
                          </span>
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
                          <span className={`sheet-bubble ${bubbleShape}`}>
                            {OPTION_LETTERS[oIdx]}
                          </span>
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
                <Scissors size={14} className="cut-icon" />
                <span className="cut-dash"></span>
                <span className="cut-label">Линия отреза для учителя (отрезать перед выдачей бланка)</span>
                <span className="cut-dash"></span>
              </div>

              <div className="teacher-key-box">
                <div className="key-header">
                  <strong>🔑 КЛЮЧИ ДЛЯ ПРОВЕРКИ</strong>
                  <span className="key-subtitle">
                    «{quiz.title}» • <strong>ВАРИАНТ {variantIndex}</strong> • Всего: {totalQuestions} вопр.
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

        .shape-toggle {
          display: flex;
          background: #f1f5f9;
          padding: 3px;
          border-radius: 8px;
          gap: 2px;
        }

        .shape-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          font-size: 0.7rem;
          font-weight: 600;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          box-shadow: none;
        }

        .shape-btn.active {
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 1px 2px rgba(0,0,0,0.08);
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
          padding: 24px;
          display: flex;
          justify-content: center;
          background: #cbd5e1;
        }

        /* --- SHEET STYLING (A4 RATIO) --- */
        .a4-sheet {
          background: #ffffff;
          color: #000000;
          width: 210mm;
          min-height: 297mm;
          padding: 10mm 12mm 8mm 12mm;
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
          padding-bottom: 8px;
          margin-bottom: 12px;
          gap: 14px;
        }

        .sheet-header-left {
          flex: 1;
        }

        .sheet-quiz-title {
          font-size: 15px;
          font-weight: 800;
          margin: 0 0 8px 0;
          color: #000000;
          line-height: 1.25;
          letter-spacing: -0.2px;
        }

        .sheet-student-fields {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field-row {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          width: 100%;
        }

        .field-row-split {
          display: flex;
          gap: 20px;
        }

        .field-inline {
          display: flex;
          align-items: flex-end;
          gap: 6px;
        }

        .field-label {
          font-size: 11px;
          font-weight: 700;
          color: #000000;
        }

        .field-line {
          flex: 1;
          border-bottom: 1px solid #000000;
          height: 14px;
          min-width: 140px;
        }

        .field-line.short {
          min-width: 70px;
          width: 80px;
        }

        .sheet-header-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }

        .variant-badge {
          background: #000000;
          color: #ffffff;
          font-size: 11px;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 4px;
          letter-spacing: 0.5px;
        }

        .grading-box {
          border: 1.5px solid #000000;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 11px;
          min-width: 115px;
        }

        .grading-row {
          display: flex;
          justify-content: space-between;
          line-height: 1.4;
        }

        /* --- 2-COLUMN QUESTIONS GRID --- */
        .sheet-questions-grid {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 16px;
          row-gap: 8px;
          align-content: start;
        }

        .sheet-column {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .sheet-question-item {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .sheet-question-title {
          display: flex;
          align-items: flex-start;
          gap: 4px;
          margin-bottom: 4px;
          font-size: 11.5px;
          font-weight: 700;
          line-height: 1.3;
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
          gap: 2.5px;
          padding-left: 6px;
        }

        .sheet-option-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          line-height: 1.25;
          color: #111111;
        }

        .sheet-bubble {
          width: 17px;
          height: 17px;
          border: 1.5px solid #000000;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 9.5px;
          font-weight: 800;
          flex-shrink: 0;
          color: #000000;
          background: #ffffff;
        }

        .sheet-bubble.circle {
          border-radius: 50%;
        }

        .sheet-bubble.square {
          border-radius: 3px;
        }

        .sheet-option-text {
          flex: 1;
        }

        /* --- TEACHER CUT STRIP --- */
        .sheet-teacher-cut {
          margin-top: auto;
          padding-top: 8px;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .cut-line {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
          color: #444444;
          font-size: 9.5px;
        }

        .cut-icon {
          flex-shrink: 0;
          color: #222222;
        }

        .cut-dash {
          flex: 1;
          border-bottom: 1.5px dashed #444444;
          height: 1px;
        }

        .cut-label {
          font-style: italic;
          font-size: 9.5px;
          white-space: nowrap;
        }

        .teacher-key-box {
          border: 1.5px solid #000000;
          border-radius: 6px;
          padding: 6px 10px;
          background: #fafafa;
        }

        .key-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10.5px;
          margin-bottom: 6px;
          border-bottom: 1px solid #dddddd;
          padding-bottom: 4px;
        }

        .key-subtitle {
          font-size: 9.5px;
          color: #444444;
        }

        .key-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          align-items: center;
        }

        .key-badge {
          display: inline-flex;
          border: 1px solid #000000;
          border-radius: 4px;
          overflow: hidden;
          font-size: 10px;
          font-weight: 700;
        }

        .key-num {
          background: #eeeeee;
          padding: 2px 5px;
          border-right: 1px solid #000000;
          color: #222222;
        }

        .key-letter {
          background: #ffffff;
          padding: 2px 6px;
          color: #000000;
          font-weight: 800;
        }

        /* --- PRINT MEDIA RULES (100% Vector Quality A4) --- */
        @media print {
          body, html {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Hide entire web app interface */
          .app-shell,
          .navbar,
          .printable-toolbar,
          .printable-modal-backdrop > *:not(.printable-modal-window),
          .no-print {
            display: none !important;
          }

          .printable-modal-backdrop {
            position: static !important;
            background: transparent !important;
            padding: 0 !important;
            display: block !important;
          }

          .printable-modal-window {
            box-shadow: none !important;
            border-radius: 0 !important;
            background: transparent !important;
            max-width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            display: block !important;
          }

          .printable-preview-area {
            background: transparent !important;
            padding: 0 !important;
            display: block !important;
            overflow: visible !important;
          }

          .a4-sheet {
            box-shadow: none !important;
            margin: 0 auto !important;
            width: 100% !important;
            min-height: auto !important;
            padding: 5mm 6mm !important;
          }

          @page {
            size: A4 portrait;
            margin: 8mm 10mm 6mm 10mm;
          }
        }
      `}</style>
    </div>
  );
};

export default PrintableQuizModal;
