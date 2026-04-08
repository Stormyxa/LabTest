import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ChevronLeft, BarChart2, Clock, CheckCircle, XCircle, Search, Filter, AlertTriangle, Menu, Pencil, Trash2, Eye } from 'lucide-react';

const AnalyticsDetails = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const quizIdParam = searchParams.get('quizId');
  const userIdParam = searchParams.get('userId');

  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [profile, setProfile] = useState(null);

  // Data for sidebar
  const [quizFolders, setQuizFolders] = useState([]);
  const [sections, setSections] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [users, setUsers] = useState([]); // users who took the selected quiz

  const [cities, setCities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  // Quiz-specific sections for test filters
  const [quizSections, setQuizSections] = useState([]);

  // Test Filters
  const [filterFolder, setFilterFolder] = useState(sessionStorage.getItem('ad_t_folder') || 'all');
  const [filterSection, setFilterSection] = useState(sessionStorage.getItem('ad_t_section') || 'all');
  const [filterQuiz, setFilterQuiz] = useState(quizIdParam || sessionStorage.getItem('ad_t_quiz') || '');

  // User Filters
  const [filterCity, setFilterCity] = useState(sessionStorage.getItem('ad_u_city') || 'all');
  const [filterSchool, setFilterSchool] = useState(sessionStorage.getItem('ad_u_school') || 'all');
  const [filterClass, setFilterClass] = useState(sessionStorage.getItem('ad_u_class') || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showObservers, setShowObservers] = useState(sessionStorage.getItem('ad_show_observers') === 'true');

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = React.useRef(null);

  // Delete Modal States
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLock, setDeleteLock] = useState(3);
  const [deleteAction, setDeleteAction] = useState(null); // { type: 'user_all' | 'attempt', data: attemptObj? }

  useEffect(() => { sessionStorage.setItem('ad_show_observers', showObservers); }, [showObservers]);

  useEffect(() => { sessionStorage.setItem('ad_t_folder', filterFolder); }, [filterFolder]);
  useEffect(() => { sessionStorage.setItem('ad_t_section', filterSection); }, [filterSection]);
  useEffect(() => { sessionStorage.setItem('ad_t_quiz', filterQuiz); }, [filterQuiz]);
  useEffect(() => { sessionStorage.setItem('ad_u_city', filterCity); }, [filterCity]);
  useEffect(() => { sessionStorage.setItem('ad_u_school', filterSchool); }, [filterSchool]);
  useEffect(() => { sessionStorage.setItem('ad_u_class', filterClass); }, [filterClass]);

  // Data for main content
  const [targetUser, setTargetUser] = useState(null);
  const [targetQuiz, setTargetQuiz] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [selectedAttempt, setSelectedAttempt] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(p);

      const isPrivileged = p.role === 'admin' || p.role === 'creator' || p.role === 'teacher' || p.role === 'editor';
      if (!isPrivileged) {
        setSidebarOpen(false); // Force close for students
      }

      const { data: qF } = await supabase.from('quiz_classes').select('id, name, sort_order').order('sort_order', { ascending: true });
      const { data: secs } = await supabase.from('quiz_sections').select('id, class_id, name, sort_order').order('sort_order', { ascending: true });

      let quizQuery = supabase.from('quizzes').select('id, title, section_id, author_id, is_archived, sort_order, content').eq('is_archived', false).order('sort_order', { ascending: true });
      if (p.role === 'editor') quizQuery = quizQuery.eq('author_id', p.id);
      const { data: qs } = await quizQuery;

      const { data: c } = await supabase.from('cities').select('*').order('name');
      const { data: s } = await supabase.from('schools').select('*').order('name');
      const { data: cl } = await supabase.from('classes').select('*').order('name');

      if (qF) setQuizFolders(qF);
      if (secs) setSections(secs);
      if (qs) setQuizzes(qs);

      if (c) setCities(c);
      if (s) setSchools(s);
      if (cl) setClasses(cl);

      const targetQuizId = quizIdParam || sessionStorage.getItem('ad_t_quiz');
      if (targetQuizId) {
        setFilterQuiz(targetQuizId);
        fetchUsersForQuiz(targetQuizId, p);
      } else if (p.role === 'student' && !targetQuizId) {
        // If student but no quiz selected, they just see empty state
      }
    }
    setLoading(false);

    // Restore scroll
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = sessionStorage.getItem('ad_list_scroll') || 0;
    }, 100);
  };

  const fetchUsersForQuiz = async (qId, currentUserProfile) => {
    // 1. Get all results for this quiz to find users
    const { data: results } = await supabase.from('quiz_results').select('user_id, score, total_questions').eq('quiz_id', qId);
    if (!results) {
      setUsers([]);
      return;
    }

    // 2. Fetch those user profiles
    const userIds = [...new Set(results.map(r => r.user_id))];
    const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds);

    if (profs) {
      const isTeacher = currentUserProfile?.role === 'teacher';
      // filter out observers unless admin/creator, or if teacher restrict to own school
      // filter out observers unless toggled, and restrict to own school for teachers
      let validProfs = profs.filter(p => (p.first_name?.trim() || p.last_name?.trim()));

      const { data: currentQuizObj } = await supabase.from('quizzes').select('author_id').eq('id', qId).single();

      if (isTeacher && currentQuizObj?.author_id !== currentUserProfile?.id) {
        validProfs = validProfs.filter(p => p.school_id === currentUserProfile.school_id);
      }

      // Map statistics for suspicion detection
      const userList = validProfs.map(p => {
        const userResults = results.filter(r => r.user_id === p.id);
        const maxScore = userResults.length > 0 ? Math.max(...userResults.map(r => r.score)) : 0;

        // Suspicion logic: if red marks (failed/low score) > 30% of attempts? 
        // Or if score < some threshold. Let's use is_passed if available or score/total < 0.6
        // For now, let's just mark based on red/green ratio in their attempts (we fetch attempts later, but we can guess from results)
        return {
          ...p,
          maxScore,
        };
      });
      userList.sort((a, b) => b.maxScore - a.maxScore);
      setUsers(userList);

      // Auto-select logic for standard users or if specifically requested
      if (userIdParam) {
        const tu = userList.find(u => u.id === userIdParam);
        if (tu) fetchAttempts(qId, tu.id);
      } else if (currentUserProfile?.role === 'student' || currentUserProfile?.is_observer) {
        const self = userList.find(u => u.id === currentUserProfile.id);
        if (self) handleUserSelect(self.id);
      }
    }
  };

  const fetchAttempts = async (qId, uId) => {
    setContentLoading(true);
    const { data: q } = await supabase.from('quizzes').select('*').eq('id', qId).single();
    const { data: u } = await supabase.from('profiles').select('*').eq('id', uId).single();

    if (q) setTargetQuiz(q);
    if (u) setTargetUser(u);

    const { data: atts, error } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('quiz_id', qId)
      .eq('user_id', uId)
      .order('created_at', { ascending: true }); // chronological order

    if (!error && atts) {
      setAttempts(atts);
      // Automatically select latest
      if (atts.length > 0) setSelectedAttempt(atts[atts.length - 1]);
    } else {
      setAttempts([]);
      setSelectedAttempt(null);
    }
    setContentLoading(false);
  };

  const handleQuizSelect = (qId) => {
    setFilterQuiz(qId);
    setSearchParams({ quizId: qId });
    setTargetUser(null);
    setAttempts([]);
    fetchUsersForQuiz(qId, profile);
  };

  const handleUserSelect = (uId) => {
    setSearchParams({ quizId: filterQuiz, userId: uId });
    fetchAttempts(filterQuiz, uId);
  };

  const handleScroll = (e) => {
    sessionStorage.setItem('ad_list_scroll', e.target.scrollTop);
  };

  // derived lists for test filters
  const validSections = filterFolder === 'all' ? sections : sections.filter(s => s.class_id === filterFolder);
  const validQuizzes = filterSection === 'all'
    ? quizzes.filter(q => filterFolder === 'all' || validSections.some(vs => vs.id === q.section_id))
    : quizzes.filter(q => q.section_id === filterSection);

  // For locking specific options: if a folder has no quizzes AT ALL, it should be disabled
  const isFolderEmpty = (fId) => !quizzes.some(q => sections.some(s => s.class_id === fId && q.section_id === s.id));
  const isSectionEmpty = (sId) => !quizzes.some(q => q.section_id === sId);

  const filteredUsers = users.filter(u => {
    if (!showObservers && u.is_observer) return false;
    if (filterCity !== 'all' && u.city_id !== filterCity) return false;
    if (filterSchool !== 'all' && u.school_id !== filterSchool) return false;
    if (filterClass !== 'all' && u.class_id !== filterClass) return false;
    if (searchQuery) {
      const name = `${u.last_name || ''} ${u.first_name || ''}`.toLowerCase();
      if (!name.includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  });

  const aggregateStats = () => {
    if (attempts.length === 0) return { totalTime: 0, avgTime: 0, maxScore: 0, passed: 0, failed: 0 };
    let totalTime = 0;
    let maxS = 0;
    let passed = 0;
    let failed = 0;
    attempts.forEach(a => {
      totalTime += a.time_spent_total;
      if (a.score > maxS) maxS = a.score;
      if (a.is_passed) passed++;
      else failed++;
    });
    const isSuspiciousUser = attempts.length > 0 && (attempts.filter(a => a.is_suspicious).length / attempts.length) > 0.4;

    return {
      totalTime,
      avgTime: Math.round(totalTime / attempts.length),
      maxScore: maxS,
      passed, failed,
      isSuspiciousUser
    };
  };

  const handleDeleteClick = (type, data = null) => {
    setDeleteAction({ type, data });
    setDeleteLock(3);
    setShowDeleteModal(true);
  };

  useEffect(() => {
    let timer;
    if (showDeleteModal && deleteLock > 0) {
      timer = setInterval(() => {
        setDeleteLock(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showDeleteModal, deleteLock]);

  const confirmDeleteAction = async () => {
    if (deleteLock > 0) return;
    try {
      if (deleteAction.type === 'user_all') {
        const { error } = await supabase.from('quiz_attempts').delete().eq('quiz_id', filterQuiz).eq('user_id', targetUser.id);
        if (error) throw error;
        await supabase.from('quiz_results').delete().eq('quiz_id', filterQuiz).eq('user_id', targetUser.id);
        setAttempts([]);
        setSelectedAttempt(null);
        fetchUsersForQuiz(filterQuiz, profile);
      } else if (deleteAction.type === 'attempt') {
        const { error } = await supabase.from('quiz_attempts').delete().eq('id', deleteAction.data.id);
        if (error) throw error;
        // Re-fetch attempts for this user/quiz
        fetchAttempts(filterQuiz, targetUser.id);
        fetchUsersForQuiz(filterQuiz, profile);
      }
      setShowDeleteModal(false);
    } catch (err) {
      alert(`Ошибка при удалении: ${err.message}`);
    }
  };

  const renderChart = () => {
    if (attempts.length === 0) return <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>Нет данных о прохождениях</div>;

    const stats = aggregateStats();
    const last10 = attempts.slice(-10);
    const chartBars = [];

    const qsLength = targetQuiz?.content?.questions?.length || 1;

    // Max Score Bar (Always Blue)
    chartBars.push({
      label: 'Максимум',
      score: stats.maxScore,
      maxPossible: qsLength,
      color: stats.isSuspiciousUser ? '#ef4444' : '#3b82f6', // Red if suspicious, else Blue
      data: null, // special
      type: 'max'
    });

    // Attempt bars
    last10.forEach((att, idx) => {
      let color = '#4ade80'; // Green
      if (att.is_suspicious) color = '#ef4444'; // Red
      else if (!att.is_passed) color = '#facc15'; // Yellow

      chartBars.push({
        label: `Попытка ${attempts.length - last10.length + idx + 1}`,
        score: att.score,
        maxPossible: att.max_score || qsLength,
        color: color,
        data: att,
        type: 'attempt',
        id: att.id
      });
    });

    // Максимальная высота бара (100% результат) будет занимать 85% высоты внутреннего контейнера
    // чтобы оставить место сверху для текста и короны.
    const MAX_BAR_HEIGHT = 85;

    return (
      <div style={{ position: 'relative', display: 'flex', height: '240px', padding: '20px 20px 20px 0', background: 'rgba(0,0,0,0.02)', borderRadius: '15px' }}>

        {/* Левая панель с градиентной шкалой */}
        <div style={{ width: '50px', position: 'relative', display: 'flex', justifyContent: 'flex-end', paddingRight: '15px', height: '100%' }}>
          <div style={{ position: 'absolute', bottom: 0, width: '6px', height: `${MAX_BAR_HEIGHT}%`, background: 'linear-gradient(to top, #ef4444 0%, #ef4444 20%, #facc15 20%, #facc15 50%, #4ade80 50%, #4ade80 100%)', borderRadius: '3px', zIndex: 5 }} />
        </div>

        {/* Область графика */}
        <div style={{ position: 'relative', flex: 1, height: '100%' }}>

          {/* Пунктирные фоновые линии - теперь они строятся снизу, так же как и столбики */}
          <div style={{ position: 'absolute', left: '-40px', bottom: `${MAX_BAR_HEIGHT}%`, width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(0,0,0,0.1)', pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', opacity: 0.5, fontWeight: 'bold' }}>100%</span>
          </div>
          <div style={{ position: 'absolute', left: '-40px', bottom: `${MAX_BAR_HEIGHT * 0.8}%`, width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(74, 222, 128, 0.3)', pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', color: '#4ade80', fontWeight: 'bold' }}>80%</span>
          </div>
          <div style={{ position: 'absolute', left: '-40px', bottom: `${MAX_BAR_HEIGHT * 0.5}%`, width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(250, 204, 21, 0.3)', pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', color: '#ca8a04', fontWeight: 'bold' }}>50%</span>
          </div>
          <div style={{ position: 'absolute', left: '-40px', bottom: `${MAX_BAR_HEIGHT * 0.2}%`, width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(239, 68, 68, 0.3)', pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold' }}>20%</span>
          </div>

          {/* Горизонтальная базовая линия */}
          <div style={{ position: 'absolute', left: '-15px', bottom: '0', width: 'calc(100% + 15px)', height: '2px', background: 'var(--text-color)', opacity: 0.1, zIndex: 0 }} />

          {/* Столбики */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '100%', position: 'relative', zIndex: 1 }}>
            {chartBars.map((bar, i) => {
              const maxP = bar.maxPossible || 1;
              const heightPercent = (bar.score / maxP) * MAX_BAR_HEIGHT;
              const isSpecial = bar.type === 'max';
              const isZero = bar.score === 0;

              return (
                <div
                  key={i}
                  onClick={() => !isSpecial && setSelectedAttempt(bar.data)}
                  style={{
                    flex: 1, minWidth: '20px', maxWidth: '60px', height: '100%',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    cursor: isSpecial ? 'default' : 'pointer',
                    opacity: (selectedAttempt?.id === bar.id || isSpecial) ? 1 : 0.6,
                    transition: 'opacity 0.2s', zIndex: 1
                  }}
                  title={isSpecial ? `Максимальный балл: ${bar.score}` : `${bar.label}\nБалл: ${bar.score}\nВремя: ${bar.data?.time_spent_total || 0}с\n${bar.data?.is_suspicious ? '(Подозрительно)' : ''}`}
                >
                  {/* Благодаря flex-direction: column все элементы (корона, цифра, бар) выстраиваются друг на друге, не сбивая верстку */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%' }}>
                    {bar.score === maxP && !isSpecial && (
                      <div style={{ textAlign: 'center', color: '#eab308', fontSize: '1.2rem', marginBottom: '-2px', zIndex: 10 }}>
                        👑
                      </div>
                    )}
                    <div style={{ textAlign: 'center', fontSize: '0.7rem', paddingBottom: '4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{bar.score}</div>
                    <div style={{
                      width: '100%',
                      height: isZero ? '5px' : `${heightPercent}%`,
                      background: isZero ? 'rgba(239, 68, 68, 0.3)' : bar.color,
                      borderRadius: '6px 6px 0 0', borderBottom: 'none',
                      transition: 'height 0.3s ease',
                      flexShrink: 0
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderAttemptDetails = () => {
    if (!selectedAttempt || !targetQuiz) return <div style={{ padding: '20px', opacity: 0.5 }}>Выберите попытку на графике</div>;

    const qs = targetQuiz.content.questions;
    let ansData = [];
    try {
      ansData = typeof selectedAttempt.answers_data === 'string' ? JSON.parse(selectedAttempt.answers_data) : selectedAttempt.answers_data;
    } catch (e) { }

    // compute average time per question for THIS user
    const avgTimePerQ = {};
    attempts.forEach(att => {
      let d = typeof att.answers_data === 'string' ? JSON.parse(att.answers_data) : att.answers_data;
      if (Array.isArray(d)) {
        d.forEach(ans => {
          if (!avgTimePerQ[ans.originalIndex]) avgTimePerQ[ans.originalIndex] = { totalTime: 0, count: 0 };
          avgTimePerQ[ans.originalIndex].totalTime += (ans.timeSpent || 0);
          avgTimePerQ[ans.originalIndex].count++;
        });
      }
    });

    return (
      <div style={{ marginTop: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>
            Детали прохождения от {new Date(selectedAttempt.created_at).toLocaleString()}
            {selectedAttempt.is_suspicious && <span style={{ marginLeft: '10px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: '10px' }}><AlertTriangle size={14} style={{ display: 'inline', marginRight: '4px' }} /> Подозрительно</span>}
          </h3>
          {(profile?.role === 'admin' || profile?.role === 'creator') && (
            <button
              onClick={() => handleDeleteClick('attempt', selectedAttempt)}
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', padding: '8px 15px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Trash2 size={16} /> Удалить попытку
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '30px' }}>
          <div className="card" style={{ padding: '15px' }}>
            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Балл</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{selectedAttempt.score} / {selectedAttempt.max_score}</div>
          </div>
          <div className="card" style={{ padding: '15px' }}>
            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Затрачено времени</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{selectedAttempt.time_spent_total} сек</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {ansData.map((ans, i) => {
            const originQ = qs.find(q => (q.originalIndex || qs.indexOf(q)) === ans.originalIndex);
            if (!originQ) return null;

            const isCorrect = ans.isCorrect;
            const avgQTime = avgTimePerQ[ans.originalIndex]?.count > 0 ? Math.round(avgTimePerQ[ans.originalIndex].totalTime / avgTimePerQ[ans.originalIndex].count) : 0;

            return (
              <div key={i} className="card" style={{ padding: '20px', borderLeft: `4px solid ${isCorrect ? '#4ade80' : '#ef4444'}` }}>
                <h4 style={{ marginBottom: '10px' }}>Вопрос: {originQ.question}</h4>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ opacity: 0.6 }}>Ответ:</span>
                  <strong style={{ color: isCorrect ? '#4ade80' : '#ef4444' }}>
                    {ans.chosenIndex !== null ? originQ.options[ans.chosenIndex] : 'Пропущено'}
                  </strong>
                  {isCorrect ? <CheckCircle size={16} color="#4ade80" /> : <XCircle size={16} color="#ef4444" />}
                </div>
                {!isCorrect && ans.correctIndex !== undefined && (
                  <div style={{ marginBottom: '10px', fontSize: '0.9rem' }}>
                    <span style={{ opacity: 0.6 }}>Верный ответ: </span>
                    <strong>{originQ.options[ans.correctIndex]}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '20px', fontSize: '0.85rem', opacity: 0.7, background: 'rgba(0,0,0,0.02)', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={14} /> Время на вопрос: {ans.timeSpent}с
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <BarChart2 size={14} /> Среднее (за все попытки): {avgQTime}с
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const isPrivileged = profile?.role === 'admin' || profile?.role === 'creator' || profile?.role === 'teacher' || profile?.role === 'editor';

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 70px)', overflow: 'hidden' }}>
      {/* Sidebar */}
      {isPrivileged && (
        <div
          style={{
            width: sidebarOpen ? '320px' : '0',
            background: 'var(--card-bg)',
            borderRight: '1px solid rgba(0,0,0,0.05)',
            transition: 'width 0.3s',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column'
          }}
        >
          <div style={{ padding: '20px', width: '320px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px' }}>
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Аналитика</h3>
              <button onClick={() => setSidebarOpen(false)} style={{ background: 'transparent', color: 'inherit', boxShadow: 'none', padding: '5px' }}><ChevronLeft size={20} /></button>
            </div>

            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', padding: '4px', marginBottom: '15px' }}>
              <button style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '0.8rem', background: 'white', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', cursor: 'default', fontWeight: 'bold' }}>По Тестам</button>
              <button onClick={() => navigate('/user-analytics')} style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '0.8rem', background: 'transparent', border: 'none', boxShadow: 'none', cursor: 'pointer', color: 'var(--text-color)', opacity: 0.7 }}>По Ученикам</button>
            </div>

            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.02)', padding: '10px', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Показать наблюдателей</span>
              <button
                onClick={() => setShowObservers(!showObservers)}
                style={{
                  width: '40px', height: '20px', borderRadius: '10px',
                  background: showObservers ? 'var(--primary-color)' : '#ccc',
                  position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.3s'
                }}
              >
                <div style={{
                  position: 'absolute', top: '2px', left: showObservers ? '22px' : '2px',
                  width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.3s'
                }} />
              </button>
            </div>

            {loading ? (
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: '30px', marginBottom: '10px' }} />
                <div className="skeleton" style={{ height: '30px', marginBottom: '10px' }} />
                <div className="skeleton" style={{ height: '30px', marginBottom: '20px' }} />
                <div className="skeleton" style={{ height: '100px' }} />
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="ad-folder" style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '5px', display: 'block' }}>Выбор Теста</label>
                  <select id="ad-folder" value={filterFolder} onChange={e => { setFilterFolder(e.target.value); setFilterSection('all'); }} style={{ width: '100%', marginBottom: '10px', padding: '8px' }}>
                    <option value="all">Все папки</option>
                    {quizFolders.map(f => <option key={f.id} value={f.id} disabled={isFolderEmpty(f.id)}>{f.name} {isFolderEmpty(f.id) ? '(пусто)' : ''}</option>)}
                  </select>
                  <select id="ad-section" value={filterSection} onChange={e => setFilterSection(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '8px' }} aria-label="Предмет">
                    <option value="all">Все предметы</option>
                    {validSections.map(s => <option key={s.id} value={s.id} disabled={isSectionEmpty(s.id)}>{s.name} {isSectionEmpty(s.id) ? '(пусто)' : ''}</option>)}
                  </select>
                  <select id="ad-quiz" value={filterQuiz} onChange={e => handleQuizSelect(e.target.value)} style={{ width: '100%', padding: '8px' }} aria-label="Тест">
                    <option value="" disabled>-- Выберите тест --</option>
                    {validQuizzes.map(q => (
                      <option key={q.id} value={q.id} disabled={q.content?.is_divider}>
                        {q.content?.is_divider ? `--- ${q.content.divider_text || 'Разделитель'} ---` : q.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ height: '1px', background: 'rgba(0,0,0,0.05)', margin: '15px 0' }} />

                {filterQuiz ? (
                  <>
                    <label htmlFor="ad-city" style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '10px', display: 'block' }}>Фильтры Учеников</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                      <select id="ad-city" value={filterCity} onChange={e => { setFilterCity(e.target.value); setFilterSchool('all'); setFilterClass('all'); }} style={{ padding: '6px', fontSize: '0.85rem' }}>
                        <option value="all">Все города</option>
                        {cities.map(c => <option key={c.id} value={c.id} disabled={!users.some(u => u.city_id === c.id)}>{c.name}</option>)}
                      </select>
                      <select id="ad-school" value={filterSchool} onChange={e => { setFilterSchool(e.target.value); setFilterClass('all'); }} disabled={profile?.role === 'teacher'} style={{ padding: '6px', fontSize: '0.85rem' }} aria-label="Школа">
                        <option value="all">Все школы</option>
                        {schools.filter(s => filterCity === 'all' || s.city_id === filterCity).map(s => <option key={s.id} value={s.id} disabled={!users.some(u => u.school_id === s.id)}>{s.name}</option>)}
                      </select>
                      <select id="ad-class" value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ padding: '6px', fontSize: '0.85rem' }} aria-label="Класс">
                        <option value="all">Все классы</option>
                        {classes.filter(c => filterSchool === 'all' || c.school_id === filterSchool).map(c => <option key={c.id} value={c.id} disabled={!users.some(u => u.class_id === c.id)}>{c.name}</option>)}
                      </select>
                      <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', opacity: 0.5 }} />
                        <label htmlFor="ad-search" style={{ display: 'none' }}>Поиск</label>
                        <input id="ad-search" type="text" placeholder="Поиск..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '6px 10px 6px 30px', fontSize: '0.85rem' }} />
                      </div>
                    </div>

                    <label style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '10px', display: 'block' }}>Ученики ({filteredUsers.length})</label>
                    <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', paddingRight: '5px' }}>
                      {filteredUsers.map(u => (
                        <button
                          key={u.id}
                          onClick={() => handleUserSelect(u.id)}
                          style={{
                            textAlign: 'left', padding: '10px',
                            background: targetUser?.id === u.id ? 'var(--primary-color)' : (u.is_observer ? 'rgba(234, 179, 8, 0.05)' : 'rgba(0,0,0,0.02)'),
                            color: targetUser?.id === u.id ? 'white' : 'var(--text-color)',
                            borderRadius: '8px', border: targetUser?.id === u.id ? 'none' : (u.is_observer ? '1px dashed #eab308' : 'none'),
                            cursor: 'pointer',
                            fontSize: '0.85rem', width: '100%'
                          }}>
                          <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {u.last_name} {u.first_name}
                            {u.is_observer && <Eye size={12} title="Наблюдатель" />}
                          </div>
                          <div style={{ opacity: 0.8, fontSize: '0.75rem' }}>Max: {u.maxScore} баллов</div>
                        </button>
                      ))}
                      {filteredUsers.length === 0 && <div style={{ fontSize: '0.8rem', opacity: 0.5, textAlign: 'center', marginTop: '10px' }}>Нет учеников по фильтру</div>}
                    </div>
                  </>
                ) : (
                  <div style={{ opacity: 0.5, fontSize: '0.9rem', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Сначала выберите тест<br />для просмотра учеников.</div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '40px 60px', overflowY: 'auto', position: 'relative', height: '100%' }}>
        {isPrivileged && !sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="flex-center" style={{ position: 'absolute', left: '20px', top: '40px', background: 'var(--card-bg)', color: 'inherit', padding: '10px', borderRadius: '10px', zIndex: 10 }}>
            <Menu size={20} />
          </button>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', marginLeft: (!sidebarOpen && isPrivileged) ? '50px' : '0' }}>
          <button onClick={() => navigate(-1)} className="flex-center" style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none', padding: '10px 20px', width: 'max-content' }}>
            <ChevronLeft size={20} /> Вернуться
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => navigate(`/analytics?id=${filterQuiz}`)} title="Общая аналитика" style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '10px', borderRadius: '10px' }}><BarChart2 size={20} /></button>
            <button onClick={() => navigate(`/redactor?id=${filterQuiz}`)} title="Редактор" style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '10px', borderRadius: '10px' }}><Pencil size={20} /></button>
            {(profile?.role === 'admin' || profile?.role === 'creator') && targetUser && targetQuiz && (
              <button
                onClick={() => handleDeleteClick('user_all')}
                title="Удалить все результаты ученика по этому тесту"
                style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px', borderRadius: '10px' }}
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>

        {loading || contentLoading ? (
          <div className="animate" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="skeleton" style={{ height: '40px', width: '300px' }} />
            <div className="skeleton" style={{ height: '30px', width: '200px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', margin: '30px 0' }}>
              <div className="skeleton" style={{ height: '100px' }} />
              <div className="skeleton" style={{ height: '100px' }} />
              <div className="skeleton" style={{ height: '100px' }} />
            </div>
            <div className="skeleton" style={{ height: '240px' }} />
          </div>
        ) : (!targetQuiz || !targetUser) ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', flexDirection: 'column', opacity: 0.5 }}>
            <BarChart2 size={64} style={{ marginBottom: '20px', color: 'var(--primary-color)' }} />
            <h2>Выберите тест и ученика для анализа</h2>
          </div>
        ) : (
          <div className="animate">
            <h2 style={{ fontSize: '2rem', marginBottom: '10px', color: aggregateStats().isSuspiciousUser ? '#ef4444' : 'inherit' }}>
              {targetUser.last_name} {targetUser.first_name}
              {aggregateStats().isSuspiciousUser && <span style={{ marginLeft: '10px', fontSize: '0.9rem', background: '#ef4444', color: 'white', padding: '4px 12px', borderRadius: '20px', verticalAlign: 'middle' }}>Низкая успеваемость</span>}
            </h2>
            <h3 style={{ opacity: 0.6, fontSize: '1.2rem', marginBottom: '30px' }}>Тест: {targetQuiz.title}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Всего попыток</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{attempts.length}</div>
              </div>
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Успешных / Провальных</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#4ade80' }}>
                  {aggregateStats().passed} <span style={{ color: 'var(--text-color)', opacity: 0.3 }}>/</span> <span style={{ color: '#facc15' }}>{aggregateStats().failed}</span>
                </div>
              </div>
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Среднее время</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{aggregateStats().avgTime} сек</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: '20px' }}>График попыток</h3>
              {renderChart()}
              <div className="flex-center" style={{ gap: '15px', marginTop: '15px', fontSize: '0.8rem', opacity: 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', background: '#3b82f6', borderRadius: '3px' }} /> Максимальный балл</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', background: '#4ade80', borderRadius: '3px' }} /> Успех</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', background: '#facc15', borderRadius: '3px' }} /> Провал</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '3px' }} /> Подозрительно</div>
              </div>
            </div>

            {renderAttemptDetails()}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card animate" style={{ maxWidth: '400px', width: '100%', padding: '30px', textAlign: 'center' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <AlertTriangle size={30} />
            </div>
            <h3 style={{ marginBottom: '10px' }}>Подтвердите удаление</h3>
            <p style={{ opacity: 0.7, marginBottom: '25px', fontSize: '0.95rem' }}>
              {deleteAction.type === 'user_all'
                ? `Вы уверены, что хотите удалить ВСЕ попытки пользователя ${targetUser.first_name} по тесту "${targetQuiz.title}"? Это действие необратимо.`
                : `Вы уверены, что хотите удалить выбранную попытку?`
              }
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowDeleteModal(false)} style={{ flex: 1, padding: '12px', background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
              <button
                onClick={confirmDeleteAction}
                disabled={deleteLock > 0}
                style={{
                  flex: 1, padding: '12px', background: '#ef4444', color: 'white',
                  opacity: deleteLock > 0 ? 0.5 : 1, cursor: deleteLock > 0 ? 'not-allowed' : 'pointer',
                  position: 'relative'
                }}
              >
                {deleteLock > 0 ? `Подождите (${deleteLock})` : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsDetails;