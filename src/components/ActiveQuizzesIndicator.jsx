import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock, ChevronDown, Play, Bell, BellRing, X } from 'lucide-react';
import { requestNotificationPermission, getNotificationPermission } from '../lib/notificationService';

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
          let badgeBg = 'rgba(16, 185, 129, 0.18)';
          let badgeBorder = 'rgba(16, 185, 129, 0.5)';
          let glow = 'rgba(16, 185, 129, 0.4)';

          if (percent <= 20) {
            color = '#ef4444'; // Red (<=20%)
            badgeBg = 'rgba(239, 68, 68, 0.18)';
            badgeBorder = 'rgba(239, 68, 68, 0.5)';
            glow = 'rgba(239, 68, 68, 0.4)';
          } else if (percent <= 50) {
            color = '#f59e0b'; // Yellow (20-50%)
            badgeBg = 'rgba(245, 158, 11, 0.18)';
            badgeBorder = 'rgba(245, 158, 11, 0.5)';
            glow = 'rgba(245, 158, 11, 0.4)';
          }

          active.push({
            id: quizId,
            title: parsed.title || 'Тест с ограничением времени',
            remaining,
            total,
            percent,
            color,
            badgeBg,
            badgeBorder,
            glow
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
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());

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

  const handleEnableNotifications = async (e) => {
    e.stopPropagation();
    const res = await requestNotificationPermission();
    setNotifPermission(res);
  };

  return (
    <div
      className="active-quizzes-wrapper"
      style={{
        position: 'fixed',
        bottom: '90px',
        right: '24px',
        zIndex: 9995,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '12px',
        fontFamily: 'inherit'
      }}
    >
      {/* Expanded popover list */}
      {isExpanded && (
        <div
          style={{
            width: '330px',
            maxHeight: '420px',
            background: 'var(--card-bg, rgba(20, 22, 32, 0.94))',
            backdropFilter: 'blur(28px) saturate(200%)',
            WebkitBackdropFilter: 'blur(28px) saturate(200%)',
            border: `1.5px solid ${urgentQuiz.badgeBorder}`,
            borderRadius: '22px',
            boxShadow: `0 20px 50px rgba(0,0,0,0.4), 0 0 30px ${urgentQuiz.glow}`,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            animation: 'slideUpActive 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-color)' }}>
              <Clock size={18} color={urgentQuiz.color} className="pulsating-timer-icon" />
              <span>Активные тесты ({activeQuizzes.length})</span>
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
              <X size={18} />
            </button>
          </div>

          {/* Web notification prompt banner if not granted */}
          {notifPermission !== 'granted' && (
            <div
              style={{
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '12px',
                padding: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                fontSize: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-color)' }}>
                <BellRing size={14} color="var(--primary-color)" />
                <span>Напоминать при уходе с вкладки</span>
              </div>
              <button
                onClick={handleEnableNotifications}
                style={{
                  background: 'var(--primary-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '4px 8px',
                  fontWeight: 'bold',
                  fontSize: '0.7rem',
                  cursor: 'pointer'
                }}
              >
                Включить
              </button>
            </div>
          )}

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
                  boxShadow: `0 4px 15px ${item.badgeBg}`
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
                      padding: '3px 8px',
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
                <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${item.percent}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${item.color}, #6366f1)`,
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
                    boxShadow: `0 4px 14px ${item.badgeBg}`
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

      {/* Floating Circular Bubble (AiHub-style) */}
      <div
        className="quiz-timer-bubble"
        onClick={() => setIsExpanded(prev => !prev)}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${urgentQuiz.color}, #6366f1)`,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: `0 8px 24px ${urgentQuiz.glow}, 0 4px 12px rgba(0,0,0,0.3)`,
          position: 'relative',
          transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          transform: isExpanded ? 'scale(1.08)' : 'scale(1)'
        }}
        title="Нажмите, чтобы увидеть незавершенные тесты"
      >
        <div className="bubble-pulse-ring" style={{ borderColor: urgentQuiz.color }} />
        <Clock size={24} className="pulsating-timer-icon" />

        {/* Floating countdown pill tag attached to bubble */}
        <div
          style={{
            position: 'absolute',
            bottom: '-8px',
            background: '#0f111a',
            color: urgentQuiz.color,
            border: `1.5px solid ${urgentQuiz.color}`,
            borderRadius: '10px',
            padding: '1px 6px',
            fontSize: '0.65rem',
            fontWeight: '900',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }}
        >
          {formatTimerSeconds(urgentQuiz.remaining)}
        </div>

        {/* Counter badge if multiple quizzes */}
        {activeQuizzes.length > 1 && (
          <div
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: '#ef4444',
              color: 'white',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              fontWeight: 'bold',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              border: '2px solid var(--bg-color, #121420)'
            }}
          >
            {activeQuizzes.length}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUpActive {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .pulsating-timer-icon {
          animation: pulseIcon 1.8s infinite ease-in-out;
        }
        @keyframes pulseIcon {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.85; }
        }
        .bubble-pulse-ring {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid;
          opacity: 0.6;
          animation: ringPulse 2s infinite cubic-bezier(0.25, 1, 0.5, 1);
          pointer-events: none;
        }
        @keyframes ringPulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        .quiz-timer-bubble:hover {
          transform: scale(1.1) !important;
        }
      `}</style>
    </div>
  );
};

export default ActiveQuizzesIndicator;
