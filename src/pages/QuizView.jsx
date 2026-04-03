import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  CheckCircle, XCircle, ChevronRight, ChevronLeft, RotateCcw, X, 
  AlertTriangle, Book, FileText, ChevronDown, ChevronUp, Clock, Zap 
} from 'lucide-react';

const SECONDS_PER_QUESTION = 25;
const EXIT_GRACE_SECONDS = 30;

const QuizView = ({ session, profile }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showExitModal, setShowExitModal] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [startTime] = useState(Date.now());
  const startTimeRef = useRef(Date.now());

  // Results display
  const [showAnswersList, setShowAnswersList] = useState(false);

  // Timer
  const [isFirstAttempt, setIsFirstAttempt] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const timerRef = useRef(null);
  const finishedRef = useRef(false);
  const answersRef = useRef({});   // mirrors answers state
  const questionsRef = useRef([]); // mirrors questions state
  const exitElapsedRef = useRef(0);
  const saveResultRef = useRef(null); // stable ref to saveResult
  const finishTimeRef = useRef(null); // frozen finish timestamp for results screen

  // NAVIGATION BLOCKER: intercept internal links (Profile, Catalog, etc.)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !finishedRef.current && !loading && !showResult && currentLocation.pathname !== nextLocation.pathname
  );

  // When blocked, show our exit modal
  useEffect(() => {
    if (blocker.state === 'blocked') {
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      exitElapsedRef.current = elapsed;
      setShowExitModal(true);
    }
  }, [blocker.state]);

  useEffect(() => {
    fetchQuiz();
  }, [id]);

  // beforeunload: save result if elapsed >= EXIT_GRACE_SECONDS
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (finishedRef.current || !questionsRef.current.length) return;
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      const answeredCount = Object.keys(answersRef.current).length;
      
      // Save if elapsed >= 30s OR (not first attempt AND answered > 2)
      const shouldSave = elapsed >= EXIT_GRACE_SECONDS || (!isFirstAttempt && answeredCount > 2);
      if (!shouldSave) return;

      // Store pending result in localStorage — will be saved on next visit
      const qs = questionsRef.current;
      const ans = answersRef.current;
      
      // Calculate results based on ORIGINAL indices to ensure analytics compatibility
      const originalAnswers = [];
      qs.forEach((q) => {
        if (q.originalIndex !== undefined) {
          originalAnswers[q.originalIndex] = ans[questions.indexOf(q)] === q.correctIndex;
        }
      });

      const correctCount = qs.filter((q, idx) => ans[idx] === q.correctIndex).length;
      const pendingKey = `quiz_pending_${id}`;
      localStorage.setItem(pendingKey, JSON.stringify({
        quiz_id: id,
        user_id: session.user.id,
        score: correctCount,
        total_questions: qs.length,
        is_passed: (correctCount / qs.length) >= 0.5,
        answers_array: originalAnswers,
        class_id: profile?.class_id || null,
        completed_at: new Date().toISOString(),
      }));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [id]);

  // visibilitychange: save result when tab is hidden after EXIT_GRACE_SECONDS,
  // AND handle blur overlay for active quiz
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Show blur if quiz is active
        if (!showResult && !loading) setIsBlurred(true);

        // Save pending result to localStorage (fires reliably even on tab close)
        if (!finishedRef.current && questionsRef.current.length > 0) {
          const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
          const answeredCount = Object.keys(answersRef.current).length;
          const shouldSave = elapsed >= EXIT_GRACE_SECONDS || (!isFirstAttempt && answeredCount > 2);

          if (shouldSave) {
            const qs = questionsRef.current;
            const ans = answersRef.current;
            
            const originalAnswers = [];
            qs.forEach((q) => {
              if (q.originalIndex !== undefined) {
                originalAnswers[q.originalIndex] = ans[questions.indexOf(q)] === q.correctIndex;
              }
            });

            const correctCount = qs.filter((q, idx) => ans[idx] === q.correctIndex).length;
            localStorage.setItem(`quiz_pending_${id}`, JSON.stringify({
              quiz_id: id,
              user_id: session.user.id,
              score: correctCount,
              total_questions: qs.length,
              is_passed: (correctCount / qs.length) >= 0.5,
              answers_array: originalAnswers,
              class_id: profile?.class_id || null,
              completed_at: new Date().toISOString(),
            }));
          }
        }
      } else {
        setIsBlurred(false);
        // If user came back and quiz not finished, clear the pending save
        if (!finishedRef.current) {
          localStorage.removeItem(`quiz_pending_${id}`);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [showResult, loading, id]);

  // Timer countdown — calls through saveResultRef to avoid stale closure
  useEffect(() => {
    if (!isFirstAttempt || timeLeft === null || showResult) return;

    if (timeLeft <= 0) {
      if (!finishedRef.current) {
        finishedRef.current = true;
        localStorage.removeItem(`quiz_timer_${id}`);
        saveResultRef.current(answersRef.current).then(() => setShowResult(true));
      }
      return;
    }

    // Persist remaining time each second
    localStorage.setItem(`quiz_timer_${id}`, JSON.stringify({ timeLeft, ts: Date.now() }));

    timerRef.current = setTimeout(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timerRef.current);
  }, [isFirstAttempt, timeLeft, showResult]);

  const fetchQuiz = async () => {
    const { data } = await supabase
      .from('quizzes')
      .select('*, quiz_sections(name, book_url)')
      .eq('id', id)
      .single();

    if (data) {
      setQuiz(data);
      const rawQuestions = data.content.questions || [];
      // Assign original indices before shuffling
      const indexedQuestions = rawQuestions.map((q, idx) => ({ ...q, originalIndex: idx }));

      // Shuffle questions (Fisher-Yates)
      const shuffledQuestions = [...indexedQuestions];
      for (let i = shuffledQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledQuestions[i], shuffledQuestions[j]] = [shuffledQuestions[j], shuffledQuestions[i]];
      }

      // Shuffle options within each question
      const fullyShuffled = shuffledQuestions.map(q => {
        const optionsWithIndices = q.options.map((opt, idx) => ({ opt, originalIndex: idx }));
        for (let i = optionsWithIndices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [optionsWithIndices[i], optionsWithIndices[j]] = [optionsWithIndices[j], optionsWithIndices[i]];
        }
        const newCorrectIndex = optionsWithIndices.findIndex(o => o.originalIndex === q.correctIndex);
        return { ...q, options: optionsWithIndices.map(o => o.opt), correctIndex: newCorrectIndex };
      });

      setQuestions(fullyShuffled);
      questionsRef.current = fullyShuffled;

      // Check if this is first attempt
      const { count } = await supabase
        .from('quiz_results')
        .select('*', { count: 'exact', head: true })
        .eq('quiz_id', data.id)
        .eq('user_id', session.user.id);

      const first = (count || 0) === 0;
      setIsFirstAttempt(first);

      if (first) {
        // Restore timer from localStorage if page was refreshed mid-attempt
        const timerKey = `quiz_timer_${data.id}`;
        const answersKey = `quiz_answers_${data.id}`;
        
        const storedTimer = localStorage.getItem(timerKey);
        if (storedTimer) {
          try {
            const { timeLeft: storedTime, ts } = JSON.parse(storedTimer);
            const secondsPassed = Math.round((Date.now() - ts) / 1000);
            const restored = Math.max(0, storedTime - secondsPassed);
            setTimeLeft(restored);
          } catch { setTimeLeft(fullyShuffled.length * SECONDS_PER_QUESTION); }
        } else {
          setTimeLeft(fullyShuffled.length * SECONDS_PER_QUESTION);
        }

        // Restore answers from localStorage
        const storedAnswers = localStorage.getItem(answersKey);
        if (storedAnswers) {
          try {
            const parsedAnswers = JSON.parse(storedAnswers);
            setAnswers(parsedAnswers);
            answersRef.current = parsedAnswers;
          } catch (e) { console.error('Failed to restore answers:', e); }
        }
      }

      // Save any pending result from a closed tab
      const pendingKey = `quiz_pending_${data.id}`;
      const pendingRaw = localStorage.getItem(pendingKey);
      if (pendingRaw) {
        try {
          const pending = JSON.parse(pendingRaw);
          localStorage.removeItem(pendingKey);
          // Check if already saved (first attempt might have been saved)
          const { data: existing } = await supabase.from('quiz_results').select('id').eq('quiz_id', pending.quiz_id).eq('user_id', pending.user_id).maybeSingle();
          if (existing) {
            await supabase.from('quiz_results').update({ score: pending.score, total_questions: pending.total_questions, is_passed: pending.is_passed, completed_at: pending.completed_at, answers_array: pending.answers_array }).eq('id', existing.id);
          } else {
            const ins = { ...pending, first_score: pending.score, first_completed_at: pending.completed_at };
            if (!ins.class_id) delete ins.class_id;
            await supabase.from('quiz_results').insert(ins);
          }
        } catch (e) { console.error('Pending save failed:', e); }
      }
    }
    setLoading(false);
  };

  const handleSelect = (optionIdx) => {
    const isAlreadyAnswered = answers[currentIdx] !== undefined;
    
    // In learning mode (not first attempt), we don't allow changing answers after the feedback is shown
    if (!isFirstAttempt && isAlreadyAnswered) return;

    const updatedAnswers = { ...answers, [currentIdx]: optionIdx };
    setAnswers(updatedAnswers);
    answersRef.current = updatedAnswers; // keep ref in sync

    // Persist answers during first attempt
    if (isFirstAttempt) {
      localStorage.setItem(`quiz_answers_${id}`, JSON.stringify(updatedAnswers));
    }

    // In learning mode, auto-advance after 1s
    if (!isFirstAttempt) {
      const autoAdvance = localStorage.getItem('quiz_auto_advance') === 'true';
      
      setTimeout(() => {
        if (autoAdvance) {
          // SMART AUTO-ADVANCE: find next unanswered GAP
          // 1. Try finding first unanswered AFTER current
          let nextGap = questions.findIndex((q, i) => i > currentIdx && updatedAnswers[i] === undefined);
          
          // 2. If not found, wrap around to find from the BEGINNING
          if (nextGap === -1) {
            nextGap = questions.findIndex((q, i) => updatedAnswers[i] === undefined);
          }

          if (nextGap !== -1) {
            setCurrentIdx(nextGap);
          } else {
            // All answered!
            finishQuiz(updatedAnswers);
          }
        }
      }, 1000);
    }
  };

  // Saves result to DB — uses refs so it's always current even in stale closures
  const saveResult = async (finalAnswers) => {
    const qs = questionsRef.current; // use ref, not state (avoids stale closure)
    if (!qs || qs.length === 0) { console.warn('saveResult: questions not loaded yet'); return; }
    
    // Map answers back to original indices
    const originalAnswers = [];
    qs.forEach((q, idx) => {
      if (q.originalIndex !== undefined) {
        originalAnswers[q.originalIndex] = finalAnswers[idx] === q.correctIndex;
      }
    });

    const correctCount = qs.filter((q, idx) => finalAnswers[idx] === q.correctIndex).length;
    const isPassed = (correctCount / qs.length) >= 0.5;
    const now = new Date().toISOString();
    const answersArray = originalAnswers;
    try {
      const { data: existing, error: checkError } = await supabase
        .from('quiz_results')
        .select('id')
        .eq('quiz_id', id)
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (checkError) throw checkError;
      if (existing) {
        await supabase.from('quiz_results').update({
          score: correctCount, total_questions: qs.length,
          is_passed: isPassed, completed_at: now, answers_array: answersArray,
        }).eq('id', existing.id);
      } else {
        const resultData = {
          quiz_id: id, user_id: session.user.id,
          score: correctCount, total_questions: qs.length,
          is_passed: isPassed, completed_at: now,
          first_score: correctCount, first_completed_at: now,
          answers_array: answersArray,
        };
        if (profile?.class_id) resultData.class_id = profile.class_id;
        await supabase.from('quiz_results').insert(resultData);
      }
    } catch (err) {
      console.error('Ошибка сохранения результата:', err);
    }
  };

  // Keep saveResultRef always pointing to latest saveResult
  saveResultRef.current = saveResult;

  const finishQuiz = async (finalAnswers = answers) => {
    clearTimeout(timerRef.current);
    finishedRef.current = true;
    finishTimeRef.current = Date.now(); // freeze finish time
    localStorage.removeItem(`quiz_pending_${id}`);
    localStorage.removeItem(`quiz_timer_${id}`);
    localStorage.removeItem(`quiz_answers_${id}`);
    await saveResultRef.current(finalAnswers);
    if (blocker.state === 'blocked') blocker.proceed();
    setShowResult(true);
  };

  const handleExit = () => {
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    exitElapsedRef.current = elapsed;
    setShowExitModal(true);
  };

  const confirmExit = async () => {
    // Mark as finished immediately so the blocker doesn't re-trigger during navigation
    finishedRef.current = true; 

    const elapsed = exitElapsedRef.current;
    const answeredCount = Object.keys(answersRef.current).length;
    const shouldSave = elapsed >= EXIT_GRACE_SECONDS || (!isFirstAttempt && answeredCount > 2);

    if (shouldSave) {
      clearTimeout(timerRef.current);
      await saveResultRef.current(answersRef.current); // use stable ref
    }
    
    if (blocker.state === 'blocked') blocker.proceed();
    else navigate('/catalog');
  };

  const cancelExit = () => {
    setShowExitModal(false);
    if (blocker.state === 'blocked') blocker.reset();
  };

  if (loading) return <div className="flex-center" style={{ height: '60vh' }}>Загрузка теста...</div>;
  if (!quiz) return <div className="container" style={{ textAlign: 'center', padding: '100px' }}>Тест не найден.</div>;

  // SCREEN: NO CLASS (Observers can pass without a class)
  if (!profile?.class_id && !profile?.is_observer) {
    return (
      <div className="container flex-center animate" style={{ padding: '100px 20px', flexDirection: 'column', textAlign: 'center' }}>
        <div className="card" style={{ maxWidth: '500px' }}>
          <div className="flex-center" style={{ justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}>
            <AlertTriangle size={40} />
          </div>
          <h2 style={{ marginBottom: '15px' }}>Класс не указан</h2>
          <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
            Для прохождения тестов и сохранения результатов необходимо указать ваш класс в профиле.
            Это поможет учителям видеть ваши успехи.
          </p>
          <button onClick={() => navigate('/profile', { state: { onboarding: true } })} style={{ width: '100%', padding: '15px' }}>
            Перейти в профиль
          </button>
        </div>
      </div>
    );
  }

  // RESULTS SCREEN
  if (showResult) {
    const correctCount = questions.filter((q, idx) => answers[idx] === q.correctIndex).length;
    const percent = Math.round((correctCount / questions.length) * 100);
    // Use frozen finish time — prevents re-calculation on every re-render
    const finishMs = finishTimeRef.current || Date.now();
    const timeSpent = Math.round((finishMs - startTimeRef.current) / 1000);

    return (
      <div className="container flex-center animate" style={{ padding: '60px 20px', flexDirection: 'column' }}>
        <div className="card" style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '20px' }}>Результаты</h2>
          <div style={{ fontSize: '4rem', fontWeight: '800', color: percent >= 50 ? 'var(--primary-color)' : 'red', marginBottom: '10px' }}>
            {percent}%
          </div>
          <p style={{ fontSize: '1.2rem', opacity: 0.8, marginBottom: '30px' }}>
            Правильных ответов: {correctCount} из {questions.length} <br />
            Время: {Math.floor(timeSpent / 60)}м {timeSpent % 60}с.
          </p>

          <div className="flex-center" style={{ gap: '15px', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/catalog')} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>В каталог</button>
            <button onClick={() => window.location.reload()}><RotateCcw size={18} style={{ marginRight: '8px' }} /> Перепройти</button>
            <button
              onClick={() => setShowAnswersList(!showAnswersList)}
              style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none' }}
            >
              {showAnswersList ? <ChevronUp size={18} style={{ marginRight: '8px' }} /> : <FileText size={18} style={{ marginRight: '8px' }} />}
              {showAnswersList ? 'Скрыть разбор' : 'Посмотреть разбор'}
            </button>
          </div>
        </div>

        {showAnswersList && (
          <div className="animate" style={{ maxWidth: '600px', width: '100%', marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ textAlign: 'left', marginBottom: '10px', opacity: 0.7 }}>Подробный разбор:</h3>
            {questions.map((q, idx) => {
              const userChoice = answers[idx];
              const isCorrect = userChoice === q.correctIndex;
              return (
                <div key={idx} className="card" style={{ textAlign: 'left', padding: '25px', border: `1px solid ${isCorrect ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)'}` }}>
                  <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isCorrect ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)', color: isCorrect ? '#4ade80' : '#f87171', fontWeight: 'bold', fontSize: '0.9rem' }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 15px 0', lineHeight: '1.4' }}>{q.question}</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ opacity: 0.6 }}>Ваш ответ:</span>
                          <span style={{ color: isCorrect ? '#4ade80' : '#f87171', fontWeight: '600' }}>
                            {userChoice !== undefined ? q.options[userChoice] : 'Пропущено'}
                          </span>
                          {userChoice !== undefined && (isCorrect ? <CheckCircle size={16} color="#4ade80" /> : <XCircle size={16} color="#f87171" />)}
                        </div>
                        {!isCorrect && (
                          <div style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(74, 222, 128, 0.05)', borderRadius: '10px' }}>
                            <span style={{ opacity: 0.6 }}>Правильный:</span>
                            <span style={{ color: '#4ade80', fontWeight: '600' }}>{q.options[q.correctIndex]}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const chosen = answers[currentIdx];
  const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
  const answeredCount = Object.keys(answers).length;
  const pastGrace = elapsed >= EXIT_GRACE_SECONDS || (!isFirstAttempt && answeredCount > 2);

  // Timer color
  const timerPercent = timeLeft !== null ? timeLeft / (questions.length * SECONDS_PER_QUESTION) : 1;
  const timerColor = timerPercent > 0.5 ? '#4ade80' : timerPercent > 0.2 ? '#facc15' : '#f87171';

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{ position: 'relative' }}>
      {/* BLUR OVERLAY when tab is hidden */}
      {isBlurred && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px',
          color: 'white', textAlign: 'center', padding: '20px'
        }}>
          <AlertTriangle size={48} color="#facc15" />
          <h2>Вкладка свёрнута</h2>
          <p style={{ opacity: 0.8, maxWidth: '350px' }}>Тест продолжается. Вернитесь обратно, чтобы продолжить прохождение.</p>
        </div>
      )}

      {/* STICKY TIMER (first attempt only) */}
      {isFirstAttempt && timeLeft !== null && !showResult && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'var(--card-bg)',
          borderBottom: `3px solid ${timerColor}`,
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          transition: 'border-color 0.5s'
        }}>
          <Clock size={18} color={timerColor} />
          <span style={{ fontWeight: '700', fontSize: '1.1rem', color: timerColor, fontVariantNumeric: 'tabular-nums', transition: 'color 0.5s' }}>
            {formatTime(timeLeft)}
          </span>
          <span style={{ opacity: 0.5, fontSize: '0.85rem' }}>— Оставшееся время</span>
          {/* Mini progress bar */}
          <div style={{ flex: 1, maxWidth: '200px', height: '6px', background: 'rgba(0,0,0,0.08)', borderRadius: '10px', overflow: 'hidden', marginLeft: '10px' }}>
            <div style={{ width: `${timerPercent * 100}%`, height: '100%', background: timerColor, transition: 'width 1s linear, background 0.5s' }} />
          </div>
        </div>
      )}

      <div
        className="container animate"
        style={{
          maxWidth: '800px',
          padding: '60px 20px',
          position: 'relative',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
        }}
      >
        {/* Exit button */}
        <button
          onClick={handleExit}
          className="flex-center"
          style={{ position: 'absolute', top: '20px', right: '20px', width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,0,0,0.05)', color: 'red', padding: 0, boxShadow: 'none', zIndex: 10 }}
          title="Выйти из теста"
        >
          <X size={20} />
        </button>

        <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '20px', opacity: 0.6, paddingRight: '50px' }}>
          <span style={{ whiteSpace: 'nowrap', fontSize: '0.9rem', fontWeight: '500' }}>Вопрос {currentIdx + 1} из {questions.length}</span>
          <div className="flex-center" style={{ gap: '10px', flex: 1, justifyContent: 'flex-end', marginLeft: '20px', minWidth: 0 }}>
            {quiz.quiz_sections?.book_url && (
              <a href={quiz.quiz_sections.book_url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--primary-color)', flexShrink: 0, display: 'flex' }} title="Открыть учебник">
                <Book size={20} />
              </a>
            )}
            <h3 style={{ fontSize: '0.95rem', fontWeight: '600', margin: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {quiz.title}
            </h3>
          </div>
        </div>

        <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', marginBottom: '20px', overflow: 'hidden' }}>
          <div style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.3s' }} />
        </div>

        {/* QUESTION NAVIGATOR (DOTS) */}
        <div className="flex-center" style={{ gap: '8px', marginBottom: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {questions.map((q, idx) => {
            const isCurrent = idx === currentIdx;
            const hasAns = answers[idx] !== undefined;
            const isCorrect = hasAns && answers[idx] === q.correctIndex;
            
            let dotColor = 'rgba(0,0,0,0.1)';
            if (isFirstAttempt) {
              if (hasAns) dotColor = 'var(--primary-color)';
            } else {
              if (hasAns) dotColor = isCorrect ? '#4ade80' : '#f87171';
            }

            return (
              <button
                key={idx}
                onClick={() => setCurrentIdx(idx)}
                style={{
                  width: '12px', height: '12px', borderRadius: '50%', padding: 0, minWidth: 0, boxShadow: 'none',
                  background: dotColor,
                  transform: isCurrent ? 'scale(1.3)' : 'scale(1)',
                  border: isCurrent ? '2px solid var(--text-color)' : 'none',
                  transition: 'all 0.2s', cursor: 'pointer'
                }}
                title={`Вопрос ${idx + 1}`}
              />
            );
          })}
        </div>

        <div className="card animate" key={currentIdx} style={{ minHeight: '450px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ marginBottom: '40px', fontSize: '1.7rem', lineHeight: '1.4' }}>{currentQ.question}</h2>

          <div style={{
            display: 'grid', gap: '12px', marginTop: 'auto',
            gridTemplateColumns: currentQ.options.some(opt => opt.length > 39) ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
            justifyContent: 'center', alignItems: 'stretch'
          }}>
            {currentQ.options.map((opt, idx) => {
              const isCorrect = idx === currentQ.correctIndex;
              const isSelected = chosen === idx;
              
              let bgColor = 'var(--card-bg)';
              let borderColor = 'rgba(0,0,0,0.1)';
              let textColor = 'var(--text-color)';

              if (chosen !== undefined) {
                if (isFirstAttempt) {
                  // Exam mode: just highlight selected in purple
                  if (isSelected) {
                    bgColor = 'rgba(99, 102, 241, 0.1)';
                    borderColor = 'var(--primary-color)';
                  }
                } else {
                  // Learning mode: show Green/Red feedback
                  if (isCorrect) {
                    bgColor = 'rgba(74, 222, 128, 0.2)';
                    borderColor = '#4ade80';
                  } else if (isSelected) {
                    bgColor = 'rgba(248, 113, 113, 0.2)';
                    borderColor = '#f87171';
                  }
                }
              }

              return (
                <button key={idx} onClick={() => handleSelect(idx)}
                  style={{
                    textAlign: 'left', background: bgColor, color: textColor,
                    border: `2px solid ${borderColor}`, padding: '18px 25px', borderRadius: '18px',
                    fontSize: '1.05rem', position: 'relative', boxShadow: 'none', transition: 'all 0.2s',
                    height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    userSelect: 'none', WebkitUserSelect: 'none',
                  }}>
                  <div className="flex-center" style={{ justifyContent: 'space-between', gap: '10px' }}>
                    <span>{opt}</span>
                    <div style={{ flexShrink: 0 }}>
                      {!isFirstAttempt && chosen !== undefined && isCorrect && <CheckCircle size={20} color="#4ade80" />}
                      {!isFirstAttempt && chosen !== undefined && isSelected && !isCorrect && <XCircle size={20} color="#f87171" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-center" style={{ justifyContent: 'space-between', marginTop: '30px', gap: '15px' }}>
          <button onClick={() => setCurrentIdx(prev => prev - 1)} disabled={currentIdx === 0} className="flex-center"
            style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', opacity: currentIdx === 0 ? 0.3 : 1, padding: '12px 25px', fontSize: '1.1rem', fontWeight: '600', gap: '8px', flex: 1, maxWidth: '200px' }}>
            <ChevronLeft size={24} /> <span>Назад</span>
          </button>
          <button onClick={currentIdx < questions.length - 1 ? () => setCurrentIdx(prev => prev + 1) : () => finishQuiz()} className="flex-center"
            style={{ padding: '12px 25px', fontSize: '1.1rem', fontWeight: '600', gap: '8px', flex: 1, maxWidth: '250px' }}>
            <span>{currentIdx === questions.length - 1 ? 'Завершить' : 'Далее'}</span> <ChevronRight size={24} />
          </button>
        </div>

        {/* EXIT MODAL */}
        {showExitModal && (
          <div className="modal-overlay" onClick={() => setShowExitModal(false)}>
            <div className="modal-content animate" onClick={e => e.stopPropagation()}>
              <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: pastGrace ? 'rgba(250, 204, 21, 0.1)' : 'rgba(248, 113, 113, 0.1)', color: pastGrace ? '#ca8a04' : '#f87171', margin: '0 auto 25px' }}>
                <AlertTriangle size={32} />
              </div>
              <h2 style={{ marginBottom: '15px' }}>{isFirstAttempt ? 'Выйти из теста?' : 'Прервать тест?'}</h2>
              <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
                {isFirstAttempt 
                  ? <>Ваши текущие ответы <strong>сохранены</strong>, но таймер продолжает идти в фоне даже после выхода. <br /> Вы сможете вернуться и завершить тест, пока время не вышло.</>
                  : elapsed >= EXIT_GRACE_SECONDS 
                    ? <>Вы прошли более {EXIT_GRACE_SECONDS} секунд. <br /> Ваш <strong>текущий результат будет сохранён</strong>, а на неотвеченные вопросы будет засчитана ошибка.</>
                    : (!isFirstAttempt && answeredCount > 2)
                      ? <>Вы ответили на {answeredCount} вопроса. <br /> Ваш <strong>прогресс будет сохранён</strong> в статистике.</>
                      : <>Вы выходите слишком рано. <br /> Ваш прогресс <strong>не будет сохранён</strong>. Вы действительно хотите выйти?</>
                }
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <button onClick={cancelExit} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Вернуться</button>
                <button onClick={confirmExit} style={{ background: (pastGrace || isFirstAttempt) ? '#ca8a04' : '#f87171', color: 'white', padding: '15px' }}>
                  {(pastGrace || isFirstAttempt) ? 'Сохранить и выйти' : 'Да, выйти'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizView;