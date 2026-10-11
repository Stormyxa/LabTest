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

  // Mobile detection
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Streak counters for dopamine loop
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [showHeartPop, setShowHeartPop] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Preference for explanation expansion on Desktop
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

  // Unified Slide Animation States (used for both Mobile touch & PC wheel/keys)
  const [touchOffset, setTouchOffset] = useState(0);
  const [isAnimatingTransition, setIsAnimatingTransition] = useState(false);
  const isTransitioningRef = useRef(false);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const touchCurrentY = useRef(0);
  const isDragging = useRef(false);
  const viewportRef = useRef(null);

  // Double tap detection for like
  const lastTapRef = useRef(0);

  // Extract all images safely from any format (images[], images string, image, image_url)
  const extractQuestionImages = (q) => {
    if (Array.isArray(q.images) && q.images.length > 0) {
      return q.images.filter(Boolean);
    }
    if (typeof q.images === 'string' && q.images.trim()) {
      return [q.images.trim()];
    }
    if (q.image) {
      return [q.image];
    }
    if (q.image_url) {
      return [q.image_url];
    }
    return [];
  };

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
              const allImgs = extractQuestionImages(q);

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
                images: allImgs,
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

  // Smooth slide trigger (1: next, -1: prev)
  const triggerSlide = useCallback((direction) => {
    if (isTransitioningRef.current || questions.length === 0) return;

    if (direction === 1) {
      if (currentIndex >= questions.length - 1) return;
      isTransitioningRef.current = true;
      setIsAnimatingTransition(true);
      setTouchOffset(-window.innerHeight * 0.9);
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        setTouchOffset(0);
        setIsAnimatingTransition(false);
        isTransitioningRef.current = false;
      }, 260);
    } else if (direction === -1) {
      if (currentIndex <= 0) return;
      isTransitioningRef.current = true;
      setIsAnimatingTransition(true);
      setTouchOffset(window.innerHeight * 0.9);
      setTimeout(() => {
        setCurrentIndex(prev => prev - 1);
        setTouchOffset(0);
        setIsAnimatingTransition(false);
        isTransitioningRef.current = false;
      }, 260);
    }
  }, [currentIndex, questions.length]);

  const goToNext = useCallback(() => triggerSlide(1), [triggerSlide]);
  const goToPrev = useCallback(() => triggerSlide(-1), [triggerSlide]);

  // Wheel listener for Desktop
  useEffect(() => {
    const handleWheel = (e) => {
      if (showExitModal || selectedQuiz || previewImage || isTransitioningRef.current) return;
      if (Math.abs(e.deltaY) < 25) return;

      if (e.deltaY > 0) {
        triggerSlide(1);
      } else {
        triggerSlide(-1);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [triggerSlide, showExitModal, selectedQuiz, previewImage]);

  // Keyboard navigation (↑ / ↓, W / S, Esc)
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

  // Touch Drag for Mobile (Strict Vertical Only + prevents pull-to-refresh)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (showExitModal || selectedQuiz || previewImage || isTransitioningRef.current) return;
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
      touchCurrentY.current = e.touches[0].clientY;
      isDragging.current = true;
    };

    const onTouchMove = (e) => {
      if (!isDragging.current || isTransitioningRef.current) return;
      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - touchStartY.current;
      const deltaX = currentX - touchStartX.current;

      // Disallow horizontal movement
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 12) {
        return;
      }

      // Prevent pull-to-refresh reload in mobile browsers
      if (e.cancelable) {
        e.preventDefault();
      }

      touchCurrentY.current = currentY;

      // Elastic resistance at boundaries
      if (currentIndex === 0 && deltaY > 0) {
        setTouchOffset(deltaY * 0.25);
      } else if (currentIndex === questions.length - 1 && deltaY < 0) {
        setTouchOffset(deltaY * 0.25);
      } else {
        setTouchOffset(deltaY);
      }
    };

    const onTouchEnd = () => {
      if (!isDragging.current || isTransitioningRef.current) return;
      isDragging.current = false;

      const diff = touchCurrentY.current - touchStartY.current;
      const threshold = 55; // swipe sensitivity threshold

      if (diff < -threshold && currentIndex < questions.length - 1) {
        triggerSlide(1);
      } else if (diff > threshold && currentIndex > 0) {
        triggerSlide(-1);
      } else {
        // Snap back to 0
        isTransitioningRef.current = true;
        setIsAnimatingTransition(true);
        setTouchOffset(0);
        setTimeout(() => {
          setIsAnimatingTransition(false);
          isTransitioningRef.current = false;
        }, 200);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [currentIndex, questions.length, showExitModal, selectedQuiz, previewImage, triggerSlide]);

  // Double tap on free area of card to like
  const handleCardAreaClick = (e, q) => {
    // If clicked on an interactive button, ignore
    if (e.target.closest('button') || e.target.closest('a')) return;

    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      // Double tap confirmed
      setLikedMap(prev => {
        const nextMap = { ...prev, [q.shortId]: true };
        try {
          localStorage.setItem('shorts_liked_ids', JSON.stringify(nextMap));
        } catch {}
        return nextMap;
      });
      setShowHeartPop(true);
      setTimeout(() => setShowHeartPop(false), 800);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
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

  // Render Question Card
  const renderCardBody = (q, isActiveCard = true) => {
    const qChosen = userAnswers[q.shortId];
    const qAnswered = qChosen !== undefined;
    const qLiked = !!likedMap[q.shortId];

    return (
      <div
        onClick={(e) => handleCardAreaClick(e, q)}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: isMobile ? 'space-between' : 'flex-start',
          boxSizing: 'border-box'
        }}
      >
        {/* TOP: Images & Question */}
        <div style={{ flexShrink: 0 }}>
          {q.images && q.images.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginBottom: isMobile ? '8px' : '16px',
                overflowX: 'auto',
                paddingBottom: '4px'
              }}
            >
              {q.images.map((imgUrl, imgIdx) => (
                <img
                  key={imgIdx}
                  src={resolveImgUrl(imgUrl)}
                  alt={`Иллюстрация ${imgIdx + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isActiveCard) setPreviewImage(resolveImgUrl(imgUrl));
                  }}
                  style={{
                    maxHeight: isMobile ? '85px' : '150px',
                    borderRadius: '12px',
                    objectFit: 'contain',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    background: 'var(--card-bg)',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
          )}

          <h2
            style={{
              fontSize: isMobile ? '1.08rem' : '1.35rem',
              lineHeight: isMobile ? '1.4' : '1.5',
              fontWeight: '700',
              margin: '0 0 14px 0',
              userSelect: 'none',
              WebkitUserSelect: 'none'
            }}
          >
            <MathRenderer text={q.question} noSelect={true} />
          </h2>
        </div>

        {/* MIDDLE: Options */}
        <div
          style={{
            display: 'grid',
            gap: isMobile ? '9px' : '12px',
            gridTemplateColumns:
              isMobile || q.options.some(opt => opt.length > 42) || q.options.length > 4
                ? '1fr'
                : 'repeat(auto-fit, minmax(360px, 1fr))',
            margin: isMobile ? '6px 0' : '0 0 20px 0',
            flexShrink: 0
          }}
        >
          {q.options.map((opt, optIdx) => {
            const isCorrect = optIdx === q.correctIndex;
            const isChosen = qChosen === optIdx;

            // Explicit borders ensure outline never disappears between slides
            let bgColor = 'var(--card-bg)';
            let borderColor = 'rgba(99, 102, 241, 0.22)';
            let textColor = 'var(--text-color)';

            if (qAnswered) {
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
                key={`${q.shortId}_opt_${optIdx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  if (isActiveCard) handleOptionSelect(optIdx);
                }}
                disabled={qAnswered || !isActiveCard}
                style={{
                  textAlign: 'left',
                  background: bgColor,
                  color: textColor,
                  border: `2px solid ${borderColor}`,
                  outline: 'none',
                  padding: isMobile ? '12px 16px' : '16px 22px',
                  borderRadius: isMobile ? '14px' : '18px',
                  fontSize: isMobile ? '0.94rem' : '1.02rem',
                  lineHeight: '1.4',
                  boxShadow: 'none',
                  transition: 'background-color 0.2s, border-color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  cursor: qAnswered || !isActiveCard ? 'default' : 'pointer',
                  transform: 'none',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ flex: 1, pointerEvents: 'none' }}>
                  <MathRenderer text={opt} noSelect={true} />
                </div>
                <div style={{ flexShrink: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                  {qAnswered && isCorrect && <CheckCircle size={18} color="#4ade80" />}
                  {qAnswered && isChosen && !isCorrect && <XCircle size={18} color="#f87171" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* PC ONLY: Explanation Block (Always visible if exists, greyed out until answered) */}
        {!isMobile && q.explanation && (
          <div
            style={{
              background: qAnswered ? 'rgba(99, 102, 241, 0.05)' : 'rgba(0,0,0,0.02)',
              borderRadius: '20px',
              border: qAnswered ? '1.5px dashed rgba(99, 102, 241, 0.25)' : '1.5px dashed rgba(128, 128, 128, 0.25)',
              overflow: 'hidden',
              padding: '0 20px',
              marginBottom: '20px',
              opacity: qAnswered ? 1 : 0.45,
              transition: 'all 0.3s ease'
            }}
          >
            <div
              className="flex-center"
              onClick={() => {
                if (qAnswered) toggleExplanation();
              }}
              style={{
                justifyContent: 'space-between',
                cursor: qAnswered ? 'pointer' : 'not-allowed',
                userSelect: 'none',
                padding: '16px 0'
              }}
            >
              <div className="flex-center" style={{ gap: '8px', color: qAnswered ? 'var(--primary-color)' : 'inherit' }}>
                <Zap size={18} />
                <span style={{ fontSize: '0.85rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  {qAnswered ? 'Пояснение' : 'Пояснение (станет доступно после ответа)'}
                </span>
              </div>
              {qAnswered && (isExplanationExpanded ? <ChevronUp size={18} opacity={0.5} /> : <ChevronDown size={18} opacity={0.5} />)}
            </div>

            {qAnswered && (
              <div
                style={{
                  maxHeight: isExplanationExpanded ? '1000px' : '0',
                  overflow: 'hidden',
                  transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s',
                  opacity: isExplanationExpanded ? 1 : 0
                }}
              >
                <div style={{ paddingBottom: '16px', fontSize: '0.98rem', lineHeight: '1.6', opacity: 0.9 }}>
                  <MathRenderer text={q.explanation} noSelect={true} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* BOTTOM: Quiz Origin Metadata & Action Buttons */}
        <div
          style={{
            marginTop: isMobile ? '6px' : 'auto',
            paddingTop: isMobile ? '10px' : '16px',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0
          }}
        >
          {/* Left: Origin Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: isMobile ? '0.88rem' : '0.98rem',
                fontWeight: '700',
                color: 'var(--text-color)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={q.quizTitle}
            >
              {q.quizTitle}
            </div>
            <div
              style={{
                fontSize: isMobile ? '0.75rem' : '0.85rem',
                opacity: 0.6,
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {q.className} — {q.sectionName}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex-center" style={{ gap: isMobile ? '8px' : '10px' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isActiveCard) toggleLike(q.shortId);
              }}
              className="flex-center"
              style={{
                background: qLiked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0,0,0,0.04)',
                color: qLiked ? '#ef4444' : 'var(--text-color)',
                width: isMobile ? '40px' : '44px',
                height: isMobile ? '40px' : '44px',
                borderRadius: '50%',
                padding: 0,
                boxShadow: 'none',
                border: 'none',
                transition: 'all 0.2s ease'
              }}
              title={qLiked ? 'Убрать сердечко' : 'Поставить сердечко'}
            >
              <Heart
                size={isMobile ? 20 : 22}
                fill={qLiked ? '#ef4444' : 'none'}
                color={qLiked ? '#ef4444' : 'currentColor'}
              />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isActiveCard) handleShareQuestion(e);
              }}
              className="flex-center"
              style={{
                background: 'rgba(0,0,0,0.04)',
                color: 'var(--text-color)',
                width: isMobile ? '40px' : '44px',
                height: isMobile ? '40px' : '44px',
                borderRadius: '50%',
                padding: 0,
                boxShadow: 'none',
                border: 'none'
              }}
              title="Поделиться вопросом"
            >
              <Share2 size={isMobile ? 18 : 19} />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isActiveCard) setSelectedQuiz(q.fullQuiz);
              }}
              className="flex-center"
              style={{
                background: 'var(--primary-color)',
                color: 'white',
                padding: isMobile ? '9px 16px' : '10px 20px',
                borderRadius: '14px',
                gap: '6px',
                fontSize: isMobile ? '0.84rem' : '0.9rem',
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}
              title="Пройти полный тест целиком"
            >
              <Play size={14} fill="currentColor" />
              <span>Тест</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

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
        {/* Cancel button in top right during loading */}
        <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 100 }}>
          <button
            onClick={() => setShowExitModal(true)}
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.06)',
              color: 'var(--text-color)',
              border: '1px solid rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Отмена"
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ fontSize: '3.5rem', animation: 'spin 2s linear infinite' }}>🧪</div>
        <div style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.5px' }}>Формируем Ленту Знаний...</div>
        <div style={{ opacity: 0.5, fontSize: '0.95rem' }}>Загружаем и перемешиваем вопросы из всех предметов</div>

        {/* Exit Modal also usable during loading */}
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
            <div className="modal-content animate" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
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
              <h2 style={{ marginBottom: '14px' }}>Отменить загрузку?</h2>
              <p style={{ opacity: 0.7, marginBottom: '28px', lineHeight: '1.6' }}>
                Выйти обратно в каталог тестов?
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <button
                  onClick={() => setShowExitModal(false)}
                  style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none', padding: '14px' }}
                >
                  Остаться
                </button>
                <button
                  onClick={handleConfirmExit}
                  style={{ background: '#ca8a04', color: 'white', padding: '14px' }}
                >
                  Да, выйти
                </button>
              </div>
            </div>
          </div>
        )}
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
        WebkitUserSelect: 'none',
        overscrollBehaviorY: 'none'
      }}
    >
      {/* ========================================================
          TOP HEADER (REPLACES NAVBAR ACROSS FULL SCREEN)
          ======================================================== */}
      <header
        style={{
          height: isMobile ? '56px' : '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 16px' : '0 24px',
          borderBottom: '1px solid rgba(124, 58, 237, 0.1)',
          background: 'var(--card-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 50,
          flexShrink: 0
        }}
      >
        {/* Left: "🧪 Лента Знаний" */}
        <div className="flex-center" style={{ gap: '8px' }}>
          <span style={{ fontSize: isMobile ? '1.3rem' : '1.5rem', lineHeight: 1 }}>🧪</span>
          <span
            style={{
              fontWeight: '800',
              fontSize: isMobile ? '1.1rem' : '1.25rem',
              letterSpacing: '-0.5px',
              color: 'var(--primary-color)'
            }}
          >
            Лента Знаний
          </span>
        </div>

        {/* Center: Streak & Counter & Shuffle */}
        <div className="flex-center" style={{ gap: isMobile ? '8px' : '14px' }}>
          {streak > 0 && (
            <div
              className="flex-center animate"
              style={{
                background:
                  streak >= 3
                    ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
                    : 'rgba(239, 68, 68, 0.1)',
                color: streak >= 3 ? 'white' : '#ef4444',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                gap: '4px',
                boxShadow: streak >= 3 ? '0 4px 12px rgba(239, 68, 68, 0.3)' : 'none'
              }}
              title={`Серия побед: ${streak}`}
            >
              <Flame size={14} fill="currentColor" />
              <span>{streak}</span>
            </div>
          )}

          <div
            style={{
              fontSize: '0.82rem',
              fontWeight: '700',
              opacity: 0.6,
              background: 'rgba(0,0,0,0.04)',
              padding: '5px 10px',
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
              padding: '6px 10px',
              borderRadius: '12px',
              boxShadow: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '0.78rem',
              fontWeight: '600'
            }}
            title="Перемешать вопросы заново"
          >
            <RotateCcw size={13} />
            <span className="shorts-shuffle-text">Перемешать</span>
          </button>
        </div>

        {/* Right: Exit Cross Button */}
        <div>
          <button
            onClick={() => setShowExitModal(true)}
            style={{
              width: isMobile ? '36px' : '40px',
              height: isMobile ? '36px' : '40px',
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
            <X size={18} />
          </button>
        </div>
      </header>

      {/* ========================================================
          VIEWPORT AREA (WITH GPU-ACCELERATED VERTICAL SLIDE TRACK)
          ======================================================== */}
      <main
        ref={viewportRef}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          width: '100%',
          maxWidth: '100vw',
          boxSizing: 'border-box',
          overscrollBehaviorY: 'none'
        }}
      >
        {/* DESKTOP SIDE NAVIGATION ARROWS */}
        {!isMobile && (
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
              disabled={currentIndex === 0}
              title="Предыдущий вопрос (↑, W или колесико вверх)"
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
                justifyContent: 'center',
                opacity: currentIndex === 0 ? 0.35 : 1
              }}
            >
              <ChevronUp size={28} />
            </button>

            <span style={{ fontSize: '0.75rem', opacity: 0.4, fontWeight: 'bold' }}>
              ↑ / ↓
            </span>

            <button
              onClick={goToNext}
              disabled={currentIndex === questions.length - 1}
              title="Следующий вопрос (↓, S или колесико вниз)"
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
                justifyContent: 'center',
                opacity: currentIndex === questions.length - 1 ? 0.35 : 1
              }}
            >
              <ChevronDown size={28} />
            </button>
          </div>
        )}

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
            3-CARD VERTICAL SLIDE CONTAINER (TIKTOK EFFECT ON BOTH PC & MOBILE)
            ======================================================== */}
        <div
          style={{
            width: '100%',
            maxWidth: isMobile ? '100%' : '940px',
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              transform: `translate3d(0, ${touchOffset}px, 0)`,
              willChange: 'transform',
              transition: isAnimatingTransition
                ? 'transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)'
                : 'none'
            }}
          >
            {/* PREVIOUS CARD (EXISTS ABOVE) */}
            {currentIndex > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '-100%',
                  left: 0,
                  width: '100%',
                  height: '100%',
                  padding: isMobile ? '14px' : '20px',
                  boxSizing: 'border-box'
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'var(--card-bg)',
                    borderRadius: isMobile ? '20px' : '24px',
                    border: '1.5px solid rgba(99, 102, 241, 0.18)',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.1)',
                    padding: isMobile ? '16px' : '28px 32px',
                    boxSizing: 'border-box',
                    overflowY: isMobile ? 'hidden' : 'auto'
                  }}
                >
                  {renderCardBody(questions[currentIndex - 1], false)}
                </div>
              </div>
            )}

            {/* CURRENT ACTIVE CARD */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                padding: isMobile ? '14px' : '20px',
                boxSizing: 'border-box'
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'var(--card-bg)',
                  borderRadius: isMobile ? '20px' : '24px',
                  border: '1.5px solid rgba(99, 102, 241, 0.2)',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.12)',
                  padding: isMobile ? '16px' : '28px 32px',
                  boxSizing: 'border-box',
                  overflowY: isMobile ? 'hidden' : 'auto'
                }}
              >
                {renderCardBody(currentQ, true)}
              </div>
            </div>

            {/* NEXT CARD (EXISTS BELOW, VISIBLE UPON PULLING UP) */}
            {currentIndex < questions.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  width: '100%',
                  height: '100%',
                  padding: isMobile ? '14px' : '20px',
                  boxSizing: 'border-box'
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'var(--card-bg)',
                    borderRadius: isMobile ? '20px' : '24px',
                    border: '1.5px solid rgba(99, 102, 241, 0.18)',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.1)',
                    padding: isMobile ? '16px' : '28px 32px',
                    boxSizing: 'border-box',
                    overflowY: isMobile ? 'hidden' : 'auto'
                  }}
                >
                  {renderCardBody(questions[currentIndex + 1], false)}
                </div>
              </div>
            )}
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

      {/* Styles */}
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
        }
      `}</style>
    </div>
  );
}
