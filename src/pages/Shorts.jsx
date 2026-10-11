import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Heart, Play, Award, Zap, RotateCcw, ChevronUp, ChevronDown,
  CheckCircle, XCircle, Clock, Share2, Book, FileText, Youtube,
  Check, X, Flame, AlertTriangle
} from 'lucide-react';
import MathRenderer from '../components/MathRenderer';
import { resolveImgUrl } from '../lib/imageUtils';

export default function Shorts({ session, profile }) {
  const navigate = useNavigate();

  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userAnswers, setUserAnswers] = useState({}); // { [shortId]: chosenIndex }
  const [likedMap, setLikedMap] = useState(() => {
    try {
      const saved = localStorage.getItem('shorts_liked_ids');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Streak counters for dopamine loop
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [showHeartPop, setShowHeartPop] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Preference for explanation expansion
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(() => {
    const saved = localStorage.getItem('quiz_explanation_expanded');
    return saved === null ? true : saved === 'true';
  });

  const toggleExplanation = () => {
    setIsExplanationExpanded(prev => {
      const nextVal = !prev;
      localStorage.setItem('quiz_explanation_expanded', nextVal.toString());
      return nextVal;
    });
  };

  // Exit Confirmation Modal state
  const [showExitModal, setShowExitModal] = useState(false);

  // Full Quiz Start Modal state (identical to QuizCatalog)
  const [selectedQuiz, setSelectedQuiz] = useState(null);

  // Full image view modal
  const [previewImage, setPreviewImage] = useState(null);

  // Mobile Slide Animation States
  const [touchOffset, setTouchOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);
  const isDragging = useRef(false);

  // Load and shuffle questions
  const loadShorts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('quizzes')
        .select(`
          id,
          title,
          section_id,
          is_hidden,
          is_archived,
          content,
          resources,
          quiz_sections (
            id,
            name,
            book_url,
            quiz_classes (
              id,
              name
            )
          )
        `)
        .eq('is_archived', false)
        .eq('is_hidden', false);

      if (error) {
        console.error('Error fetching quizzes for shorts:', error);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setQuestions([]);
        setLoading(false);
        return;
      }

      const extracted = [];
      data.forEach(quiz => {
        const qList = quiz.content?.questions;
        if (Array.isArray(qList) && qList.length > 0) {
          const secName = quiz.quiz_sections?.name || 'Предмет';
          const clsName = quiz.quiz_sections?.quiz_classes?.name || 'Класс';

          qList.forEach((q, idx) => {
            if (
              q &&
              q.question &&
              Array.isArray(q.options) &&
              q.options.length > 0 &&
              typeof q.correctIndex === 'number'
            ) {
              extracted.push({
                shortId: `${quiz.id}_${idx}`,
                quizId: quiz.id,
                quizTitle: quiz.title,
                sectionName: secName,
                className: clsName,
                question: q.question,
                options: q.options,
                correctIndex: q.correctIndex,
                explanation: q.explanation || '',
                images: q.images || [],
                fullQuiz: quiz,
                questionIdx: idx
              });
            }
          });
        }
      });

      // Fisher-Yates shuffle
      for (let i = extracted.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [extracted[i], extracted[j]] = [extracted[j], extracted[i]];
      }

      setQuestions(extracted);
      setCurrentIndex(0);
      setUserAnswers({});
    } catch (err) {
      console.error('Failed to load shorts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShorts();
  }, [loadShorts]);

  // Navigate to previous/next short
  const goToNext = useCallback(() => {
    if (questions.length === 0) return;
    setCurrentIndex(prev => (prev < questions.length - 1 ? prev + 1 : 0));
    setTouchOffset(0);
  }, [questions.length]);

  const goToPrev = useCallback(() => {
    if (questions.length === 0) return;
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : questions.length - 1));
    setTouchOffset(0);
  }, [questions.length]);

  // Keyboard navigation (↑ / ↓, W / S, etc.)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showExitModal || selectedQuiz || previewImage) {
        if (e.key === 'Escape') {
          setShowExitModal(false);
          setSelectedQuiz(null);
          setPreviewImage(null);
        }
        return;
      }

      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.key === 'ArrowDown' || e.key === 'KeyS' || e.key === 'PageDown') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowUp' || e.key === 'KeyW' || e.key === 'PageUp') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'Escape') {
        setShowExitModal(true);
      } else if (e.key === 'l' || e.key === 'L') {
        const q = questions[currentIndex];
        if (q) toggleLike(q.shortId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, questions, showExitModal, selectedQuiz, previewImage, goToNext, goToPrev]);

  // Interactive Touch Drag for Mobile TikTok Effect
  const handleTouchStart = (e) => {
    // If modal is open, don't drag
    if (showExitModal || selectedQuiz || previewImage) return;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    isDragging.current = true;
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging.current) return;
    touchCurrentY.current = e.touches[0].clientY;
    const diff = touchCurrentY.current - touchStartY.current;

    // Resistance at extremes if desired, or smooth drag
    setTouchOffset(diff);
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsSwiping(false);

    const diff = touchCurrentY.current - touchStartY.current;
    const threshold = 65; // pixels to trigger slide

    if (diff < -threshold) {
      // Swiped UP -> Go to Next
      goToNext();
    } else if (diff > threshold) {
      // Swiped DOWN -> Go to Prev
      goToPrev();
    } else {
      // Snap back to current
      setTouchOffset(0);
    }
  };

  // Option selection
  const handleOptionSelect = (optionIdx) => {
    const q = questions[currentIndex];
    if (!q) return;
    if (userAnswers[q.shortId] !== undefined) return;

    const isCorrect = optionIdx === q.correctIndex;

    setUserAnswers(prev => ({
      ...prev,
      [q.shortId]: optionIdx
    }));

    if (isCorrect) {
      setStreak(prev => {
        const next = prev + 1;
        if (next > maxStreak) setMaxStreak(next);
        return next;
      });
      if (navigator.vibrate) navigator.vibrate([40]);
    } else {
      setStreak(0);
      if (navigator.vibrate) navigator.vibrate([80, 50, 80]);
    }
  };

  // Toggle like (heart)
  const toggleLike = (shortId) => {
    setLikedMap(prev => {
      const nextMap = { ...prev, [shortId]: !prev[shortId] };
      try {
        localStorage.setItem('shorts_liked_ids', JSON.stringify(nextMap));
      } catch {}
      return nextMap;
    });

    setShowHeartPop(true);
    setTimeout(() => setShowHeartPop(false), 800);
  };

  // Share current question
  const handleShareQuestion = (e) => {
    e.stopPropagation();
    const q = questions[currentIndex];
    if (!q) return;

    const url = `${window.location.origin}/quiz/${q.quizId}`;
    const text = `Интересный вопрос из теста «${q.quizTitle}» (${q.className} — ${q.sectionName}):\n${q.question}\n${url}`;

    navigator.clipboard.writeText(text);
    setToastMessage('Вопрос и ссылка скопированы!');
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Exit handler
  const handleConfirmExit = () => {
    setShowExitModal(false);
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/catalog');
    }
  };

  // Check if active first attempt exists
  const isActiveFirstAttempt = (quizId) => {
    try {
      const timerRaw = localStorage.getItem(`quiz_timer_${quizId}`);
      if (!timerRaw) return false;
      const parsed = JSON.parse(timerRaw);
      const endTime = parsed.endTime || parsed.ts + (parsed.timeLeft || 0) * 1000;
      return endTime > Date.now();
    } catch {
      return false;
    }
  };

  const currentQ = questions[currentIndex];
  const chosenAnswer = currentQ ? userAnswers[currentQ.shortId] : undefined;
  const isAnswered = chosenAnswer !== undefined;
  const isLiked = currentQ ? !!likedMap[currentQ.shortId] : false;

  // Next & previous question references for smooth TikTok sliding peek
  const nextQ = questions[currentIndex < questions.length - 1 ? currentIndex + 1 : 0];
  const prevQ = questions[currentIndex > 0 ? currentIndex - 1 : questions.length - 1];

  if (loading) {
    return (
      <div
        className="shorts-fullscreen-root"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10001,
          background: 'var(--bg-color)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px'
        }}
      >
        <div style={{ fontSize: '3.5rem', animation: 'spin 2s linear infinite' }}>🧪</div>
        <div style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.5px' }}>Формируем Ленту Знаний...</div>
        <div style={{ opacity: 0.5, fontSize: '0.95rem' }}>Загружаем и перемешиваем вопросы из всех предметов</div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div
        className="shorts-fullscreen-root"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10001,
          background: 'var(--bg-color)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          padding: '20px',
          textAlign: 'center'
        }}
      >
        <div style={{ fontSize: '4rem' }}>🧪</div>
        <h2>В Ленте Знаний пока пусто</h2>
        <p style={{ opacity: 0.6, maxWidth: '420px', lineHeight: '1.6' }}>
          В каталоге пока нет тестов с вопросами. Загляните позже или создайте свой тест!
        </p>
        <button onClick={() => navigate('/catalog')} style={{ padding: '12px 28px' }}>
          Перейти в каталог
        </button>
      </div>
    );
  }

  return (
    <div
      className="shorts-fullscreen-root"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 10001,
        background: 'var(--bg-color)',
        color: 'var(--text-color)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}
    >
      {/* ========================================================
          TOP IMMERSIVE HEADER (REPLACES NAVBAR ACROSS FULL SCREEN)
          ======================================================== */}
      <header
        style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid rgba(124, 58, 237, 0.1)',
          background: 'var(--card-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 50,
          flexShrink: 0
        }}
      >
        {/* Left: Replaces "LabTest" with "🧪 Лента Знаний" */}
        <div className="flex-center" style={{ gap: '10px' }}>
          <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>🧪</span>
          <span
            style={{
              fontWeight: '800',
              fontSize: '1.25rem',
              letterSpacing: '-0.5px',
              color: 'var(--primary-color)'
            }}
          >
            Лента Знаний
          </span>
        </div>

        {/* Center: Streak & Shuffle & Counter */}
        <div className="flex-center" style={{ gap: '14px' }}>
          {streak > 0 && (
            <div
              className="flex-center animate"
              style={{
                background:
                  streak >= 3
                    ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
                    : 'rgba(239, 68, 68, 0.1)',
                color: streak >= 3 ? 'white' : '#ef4444',
                padding: '5px 12px',
                borderRadius: '20px',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                gap: '5px',
                boxShadow: streak >= 3 ? '0 4px 12px rgba(239, 68, 68, 0.3)' : 'none'
              }}
              title={`Серия побед: ${streak}`}
            >
              <Flame size={15} fill="currentColor" />
              <span>{streak}</span>
            </div>
          )}

          <div
            style={{
              fontSize: '0.85rem',
              fontWeight: '700',
              opacity: 0.6,
              background: 'rgba(0,0,0,0.04)',
              padding: '6px 12px',
              borderRadius: '12px'
            }}
          >
            {currentIndex + 1} <span style={{ opacity: 0.5 }}>/</span> {questions.length}
          </div>

          <button
            onClick={loadShorts}
            style={{
              background: 'rgba(0,0,0,0.04)',
              color: 'var(--text-color)',
              padding: '8px 12px',
              borderRadius: '12px',
              boxShadow: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: '600'
            }}
            title="Перемешать вопросы заново"
          >
            <RotateCcw size={14} />
            <span className="shorts-shuffle-text">Перемешать</span>
          </button>
        </div>

        {/* Right: Close Cross Button (Warning Exit) */}
        <div>
          <button
            onClick={() => setShowExitModal(true)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.05)',
              color: 'var(--text-color)',
              boxShadow: 'none',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(0,0,0,0.05)',
              transition: 'all 0.2s ease'
            }}
            title="Выйти из Ленты Знаний (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* ========================================================
          MAIN VIEWPORT AREA (FULL SCREEN, EXPANDED & SPACIOUS ON PC)
          ======================================================== */}
      <main
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* DESKTOP SIDE ARROWS (UP / DOWN) */}
        <div
          className="shorts-desktop-arrows"
          style={{
            position: 'absolute',
            right: '28px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            zIndex: 40
          }}
        >
          <button
            onClick={goToPrev}
            title="Предыдущий вопрос (↑ или W)"
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'var(--card-bg)',
              color: 'var(--text-color)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <ChevronUp size={28} />
          </button>

          <span style={{ fontSize: '0.75rem', opacity: 0.4, fontWeight: 'bold' }}>
            ↑ / ↓
          </span>

          <button
            onClick={goToNext}
            title="Следующий вопрос (↓ или S)"
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'var(--card-bg)',
              color: 'var(--text-color)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <ChevronDown size={28} />
          </button>
        </div>

        {/* Heart Pop Animation */}
        {showHeartPop && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 99,
              pointerEvents: 'none',
              animation: 'heartPop 0.8s ease forwards'
            }}
          >
            <Heart size={110} fill="#ef4444" color="#ef4444" />
          </div>
        )}

        {/* ========================================================
            SLIDER TRACK FOR TIKTOK SWIPE EFFECT ON MOBILE
            ======================================================== */}
        <div
          className="shorts-slider-track"
          style={{
            width: '100%',
            maxWidth: '920px',
            height: '100%',
            maxHeight: 'calc(100vh - 100px)',
            position: 'relative',
            transform: `translateY(${touchOffset}px)`,
            transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* THE ACTIVE QUESTION CARD (SPACIOUS, NO UNNECESSARY RESTRICTIONS) */}
          <div
            className="shorts-card animate"
            key={currentQ.shortId}
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--card-bg)',
              borderRadius: '24px',
              border: '1.5px solid rgba(99, 102, 241, 0.18)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.12)',
              padding: '28px 32px',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              boxSizing: 'border-box'
            }}
          >
            {/* QUESTION IMAGES */}
            {currentQ.images && currentQ.images.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  marginBottom: '18px',
                  overflowX: 'auto',
                  paddingBottom: '6px'
                }}
              >
                {currentQ.images.map((imgUrl, imgIdx) => (
                  <img
                    key={imgIdx}
                    src={resolveImgUrl(imgUrl)}
                    alt={`Иллюстрация ${imgIdx + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage(resolveImgUrl(imgUrl));
                    }}
                    style={{
                      maxHeight: '160px',
                      borderRadius: '14px',
                      objectFit: 'contain',
                      border: '1px solid rgba(0,0,0,0.1)',
                      background: 'var(--card-bg)',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            )}

            {/* QUESTION TEXT (UNSELECTABLE ON PC AS REQUESTED) */}
            <div style={{ marginBottom: '24px' }}>
              <h2
                style={{
                  fontSize: '1.35rem',
                  lineHeight: '1.5',
                  fontWeight: '700',
                  margin: 0,
                  userSelect: 'none',
                  WebkitUserSelect: 'none'
                }}
              >
                <MathRenderer text={currentQ.question} noSelect={true} />
              </h2>
            </div>

            {/* OPTIONS GRID (SPACIOUS & ADAPTIVE) */}
            <div
              className="shorts-options-container"
              style={{
                display: 'grid',
                gap: '12px',
                gridTemplateColumns:
                  currentQ.options.some(opt => opt.length > 42) || currentQ.options.length > 4
                    ? '1fr'
                    : 'repeat(auto-fit, minmax(360px, 1fr))',
                marginBottom: '20px'
              }}
            >
              {currentQ.options.map((opt, optIdx) => {
                const isCorrect = optIdx === currentQ.correctIndex;
                const isChosen = chosenAnswer === optIdx;

                let bgColor = 'var(--card-bg)';
                let borderColor = 'rgba(99, 102, 241, 0.12)';
                let textColor = 'var(--text-color)';

                if (isAnswered) {
                  if (isCorrect) {
                    bgColor = 'rgba(74, 222, 128, 0.2)';
                    borderColor = '#4ade80';
                  } else if (isChosen) {
                    bgColor = 'rgba(248, 113, 113, 0.2)';
                    borderColor = '#f87171';
                  }
                }

                return (
                  <button
                    key={optIdx}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOptionSelect(optIdx);
                    }}
                    disabled={isAnswered}
                    style={{
                      textAlign: 'left',
                      background: bgColor,
                      color: textColor,
                      border: `2px solid ${borderColor}`,
                      padding: '16px 22px',
                      borderRadius: '18px',
                      fontSize: '1.02rem',
                      lineHeight: '1.45',
                      boxShadow: 'none',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      cursor: isAnswered ? 'default' : 'pointer',
                      transform: 'none',
                      userSelect: 'none',
                      WebkitUserSelect: 'none'
                    }}
                  >
                    <div style={{ flex: 1, pointerEvents: 'none' }}>
                      <MathRenderer text={opt} noSelect={true} />
                    </div>
                    <div style={{ flexShrink: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                      {isAnswered && isCorrect && <CheckCircle size={20} color="#4ade80" />}
                      {isAnswered && isChosen && !isCorrect && <XCircle size={20} color="#f87171" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* EXPLANATION BLOCK (MATCHING QuizView) */}
            {isAnswered && currentQ.explanation && (
              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.05)',
                  borderRadius: '20px',
                  border: '1.5px dashed rgba(99, 102, 241, 0.22)',
                  overflow: 'hidden',
                  padding: '0 20px',
                  marginBottom: '20px',
                  animation: 'slideDownFade 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                }}
              >
                <div
                  className="flex-center"
                  onClick={toggleExplanation}
                  style={{
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    padding: '16px 0'
                  }}
                >
                  <div className="flex-center" style={{ gap: '8px', color: 'var(--primary-color)' }}>
                    <Zap size={18} />
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      Пояснение
                    </span>
                  </div>
                  {isExplanationExpanded ? <ChevronUp size={18} opacity={0.5} /> : <ChevronDown size={18} opacity={0.5} />}
                </div>

                <div
                  style={{
                    maxHeight: isExplanationExpanded ? '1000px' : '0',
                    overflow: 'hidden',
                    transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s',
                    opacity: isExplanationExpanded ? 1 : 0
                  }}
                >
                  <div style={{ paddingBottom: '16px', fontSize: '0.98rem', lineHeight: '1.6', opacity: 0.9 }}>
                    <MathRenderer text={currentQ.explanation} noSelect={true} />
                  </div>
                </div>
              </div>
            )}

            {/* BOTTOM METADATA & ACTION BUTTONS */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: '18px',
                borderTop: '1px solid rgba(0,0,0,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '15px'
              }}
            >
              {/* Left: Origin Details (Quiz title instead of author, Folder - Section instead of description) */}
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div
                  style={{
                    fontSize: '1rem',
                    fontWeight: '700',
                    color: 'var(--text-color)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={currentQ.quizTitle}
                >
                  {currentQ.quizTitle}
                </div>
                <div
                  style={{
                    fontSize: '0.85rem',
                    opacity: 0.6,
                    marginTop: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {currentQ.className} — {currentQ.sectionName}
                </div>
              </div>

              {/* Right: Actions (Like, Share, Start Full Quiz) */}
              <div className="flex-center" style={{ gap: '10px' }}>
                <button
                  onClick={() => toggleLike(currentQ.shortId)}
                  className="flex-center"
                  style={{
                    background: isLiked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0,0,0,0.04)',
                    color: isLiked ? '#ef4444' : 'var(--text-color)',
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    padding: 0,
                    boxShadow: 'none',
                    border: 'none',
                    transition: 'all 0.2s ease'
                  }}
                  title={isLiked ? 'Убрать сердечко' : 'Поставить сердечко'}
                >
                  <Heart
                    size={22}
                    fill={isLiked ? '#ef4444' : 'none'}
                    color={isLiked ? '#ef4444' : 'currentColor'}
                  />
                </button>

                <button
                  onClick={handleShareQuestion}
                  className="flex-center"
                  style={{
                    background: 'rgba(0,0,0,0.04)',
                    color: 'var(--text-color)',
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    padding: 0,
                    boxShadow: 'none',
                    border: 'none'
                  }}
                  title="Поделиться вопросом"
                >
                  <Share2 size={19} />
                </button>

                <button
                  onClick={() => setSelectedQuiz(currentQ.fullQuiz)}
                  className="flex-center"
                  style={{
                    background: 'var(--primary-color)',
                    color: 'white',
                    padding: '10px 20px',
                    borderRadius: '16px',
                    gap: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap'
                  }}
                  title="Пройти полный тест целиком"
                >
                  <Play size={15} fill="currentColor" />
                  <span>Тест</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ========================================================
          EXIT CONFIRMATION WARNING MODAL (UNIFIED SITE STYLE)
          ======================================================== */}
      {showExitModal && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) e.target.dataset.md = 'true';
          }}
          onMouseUp={(e) => {
            if (e.target === e.currentTarget && e.target.dataset.md === 'true') {
              e.target.dataset.md = 'false';
              setShowExitModal(false);
            }
          }}
        >
          <div
            className="modal-content animate"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px' }}
          >
            <div
              className="flex-center"
              style={{
                justifyContent: 'center',
                width: '64px',
                height: '64px',
                borderRadius: '22px',
                background: 'rgba(250, 204, 21, 0.1)',
                color: '#ca8a04',
                margin: '0 auto 24px'
              }}
            >
              <AlertTriangle size={34} />
            </div>

            <h2 style={{ marginBottom: '14px' }}>Выйти из Ленты Знаний?</h2>
            <p style={{ opacity: 0.7, marginBottom: '28px', lineHeight: '1.6' }}>
              Вы действительно хотите выйти? Текущая серия ответов ({streak}) будет завершена.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <button
                onClick={() => setShowExitModal(false)}
                style={{
                  background: 'rgba(0,0,0,0.05)',
                  color: 'var(--text-color)',
                  boxShadow: 'none',
                  padding: '14px'
                }}
              >
                Остаться
              </button>
              <button
                onClick={handleConfirmExit}
                style={{
                  background: '#ca8a04',
                  color: 'white',
                  padding: '14px'
                }}
              >
                Да, выйти
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          FULL QUIZ START WARNING MODAL (EXACT SAME AS QuizCatalog)
          ======================================================== */}
      {selectedQuiz && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) e.target.dataset.md = 'true';
          }}
          onMouseUp={(e) => {
            if (e.target === e.currentTarget && e.target.dataset.md === 'true') {
              e.target.dataset.md = 'false';
              setSelectedQuiz(null);
            }
          }}
        >
          <div
            className="modal-content animate"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '5px' }}>
              <div
                className="flex-center"
                style={{
                  justifyContent: 'center',
                  width: '60px',
                  height: '60px',
                  borderRadius: '20px',
                  background: 'rgba(99, 102, 241, 0.1)',
                  color: 'var(--primary-color)',
                  margin: '0 auto 25px'
                }}
              >
                <Award size={32} />
              </div>

              <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Вы готовы?</h2>
              <p style={{ opacity: 0.7, marginBottom: '25px', lineHeight: '1.6', textAlign: 'center' }}>
                Начать тест: <br /> <strong>"{selectedQuiz.title}"</strong>.
              </p>

              {/* Time & question info */}
              {(() => {
                const bankCount = selectedQuiz.content?.questions?.length || 0;
                const limit = selectedQuiz.content?.question_limit;
                const ticketCount = limit && limit > 0 && limit < bankCount ? limit : bankCount;
                const timeBase = selectedQuiz.content?.time_limit
                  ? selectedQuiz.content.time_limit
                  : ticketCount * 25;
                return (
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      justifyContent: 'center',
                      marginBottom: '25px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 15px',
                        background: 'rgba(0,0,0,0.03)',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        textAlign: 'center'
                      }}
                    >
                      {limit && limit > 0 && limit < bankCount ? (
                        <>
                          <strong>{limit}</strong> из {bankCount} вопросов{' '}
                          <span style={{ opacity: 0.5, fontSize: '0.78rem' }}>(банк)</span>
                        </>
                      ) : (
                        <>
                          <strong>{bankCount}</strong> вопр.
                        </>
                      )}
                    </div>
                    <div
                      style={{
                        padding: '8px 15px',
                        background: 'rgba(99, 102, 241, 0.08)',
                        color: 'var(--primary-color)',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Clock size={14} />
                      <strong>
                        {Math.floor(timeBase / 60)} мин {timeBase % 60} сек
                      </strong>
                    </div>
                  </div>
                );
              })()}

              {/* Recommended materials */}
              {selectedQuiz.resources && selectedQuiz.resources.length > 0 && (
                <div style={{ marginBottom: '30px', textAlign: 'left' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '15px',
                      padding: '12px',
                      background: 'rgba(99, 102, 241, 0.05)',
                      borderRadius: '12px',
                      border: '1px solid rgba(99, 102, 241, 0.1)'
                    }}
                  >
                    <Book size={18} style={{ color: 'var(--primary-color)' }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                      Рекомендуем подготовиться:
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      paddingRight: '5px'
                    }}
                  >
                    {selectedQuiz.resources.map((res, idx) => {
                      const isYoutube = res.url.includes('youtube.com') || res.url.includes('youtu.be');
                      const isDrive = res.url.includes('drive.google.com') || res.url.includes('docs.google.com');
                      return (
                        <a
                          key={idx}
                          href={res.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-center animate"
                          style={{
                            textDecoration: 'none',
                            justifyContent: 'space-between',
                            padding: '12px 18px',
                            background: 'rgba(99, 102, 241, 0.03)',
                            borderRadius: '14px',
                            border: '1px solid rgba(99, 102, 241, 0.1)',
                            fontSize: '0.9rem'
                          }}
                        >
                          <div className="flex-center" style={{ gap: '12px' }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '10px',
                                background: isYoutube
                                  ? 'rgba(239, 68, 68, 0.1)'
                                  : isDrive
                                  ? 'rgba(34, 197, 94, 0.1)'
                                  : 'rgba(99, 102, 241, 0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {isYoutube ? (
                                <Youtube size={16} color="#ef4444" />
                              ) : isDrive ? (
                                <FileText size={16} color="#22c55e" />
                              ) : (
                                <Book size={16} color="var(--primary-color)" />
                              )}
                            </div>
                            <span style={{ fontWeight: '600', color: 'var(--text-color)' }}>
                              {res.title || 'Материал ' + (idx + 1)}
                            </span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="grid-2" style={{ gap: '15px', marginTop: '10px' }}>
              <button
                onClick={() => setSelectedQuiz(null)}
                style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  const id = selectedQuiz.id;
                  const resuming = isActiveFirstAttempt(id);
                  localStorage.removeItem(`quiz_show_result_${id}`);
                  if (!resuming) {
                    localStorage.removeItem(`quiz_answers_${id}`);
                    localStorage.removeItem(`quiz_current_idx_${id}`);
                    localStorage.removeItem(`quiz_times_${id}`);
                    localStorage.removeItem(`quiz_start_time_${id}`);
                    localStorage.removeItem(`quiz_timer_${id}`);
                    localStorage.removeItem(`quiz_expired_notice_${id}`);
                  }
                  navigate(`/quiz/${id}`);
                }}
                style={{ padding: '15px', background: 'var(--primary-color)', color: 'white' }}
              >
                Начать тест
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--primary-color)',
            color: 'white',
            padding: '10px 22px',
            borderRadius: '16px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            boxShadow: '0 10px 25px rgba(99, 102, 241, 0.4)',
            zIndex: 10002,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeInUp 0.3s ease'
          }}
        >
          <Check size={16} /> {toastMessage}
        </div>
      )}

      {/* FULL IMAGE PREVIEW MODAL */}
      {previewImage && (
        <div
          className="modal-overlay"
          onClick={() => setPreviewImage(null)}
          style={{ zIndex: 10003, background: 'rgba(0,0,0,0.85)' }}
        >
          <div
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: '-45px',
                right: '0',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                padding: '8px',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
            <img
              src={previewImage}
              alt="Увеличенное изображение"
              style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '16px' }}
            />
          </div>
        </div>
      )}

      {/* Custom Styles for TikTok Animation & Responsiveness */}
      <style>{`
        @keyframes heartPop {
          0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
          50% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
        }

        @media (max-width: 768px) {
          .shorts-desktop-arrows {
            display: none !important;
          }
          .shorts-shuffle-text {
            display: none !important;
          }
          .shorts-card {
            padding: 20px 18px !important;
            border-radius: 20px !important;
          }
        }
      `}</style>
    </div>
  );
}
