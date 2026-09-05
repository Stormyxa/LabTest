import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  extractPdfText,
  detectTocPages,
  analyzeTextbookStructure,
  generateQuizForParagraph,
  searchYouTubeVideo,
  getEffectiveApiKey,
  CANDIDATE_MODELS
} from '../lib/aiBookImporter';
import {
  Sparkles, Book, FileText, Play, Pause, Square, CheckCircle,
  AlertCircle, ChevronRight, Split, Trash2, Plus, ExternalLink,
  Layers, Clock, Youtube, Eye, EyeOff, RefreshCw, Upload, FileUp,
  Settings, Check, HelpCircle, Search, ClipboardList
} from 'lucide-react';

const BookImporterStudio = ({
  session,
  profile,
  classes = [],
  sections = [],
  onComplete,
  initialSectionId = null,
  initialClassId = null,
  isPersonal = false
}) => {
  // Destination
  const [targetClassId, setTargetClassId] = useState(initialClassId || '');
  const [targetSectionId, setTargetSectionId] = useState(initialSectionId || '');

  // Book source
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [useSectionBook, setUseSectionBook] = useState(true);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);

  // TOC Mode: 'pdf' (scan from pdf) or 'text' (paste text directly)
  const [tocMode, setTocMode] = useState('pdf');
  const [manualTocText, setManualTocText] = useState('');

  // TOC extraction settings
  const [tocStartPage, setTocStartPage] = useState(1);
  const [tocEndPage, setTocEndPage] = useState(10);
  const [scanningToc, setScanningToc] = useState(false);
  const [autoDetectingToc, setAutoDetectingToc] = useState(false);
  const [tocScanProgress, setTocScanProgress] = useState('');

  // Roadmap (parsed structure)
  const [roadmap, setRoadmap] = useState([]);
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('gemini_custom_api_key') || '');
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('gemini_selected_model') || 'gemini-3.8-flash');
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Generation settings
  const [questionsPerQuiz, setQuestionsPerQuiz] = useState(20);
  const [questionLimit, setQuestionLimit] = useState(10);
  const [authorName, setAuthorName] = useState('Афанасиади Анастас');
  const [searchYoutube, setSearchYoutube] = useState(true);
  const [autoPublish, setAutoPublish] = useState(false);
  const [rateLimitDelaySec, setRateLimitDelaySec] = useState(4); // 4s = 15 RPM

  // Pipeline execution state
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentStatus, setCurrentStatus] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [createdQuizzes, setCreatedQuizzes] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);

  const abortRef = useRef(false);
  const pauseRef = useRef(false);

  // Selected section object
  const currentSection = sections.find(s => s.id === targetSectionId);

  // If section changes, check if it has book_url
  useEffect(() => {
    if (currentSection?.book_url) {
      setPdfUrl(currentSection.book_url);
      setUseSectionBook(true);
    }
  }, [currentSection]);

  // Save custom key
  const handleSaveApiKey = (val) => {
    setCustomApiKey(val);
    localStorage.setItem('gemini_custom_api_key', val);
  };

  const activeApiKey = getEffectiveApiKey(customApiKey);

  // ─── Step 1A: Auto-detect TOC pages in PDF ───────────────────────
  const handleAutoDetectTocPages = async () => {
    setAutoDetectingToc(true);
    setErrorMessage(null);
    setTocScanProgress('Поиск содержания в учебнике...');

    try {
      const source = (useSectionBook && currentSection?.book_url) ? currentSection.book_url : pdfFile;
      if (!source) {
        throw new Error('Пожалуйста, выберите локальный PDF-файл или секцию с прикреплённым учебником.');
      }

      const res = await detectTocPages(source, (curr, total, msg) => {
        setTocScanProgress(msg);
      });

      setPdfTotalPages(res.numPages);
      setTocStartPage(res.startPage);
      setTocEndPage(res.endPage);
      setTocScanProgress(`✓ ${res.reason}`);
    } catch (err) {
      console.error('Detect TOC error:', err);
      setErrorMessage(err.message || 'Не удалось автоматически найти оглавление. Введите номера страниц вручную или вставьте текст.');
      setTocScanProgress('');
    } finally {
      setAutoDetectingToc(false);
    }
  };

  // ─── Step 1B: Scan TOC from PDF or Text ────────────────────────
  const handleScanToc = async () => {
    setScanningToc(true);
    setErrorMessage(null);
    setRoadmap([]);

    try {
      let contentForGemini = '';
      let totalPages = pdfTotalPages || 200;

      if (tocMode === 'text') {
        if (!manualTocText.trim()) {
          throw new Error('Пожалуйста, вставьте скопированный текст содержания / оглавления книги.');
        }
        contentForGemini = manualTocText.trim();
        setTocScanProgress('Анализ структуры по введённому тексту с помощью Gemini Flash...');
      } else {
        const source = (useSectionBook && currentSection?.book_url) ? currentSection.book_url : pdfFile;
        if (!source) {
          throw new Error('Пожалуйста, выберите локальный PDF-файл или секцию с прикреплённым учебником.');
        }

        setTocScanProgress('Чтение страниц оглавления из PDF...');
        const { fullText, numPages } = await extractPdfText(
          source,
          parseInt(tocStartPage) || 1,
          parseInt(tocEndPage) || 10,
          (curr, total) => {
            setTocScanProgress(`Извлечение текста: страница ${curr} из ${total}...`);
          }
        );

        totalPages = numPages;
        setPdfTotalPages(numPages);
        contentForGemini = fullText;
        setTocScanProgress('Анализ структуры и распознавание глав с помощью Gemini Flash...');
      }

      const items = await analyzeTextbookStructure(contentForGemini, activeApiKey, totalPages, selectedModel);
      setRoadmap(items);
      setTocScanProgress('');
    } catch (err) {
      console.error('TOC Scan Error:', err);
      setErrorMessage(err.message || 'Ошибка при распознавании оглавления.');
      setTocScanProgress('');
    } finally {
      setScanningToc(false);
    }
  };

  // ─── Split an item into Part 1 and Part 2 ──────────────────────
  const handleSplitItem = (index) => {
    const item = roadmap[index];
    if (item.type !== 'quiz') return;

    const totalPages = Math.max(1, item.endPage - item.startPage + 1);
    const midPage = item.startPage + Math.floor(totalPages / 2) - 1;

    // Remove existing part suffixes if already present
    const cleanTitle = item.title.replace(/\s*\(ч\.\s*\d+\)/gi, '').trim();

    const part1 = {
      ...item,
      id: `item-${Date.now()}-1`,
      title: `${cleanTitle} (ч. 1)`,
      startPage: item.startPage,
      endPage: Math.max(item.startPage, midPage)
    };

    const part2 = {
      ...item,
      id: `item-${Date.now()}-2`,
      title: `${cleanTitle} (ч. 2)`,
      startPage: Math.min(item.endPage, midPage + 1),
      endPage: item.endPage
    };

    const updated = [...roadmap];
    updated.splice(index, 1, part1, part2);
    setRoadmap(updated);
  };

  // Remove an item from roadmap
  const handleRemoveItem = (index) => {
    setRoadmap(roadmap.filter((_, i) => i !== index));
  };

  // Toggle item enabled
  const handleToggleItem = (index) => {
    const updated = [...roadmap];
    updated[index].enabled = !updated[index].enabled;
    setRoadmap(updated);
  };

  // Update item field
  const handleUpdateItem = (index, field, value) => {
    const updated = [...roadmap];
    updated[index][field] = value;
    setRoadmap(updated);
  };

  // Add custom divider or quiz manually
  const handleAddManualItem = (type) => {
    setRoadmap([
      ...roadmap,
      {
        id: `manual-${Date.now()}`,
        type,
        title: type === 'divider' ? 'НОВЫЙ РАЗДЕЛИТЕЛЬ' : '§ Новая тема',
        startPage: 1,
        endPage: 5,
        enabled: true,
        status: 'pending'
      }
    ]);
  };

  // Helper wait function with countdown
  const waitWithCountdown = async (seconds) => {
    for (let s = seconds; s > 0; s--) {
      if (abortRef.current) return;
      setCountdown(s);
      await new Promise(r => setTimeout(r, 1000));
    }
    setCountdown(0);
  };

  // ─── Step 3: Run the Pipeline ──────────────────────────────────
  const handleStartPipeline = async () => {
    if (!targetSectionId) {
      alert('Пожалуйста, выберите целевой предмет (секцию) для загрузки тестов.');
      return;
    }

    const enabledItems = roadmap.filter(i => i.enabled);
    if (enabledItems.length === 0) {
      alert('В плане нет выбранных элементов для генерации.');
      return;
    }

    setIsRunning(true);
    setIsPaused(false);
    abortRef.current = false;
    pauseRef.current = false;
    setErrorMessage(null);

    const source = (useSectionBook && currentSection?.book_url) ? currentSection.book_url : pdfFile;

    try {
      // Get current max order in target section
      const { data: maxOrderData, error: rpcError } = await supabase.rpc('get_max_sort_order', {
        p_section_id: targetSectionId
      });
      if (rpcError) throw rpcError;
      let currentSortOrder = (maxOrderData ?? -1) + 1;

      for (let i = 0; i < roadmap.length; i++) {
        if (abortRef.current) break;

        // Check for pause
        while (pauseRef.current) {
          if (abortRef.current) break;
          await new Promise(r => setTimeout(r, 500));
        }
        if (abortRef.current) break;

        const item = roadmap[i];
        if (!item.enabled || item.status === 'completed') {
          continue;
        }

        setCurrentIndex(i);

        // Update item status to generating
        setRoadmap(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'generating', error: null } : it));

        try {
          if (item.type === 'divider') {
            // ── Create Divider in Supabase ──
            setCurrentStatus(`Создание разделителя: ${item.title}...`);
            const { data: dividerData, error: divErr } = await supabase.from('quizzes').insert({
              title: item.title.trim(),
              section_id: targetSectionId,
              author_id: session.user.id,
              is_personal: isPersonal,
              is_verified: true,
              sort_order: currentSortOrder++,
              content: {
                is_divider: true,
                divider_text: item.title.trim()
              }
            }).select().single();

            if (divErr) throw divErr;

            setRoadmap(prev => prev.map((it, idx) => idx === i ? {
              ...it,
              status: 'completed',
              createdQuizId: dividerData?.id
            } : it));

            setCreatedQuizzes(prev => [...prev, { title: item.title, id: dividerData.id, isDivider: true }]);
          } else {
            // ── Create Quiz: Extract Pages -> Gemini -> YouTube -> Supabase ──
            setCurrentStatus(`[1/3] Чтение страниц ${item.startPage}–${item.endPage} из PDF...`);

            const { fullText: paragraphText } = await extractPdfText(
              source,
              parseInt(item.startPage) || 1,
              parseInt(item.endPage) || 1
            );

            if (!paragraphText.trim()) {
              throw new Error(`Не удалось прочитать текст на страницах ${item.startPage}–${item.endPage}.`);
            }

            setCurrentStatus(`[2/3] Gemini Flash: генерация академического теста (${questionsPerQuiz} вопр.)...`);

            const quizObj = await generateQuizForParagraph(
              paragraphText,
              item.title,
              {
                questionsCount: questionsPerQuiz,
                questionLimit: questionLimit,
                authorName,
                preferredModel: selectedModel
              },
              activeApiKey
            );

            let youtubeResources = [];
            if (searchYoutube) {
              setCurrentStatus(`[2.5/3] Поиск обучающего видео на YouTube...`);
              try {
                youtubeResources = await searchYouTubeVideo(item.title, currentSection?.name || 'История Казахстана', activeApiKey, selectedModel);
              } catch (ytErr) {
                console.warn('YouTube search skipped due to error:', ytErr);
              }
            }

            setCurrentStatus(`[3/3] Сохранение теста в базу LabTest...`);

            const { data: createdQuiz, error: quizErr } = await supabase.from('quizzes').insert({
              title: item.title.trim(),
              section_id: targetSectionId,
              author_id: session.user.id,
              is_personal: isPersonal,
              is_verified: true,
              is_hidden: !autoPublish,
              sort_order: currentSortOrder++,
              content: {
                questions: quizObj.questions,
                time_limit: null,
                question_limit: questionLimit > 0 ? questionLimit : null
              },
              resources: youtubeResources.length > 0 ? youtubeResources : null
            }).select().single();

            if (quizErr) throw quizErr;

            setRoadmap(prev => prev.map((it, idx) => idx === i ? {
              ...it,
              status: 'completed',
              createdQuizId: createdQuiz.id
            } : it));

            setCreatedQuizzes(prev => [...prev, {
              title: item.title,
              id: createdQuiz.id,
              questionsCount: quizObj.questions.length,
              isDivider: false
            }]);
          }

          // Delay between requests for 15 RPM safety
          if (i < roadmap.length - 1 && !abortRef.current) {
            setCurrentStatus(`Пауза безопасности для соблюдения лимитов (15 RPM)...`);
            await waitWithCountdown(rateLimitDelaySec);
          }
        } catch (itemErr) {
          console.error(`Ошибка при создании "${item.title}":`, itemErr);
          const friendlyMsg = itemErr.message || 'Ошибка обработки';
          setRoadmap(prev => prev.map((it, idx) => idx === i ? {
            ...it,
            status: 'error',
            error: friendlyMsg
          } : it));
          setCurrentStatus(`⚠️ Пропуск "${item.title}": ${friendlyMsg}. Переход к следующему параграфу...`);
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      setCurrentStatus('🎉 Все выбранные тесты и разделители успешно обработаны!');
      if (onComplete) onComplete();
    } catch (err) {
      console.error('Pipeline Error:', err);
      setErrorMessage(err.message || 'Ошибка во время работы конвейера.');
    } finally {
      setIsRunning(false);
      setCountdown(0);
    }
  };

  const handlePauseToggle = () => {
    pauseRef.current = !pauseRef.current;
    setIsPaused(pauseRef.current);
  };

  const handleStopPipeline = () => {
    abortRef.current = true;
    pauseRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setCurrentStatus('Остановлено пользователем.');
  };

  // Badge styler for roadmap items
  const getBadgeStyle = (title, type) => {
    if (type === 'divider') {
      const upper = title.toUpperCase();
      if (upper.includes('РАЗДЕЛ') || upper.includes('ЧАСТЬ')) {
        return { bg: 'rgba(168, 85, 247, 0.12)', color: '#9333ea', label: 'РАЗДЕЛ' };
      }
      return { bg: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', label: 'ГЛАВА' };
    }
    return { bg: 'rgba(16, 185, 129, 0.12)', color: '#059669', label: 'ТЕСТ' };
  };

  const completedCount = roadmap.filter(i => i.status === 'completed').length;
  const enabledCount = roadmap.filter(i => i.enabled).length;
  const progressPercent = enabledCount > 0 ? Math.round((completedCount / enabledCount) * 100) : 0;

  return (
    <div className="card animate" style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* ── Header ── */}
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div className="flex-center" style={{ gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--primary-color), #a855f7)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800' }}>Авто-импорт учебника с ИИ</h2>
            <div style={{ fontSize: '0.85rem', opacity: 0.6 }}>
              Создание тестов и разделителей по PDF с помощью Gemini Flash и поиском видеоуроков
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowKeyInput(!showKeyInput)}
          style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '8px 14px', borderRadius: '10px', boxShadow: 'none', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Settings size={15} />
          {showKeyInput ? 'Скрыть настройки API' : 'Gemini API Key'}
        </button>
      </div>

      {/* ── Optional Custom API Key input & Model Selector ── */}
      {showKeyInput && (
        <div style={{ marginBottom: '25px', padding: '18px 20px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '14px', border: '1px dashed rgba(99, 102, 241, 0.2)' }}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
              Приоритетная модель Gemini:
            </label>
            <select
              value={selectedModel}
              onChange={e => {
                setSelectedModel(e.target.value);
                localStorage.setItem('gemini_selected_model', e.target.value);
              }}
              style={{ width: '100%', maxWidth: '340px', padding: '8px 12px', fontSize: '0.9rem', borderRadius: '8px' }}
            >
              {CANDIDATE_MODELS.map(m => (
                <option key={m} value={m}>
                  {m} {m === 'gemini-3.8-flash' ? '(Новейшая, с авто-фолбэком)' : ''}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '0.78rem', opacity: 0.6, marginTop: '4px' }}>
              Если выбранная модель временно перегружена (503 High Demand), система автоматически продолжит работу на резервных моделях (3.7 / 3.5 / 2.5).
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
              Пользовательский Google Gemini API Key (опционально, если хотите использовать личный ключ):
            </label>
            <div className="flex-center" style={{ gap: '10px' }}>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={customApiKey}
                onChange={e => handleSaveApiKey(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem' }}
              />
              {customApiKey && (
                <button onClick={() => handleSaveApiKey('')} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '8px 14px', borderRadius: '8px', boxShadow: 'none' }}>
                  Сбросить
                </button>
              )}
            </div>
            <div style={{ fontSize: '0.78rem', opacity: 0.6, marginTop: '6px' }}>
              По умолчанию используется ключ из .env.local ({activeApiKey ? '✓ Настроен' : '✕ Не найден'}).
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 1: Destination & Book Source ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '25px' }}>
        {/* Destination Section */}
        <div style={{ padding: '20px', background: 'rgba(0,0,0,0.02)', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-color)' }}>
            <Layers size={18} /> 1. Куда загружать
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block', marginBottom: '4px' }}>Папка / Класс:</label>
              <select
                value={targetClassId}
                onChange={e => { setTargetClassId(e.target.value); setTargetSectionId(''); }}
                style={{ width: '100%', padding: '10px', fontSize: '0.9rem' }}
              >
                <option value="">-- Выберите папку --</option>
                {classes.filter(c => !c.is_divider).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block', marginBottom: '4px' }}>Предмет / Секция:</label>
              <select
                value={targetSectionId}
                onChange={e => setTargetSectionId(e.target.value)}
                style={{ width: '100%', padding: '10px', fontSize: '0.9rem' }}
                disabled={!targetClassId}
              >
                <option value="">-- Выберите предмет --</option>
                {sections.filter(s => s.class_id === targetClassId && !s.is_divider).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Book Source */}
        <div style={{ padding: '20px', background: 'rgba(0,0,0,0.02)', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: '#a855f7' }}>
            <Book size={18} /> 2. Учебник (PDF)
          </div>

          {currentSection?.book_url ? (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                <input
                  type="radio"
                  name="bookSource"
                  checked={useSectionBook}
                  onChange={() => setUseSectionBook(true)}
                />
                <span style={{ fontSize: '0.88rem', fontWeight: '600' }}>Прикреплённый к предмету учебник:</span>
              </label>
              <div style={{ padding: '8px 12px', background: 'var(--card-bg)', borderRadius: '10px', fontSize: '0.82rem', wordBreak: 'break-all', opacity: 0.8, border: '1px solid rgba(0,0,0,0.05)' }}>
                {currentSection.book_url}
              </div>
            </div>
          ) : null}

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
              <input
                type="radio"
                name="bookSource"
                checked={!useSectionBook || !currentSection?.book_url}
                onChange={() => setUseSectionBook(false)}
              />
              <span style={{ fontSize: '0.88rem', fontWeight: '600' }}>Выбрать PDF файл на компьютере:</span>
            </label>
            <input
              type="file"
              accept=".pdf"
              disabled={useSectionBook && !!currentSection?.book_url}
              onChange={e => {
                if (e.target.files?.[0]) {
                  setPdfFile(e.target.files[0]);
                  setUseSectionBook(false);
                }
              }}
              style={{ width: '100%', padding: '8px', fontSize: '0.85rem' }}
            />
            {pdfFile && <div style={{ fontSize: '0.8rem', color: '#059669', marginTop: '4px' }}>✓ Выбран файл: {pdfFile.name} ({(pdfFile.size / (1024 * 1024)).toFixed(1)} МБ)</div>}
          </div>
        </div>

        {/* TOC Scan Options */}
        <div style={{ padding: '20px', background: 'rgba(0,0,0,0.02)', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
            <FileText size={18} /> 3. Содержание / Оглавление
          </div>

          {/* Mode Tabs */}
          <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.04)', padding: '4px', borderRadius: '10px', marginBottom: '15px' }}>
            <button
              type="button"
              onClick={() => setTocMode('pdf')}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '0.8rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: tocMode === 'pdf' ? 'var(--card-bg)' : 'transparent',
                boxShadow: tocMode === 'pdf' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                fontWeight: tocMode === 'pdf' ? '700' : '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px'
              }}
            >
              <FileText size={13} /> Из PDF
            </button>
            <button
              type="button"
              onClick={() => setTocMode('text')}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '0.8rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: tocMode === 'text' ? 'var(--card-bg)' : 'transparent',
                boxShadow: tocMode === 'text' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                fontWeight: tocMode === 'text' ? '700' : '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px'
              }}
            >
              <ClipboardList size={13} /> Вставить текст
            </button>
          </div>

          {tocMode === 'pdf' ? (
            <div>
              <div className="flex-center" style={{ gap: '10px', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block', marginBottom: '2px' }}>Стр. с</label>
                  <input
                    type="number"
                    min="1"
                    value={tocStartPage}
                    onChange={e => setTocStartPage(e.target.value)}
                    style={{ width: '100%', padding: '8px', textAlign: 'center' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block', marginBottom: '2px' }}>По стр.</label>
                  <input
                    type="number"
                    min="1"
                    value={tocEndPage}
                    onChange={e => setTocEndPage(e.target.value)}
                    style={{ width: '100%', padding: '8px', textAlign: 'center' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleAutoDetectTocPages}
                  disabled={autoDetectingToc || (!pdfFile && (!useSectionBook || !currentSection?.book_url))}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#d97706',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    boxShadow: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {autoDetectingToc ? <RefreshCw size={14} className="spinner" /> : <Search size={14} />}
                  {autoDetectingToc ? 'Поиск...' : '🔍 Найти страницы содержания в PDF'}
                </button>

                <button
                  onClick={handleScanToc}
                  disabled={scanningToc || (!pdfFile && (!useSectionBook || !currentSection?.book_url))}
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: '12px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: 'linear-gradient(135deg, var(--primary-color), #a855f7)',
                    color: 'white'
                  }}
                >
                  {scanningToc ? <RefreshCw size={17} className="spinner" /> : <Sparkles size={17} />}
                  {scanningToc ? 'Распознавание...' : 'Распознать структуру'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <textarea
                placeholder="Вставьте скопированный текст содержания / оглавления книги (например: 'Раздел 1... Глава 1... § 1-2. Развитие скотоводства... 5')..."
                value={manualTocText}
                onChange={e => setManualTocText(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '0.85rem',
                  borderRadius: '10px',
                  marginBottom: '10px',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
              <button
                onClick={handleScanToc}
                disabled={scanningToc || !manualTocText.trim()}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: '12px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, var(--primary-color), #a855f7)',
                  color: 'white'
                }}
              >
                {scanningToc ? <RefreshCw size={17} className="spinner" /> : <Sparkles size={17} />}
                {scanningToc ? 'Распознавание...' : 'Построить структуру по тексту'}
              </button>
            </div>
          )}

          {tocScanProgress && (
            <div style={{ fontSize: '0.8rem', color: 'var(--primary-color)', marginTop: '8px', textAlign: 'center', fontWeight: '500' }}>
              {tocScanProgress}
            </div>
          )}
        </div>
      </div>

      {/* ── Error Notification ── */}
      {errorMessage && (
        <div style={{ marginBottom: '25px', padding: '14px 18px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '14px', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem' }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* ── STEP 2: Roadmap Table (Preview & Customization) ── */}
      {roadmap.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>План импорта: {roadmap.length} элементов</h3>
              <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                Разделителей: {roadmap.filter(i => i.type === 'divider').length} • Тестов: {roadmap.filter(i => i.type === 'quiz').length}
              </div>
            </div>

            <div className="flex-center" style={{ gap: '8px' }}>
              <button
                onClick={() => handleAddManualItem('divider')}
                style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(168, 85, 247, 0.1)', color: '#9333ea', borderRadius: '8px', boxShadow: 'none' }}
              >
                + Разделитель
              </button>
              <button
                onClick={() => handleAddManualItem('quiz')}
                style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', color: '#059669', borderRadius: '8px', boxShadow: 'none' }}
              >
                + Тест
              </button>
            </div>
          </div>

          <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid rgba(0,0,0,0.06)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', width: '40px' }}>Вкл</th>
                  <th style={{ padding: '10px 14px', width: '90px' }}>Тип</th>
                  <th style={{ padding: '10px 14px' }}>Название</th>
                  <th style={{ padding: '10px 14px', width: '150px' }}>Страницы</th>
                  <th style={{ padding: '10px 14px', width: '140px' }}>Действия</th>
                  <th style={{ padding: '10px 14px', width: '100px' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {roadmap.map((item, idx) => {
                  const badge = getBadgeStyle(item.title, item.type);
                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid rgba(0,0,0,0.04)',
                        opacity: item.enabled ? 1 : 0.4,
                        background: item.status === 'generating' ? 'rgba(99, 102, 241, 0.05)' : item.status === 'completed' ? 'rgba(16, 185, 129, 0.03)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '8px 14px' }}>
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => handleToggleItem(idx)}
                          disabled={isRunning}
                        />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <span style={{ padding: '3px 8px', background: badge.bg, color: badge.color, borderRadius: '6px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input
                          type="text"
                          value={item.title}
                          onChange={e => handleUpdateItem(idx, 'title', e.target.value)}
                          disabled={isRunning}
                          style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem', fontWeight: item.type === 'divider' ? 'bold' : 'normal' }}
                        />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        {item.type === 'quiz' ? (
                          <div className="flex-center" style={{ gap: '6px' }}>
                            <input
                              type="number"
                              min="1"
                              value={item.startPage}
                              onChange={e => handleUpdateItem(idx, 'startPage', parseInt(e.target.value) || 1)}
                              disabled={isRunning}
                              style={{ width: '55px', padding: '4px', textAlign: 'center', fontSize: '0.8rem' }}
                            />
                            <span>–</span>
                            <input
                              type="number"
                              min="1"
                              value={item.endPage}
                              onChange={e => handleUpdateItem(idx, 'endPage', parseInt(e.target.value) || 1)}
                              disabled={isRunning}
                              style={{ width: '55px', padding: '4px', textAlign: 'center', fontSize: '0.8rem' }}
                            />
                          </div>
                        ) : (
                          <span style={{ opacity: 0.3 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <div className="flex-center" style={{ gap: '6px' }}>
                          {item.type === 'quiz' && (
                            <button
                              onClick={() => handleSplitItem(idx)}
                              disabled={isRunning}
                              style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--primary-color)', borderRadius: '6px', boxShadow: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                              title="Разбить большой параграф на 2 части (ч. 1 / ч. 2)"
                            >
                              <Split size={12} /> ч. 1/2
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveItem(idx)}
                            disabled={isRunning}
                            style={{ padding: '4px 6px', background: 'transparent', color: '#ef4444', boxShadow: 'none' }}
                            title="Удалить из плана"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        {item.status === 'generating' && (
                          <span style={{ color: 'var(--primary-color)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <RefreshCw size={12} className="spinner" /> Генерация
                          </span>
                        )}
                        {item.status === 'completed' && (
                          <span style={{ color: '#059669', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle size={12} /> Готово
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span style={{ color: '#dc2626', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <AlertCircle size={12} /> Ошибка
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span style={{ opacity: 0.4, fontSize: '0.75rem' }}>Ожидание</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STEP 3: Generation Settings ── */}
      {roadmap.length > 0 && (
        <div style={{ marginBottom: '30px', padding: '20px', background: 'rgba(0,0,0,0.02)', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-color)' }}>
            <Settings size={18} /> Настройки генерации контента
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '15px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block', marginBottom: '4px' }}>Вопросов в параграфе:</label>
              <input
                type="number"
                min="5"
                max="50"
                value={questionsPerQuiz}
                onChange={e => setQuestionsPerQuiz(parseInt(e.target.value) || 20)}
                disabled={isRunning}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block', marginBottom: '4px' }}>Банк вопросов (лимит в билете):</label>
              <input
                type="number"
                min="0"
                max="50"
                value={questionLimit}
                onChange={e => setQuestionLimit(parseInt(e.target.value) || 0)}
                disabled={isRunning}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.9rem' }}
              />
              <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '4px' }}>Случайная выборка при каждой попытке</div>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block', marginBottom: '4px' }}>Автор-составитель:</label>
              <input
                type="text"
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                disabled={isRunning}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block', marginBottom: '4px' }}>Пауза между запросами:</label>
              <div className="flex-center" style={{ gap: '8px' }}>
                <input
                  type="number"
                  min="3"
                  max="10"
                  value={rateLimitDelaySec}
                  onChange={e => setRateLimitDelaySec(parseInt(e.target.value) || 4)}
                  disabled={isRunning}
                  style={{ width: '70px', padding: '8px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.85rem', opacity: 0.6 }}>сек (для квоты 15 RPM)</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={searchYoutube}
                onChange={e => setSearchYoutube(e.target.checked)}
                disabled={isRunning}
              />
              <span style={{ fontSize: '0.85rem' }}>Искать и прикреплять видеоурок с YouTube</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoPublish}
                onChange={e => setAutoPublish(e.target.checked)}
                disabled={isRunning}
              />
              <span style={{ fontSize: '0.85rem' }}>Сразу публиковать тесты (иначе сохраняются скрытыми)</span>
            </label>
          </div>
        </div>
      )}

      {/* ── STEP 4: Execution & Monitoring Panel ── */}
      {roadmap.length > 0 && (
        <div>
          {/* Progress Bar */}
          {isRunning && (
            <div style={{ marginBottom: '20px' }}>
              <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.88rem' }}>
                <div>
                  <strong>Прогресс:</strong> {completedCount} из {enabledCount} ({progressPercent}%)
                </div>
                {countdown > 0 && (
                  <div style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                    <Clock size={14} /> Пауза квоты: {countdown}с...
                  </div>
                )}
              </div>
              <div style={{ height: '8px', background: 'rgba(0,0,0,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary-color), #a855f7)', transition: 'width 0.3s ease' }} />
              </div>
              {currentStatus && (
                <div style={{ fontSize: '0.82rem', color: 'var(--primary-color)', marginTop: '8px', fontWeight: '500' }}>
                  {currentStatus}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex-center" style={{ gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            {!isRunning ? (
              <>
                <button
                  onClick={handleStartPipeline}
                  style={{
                    padding: '12px 28px',
                    borderRadius: '12px',
                    fontWeight: '700',
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Play size={18} /> Запустить конвейер генерации
                </button>

                {roadmap.some(i => i.status === 'error') && (
                  <button
                    onClick={() => {
                      setRoadmap(prev => prev.map(item => item.status === 'error' ? { ...item, status: 'pending', error: null } : item));
                      setErrorMessage(null);
                    }}
                    style={{
                      padding: '12px 20px',
                      borderRadius: '12px',
                      fontWeight: '600',
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#dc2626',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <RefreshCw size={16} /> Повторить элементы с ошибками ({roadmap.filter(i => i.status === 'error').length})
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={handlePauseToggle}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    fontWeight: '600',
                    background: isPaused ? '#10b981' : '#f59e0b',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isPaused ? <Play size={16} /> : <Pause size={16} />}
                  {isPaused ? 'Продолжить' : 'Пауза'}
                </button>
                <button
                  onClick={handleStopPipeline}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    fontWeight: '600',
                    background: '#dc2626',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Square size={16} /> Остановить
                </button>
              </>
            )}

            {createdQuizzes.length > 0 && (
              <div style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#059669', fontWeight: 'bold' }}>
                ✓ Создано в базе: {createdQuizzes.length} объектов
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BookImporterStudio;
