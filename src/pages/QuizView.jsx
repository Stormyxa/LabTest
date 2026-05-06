import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  CheckCircle, XCircle, ChevronRight, ChevronLeft, RotateCcw, X,
  AlertTriangle, Book, FileText, ChevronDown, ChevronUp, Clock, Zap,
  Shield, Maximize2, Minimize2, Youtube, ExternalLink,
  Play, Pause, Volume2, VolumeX, Settings, FastForward, Rewind
} from 'lucide-react';
import { resolveImgUrl } from '../lib/imageUtils';
import { useScrollRestoration } from '../lib/useScrollRestoration';
import ResourcePlayer from '../components/ResourcePlayer';

const SECONDS_PER_QUESTION = 25;
const EXIT_GRACE_SECONDS = 30;

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return isMobile;
};




const ResourceModal = ({ res, onClose }) => {
  if (!res) return null;

  const getYoutubeId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const ytId = getYoutubeId(res.url);

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 5000, background: 'rgba(0,0,0,0.95)', padding: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }} onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; onClose(); } }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '15px 30px', background: 'rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h3 style={{ color: 'white', margin: 0 }}>{res.title || 'Материалы'}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '50%', boxShadow: 'none' }}><X size={24} /></button>
        </div>
        <div style={{ flex: 1, position: 'relative', background: '#000' }}>
          <ResourcePlayer 
            resources={[res]} 
            activeIdx={0} 
            setActiveIdx={() => {}} 
            isMobile={false} 
            onOpenModal={() => {}} 
            inline={false} 
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

const QuizView = ({ session, profile }) => {
  const isMobile = useIsMobile();
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

  // Integrity & Telemetry Refs
  const focusLostCntRef = useRef(0);
  const offSiteMsRef = useRef(0);
  const lastHiddenAtRef = useRef(null);
  const exitEventsRef = useRef([]);
  const answerLogRef = useRef([]); // { qIdx, from, to, ts }
  const integrityWarningTimerRef = useRef(null);

  // Integrity Modal State
  const [showIntegrityModal, setShowIntegrityModal] = useState(false);
  const [integrityWarningLock, setIntegrityWarningLock] = useState(0);

  // Results display
  const [showAnswersList, setShowAnswersList] = useState(false);
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(() => {
    const saved = localStorage.getItem('quiz_explanation_expanded');
    return saved === null ? true : saved === 'true';
  });

  const toggleExplanation = () => {
    setIsExplanationExpanded(prev => {
      const newVal = !prev;
      localStorage.setItem('quiz_explanation_expanded', newVal.toString());
      return newVal;
    });
  };

  // Timer
  const [isFirstAttempt, setIsFirstAttempt] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);

  const [currentImageIdx, setCurrentImageIdx] = useState(0);

  const [detailedImageModal, setDetailedImageModal] = useState({ isOpen: false, images: [], currentImgIdx: 0, question: '', userAnswer: '', correctAnswer: '', isCorrect: false });

  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'success' });
  const [guestSaving, setGuestSaving] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [activeResourceIdx, setActiveResourceIdx] = useState(0);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [splitMode, setSplitMode] = useState(!isMobile);

  // Quick Auth for Guests
  const [qaMode, setQaMode] = useState('choice'); // 'choice', 'login', 'register'
  const [qaEmail, setQaEmail] = useState('');
  const [qaPassword, setQaPassword] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState('');

  const handleQuickAuth = async (e) => {
    e.preventDefault();
    setQaLoading(true);
    setQaError('');
    try {
      if (qaMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: qaEmail, password: qaPassword });
        if (error) {
          if (error.message.toLowerCase().includes('already registered')) {
            setQaError('Аккаунт с таким email уже существует. Пожалуйста, войдите.');
            setQaMode('login');
            setQaLoading(false);
            return;
          }
          throw error;
        }
        if (data?.user && !data.session) {
          setQaError('Регистрация успешна! Пожалуйста, подтвердите email по ссылке в письме.');
        }
      }
    } catch (err) {
      setQaError(err.message);
    } finally {
      setQaLoading(false);
    }
  };

  useEffect(() => {
    setCurrentImageIdx(0);
    // Note: We don't scroll to top here because the user explicitly asked to preserve scroll position between questions.
  }, [currentIdx]);

  useScrollRestoration(loading);

  const timerRef = useRef(null);
  const finishedRef = useRef(false);
  const answersRef = useRef({});   // mirrors answers state
  const questionsRef = useRef([]); // mirrors questions state
  const exitElapsedRef = useRef(0);
  const saveResultRef = useRef(null); // stable ref to saveResult
  const finishTimeRef = useRef(null); // frozen finish timestamp for results screen
  const questionTimesRef = useRef({}); // tracks seconds spent on each question
  const navRef = useRef(null);

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        !finishedRef.current && !loading && !showResult && currentLocation.pathname !== nextLocation.pathname,
      [loading, showResult]
    )
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

  // Handle Guest Result Auto-save when session appears
  // NOTE: App.jsx recreates the router (useMemo) when session/profile change,
  // which causes QuizView to fully unmount/remount and lose all state.
  // We store the guest data in localStorage to survive remounts, and always
  // await DB completion before navigating to ensure data is available.
  useEffect(() => {
    if (!session || !id) return;
    let cancelled = false;

    const guestKey = `guest_quiz_result_${id}`;
    const savedFlag = `guest_quiz_saved_${id}`;

    // Determine which data source to use
    let gr = null;
    const guestRaw = localStorage.getItem(guestKey);
    const savedRaw = localStorage.getItem(savedFlag);

    if (guestRaw) {
      gr = JSON.parse(guestRaw);
      localStorage.removeItem(guestKey);
      localStorage.setItem(savedFlag, guestRaw);
    } else if (savedRaw && savedRaw !== 'true') {
      gr = JSON.parse(savedRaw);
    } else if (savedRaw === 'true') {
      localStorage.removeItem(savedFlag);
      navigate(`/analytics-details?quizId=${id}&userId=${session.user.id}`);
      return;
    }

    if (!gr) return;

    // Show saving indicator
    setGuestSaving(true);

    (async () => {
      try {
        // Check if this attempt was already saved (prevents double-insert on remounts)
        const { data: existingAttempt } = await supabase.from('quiz_attempts')
          .select('id')
          .eq('quiz_id', id)
          .eq('user_id', session.user.id)
          .eq('score', gr.score)
          .gte('created_at', new Date(Date.now() - 60000).toISOString())
          .limit(1);

        if (!existingAttempt || existingAttempt.length === 0) {
          await supabase.from('quiz_attempts').insert({
            user_id: session.user.id,
            quiz_id: id,
            score: gr.score,
            max_score: gr.total_questions,
            time_spent_total: gr.time_spent_total,
            is_passed: gr.is_passed,
            is_suspicious: gr.is_suspicious,
            suspicion_reason: gr.suspicion_reason,
            answers_data: gr.detailedAnswers
          });
        }

        const { data: existing } = await supabase.from('quiz_results').select('id').eq('quiz_id', id).eq('user_id', session.user.id).maybeSingle();
        if (existing) {
          await supabase.from('quiz_results').update({
            score: gr.score, total_questions: gr.total_questions,
            is_passed: gr.is_passed, completed_at: gr.completed_at, answers_array: gr.answers_array
          }).eq('id', existing.id);
        } else {
          const resData = {
            quiz_id: id, user_id: session.user.id,
            score: gr.score, total_questions: gr.total_questions,
            is_passed: gr.is_passed, completed_at: gr.completed_at,
            first_score: gr.score, first_completed_at: gr.completed_at,
            answers_array: gr.answers_array, first_answers_array: gr.answers_array
          };
          if (profile?.class_id) resData.class_id = profile.class_id;
          await supabase.from('quiz_results').insert(resData);
        }

        // Invalidate analytics cache so AnalyticsDetails fetches fresh data
        localStorage.removeItem(`labtest_cache_ad_users_${id}`);
        localStorage.removeItem(`labtest_cache_ad_attempts_${id}_${session.user.id}`);

        if (!cancelled) {
          localStorage.removeItem(savedFlag);
          setGuestSaving(false);
          navigate(`/analytics-details?quizId=${id}&userId=${session.user.id}&fresh=1`);
        }
      } catch (e) {
        console.error('Guest save failed:', e);
        if (!cancelled) setGuestSaving(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session, id, profile]);

  // Stopwatch effect for tracking time spent per question
  useEffect(() => {
    if (showResult || loading || isBlurred || !questionsRef.current.length) return;

    const interval = setInterval(() => {
      // In learning mode (not first attempt), stop counting time if the current question is already answered
      if (!isFirstAttempt && answersRef.current[currentIdx] !== undefined) {
        return;
      }

      const currentVal = questionTimesRef.current[currentIdx] || 0;
      questionTimesRef.current[currentIdx] = currentVal + 1;
      localStorage.setItem(`quiz_times_${id}`, JSON.stringify(questionTimesRef.current));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentIdx, showResult, loading, isBlurred, isFirstAttempt, id]);

  // Persist current question index
  useEffect(() => {
    if (!loading && !showResult && id) {
      localStorage.setItem(`quiz_current_idx_${id}`, currentIdx.toString());
    }
  }, [currentIdx, loading, showResult, id]);

  // AUTO-SCROLL to buttons on PC when answering in learning mode
  useEffect(() => {
    if (!isMobile && !isFirstAttempt && answers[currentIdx] !== undefined) {
      // Small delay to let the explanation expansion start
      setTimeout(() => {
        navRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 150);
    }
  }, [answers, currentIdx, isMobile, isFirstAttempt]);

  // beforeunload: save result if elapsed >= EXIT_GRACE_SECONDS
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!session || finishedRef.current || !questionsRef.current.length) return;
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
        is_incomplete: true,
        suspicion_reason: 'incomplete_exit'
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
        if (session && !finishedRef.current && questionsRef.current.length > 0) {
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
              is_incomplete: true,
              suspicion_reason: 'incomplete_exit'
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
        finishQuiz(answersRef.current);
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
      .select('*, quiz_sections(name, book_url), resources')
      .eq('id', id)
      .single();

    if (data) {
      setQuiz(data);
      const rawQuestions = data.content.questions || [];
      // Assign original indices before shuffling
      const indexedQuestions = rawQuestions.map((q, idx) => ({ ...q, originalIndex: idx }));

      // Try to restore shuffled structure from cache
      const structureKey = `quiz_structure_${data.id}`;
      const sessionKey = `quiz_session_struct_${data.id}`;
      let finalQuestions = null;

      // 1. Try sessionStorage first (highest priority for tab stability)
      const sessionStructure = sessionStorage.getItem(sessionKey);
      if (sessionStructure) {
        try { finalQuestions = JSON.parse(sessionStructure); } catch (e) { }
      }

      if (!finalQuestions) {
        const cachedStructure = localStorage.getItem(structureKey);
        if (cachedStructure) {
          try {
            finalQuestions = JSON.parse(cachedStructure);
            // Sync to sessionStorage
            sessionStorage.setItem(sessionKey, cachedStructure);
          } catch (e) {
            console.error('Failed to parse cached structure:', e);
          }
        }
      }

      if (!finalQuestions) {
        // Shuffle questions (Fisher-Yates)
        const shuffledQuestions = [...indexedQuestions];
        for (let i = shuffledQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledQuestions[i], shuffledQuestions[j]] = [shuffledQuestions[j], shuffledQuestions[i]];
        }

        // Shuffle options within each question
        finalQuestions = shuffledQuestions.map(q => {
          const optionsWithIndices = q.options.map((opt, idx) => ({ opt, originalIndex: idx }));
          for (let i = optionsWithIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [optionsWithIndices[i], optionsWithIndices[j]] = [optionsWithIndices[j], optionsWithIndices[i]];
          }
          const newCorrectIndex = optionsWithIndices.findIndex(o => o.originalIndex === q.correctIndex);
          return {
            ...q,
            options: optionsWithIndices.map(o => o.opt),
            correctIndex: newCorrectIndex,
            optionMapping: optionsWithIndices.map(o => o.originalIndex)
          };
        });
        localStorage.setItem(structureKey, JSON.stringify(finalQuestions));
        sessionStorage.setItem(sessionKey, JSON.stringify(finalQuestions));
      }

      setQuestions(finalQuestions);
      questionsRef.current = finalQuestions;

      // Restore session-specific state (Timer, Start Time, Current Question Index)
      const startKey = `quiz_start_time_${data.id}`;
      const savedStart = localStorage.getItem(startKey);
      if (savedStart) {
        startTimeRef.current = parseInt(savedStart);
      } else {
        localStorage.setItem(startKey, Date.now().toString());
      }

      const idxKey = `quiz_current_idx_${data.id}`;
      const savedIdx = localStorage.getItem(idxKey);
      if (savedIdx) {
        setCurrentIdx(parseInt(savedIdx));
      }

      const timesKey = `quiz_times_${data.id}`;
      const savedTimes = localStorage.getItem(timesKey);
      if (savedTimes) {
        try {
          questionTimesRef.current = JSON.parse(savedTimes);
        } catch (e) { }
      }

      // Check if this is first attempt
      let first = true;
      if (session) {
        const { count } = await supabase
          .from('quiz_results')
          .select('*', { count: 'exact', head: true })
          .eq('quiz_id', data.id)
          .eq('user_id', session.user.id);
        first = (count || 0) === 0;
      }
      setIsFirstAttempt(first);

      if (data.resources && data.resources.length > 0) {
        setShowResources(false);
        if (!isMobile) setSplitMode(true);
      }

      // Restore session-specific state (Timer, Start Time, Current Question Index)

      // Restore timer from localStorage if page was refreshed mid-attempt
      const timerKey = `quiz_timer_${data.id}`;
      const answersKey = `quiz_answers_${data.id}`;

      const storedTimer = localStorage.getItem(timerKey);
      if (storedTimer && first) {
        try {
          const { timeLeft: storedTime, ts } = JSON.parse(storedTimer);
          const secondsPassed = Math.round((Date.now() - ts) / 1000);
          const restored = Math.max(0, storedTime - secondsPassed);
          setTimeLeft(restored);
        } catch { setTimeLeft(finalQuestions.length * SECONDS_PER_QUESTION); }
      } else if (first) {
        setTimeLeft(finalQuestions.length * SECONDS_PER_QUESTION);
      }

      // Restore answers from localStorage (always restore if cached)
      const storedAnswers = localStorage.getItem(answersKey);
      if (storedAnswers) {
        try {
          const parsedAnswers = JSON.parse(storedAnswers);
          setAnswers(parsedAnswers);
          answersRef.current = parsedAnswers;
        } catch (e) { console.error('Failed to restore answers:', e); }
      }

      const showResultKey = `quiz_show_result_${data.id}`;
      const isFresh = new URLSearchParams(window.location.search).get('fresh') === '1';
      if (localStorage.getItem(showResultKey) === 'true' && !isFresh) {
        setShowResult(true);
      } else {
        localStorage.removeItem(showResultKey);
      }

      // Save any pending result from a closed tab (for logged in users)
      if (session) {
        const pendingKey = `quiz_pending_${data.id}`;
        const pendingRaw = localStorage.getItem(pendingKey);
        if (pendingRaw) {
          try {
            const pending = JSON.parse(pendingRaw);
            localStorage.removeItem(pendingKey);
            const { data: existing } = await supabase.from('quiz_results').select('id').eq('quiz_id', pending.quiz_id).eq('user_id', pending.user_id).maybeSingle();
            if (existing) {
              await supabase.from('quiz_results').update({ score: pending.score, total_questions: pending.total_questions, is_passed: pending.is_passed, completed_at: pending.completed_at, answers_array: pending.answers_array }).eq('id', existing.id);
            } else {
              const ins = { ...pending, first_score: pending.score, first_completed_at: pending.completed_at, first_answers_array: pending.answers_array };
              if (!ins.class_id) delete ins.class_id;
              await supabase.from('quiz_results').insert(ins);
            }
          } catch (e) { console.error('Pending save failed:', e); }
        }
      }
    }
    setLoading(false);
  };

  // Handle Visibility Change (Telemetry & Integrity Warning)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Leaving the page
        focusLostCntRef.current++;
        lastHiddenAtRef.current = Date.now();
        setIsBlurred(true);
      } else {
        // Returning to the page
        if (lastHiddenAtRef.current) {
          const duration = Date.now() - lastHiddenAtRef.current;
          offSiteMsRef.current += duration;
          exitEventsRef.current.push({
            left_at: new Date(lastHiddenAtRef.current).toISOString(),
            returned_at: new Date().toISOString(),
            duration_ms: duration
          });
        }

        setIsBlurred(false);

        // Show Integrity Warning ONLY in checking mode (1st attempt)
        if (isFirstAttempt && !finishedRef.current && !showResult) {
          // 1st time = 5s, subsequent times = 3s
          const lockTime = focusLostCntRef.current === 1 ? 5 : 3;
          setIntegrityWarningLock(lockTime);
          setShowIntegrityModal(true);

          if (integrityWarningTimerRef.current) clearInterval(integrityWarningTimerRef.current);

          integrityWarningTimerRef.current = setInterval(() => {
            setIntegrityWarningLock(prev => {
              if (prev <= 1) {
                clearInterval(integrityWarningTimerRef.current);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (integrityWarningTimerRef.current) clearInterval(integrityWarningTimerRef.current);
    };
  }, [isFirstAttempt, showResult, loading]);

  const handleSelect = (optionIdx) => {
    const isAlreadyAnswered = answers[currentIdx] !== undefined;

    // Record answer change in first attempt mode
    if (isFirstAttempt && isAlreadyAnswered && answers[currentIdx] !== optionIdx) {
      answerLogRef.current.push({
        qIdx: questions[currentIdx].originalIndex ?? currentIdx,
        from: answers[currentIdx],
        to: optionIdx,
        ts: Date.now() - startTimeRef.current
      });
    }

    // In learning mode (not first attempt), we don't allow changing answers after the feedback is shown
    if (!isFirstAttempt && isAlreadyAnswered) return;

    const updatedAnswers = { ...answers, [currentIdx]: optionIdx };
    setAnswers(updatedAnswers);
    answersRef.current = updatedAnswers; // keep ref in sync

    // Persist answers (always, to survive reloads)
    localStorage.setItem(`quiz_answers_${id}`, JSON.stringify(updatedAnswers));

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
  const savingRef = useRef(false);
  const saveResult = async (finalAnswers, isIncomplete = false) => {
    if (savingRef.current) return;
    savingRef.current = true;

    const qs = questionsRef.current; // use ref, not state (avoids stale closure)
    if (!qs || qs.length === 0) {
      console.warn('saveResult: questions not loaded yet');
      savingRef.current = false;
      return;
    }

    // Map answers back to original indices
    const originalAnswers = [];
    qs.forEach((q, idx) => {
      if (q.originalIndex !== undefined) {
        const shuffledChoice = finalAnswers[idx];
        const isCorrect = shuffledChoice === q.correctIndex;
        originalAnswers[q.originalIndex] = isCorrect;
      }
    });

    const correctCount = qs.filter((q, idx) => finalAnswers[idx] === q.correctIndex).length;
    const answeredCount = Object.keys(finalAnswers).length;
    const skippedCount = qs.length - answeredCount;
    const isPassed = (correctCount / qs.length) >= 0.5;
    const now = new Date().toISOString();
    const answersArray = originalAnswers;

    const finalTimeSpent = Math.round(((finishTimeRef.current || Date.now()) - startTimeRef.current) / 1000);
    const scoreRatio = correctCount / qs.length;

    // REFINED SUSPICIOUS LOGIC:
    const avgTimePerQ = finalTimeSpent / qs.length;
    const fastQuestionsCount = Object.values(questionTimesRef.current || {}).filter(t => t < 3).length;
    const fastRatio = fastQuestionsCount / qs.length;
    const totalAllocatedTime = qs.length * 25; // Standard is 25s per Q

    let suspicion_reason = null;
    let isSuspicious = false;

    if (isIncomplete) {
      suspicion_reason = 'incomplete_exit';
    } else if (fastRatio >= 0.4 && scoreRatio < 0.3) {
      isSuspicious = true;
      suspicion_reason = 'blind_guessing';
    } else if (skippedCount / qs.length > 0.4) {
      isSuspicious = true;
      suspicion_reason = 'high_skip_rate';
    } else if (finalTimeSpent < totalAllocatedTime * 0.12 && scoreRatio < 0.4) {
      // Rapid Fail check (e.g. 1/10 in 11s)
      isSuspicious = true;
      suspicion_reason = 'rapid_fail';
    } else if (correctCount === 0 && finalTimeSpent < 30) {
      isSuspicious = true;
      suspicion_reason = 'instant_zero';
    } else if (isFirstAttempt && (focusLostCntRef.current > 5 || offSiteMsRef.current > 60000)) {
      isSuspicious = true;
      suspicion_reason = 'high_off_site';
    }

    // Build detailed answers map
    const detailedAnswers = qs.map((q, idx) => {
      const shuffledChoice = finalAnswers[idx] !== undefined ? finalAnswers[idx] : null;

      // Map SHUFFLED index back to ORIGINAL index of the option
      const originalChosenIndex = (shuffledChoice !== null && q.optionMapping)
        ? q.optionMapping[shuffledChoice]
        : null;

      const originalCorrectIndex = q.optionMapping ? q.optionMapping.indexOf(q.correctIndex) : q.correctIndex;

      const isCorrect = shuffledChoice === q.correctIndex;
      const timeSpentOnQ = questionTimesRef.current[idx] || 0;
      return {
        originalIndex: q.originalIndex,
        chosenIndex: originalChosenIndex,
        correctIndex: q.optionMapping[q.correctIndex], // Map shuffled correct index back to original index
        timeSpent: timeSpentOnQ,
        isCorrect: isCorrect
      };
    });

    if (!session) {
      // Guest mode: save to sessionStorage
      const guestResult = {
        quiz_id: id,
        score: correctCount,
        total_questions: qs.length,
        is_passed: isPassed,
        answers_array: answersArray,
        detailedAnswers: detailedAnswers,
        completed_at: now,
        is_suspicious: isSuspicious,
        suspicion_reason: suspicion_reason,
        time_spent_total: finalTimeSpent,
        finishTime: finishTimeRef.current,
        startTime: startTimeRef.current,
        // Guest telemetry
        off_site_ms: Math.round(offSiteMsRef.current),
        focus_lost_cnt: focusLostCntRef.current,
        answer_log: answerLogRef.current
      };
      localStorage.setItem(`guest_quiz_result_${id}`, JSON.stringify(guestResult));
      savingRef.current = false;
      return;
    }

    try {
      // 1. Log the detailed attempt into the new table
      const attemptData = {
        user_id: session.user.id,
        quiz_id: id,
        score: correctCount,
        max_score: qs.length,
        time_spent_total: finalTimeSpent,
        is_passed: isPassed,
        is_suspicious: isSuspicious,
        is_incomplete: isIncomplete,
        suspicion_reason: suspicion_reason,
        answers_data: detailedAnswers,
        // Telemetry
        off_site_ms: Math.round(offSiteMsRef.current),
        focus_lost_cnt: focusLostCntRef.current,
        answer_log: answerLogRef.current
      };
      await supabase.from('quiz_attempts').insert(attemptData);

      // 2. Update summary data in quiz_results for leaderboard and legacy analytics
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
          is_suspicious_user: isSuspicious, is_incomplete_user: isIncomplete
        }).eq('id', existing.id);
      } else {
        const resultData = {
          quiz_id: id, user_id: session.user.id,
          score: correctCount, total_questions: qs.length,
          is_passed: isPassed, completed_at: now,
          first_score: correctCount, first_completed_at: now,
          answers_array: answersArray, first_answers_array: answersArray,
          is_suspicious_user: isSuspicious, is_incomplete_user: isIncomplete
        };
        if (profile?.class_id) resultData.class_id = profile.class_id;
        await supabase.from('quiz_results').insert(resultData);
      }

      // Optimistic UI Update: Directly modify the catalog stats cache
      // so the user sees their new score instantly upon returning.
      const catalogCacheKey = `labtest_cache_catalog_stats_${quiz.section_id}`;
      const rawCache = localStorage.getItem(catalogCacheKey);
      if (rawCache) {
        try {
          const parsed = JSON.parse(rawCache);
          if (parsed.data && parsed.data.passed) {
            parsed.data.passed[id] = { is_passed: isPassed, score: correctCount, total: qs.length };
            localStorage.setItem(catalogCacheKey, JSON.stringify(parsed));
          }
        } catch (e) { }
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
    localStorage.removeItem(`quiz_current_idx_${id}`);
    localStorage.removeItem(`quiz_times_${id}`);
    localStorage.removeItem(`quiz_start_time_${id}`);
    await saveResultRef.current(finalAnswers, false);
    if (blocker.state === 'blocked') blocker.proceed();
    setShowResult(true);
    localStorage.setItem(`quiz_show_result_${id}`, 'true');
  };

  const handleExit = () => {
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    exitElapsedRef.current = elapsed;
    setShowExitModal(true);
  };

  const handleRetry = () => {
    localStorage.removeItem(`quiz_show_result_${id}`);
    localStorage.removeItem(`quiz_structure_${id}`);
    sessionStorage.removeItem(`quiz_session_struct_${id}`);
    localStorage.removeItem(`quiz_answers_${id}`);
    localStorage.removeItem(`quiz_current_idx_${id}`);
    localStorage.removeItem(`quiz_times_${id}`);
    localStorage.removeItem(`quiz_start_time_${id}`);
    localStorage.removeItem(`guest_quiz_saved_${id}`);
    localStorage.removeItem(`guest_quiz_result_${id}`);
    window.location.reload();
  };

  const confirmExit = async () => {
    // Mark as finished immediately so the blocker doesn't re-trigger during navigation
    finishedRef.current = true;

    const elapsed = exitElapsedRef.current;
    const answeredCount = Object.keys(answersRef.current).length;
    const shouldSave = elapsed >= EXIT_GRACE_SECONDS || (!isFirstAttempt && answeredCount > 2);

    if (shouldSave) {
      clearTimeout(timerRef.current);
      await saveResultRef.current(answersRef.current, true); // use stable ref
    }

    localStorage.removeItem(`quiz_pending_${id}`);
    localStorage.removeItem(`quiz_timer_${id}`);
    localStorage.removeItem(`quiz_answers_${id}`);
    localStorage.removeItem(`quiz_structure_${id}`);
    localStorage.removeItem(`quiz_current_idx_${id}`);
    localStorage.removeItem(`quiz_times_${id}`);
    localStorage.removeItem(`quiz_start_time_${id}`);

    if (blocker.state === 'blocked') blocker.proceed();
    else navigate('/catalog');
  };

  const cancelExit = () => {
    setShowExitModal(false);
    if (blocker.state === 'blocked') blocker.reset();
  };

  if (loading || guestSaving) return (
    <>
      <div className="flex-center" style={{ height: '60vh', flexDirection: 'column', gap: '20px' }}>
        {guestSaving ? (
          <>
            <div style={{
              width: '60px', height: '60px', borderRadius: '50%',
              border: '3px solid rgba(99, 102, 241, 0.2)',
              borderTopColor: 'var(--primary-color)',
              animation: 'spin 0.8s linear infinite'
            }} />
            <h3 style={{ margin: 0, opacity: 0.8 }}>Сохраняем ваш результат...</h3>
            <p style={{ margin: 0, opacity: 0.5, fontSize: '0.9rem' }}>Через мгновение вы будете перенаправлены в аналитику</p>
          </>
        ) : 'Загрузка теста...'}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
  if (!quiz) return <div className="container" style={{ textAlign: 'center', padding: '100px' }}>Тест не найден.</div>;


  const currentQ = questions[currentIdx];
  const chosen = answers[currentIdx];

  // RESULTS SCREEN
  if (showResult) {
    const correctCount = questions.filter((q, idx) => answers[idx] === q.correctIndex).length;
    const percent = Math.round((correctCount / questions.length) * 100);
    // Use frozen finish time — prevents re-calculation on every re-render
    const finishMs = finishTimeRef.current || Date.now();
    const timeSpent = Math.round((finishMs - startTimeRef.current) / 1000);

    return (
      <>
        <div className="container flex-center animate" style={{ padding: '60px 20px', flexDirection: 'column' }}>
          <div className="card" style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
            <div style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '10px' }}>{quiz.title}</div>
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
              <button onClick={handleRetry}><RotateCcw size={18} style={{ marginRight: '8px' }} /> Перепройти</button>
              <button
                onClick={() => setShowAnswersList(!showAnswersList)}
                style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none' }}
              >
                {showAnswersList ? <ChevronUp size={18} style={{ marginRight: '8px' }} /> : <FileText size={18} style={{ marginRight: '8px' }} />}
                {showAnswersList ? 'Скрыть разбор' : 'Посмотреть разбор'}
              </button>
            </div>
            {!session && (
              <div className="card animate" style={{ marginTop: '30px', background: 'var(--primary-color)', color: 'white', padding: '25px', textAlign: 'left' }}>
                <div className="flex-center" style={{ gap: '15px', marginBottom: '15px', justifyContent: 'flex-start' }}>
                  <Zap size={24} fill="white" />
                  <h3 style={{ margin: 0, color: 'white' }}>Сохранить результат</h3>
                </div>

                {qaMode === 'choice' ? (
                  <>
                    <p style={{ fontSize: '0.95rem', opacity: 0.9, marginBottom: '20px', lineHeight: '1.5' }}>
                      Вы прошли тест как гость. Создайте аккаунт или войдите, чтобы сохранить этот результат навсегда и открыть доступ к статистике.
                    </p>
                    <div className="flex-center" style={{ gap: '10px' }}>
                      <button onClick={() => setQaMode('register')} style={{ background: 'white', color: 'var(--primary-color)', fontWeight: 'bold', border: 'none' }}>Регистрация</button>
                      <button onClick={() => setQaMode('login')} style={{ background: 'transparent', color: 'white', border: '1px solid white', boxShadow: 'none' }}>Вход</button>
                    </div>
                  </>
                ) : (
                  <form onSubmit={handleQuickAuth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <p style={{ fontSize: '0.85rem', opacity: 0.8, margin: 0 }}>
                      {qaMode === 'login' ? 'Вход в аккаунт' : 'Быстрая регистрация'}
                    </p>
                    <input
                      type="email"
                      placeholder="Email"
                      value={qaEmail}
                      onChange={e => setQaEmail(e.target.value)}
                      required
                      className="quiz-qa-input"
                    />
                    <input
                      type="password"
                      placeholder="Пароль"
                      value={qaPassword}
                      onChange={e => setQaPassword(e.target.value)}
                      required
                      className="quiz-qa-input"
                    />
                    {qaError && <p style={{ fontSize: '0.85rem', color: (qaError.includes('успешна') || qaError.includes('подтвердите')) ? '#4ade80' : '#ffbaba', margin: 0 }}>{qaError}</p>}
                    <div className="flex-center" style={{ gap: '10px', marginTop: '5px' }}>
                      <button type="submit" disabled={qaLoading} style={{ background: 'white', color: 'var(--primary-color)', fontWeight: 'bold', border: 'none', flex: 1 }}>
                        {qaLoading ? '...' : (qaMode === 'login' ? 'Войти' : 'Создать')}
                      </button>
                      <button type="button" onClick={() => setQaMode('choice')} style={{ background: 'transparent', color: 'white', border: 'none', boxShadow: 'none', fontSize: '0.85rem' }}>Отмена</button>
                    </div>
                  </form>
                )}
              </div>
            )}
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

                        {q.images && q.images.length > 0 && (
                          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '10px' }}>
                            {q.images.map((imgUrl, imgIdx) => (
                              <img
                                key={imgIdx}
                                src={resolveImgUrl(imgUrl)}
                                alt={`QImg ${imgIdx + 1}`}
                                onClick={() => setDetailedImageModal({ isOpen: true, images: q.images, currentImgIdx: imgIdx, question: q.question, userAnswer: userChoice !== undefined ? q.options[userChoice] : 'Пропущено', correctAnswer: q.options[q.correctIndex], isCorrect, timeSpent: questionTimesRef.current[idx] || 0, explanation: q.explanation })}
                                style={{ height: '80px', borderRadius: '8px', objectFit: 'contain', border: '1px solid rgba(0,0,0,0.1)', background: 'var(--card-bg)', cursor: 'pointer' }}
                              />
                            ))}
                          </div>
                        )}

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

                          <div style={{ display: 'flex', gap: '20px', fontSize: '0.85rem', opacity: 0.7, marginTop: '5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={14} /> Время на вопрос: {questionTimesRef.current[idx] || 0}с
                            </div>
                          </div>

                          {q.explanation && (
                            <div style={{ marginTop: '15px', padding: '0 15px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px dashed rgba(99, 102, 241, 0.2)', transition: 'all 0.3s' }}>
                              <div
                                className="flex-center"
                                onClick={toggleExplanation}
                                style={{ justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', padding: '12px 0' }}
                              >
                                <div style={{ fontSize: '0.75rem', opacity: 0.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Пояснение</div>
                                {isExplanationExpanded ? <ChevronUp size={14} opacity={0.4} /> : <ChevronDown size={14} opacity={0.4} />}
                              </div>
                              <div style={{
                                maxHeight: isExplanationExpanded ? '1000px' : '0',
                                overflow: 'hidden',
                                transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s',
                                opacity: isExplanationExpanded ? 1 : 0
                              }}>
                                <div style={{ paddingBottom: '12px', fontSize: '0.9rem', lineHeight: '1.5', opacity: 0.9 }}>{q.explanation}</div>
                              </div>
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

        {/* DETAILED IMAGE MODAL (GALLERY) FOR RESULTS */}
        {detailedImageModal.isOpen && detailedImageModal.images && detailedImageModal.images.length > 0 && (
          <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 99999, padding: '20px' }} onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }} onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; (() => setDetailedImageModal({ isOpen: false, images: [], currentImgIdx: 0 }))(e); } }}>
            <div className="animate" style={{ position: 'relative', width: '100%', maxWidth: '900px', maxHeight: 'max-content', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setDetailedImageModal({ isOpen: false, images: [], currentImgIdx: 0 })}
                style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.5)', color: 'white', padding: '10px', borderRadius: '50%', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', zIndex: 50, cursor: 'pointer', border: 'none' }}
                className="flex-center"
              >
                <X size={24} />
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', maxHeight: '55vh', padding: '0px' }}>
                  <img src={resolveImgUrl(detailedImageModal.images[detailedImageModal.currentImgIdx])} alt="Preview" style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: '12px', border: '2px solid rgba(255,255,255,0.1)' }} />
                  {detailedImageModal.images.length > 1 && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDetailedImageModal(p => ({ ...p, currentImgIdx: p.currentImgIdx === 0 ? p.images.length - 1 : p.currentImgIdx - 1 })); }}
                        style={{ position: 'absolute', left: '-10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', padding: '15px', cursor: 'pointer', boxShadow: 'none' }}
                        className="flex-center"
                      >
                        <ChevronLeft size={24} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDetailedImageModal(p => ({ ...p, currentImgIdx: p.currentImgIdx === p.images.length - 1 ? 0 : p.currentImgIdx + 1 })); }}
                        style={{ position: 'absolute', right: '-10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', padding: '15px', cursor: 'pointer', boxShadow: 'none' }}
                        className="flex-center"
                      >
                        <ChevronRight size={24} />
                      </button>
                    </>
                  )}
                  {detailedImageModal.images.length > 1 && (
                    <div style={{ position: 'absolute', bottom: '10px', color: 'rgba(255,255,255,0.9)', fontSize: '1rem', fontWeight: 'bold', background: 'rgba(0,0,0,0.5)', padding: '5px 15px', borderRadius: '20px' }}>
                      {detailedImageModal.currentImgIdx + 1} / {detailedImageModal.images.length}
                    </div>
                  )}
                </div>
                <div style={{ background: 'var(--card-bg)', color: 'var(--text-color)', padding: '25px', borderRadius: '20px', marginTop: '15px', width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
                  <h4 style={{ margin: '0 0 15px 0', fontSize: '1.2rem', lineHeight: '1.4' }}>{detailedImageModal.question}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ opacity: 0.6 }}>Ответ:</span>
                      <strong style={{ color: detailedImageModal.isCorrect ? '#4ade80' : '#f87171' }}>
                        {detailedImageModal.userAnswer}
                      </strong>
                      {detailedImageModal.isCorrect ? <CheckCircle size={18} color="#4ade80" /> : <XCircle size={18} color="#f87171" />}
                    </div>
                    {!detailedImageModal.isCorrect && detailedImageModal.correctAnswer && (
                      <div style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(74, 222, 128, 0.05)', borderRadius: '10px', marginTop: '5px' }}>
                        <span style={{ opacity: 0.6 }}>Правильный:</span>
                        <strong style={{ color: '#4ade80' }}>
                          {detailedImageModal.correctAnswer}
                        </strong>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '20px', fontSize: '0.9rem', opacity: 0.8, background: 'rgba(0,0,0,0.02)', padding: '10px 15px', borderRadius: '8px', marginTop: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={16} /> Потрачено времени: <strong>{detailedImageModal.timeSpent}с</strong>
                      </div>
                    </div>

                    {detailedImageModal.explanation && (
                      <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '15px', border: '1px dashed rgba(99, 102, 241, 0.2)' }}>
                        <div style={{ fontSize: '0.8rem', opacity: 0.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px', color: 'var(--primary-color)' }}>Пояснение</div>
                        <div style={{ fontSize: '1rem', lineHeight: '1.5', opacity: 0.9 }}>{detailedImageModal.explanation}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
  const answeredCount = Object.keys(answers).length;
  const pastGrace = elapsed >= EXIT_GRACE_SECONDS || (!isFirstAttempt && answeredCount > 2);

  // Timer color
  const timerPercent = timeLeft !== null ? timeLeft / (questions.length * SECONDS_PER_QUESTION) : 1;
  const timerColor = timerPercent > 0.5 ? '#4ade80' : timerPercent > 0.2 ? '#facc15' : '#f87171';

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', height: isMobile ? 'auto' : 'calc(100vh - 67px)', overflow: isMobile ? 'visible' : 'hidden' }}>
      {/* Sidebar Materials (PC only, split screen) */}
      {!isMobile && showResources && quiz.resources?.length > 0 && (
        <div style={{ width: '50%', flexShrink: 0 }}>
          <ResourcePlayer
            resources={quiz.resources}
            activeIdx={activeResourceIdx}
            setActiveIdx={setActiveResourceIdx}
            isMobile={isMobile}
            onOpenModal={() => setShowResourceModal(true)}
            inline={false}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* STICKY TIMER (first attempt only) - Moved outside padded container */}
        {isFirstAttempt && timeLeft !== null && !showResult && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 100,
            background: 'var(--card-bg)',
            borderBottom: `3px solid ${timerColor}`,
            padding: '10px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
            transition: 'border-color 0.5s',
            borderRadius: '0 0 15px 15px',
            marginBottom: '0' // No margin needed here now
          }}>
            <Clock size={18} color={timerColor} />
            <span style={{ fontWeight: '700', fontSize: '1.1rem', color: timerColor, fontVariantNumeric: 'tabular-nums', transition: 'color 0.5s' }}>
              {formatTime(timeLeft)}
            </span>
            <span style={{ opacity: 0.5, fontSize: '0.85rem' }}>— Оставшееся время</span>
            <div style={{ flex: 1, maxWidth: '200px', height: '6px', background: 'rgba(0,0,0,0.08)', borderRadius: '10px', overflow: 'hidden', marginLeft: '10px' }}>
              <div style={{ width: `${timerPercent * 100}%`, height: '100%', background: timerColor, transition: 'width 1s linear, background 0.5s' }} />
            </div>
          </div>
        )}

        <div className="animate" style={{
          maxWidth: '800px',
          padding: isMobile ? '60px 10px 130px' : '60px 20px 0px',
          position: 'relative',
          margin: '0 auto'
        }}>
          {/* Integrity Warning Modal - Now using Portal for full-screen overlay */}
          {showIntegrityModal && createPortal(
            <div className="modal-overlay" style={{ zIndex: 3000 }}>
              <div className="modal-content animate" style={{ width: '450px', textAlign: 'center' }}>
                <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '20px', margin: '0 auto 20px' }}>
                  <Shield size={32} />
                </div>
                <h2 style={{ marginBottom: '15px' }}>Режим проверки</h2>
                <p style={{ opacity: 0.7, lineHeight: '1.6', marginBottom: '25px' }}>
                  В режиме контрольной проверки не рекомендуется сворачивать окно или переключать вкладки. <br />
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Ваша активность фиксируется в аналитике для учителя.</span>
                </p>
                <button
                  disabled={integrityWarningLock > 0}
                  onClick={() => setShowIntegrityModal(false)}
                  style={{ width: '100%', background: integrityWarningLock > 0 ? 'rgba(0,0,0,0.05)' : 'var(--primary-color)', color: integrityWarningLock > 0 ? 'rgba(0,0,0,0.3)' : 'white' }}
                >
                  {integrityWarningLock > 0 ? `Подождите... ${integrityWarningLock}с` : 'Я понимаю, продолжить'}
                </button>
              </div>
            </div>,
            document.body
          )}

          {/* BLUR OVERLAY when tab is hidden - Now using Portal for full-screen overlay */}
          {isBlurred && createPortal(
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
            </div>,
            document.body
          )}

          {/* Exit button */}
          <button
            onClick={handleExit}
            className="flex-center"
            style={{ position: 'absolute', top: '20px', right: '20px', width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,0,0,0.05)', color: 'red', padding: 0, boxShadow: 'none', zIndex: 10, border: 'none' }}
            title="Выйти из теста"
          >
            <X size={20} />
          </button>

          {/* Header Info */}
          <div className="flex-center" style={{
            justifyContent: 'space-between',
            marginBottom: '20px',
            opacity: 0.8,
            paddingRight: isMobile ? '65px' : '0'
          }}>
            <span style={{ whiteSpace: 'nowrap', fontSize: '0.9rem', fontWeight: '500', opacity: 0.6 }}>Вопрос {currentIdx + 1} из {questions.length}</span>
            <div className="flex-center" style={{ gap: '15px' }}>
              {quiz.resources && quiz.resources.length > 0 && (
                <button
                  onClick={() => setShowResources(!showResources)}
                  className="flex-center"
                  style={{
                    height: '32px',
                    borderRadius: '10px', background: showResources ? 'var(--primary-color)' : 'rgba(0,0,0,0.05)',
                    color: showResources ? 'white' : 'var(--primary-color)',
                    padding: '0 12px', fontWeight: 'bold', fontSize: '0.8rem', gap: '6px',
                    boxShadow: 'none', border: 'none'
                  }}
                >
                  <Book size={14} />
                  Материалы
                </button>
              )}
              {quiz.quiz_sections?.book_url && (
                <a href={quiz.quiz_sections.book_url} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--primary-color)', flexShrink: 0, display: 'flex' }} title="Открыть учебник">
                  <Book size={20} />
                </a>
              )}
              <h3 style={{ fontSize: '0.95rem', fontWeight: '600', margin: 0, textAlign: 'right' }}>
                {quiz.title}
              </h3>
            </div>
          </div>

          <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', marginBottom: '20px', overflow: 'hidden' }}>
            <div style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.3s' }} />
          </div>

          {/* Materials Area (Inline - Mobile ONLY) */}
          {isMobile && showResources && (
            <div style={{ display: 'block' }}>
              <ResourcePlayer
                resources={quiz.resources}
                activeIdx={activeResourceIdx}
                setActiveIdx={setActiveResourceIdx}
                isMobile={isMobile}
                onOpenModal={() => setShowResourceModal(true)}
                inline={true}
              />
            </div>
          )}

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
            {currentQ.images && currentQ.images.length > 0 && (
              <div style={{ marginBottom: '25px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
                  <img
                    src={resolveImgUrl(currentQ.images[currentImageIdx])}
                    style={{ maxWidth: '100%', maxHeight: '40vh', objectFit: 'contain', borderRadius: '12px', userSelect: 'none', WebkitUserSelect: 'none' }}
                    alt={`Изображение ${currentImageIdx + 1}`}
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                  />

                  {currentQ.images.length > 1 && (
                    <>
                      <button
                        onClick={() => setCurrentImageIdx(p => p === 0 ? currentQ.images.length - 1 : p - 1)}
                        style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', padding: '8px', cursor: 'pointer', boxShadow: 'none' }}
                        className="flex-center"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <button
                        onClick={() => setCurrentImageIdx(p => p === currentQ.images.length - 1 ? 0 : p + 1)}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', padding: '8px', cursor: 'pointer', boxShadow: 'none' }}
                        className="flex-center"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </>
                  )}
                </div>
                {currentQ.images.length > 1 && (
                  <div style={{ marginTop: '10px', fontSize: '0.85rem', opacity: 0.6, fontWeight: 'bold' }}>
                    {currentImageIdx + 1} / {currentQ.images.length}
                  </div>
                )}
              </div>
            )}

            <h2 style={{ marginBottom: '40px', fontSize: (currentQ.images && currentQ.images.length > 0) ? '1.4rem' : '1.7rem', lineHeight: '1.4' }}>{currentQ.question}</h2>

            <div style={{
              display: 'grid', gap: '12px', marginTop: 'auto',
              gridTemplateColumns: currentQ.options.some(opt => opt.length > 39) ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
              justifyContent: 'center', alignItems: 'stretch'
            }}>
              {currentQ.options.map((opt, idx) => {
                const chosen = answers[currentIdx];
                const isCorrect = idx === currentQ.correctIndex;
                const isSelected = chosen === idx;

                let bgColor = 'var(--card-bg)';
                let borderColor = 'rgba(0,0,0,0.1)';
                let textColor = 'var(--text-color)';

                if (chosen !== undefined) {
                  if (isFirstAttempt) {
                    if (isSelected) {
                      bgColor = 'rgba(99, 102, 241, 0.1)';
                      borderColor = 'var(--primary-color)';
                    }
                  } else {
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

            {!isFirstAttempt && answers[currentIdx] !== undefined && currentQ.explanation && (
              <div style={{
                background: 'rgba(99, 102, 241, 0.05)', borderRadius: '20px', border: '1.5px dashed rgba(99, 102, 241, 0.2)',
                overflow: 'hidden', padding: '0 20px',
                animation: 'slideDownFade 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards'
              }}>
                <div
                  className="flex-center"
                  onClick={toggleExplanation}
                  style={{ justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', padding: '20px 0' }}
                >
                  <div className="flex-center" style={{ gap: '10px', color: 'var(--primary-color)' }}>
                    <Zap size={18} />
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Пояснение</span>
                  </div>
                  {isExplanationExpanded ? <ChevronUp size={18} opacity={0.5} /> : <ChevronDown size={18} opacity={0.5} />}
                </div>

                <div style={{
                  maxHeight: isExplanationExpanded ? '1000px' : '0',
                  overflow: 'hidden',
                  transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s',
                  opacity: isExplanationExpanded ? 1 : 0
                }}>
                  <div style={{ paddingBottom: '20px', fontSize: '1.05rem', lineHeight: '1.6', opacity: 0.9 }}>
                    {currentQ.explanation}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Buttons (Desktop) */}
          {!isMobile && (
            <div ref={navRef} className="quiz-nav-container flex-center" style={{
              justifyContent: 'space-between',
              gap: '15px',
              maxWidth: '800px',
              margin: '30px auto 0',
              width: '100%',
              padding: '0 20px',
              paddingBottom: '60px'
            }}>
              <button onClick={() => setCurrentIdx(prev => prev - 1)} disabled={currentIdx === 0} className="flex-center"
                style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', opacity: currentIdx === 0 ? 0.3 : 1, padding: '12px 25px', fontSize: '1.1rem', fontWeight: '600', gap: '8px', flex: 1, maxWidth: '200px' }}>
                <ChevronLeft size={24} /> <span>Назад</span>
              </button>
              <button onClick={currentIdx < questions.length - 1 ? () => setCurrentIdx(prev => prev + 1) : () => finishQuiz()} className="flex-center"
                style={{ padding: '12px 25px', fontSize: '1.1rem', fontWeight: '600', gap: '8px', flex: 1, maxWidth: '250px' }}>
                <span>{currentIdx === questions.length - 1 ? 'Завершить' : 'Далее'}</span> <ChevronRight size={24} />
              </button>
            </div>
          )}

          {showExitModal && createPortal(
            <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }} onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; (() => setShowExitModal(false))(e); } }}>
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
            </div>,
            document.body
          )}

          {isMobile && createPortal(
            <div ref={navRef} className="quiz-nav-container flex-center" style={{
              justifyContent: 'space-between',
              gap: '15px',
              maxWidth: '800px',
              margin: '0 auto',
              width: '100%',
              padding: '0 20px',
              paddingBottom: '60px'
            }}>
              <button onClick={() => setCurrentIdx(prev => prev - 1)} disabled={currentIdx === 0} className="flex-center"
                style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', opacity: currentIdx === 0 ? 0.3 : 1, padding: '12px 25px', fontSize: '1.1rem', fontWeight: '600', gap: '8px', flex: 1, maxWidth: '200px' }}>
                <ChevronLeft size={24} /> <span>Назад</span>
              </button>
              <button onClick={currentIdx < questions.length - 1 ? () => setCurrentIdx(prev => prev + 1) : () => finishQuiz()} className="flex-center"
                style={{ padding: '12px 25px', fontSize: '1.1rem', fontWeight: '600', gap: '8px', flex: 1, maxWidth: '250px' }}>
                <span>{currentIdx === questions.length - 1 ? 'Завершить' : 'Далее'}</span> <ChevronRight size={24} />
              </button>
            </div>,
            document.body
          )}
          {/* МОДАЛЬНОЕ ОКНО УСПЕХА */}
          {modal.isOpen && (
            <div className="modal-overlay" onClick={() => !modal.isStatic && setModal({ ...modal, isOpen: false })}>
              <div className="modal-content animate" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                <div className="flex-center" style={{
                  width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', margin: '0 auto 25px'
                }}>
                  <CheckCircle size={40} />
                </div>
                <h2 style={{ marginBottom: '15px' }}>{modal.title}</h2>
                <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
                  {modal.message}
                </p>
                <button onClick={() => {
                  setModal({ ...modal, isOpen: false });
                  if (modal.onConfirm) modal.onConfirm();
                }} style={{ width: '100%', padding: '15px' }}>
                  Понятно
                </button>
              </div>
            </div>
          )}

          {/* Resource Modal */}
          {showResourceModal && quiz.resources && quiz.resources[activeResourceIdx] && (
            <ResourceModal
              res={quiz.resources[activeResourceIdx]}
              onClose={() => setShowResourceModal(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizView;