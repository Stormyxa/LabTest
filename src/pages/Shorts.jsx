import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Heart, Play, Award, Zap, RotateCcw, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock, Share2,
  Book, FileText, Youtube, Check, X, Flame, Sparkles, AlertCircle
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

  // Preference for explanation expansion (matching QuizView)
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

  // Full Quiz Start Modal state (identical to QuizCatalog)
  const [selectedQuiz, setSelectedQuiz] = useState(null);

  // Full image view modal
  const [previewImage, setPreviewImage] = useState(null);

  // Touch gesture state for mobile swiping
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const cardRef = useRef(null);

  // Load and shuffle all questions from official & available quizzes
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
            if (q && q.question && Array.isArray(q.options) && q.options.length > 0 && typeof q.correctIndex === 'number') {
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
  }, [questions.length]);

  const goToPrev = useCallback(() => {
    if (questions.length === 0) return;
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : questions.length - 1));
  }, [questions.length]);

  // Keyboard navigation (↑ / ↓, W / S, etc.)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is inside an input or modal is open
      if (selectedQuiz || previewImage) return;
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.key === 'ArrowDown' || e.key === 'KeyS' || e.key === 'PageDown') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowUp' || e.key === 'KeyW' || e.key === 'PageUp') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'l' || e.key === 'L') {
        const currentQ = questions[currentIndex];
        if (currentQ) toggleLike(currentQ.shortId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, questions, selectedQuiz, previewImage, goToNext, goToPrev]);

  // Touch gesture handling
  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    const deltaY = touchStartY.current - touchEndY.current;
    const threshold = 55; // minimum swipe distance

    if (deltaY > threshold) {
      // Swiped UP -> Next
      goToNext();
    } else if (deltaY < -threshold) {
      // Swiped DOWN -> Prev
      goToPrev();
    }
  };

  // User selects an option
  const handleOptionSelect = (optionIdx) => {
    const currentQ = questions[currentIndex];
    if (!currentQ) return;
    if (userAnswers[currentQ.shortId] !== undefined) return; // Already answered this question

    const isCorrect = optionIdx === currentQ.correctIndex;

    setUserAnswers(prev => ({
      ...prev,
      [currentQ.shortId]: optionIdx
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

    // Trigger visual pop animation
    setShowHeartPop(true);
    setTimeout(() => setShowHeartPop(false), 800);
  };

  // Double tap to like
  const lastTapRef = useRef(0);
  const handleCardDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      const currentQ = questions[currentIndex];
      if (currentQ) {
        setLikedMap(prev => {
          const nextMap = { ...prev, [currentQ.shortId]: true };
          try {
            localStorage.setItem('shorts_liked_ids', JSON.stringify(nextMap));
          } catch {}
          return nextMap;
        });
        setShowHeartPop(true);
        setTimeout(() => setShowHeartPop(false), 800);
      }
    }
    lastTapRef.current = now;
  };

  // Share current question
  const handleShareQuestion = (e) => {
    e.stopPropagation();
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    const url = `${window.location.origin}/quiz/${currentQ.quizId}`;
    const text = `Интересный вопрос из теста «${currentQ.quizTitle}» (${currentQ.className} — ${currentQ.sectionName}):\n${currentQ.question}\n${url}`;

    navigator.clipboard.writeText(text);
    setToastMessage('Вопрос и ссылка скопированы!');
    setTimeout(() => setToastMessage(null), 2500);
  };

  const currentQ = questions[currentIndex];
  const chosenAnswer = currentQ ? userAnswers[currentQ.shortId] : undefined;
  const isAnswered = chosenAnswer !== undefined;
  const isLiked = currentQ ? !!likedMap[currentQ.shortId] : false;

  // Check if active attempt is running (for clean reset if needed)
  const isActiveFirstAttempt = (quizId) => {
    try {
      const timerRaw = localStorage.getItem(`quiz_timer_${quizId}`);
      if (!timerRaw) return false;
      const parsed = JSON.parse(timerRaw);
      const endTime = parsed.endTime || (parsed.ts + (parsed.timeLeft || 0) * 1000);
      return endTime > Date.now();
    } catch {
      return false;
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: 'calc(100vh - 80px)', flexDirection: 'column', gap: '20px' }}>
        <div style={{ fontSize: '3rem', animation: 'spin 2s linear infinite' }}>🧪</div>
        <div style={{ fontSize: '1.2rem', fontWeight: '800' }}>Формируем Ленту Знаний...</div>
        <div style={{ opacity: 0.5, fontSize: '0.9rem' }}>Собираем и перемешиваем вопросы из всех тестов</div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="container flex-center" style={{ minHeight: 'calc(100vh - 80px)', flexDirection: 'column', gap: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '3.5rem' }}>🧪</div>
        <h2>В Ленте Знаний пока пусто</h2>
        <p style={{ opacity: 0.6, maxWidth: '400px' }}>В каталоге пока нет доступных тестов с вопросами. Загляните позже или создайте свой тест!</p>
        <button onClick={() => navigate('/catalog')} style={{ marginTop: '10px' }}>
          Перейти в каталог
        </button>
      </div>
    );
  }

  return (
    <div
      className="shorts-page-container"
      style={{
        minHeight: 'calc(100vh - 75px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: '15px 10px 40px',
        overflow: 'hidden'
      }}
    >
      {/* Background ambient glow effect */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.05) 50%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      {/* DESKTOP SIDE NAVIGATION BUTTONS */}
      <div
        className="shorts-desktop-nav"
        style={{
          position: 'fixed',
          right: 'max(20px, calc(50% - 380px))',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          zIndex: 50
        }}
      >
        <button
          onClick={goToPrev}
          title="Предыдущий вопрос (↑)"
          className="flex-center"
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'var(--card-bg)',
            color: 'var(--text-color)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
            padding: 0
          }}
        >
          <ChevronUp size={24} />
        </button>

        <div style={{ fontSize: '0.75rem', opacity: 0.5, textAlign: 'center', fontWeight: 'bold' }}>
          {currentIndex + 1} / {questions.length}
        </div>

        <button
          onClick={goToNext}
          title="Следующий вопрос (↓)"
          className="flex-center"
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'var(--card-bg)',
            color: 'var(--text-color)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
            padding: 0
          }}
        >
          <ChevronDown size={24} />
        </button>
      </div>

      {/* MAIN VERTICAL CARD (SHORTS FORMAT) */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardDoubleTap}
        className="card animate"
        key={currentQ.shortId} // Re-triggers smooth animation when switching question
        style={{
          width: '100%',
          maxWidth: '540px',
          minHeight: '620px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '28px',
          padding: '24px',
          position: 'relative',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          boxShadow: '0 20px 45px -10px rgba(99, 102, 241, 0.15), 0 10px 25px -5px rgba(0,0,0,0.06)',
          zIndex: 1,
          overflowY: 'auto',
          scrollBehavior: 'smooth'
        }}
      >
        {/* Floating Heart Pop Animation on Like */}
        {showHeartPop && (
          <div
            style={{
              position: 'absolute',
              top: '40%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 99,
              pointerEvents: 'none',
              animation: 'heartPop 0.8s ease forwards'
            }}
          >
            <Heart size={90} fill="#ef4444" color="#ef4444" />
          </div>
        )}

        {/* TOP HEADER OF THE CARD */}
        <div
          className="flex-center"
          style={{
            justifyContent: 'space-between',
            marginBottom: '18px',
            borderBottom: '1px solid rgba(0,0,0,0.05)',
            paddingBottom: '12px'
          }}
        >
          <div className="flex-center" style={{ gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>🧪</span>
            <span style={{ fontWeight: '800', fontSize: '0.95rem', letterSpacing: '-0.3px', color: 'var(--primary-color)' }}>
              Лента Знаний
            </span>
          </div>

          <div className="flex-center" style={{ gap: '10px' }}>
            {streak > 0 && (
              <div
                className="flex-center animate"
                style={{
                  background: streak >= 3 ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' : 'rgba(239, 68, 68, 0.1)',
                  color: streak >= 3 ? 'white' : '#ef4444',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  gap: '4px',
                  boxShadow: streak >= 3 ? '0 4px 12px rgba(239, 68, 68, 0.3)' : 'none'
                }}
                title={`Серия правильных ответов: ${streak}`}
              >
                <Flame size={14} fill="currentColor" />
                <span>{streak}</span>
              </div>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                loadShorts();
              }}
              style={{
                background: 'rgba(0,0,0,0.04)',
                color: 'var(--text-color)',
                padding: '6px 10px',
                borderRadius: '12px',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.75rem',
                border: 'none'
              }}
              title="Перемешать вопросы заново"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        {/* QUESTION IMAGES (IF ANY) */}
        {currentQ.images && currentQ.images.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '6px' }}>
            {currentQ.images.map((imgUrl, imgIdx) => (
              <img
                key={imgIdx}
                src={resolveImgUrl(imgUrl)}
                alt={`Вопрос ${imgIdx + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage(resolveImgUrl(imgUrl));
                }}
                style={{
                  height: '110px',
                  borderRadius: '12px',
                  objectFit: 'contain',
                  border: '1px solid rgba(0,0,0,0.08)',
                  background: 'var(--card-bg)',
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease'
                }}
              />
            ))}
          </div>
        )}

        {/* QUESTION TEXT */}
        <div style={{ marginBottom: '22px' }}>
          <h2
            style={{
              fontSize: '1.25rem',
              lineHeight: '1.45',
              fontWeight: '700',
              margin: 0
            }}
          >
            <MathRenderer text={currentQ.question} />
          </h2>
        </div>

        {/* OPTIONS LIST */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '20px'
          }}
        >
          {currentQ.options.map((opt, optIdx) => {
            const isCorrect = optIdx === currentQ.correctIndex;
            const isChosen = chosenAnswer === optIdx;

            let bgColor = 'var(--card-bg)';
            let borderColor = 'rgba(0,0,0,0.08)';
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
                  padding: '14px 18px',
                  borderRadius: '16px',
                  fontSize: '0.95rem',
                  position: 'relative',
                  boxShadow: 'none',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  cursor: isAnswered ? 'default' : 'pointer',
                  transform: 'none'
                }}
              >
                <div style={{ flex: 1, pointerEvents: 'none', lineHeight: '1.4' }}>
                  <MathRenderer text={opt} />
                </div>
                <div style={{ flexShrink: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                  {isAnswered && isCorrect && <CheckCircle size={18} color="#4ade80" />}
                  {isAnswered && isChosen && !isCorrect && <XCircle size={18} color="#f87171" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* EXPLANATION BLOCK (IDENTICAL STYLE TO QuizView) */}
        {isAnswered && currentQ.explanation && (
          <div
            style={{
              background: 'rgba(99, 102, 241, 0.05)',
              borderRadius: '20px',
              border: '1.5px dashed rgba(99, 102, 241, 0.2)',
              overflow: 'hidden',
              padding: '0 16px',
              marginBottom: '20px',
              animation: 'slideDownFade 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards'
            }}
          >
            <div
              className="flex-center"
              onClick={(e) => {
                e.stopPropagation();
                toggleExplanation();
              }}
              style={{
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
                padding: '14px 0'
              }}
            >
              <div className="flex-center" style={{ gap: '8px', color: 'var(--primary-color)' }}>
                <Zap size={16} />
                <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Пояснение
                </span>
              </div>
              {isExplanationExpanded ? <ChevronUp size={16} opacity={0.5} /> : <ChevronDown size={16} opacity={0.5} />}
            </div>

            <div
              style={{
                maxHeight: isExplanationExpanded ? '1000px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s',
                opacity: isExplanationExpanded ? 1 : 0
              }}
            >
              <div style={{ paddingBottom: '14px', fontSize: '0.9rem', lineHeight: '1.5', opacity: 0.9 }}>
                <MathRenderer text={currentQ.explanation} />
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM METADATA & ACTIONS (TIKTOK STYLE) */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: '16px',
            borderTop: '1px solid rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '15px'
          }}
        >
          {/* Left: Author / Origin metadata */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Вместо автора: название теста */}
            <div
              style={{
                fontSize: '0.9rem',
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

            {/* Вместо описания: Папка — Секция */}
            <div
              style={{
                fontSize: '0.8rem',
                opacity: 0.6,
                marginTop: '3px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {currentQ.className} — {currentQ.sectionName}
            </div>
          </div>

          {/* Right: TikTok Action Buttons (Like, Start Full Quiz, Share) */}
          <div className="flex-center" style={{ gap: '10px' }}>
            {/* Heart / Like button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleLike(currentQ.shortId);
              }}
              className="flex-center"
              style={{
                background: isLiked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0,0,0,0.04)',
                color: isLiked ? '#ef4444' : 'var(--text-color)',
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                padding: 0,
                boxShadow: 'none',
                border: 'none',
                transition: 'all 0.2s ease'
              }}
              title={isLiked ? 'Убрать лайк' : 'Поставить лайк'}
            >
              <Heart
                size={20}
                fill={isLiked ? '#ef4444' : 'none'}
                color={isLiked ? '#ef4444' : 'currentColor'}
              />
            </button>

            {/* Share Question button */}
            <button
              onClick={handleShareQuestion}
              className="flex-center"
              style={{
                background: 'rgba(0,0,0,0.04)',
                color: 'var(--text-color)',
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                padding: 0,
                boxShadow: 'none',
                border: 'none'
              }}
              title="Поделиться вопросом"
            >
              <Share2 size={18} />
            </button>

            {/* Start Full Quiz button (Warning Modal trigger) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedQuiz(currentQ.fullQuiz);
              }}
              className="flex-center"
              style={{
                background: 'var(--primary-color)',
                color: 'white',
                padding: '10px 16px',
                borderRadius: '16px',
                gap: '6px',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}
              title="Перейти к выполнению полного теста"
            >
              <Play size={14} fill="currentColor" />
              <span>Тест</span>
            </button>
          </div>
        </div>

        {/* MOBILE BOTTOM NAVIGATION (Swipe hints & next/prev arrows) */}
        <div
          className="shorts-mobile-nav"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '14px',
            paddingTop: '10px',
            borderTop: '1px dashed rgba(0,0,0,0.05)',
            opacity: 0.7
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToPrev();
            }}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              background: 'rgba(0,0,0,0.03)',
              color: 'var(--text-color)',
              boxShadow: 'none',
              borderRadius: '10px'
            }}
          >
            ← Предыдущий
          </button>

          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Свайп вверх / вниз</span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              background: 'rgba(99, 102, 241, 0.1)',
              color: 'var(--primary-color)',
              boxShadow: 'none',
              borderRadius: '10px'
            }}
          >
            Следующий →
          </button>
        </div>
      </div>

      {/* TOAST COPIED NOTIFICATION */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '25px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--primary-color)',
            color: 'white',
            padding: '8px 20px',
            borderRadius: '14px',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            boxShadow: '0 10px 25px rgba(99, 102, 241, 0.4)',
            zIndex: 10000,
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
          style={{ zIndex: 10000, background: 'rgba(0,0,0,0.85)' }}
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

      {/* FULL QUIZ START CONFIRMATION MODAL (EXACT SAME AS IN QuizCatalog) */}
      {selectedQuiz && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) e.target.dataset.md = "true";
          }}
          onMouseUp={(e) => {
            if (e.target === e.currentTarget && e.target.dataset.md === "true") {
              e.target.dataset.md = "false";
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

              {/* Recommended resources */}
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
                          <ChevronRight size={14} style={{ opacity: 0.3 }} />
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

      {/* Keyframe animation for heart popping */}
      <style>{`
        @keyframes heartPop {
          0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
          50% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
        }

        @media (min-width: 900px) {
          .shorts-mobile-nav {
            display: none !important;
          }
        }

        @media (max-width: 899px) {
          .shorts-desktop-nav {
            display: none !important;
          }
          .shorts-page-container {
            padding: 8px 6px 15px !important;
          }
        }
      `}</style>
    </div>
  );
}
