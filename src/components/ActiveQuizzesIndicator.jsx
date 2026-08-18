import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock, ChevronUp, ChevronDown, Play, AlertCircle } from 'lucide-react';

export const getActiveTimedQuizzes = () => {
  const active = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('quiz_timer_')) {
        const quizId = key.replace('quiz_timer_', '');
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const elapsed = Math.round((Date.now() - (parsed.ts || Date.now())) / 1000);
          const remaining = Math.max(0, (parsed.timeLeft || 0) - elapsed);

          if (remaining <= 0) {
            // Expired, clean up
            localStorage.removeItem(key);
            continue;
          }

          const total = parsed.totalTime || Math.max(remaining, 60);
          const percent = Math.min(100, Math.max(0, Math.round((remaining / total) * 100)));

          let color = '#10b981'; // Green (>50%)
          let badgeBg = 'rgba(16, 185, 129, 0.15)';
          let badgeBorder = 'rgba(16, 185, 129, 0.4)';
          if (percent <= 20) {
            color = '#ef4444'; // Red (<=20%)
            badgeBg = 'rgba(239, 68, 68, 0.15)';
            badgeBorder = 'rgba(239, 68, 68, 0.4)';
          } else if (percent <= 50) {
            color = '#f59e0b'; // Yellow (20-50%)
            badgeBg = 'rgba(245, 158, 11, 0.15)';
            badgeBorder = 'rgba(245, 158, 11, 0.4)';
          }

          active.push({
            id: quizId,
            title: parsed.title || 'Тест с ограничением времени',
            remaining,
            total,
            percent,
            color,
            badgeBg,
            badgeBorder
          });
        } catch {
          // ignore corrupted keys
        }
      }
    }
  } catch (e) {
    console.warn('Error reading active timed quizzes:', e);
  }
  return active.sort((a, b) => a.remaining - b.remaining);
};

export const formatTimerSeconds = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const ActiveQuizzesIndicator = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeQuizzes, setActiveQuizzes] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if user is currently inside an active test
  const isTakingQuiz = location.pathname.startsWith('/quiz/');

  const updateList = useCallback(() => {
    const list = getActiveTimedQuizzes();
    setActiveQuizzes(list);
  }, []);

  useEffect(() => {
    updateList();
    const interval = setInterval(updateList, 1000);
    return () => clearInterval(interval);
  }, [updateList]);

  // Don't render if taking a quiz or no active timed quizzes
  if (isTakingQuiz || activeQuizzes.length === 0) {
    return null;
  }

  const urgentQuiz = activeQuizzes[0];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9990,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '10px',
        fontFamily: 'inherit'
      }}
    >
      {/* Expanded popover list */}
      {isExpanded && (
        <div
          style={{
            width: '320px',
            maxHeight: '380px',
            background: 'var(--card-bg, rgba(25, 27, 38, 0.95))',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '20px',
            boxShadow: '0 20px 45px rgba(0,0,0,0.35), 0 0 25px rgba(99, 102, 241, 0.2)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            animation: 'slideUpActive 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-color)' }}>
              <Clock size={16} color={urgentQuiz.color} className="pulsating-timer" />
              <span>Незавершенные тесты ({activeQuizzes.length})</span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-color)',
                opacity: 0.6,
                cursor: 'pointer',
                padding: '4px',
                display: 'flex'
              }}
            >
              <ChevronDown size={18} />
            </button>
          </div>

          <div className="custom-scrollbar" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px' }}>
            {activeQuizzes.map(item => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${item.badgeBorder}`,
                  borderRadius: '14px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-color)', lineHeight: '1.3', flex: 1 }}>
                    {item.title}
                  </span>
                  <span
                    style={{
                      background: item.badgeBg,
                      color: item.color,
                      border: `1px solid ${item.badgeBorder}`,
                      padding: '2px 8px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      fontVariantNumeric: 'tabular-nums',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Clock size={12} />
                    {formatTimerSeconds(item.remaining)}
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${item.percent}%`,
                      height: '100%',
                      background: item.color,
                      borderRadius: '4px',
                      transition: 'width 1s linear'
                    }}
                  />
                </div>

                <button
                  onClick={() => {
                    setIsExpanded(false);
                    navigate(`/quiz/${item.id}`);
                  }}
                  style={{
                    marginTop: '2px',
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: `linear-gradient(135deg, ${item.color}, #6366f1)`,
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: `0 4px 12px ${item.badgeBg}`
                  }}
                >
                  <Play size={14} fill="currentColor" />
                  Продолжить тест
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main floating trigger pill */}
      <button
        onClick={() => setIsExpanded(prev => !prev)}
        style={{
          background: 'var(--card-bg, rgba(20, 22, 32, 0.9))',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: `1.5px solid ${urgentQuiz.badgeBorder}`,
          borderRadius: '24px',
          padding: '10px 18px',
          color: 'var(--text-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: `0 8px 30px rgba(0,0,0,0.3), 0 0 20px ${urgentQuiz.badgeBg}`,
          cursor: 'pointer',
          transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          transform: isExpanded ? 'scale(1.02)' : 'scale(1)'
        }}
        title="У вас есть незавершенные тесты с таймером"
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Clock size={18} color={urgentQuiz.color} />
          <span
            style={{
              position: 'absolute',
              top: '-6px',
              right: '-8px',
              background: urgentQuiz.color,
              color: 'white',
              fontSize: '0.65rem',
              fontWeight: '900',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
            }}
          >
            {activeQuizzes.length}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>
            Тест не окончен
          </span>
          <span
            style={{
              fontSize: '0.9rem',
              fontWeight: '800',
              color: urgentQuiz.color,
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {formatTimerSeconds(urgentQuiz.remaining)} осталось
          </span>
        </div>

        <ChevronUp
          size={16}
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.3s ease',
            opacity: 0.7
          }}
        />
      </button>

      <style>{`
        @keyframes slideUpActive {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .pulsating-timer {
          animation: pulseTimer 1.5s infinite ease-in-out;
        }
        @keyframes pulseTimer {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

export default ActiveQuizzesIndicator;
