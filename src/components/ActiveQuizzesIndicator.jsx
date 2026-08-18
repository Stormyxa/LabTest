import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock, Play, BellRing, X, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { requestNotificationPermission, getNotificationPermission, sendQuizExpiredDeviceNotification } from '../lib/notificationService';
import { supabase } from '../lib/supabase';
import { triggerFactStorage } from '../lib/ragService';

export const getActiveTimedQuizzes = () => {
  const active = [];
  const expiredToFinalize = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('quiz_timer_')) {
        const quizId = key.replace('quiz_timer_', '');
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          // Prefer absolute endTime (set by new timer logic); fall back to legacy timeLeft+ts
          let remaining;
          if (parsed.endTime) {
            remaining = Math.max(0, Math.ceil((parsed.endTime - Date.now()) / 1000));
          } else {
            const elapsed = Math.round((Date.now() - (parsed.ts || Date.now())) / 1000);
            remaining = Math.max(0, (parsed.timeLeft || 0) - elapsed);
          }

          if (remaining <= 0) {
            expiredToFinalize.push({
              id: quizId,
              title: parsed.title || 'Тест',
              totalTime: parsed.totalTime || 60
            });
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
  return { active: active.sort((a, b) => a.remaining - b.remaining), expiredToFinalize };
};

export const getExpiredNotices = () => {
  const notices = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('quiz_expired_notice_')) {
        const quizId = key.replace('quiz_expired_notice_', '');
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            notices.push(parsed);
          }
        } catch {}
      }
    }
  } catch (e) {}
  return notices.sort((a, b) => b.timestamp - a.timestamp);
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
  const [expiredNotices, setExpiredNotices] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const finalizingSetRef = useRef(new Set());

  // Check if user is currently inside an active test view
  const isTakingQuiz = location.pathname.startsWith('/quiz/');

  const handleFinalizeExpired = async (item) => {
    const qId = item.id;
    if (finalizingSetRef.current.has(qId)) return;
    finalizingSetRef.current.add(qId);

    try {
      // 1. Fetch user session
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      // 2. Fetch quiz details
      let questions = [];
      let quizTitle = item.title || 'Тест';
      let sectionName = null;
      let quizClass = null;

      // Try local structure cache first
      const cachedStruct = localStorage.getItem(`quiz_structure_${qId}`);
      if (cachedStruct) {
        try {
          questions = JSON.parse(cachedStruct);
        } catch {}
      }

      // If not cached, fetch from DB
      if (questions.length === 0) {
        const { data: quizData } = await supabase
          .from('quizzes')
          .select('*, quiz_sections(name, quiz_classes(name))')
          .eq('id', qId)
          .single();

        if (quizData) {
          questions = quizData.content?.questions || [];
          quizTitle = quizData.title || quizTitle;
          sectionName = quizData.quiz_sections?.name;
          quizClass = quizData.quiz_sections?.quiz_classes?.name;
        }
      }

      const maxScore = questions.length || 1;

      // 3. Load user answers from localStorage
      let finalAnswers = {};
      const storedAnswers = localStorage.getItem(`quiz_answers_${qId}`);
      if (storedAnswers) {
        try { finalAnswers = JSON.parse(storedAnswers); } catch {}
      }

      // 4. Grade
      let correctCount = 0;
      const originalAnswers = [];
      const detailedAnswers = questions.map((q, idx) => {
        const chosen = finalAnswers[idx];
        const isCorrect = chosen !== undefined && chosen === q.correctIndex;
        if (isCorrect) correctCount++;
        originalAnswers[idx] = isCorrect;
        return {
          originalIndex: q.originalIndex !== undefined ? q.originalIndex : idx,
          chosenIndex: chosen !== undefined ? chosen : null,
          correctIndex: q.correctIndex,
          timeSpent: 25,
          isCorrect
        };
      });

      const isPassed = (correctCount / maxScore) >= 0.5;
      const totalSeconds = item.totalTime || (maxScore * 25);
      const now = new Date().toISOString();
      const percent = Math.round((correctCount / maxScore) * 100);

      if (userId) {
        // Save to quiz_attempts marked as incomplete (grey)
        const { data: insertedAttempt, error: attError } = await supabase.from('quiz_attempts').insert({
          quiz_id: qId,
          user_id: userId,
          score: correctCount,
          max_score: maxScore,
          time_spent_total: totalSeconds,
          is_passed: isPassed,
          is_incomplete: true, // Marked incomplete (grey)
          finish_reason: 'timer_expired_away',
          suspicion_reason: 'incomplete_exit',
          is_suspicious: false,
          answers_data: detailedAnswers
        }).select('id').single();

        if (attError) {
          console.error('Error inserting expired quiz_attempt:', attError);
        }

        // Update / insert summary in quiz_results
        const { data: existing } = await supabase.from('quiz_results').select('id').eq('quiz_id', qId).eq('user_id', userId).maybeSingle();
        if (existing) {
          await supabase.from('quiz_results').update({
            score: correctCount,
            total_questions: maxScore,
            is_passed: isPassed,
            completed_at: now,
            answers_array: originalAnswers,
            is_incomplete_user: true
          }).eq('id', existing.id);
        } else {
          const { data: prof } = await supabase.from('profiles').select('class_id').eq('id', userId).single();
          await supabase.from('quiz_results').insert({
            quiz_id: qId,
            user_id: userId,
            score: correctCount,
            total_questions: maxScore,
            is_passed: isPassed,
            completed_at: now,
            first_score: correctCount,
            first_completed_at: now,
            answers_array: originalAnswers,
            first_answers_array: originalAnswers,
            is_incomplete_user: true,
            class_id: prof?.class_id || null
          });
        }

        // Update catalog stats cache so catalog card shows the grade immediately
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('labtest_cache_catalog_stats_')) {
            try {
              const parsed = JSON.parse(localStorage.getItem(k));
              if (parsed?.data?.passed) {
                parsed.data.passed[qId] = { is_passed: isPassed, score: correctCount, total: maxScore };
                localStorage.setItem(k, JSON.stringify(parsed));
                const secId = k.replace('labtest_cache_catalog_stats_', '');
                window.dispatchEvent(new CustomEvent(`cache-update-catalog_stats_${secId}`, { detail: parsed.data }));
              }
            } catch {}
          }
        }
      }

      // Save expired notice to localStorage so UI and bubble show completion details
      localStorage.setItem(`quiz_show_result_${qId}`, 'true');
      localStorage.setItem(`quiz_expired_notice_${qId}`, JSON.stringify({
        quizId: qId,
        title: quizTitle,
        score: correctCount,
        total: maxScore,
        percent,
        isPassed,
        timestamp: Date.now()
      }));

      // Send direct OS/device notification
      sendQuizExpiredDeviceNotification(qId, quizTitle, correctCount, maxScore, percent);

    } catch (e) {
      console.error('Failed to auto-finalize expired quiz:', e);
    } finally {
      localStorage.removeItem(`quiz_timer_${qId}`);
      localStorage.removeItem(`quiz_pending_${qId}`);
      localStorage.removeItem('quiz_first_attempt_mode');
      finalizingSetRef.current.delete(qId);
    }
  };

  const updateList = useCallback(() => {
    const { active, expiredToFinalize } = getActiveTimedQuizzes();
    setActiveQuizzes(active);

    // Auto-finalize expired quizzes
    if (expiredToFinalize.length > 0) {
      expiredToFinalize.forEach(item => {
        handleFinalizeExpired(item);
      });
    }

    const notices = getExpiredNotices();
    setExpiredNotices(notices);
  }, []);

  useEffect(() => {
    updateList();
    const interval = setInterval(updateList, 1000);
    return () => clearInterval(interval);
  }, [updateList]);

  const dismissNotice = (e, quizId) => {
    e.stopPropagation();
    localStorage.removeItem(`quiz_expired_notice_${quizId}`);
    setExpiredNotices(prev => prev.filter(n => n.quizId !== quizId));
  };

  const handleEnableNotifications = async (e) => {
    e.stopPropagation();
    const res = await requestNotificationPermission();
    setNotifPermission(res);
  };

  // Don't render if user is inside quiz view or no items to show
  if (isTakingQuiz || (activeQuizzes.length === 0 && expiredNotices.length === 0)) {
    return null;
  }

  const hasActive = activeQuizzes.length > 0;
  const urgentQuiz = hasActive ? activeQuizzes[0] : null;
  const latestNotice = expiredNotices[0];

  return (
    <div
      className="active-quizzes-wrapper"
      style={{
        position: 'fixed',
        bottom: '105px', // Perfectly stacked above AI Hub bubble (which is at bottom: 30px, height: 60px)
        right: '30px',   // Exactly matches AI Hub right: 30px offset
        zIndex: 10001,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '12px',
        fontFamily: 'inherit',
        pointerEvents: 'auto'
      }}
    >
      {/* Expanded popover list */}
      {isExpanded && (
        <div
          style={{
            width: '330px',
            maxHeight: '430px',
            background: 'var(--card-bg, rgba(18, 20, 30, 0.95))',
            backdropFilter: 'blur(28px) saturate(200%)',
            WebkitBackdropFilter: 'blur(28px) saturate(200%)',
            border: hasActive ? `1.5px solid ${urgentQuiz.badgeBorder}` : '1.5px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '24px',
            boxShadow: hasActive 
              ? `0 24px 60px rgba(0,0,0,0.45), 0 0 35px ${urgentQuiz.glow}` 
              : '0 24px 60px rgba(0,0,0,0.45), 0 0 25px rgba(99, 102, 241, 0.15)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            animation: 'slideUpActive 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-color)' }}>
              {hasActive ? (
                <>
                  <Clock size={18} color={urgentQuiz.color} className="pulsating-timer-icon" />
                  <span>Активные тесты ({activeQuizzes.length})</span>
                </>
              ) : (
                <>
                  <CheckCircle size={18} color="#94a3b8" />
                  <span>Завершенные по таймеру</span>
                </>
              )}
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

          {/* Web notification permission banner if not enabled */}
          {notifPermission !== 'granted' && hasActive && (
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
                <span>Напоминать при уходе с сайта</span>
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
            {/* Active Quizzes */}
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

            {/* Expired Notices (recently completed while away) */}
            {expiredNotices.map(notice => (
              <div
                key={notice.quizId}
                style={{
                  background: 'rgba(148, 163, 184, 0.08)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '14px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>
                      Окончен по таймеру
                    </div>
                    <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-color)', lineHeight: '1.3' }}>
                      {notice.title}
                    </span>
                  </div>
                  <button
                    onClick={(e) => dismissNotice(e, notice.quizId)}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                    title="Закрыть уведомление"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: notice.isPassed ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
                    Результат: {notice.score}/{notice.total} ({notice.percent}%)
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                    Не завершен
                  </span>
                </div>

                <button
                  onClick={() => {
                    setIsExpanded(false);
                    navigate(`/quiz/${notice.quizId}`);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #64748b, #475569)',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}
                >
                  <RotateCcw size={14} />
                  Открыть результаты / Пересдать
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Circular Bubble (Identical 60px diameter and perfectly vertically aligned with AI Bubble at right: 30px) */}
      <div
        className="quiz-timer-bubble"
        onClick={() => setIsExpanded(prev => !prev)}
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: hasActive
            ? `linear-gradient(135deg, ${urgentQuiz.color}, #6366f1)`
            : 'linear-gradient(135deg, #64748b, #475569)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: hasActive
            ? `0 10px 25px ${urgentQuiz.glow}, 0 4px 12px rgba(0,0,0,0.3)`
            : '0 10px 25px rgba(100, 116, 139, 0.4), 0 4px 12px rgba(0,0,0,0.3)',
          position: 'relative',
          transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          animation: 'bubblePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
          transform: isExpanded ? 'scale(1.08)' : 'scale(1)'
        }}
        title={hasActive ? "Незавершенный тест с таймером" : "Тест завершился по времени"}
      >
        {hasActive && <div className="bubble-pulse-ring" style={{ borderColor: urgentQuiz.color }} />}
        
        {hasActive ? (
          <Clock size={26} className="pulsating-timer-icon" />
        ) : (
          <AlertCircle size={26} />
        )}

        {/* Floating live tag attached to bubble */}
        <div
          style={{
            position: 'absolute',
            bottom: '-8px',
            background: '#0f111a',
            color: hasActive ? urgentQuiz.color : '#94a3b8',
            border: `1.5px solid ${hasActive ? urgentQuiz.color : '#94a3b8'}`,
            borderRadius: '10px',
            padding: '1px 6px',
            fontSize: '0.65rem',
            fontWeight: '900',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }}
        >
          {hasActive ? formatTimerSeconds(urgentQuiz.remaining) : `${latestNotice?.score}/${latestNotice?.total}`}
        </div>

        {/* Counter badge if multiple items */}
        {(activeQuizzes.length + expiredNotices.length) > 1 && (
          <div
            style={{
              position: 'absolute',
              top: '0',
              right: '0',
              background: '#ef4444',
              color: 'white',
              borderRadius: '10px',
              padding: '2px 6px',
              fontSize: '0.7rem',
              fontWeight: 'bold',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              border: '2px solid white'
            }}
          >
            {activeQuizzes.length + expiredNotices.length}
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
          transform: scale(1.1) translateY(-5px) !important;
        }
      `}</style>
    </div>
  );
};

export default ActiveQuizzesIndicator;
