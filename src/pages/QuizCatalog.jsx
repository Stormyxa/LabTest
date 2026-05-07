import React, { useState, useEffect, useMemo, useCallback, startTransition, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, Play, CheckCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Award, Save, Copy, BarChart2, Book, Pencil, Eye, AlertTriangle, Plus, Shield, EyeOff, Trash2, Dices, Clock, TrendingUp, Info, Loader2, Share2, Check, X, ExternalLink, Youtube, FileText, Layout, Video } from 'lucide-react';
import { useScrollRestoration } from '../lib/useScrollRestoration';
import ResourcePlayer from '../components/ResourcePlayer';
import { fetchWithCache, useCacheSync } from '../lib/cache';

const DividerItem = React.memo(({ quiz, qIndex, userRole, searchQuery, swapQuizzes, handleRenameTrigger, fetchQuizzes, quizzesLength, activeTab }) => (
  <div className="grid-full animate" style={{ gridColumn: '1 / -1', margin: '10px 0', padding: '10px 0', display: 'flex', alignItems: 'center', gap: '15px' }}>
    <div className="flex-center" style={{ gap: '15px' }}>
      {(userRole === 'creator' || activeTab === 'personal') && !searchQuery && (
        <div className="flex-center" style={{ flexDirection: 'column', gap: '2px' }}>
          <button onClick={(e) => swapQuizzes(qIndex, -1, e, quiz)} disabled={qIndex === 0} style={{ padding: '0', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronUp size={14} /></button>
          <button onClick={(e) => swapQuizzes(qIndex, 1, e, quiz)} disabled={qIndex === quizzesLength - 1} style={{ padding: '0', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronDown size={14} /></button>
        </div>
      )}
      <div style={{ height: '1px', background: 'rgba(99, 102, 241, 0.2)', width: '20px' }} />
    </div>
    <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--primary-color)', opacity: quiz.is_hidden ? 0.5 : 1 }}>
      {quiz.content.divider_text || quiz.title || ''}
      {quiz.is_hidden && <Shield size={14} style={{ marginLeft: '8px', verticalAlign: 'middle' }} />}
    </span>
    <div style={{ height: '1px', background: 'rgba(99, 102, 241, 0.2)', flex: 1 }} />
    {(userRole === 'creator' || activeTab === 'personal') && (
      <div className="flex-center" style={{ gap: '5px' }}>
        <button onClick={(e) => { e.stopPropagation(); handleRenameTrigger({ id: quiz.id, name: quiz.content.divider_text || quiz.title, type: 'quiz', isDivider: true, sectionId: quiz.section_id }); }} style={{ background: 'transparent', color: 'var(--primary-color)', opacity: 0.4, padding: '5px', boxShadow: 'none' }}><Pencil size={14} /></button>
        <button onClick={async (e) => { e.stopPropagation(); await supabase.from('quizzes').update({ is_hidden: !quiz.is_hidden }).eq('id', quiz.id); fetchQuizzes(); }} style={{ background: 'transparent', color: quiz.is_hidden ? '#ca8a04' : 'inherit', opacity: 0.4, padding: '5px', boxShadow: 'none' }}>
          {quiz.is_hidden ? <Shield size={14} /> : <EyeOff size={14} />}
        </button>
        <button onClick={async (e) => { e.stopPropagation(); if (window.confirm('Удалить разделитель?')) { await supabase.from('quizzes').delete().eq('id', quiz.id); fetchQuizzes(); } }} style={{ background: 'transparent', color: 'red', opacity: 0.4, padding: '5px', boxShadow: 'none' }}><Trash2 size={14} /></button>
      </div>
    )}
  </div>
));

const QuizCard = React.memo(({ quiz, qIndex, userId, userRole, searchQuery, passState, statsLoading, canEditQuiz, canMoveQuiz, swapQuizzes, navigate, setSelectedQuiz, onPrepQuizSelect, setHideModal, setDuplicateModal, isDimmed, quizzesLength, handleShare, fetchData, setActiveStandaloneResource }) => {
  const [toast, setToast] = useState({ visible: false, opacity: 0 });

  const onShareClick = (e) => {
    e.stopPropagation();
    const copied = handleShare(quiz);
    if (copied) {
      setToast({ visible: true, opacity: 1 });
      setTimeout(() => setToast(prev => ({ ...prev, opacity: 0 })), 2000);
      setTimeout(() => setToast({ visible: false, opacity: 0 }), 2500);
    }
  };

  return (
    <div className="card animate" style={{ padding: '20px', background: 'var(--card-bg)', boxShadow: 'var(--soft-shadow)', display: 'flex', flexDirection: 'column', height: '100%', opacity: isDimmed ? 0.5 : 1, border: isDimmed ? '1px dashed #ca8a04' : '1px solid rgba(99, 102, 241, 0.1)', position: 'relative' }}>
      {canMoveQuiz(quiz) && !searchQuery && (
        <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', gap: '5px', zIndex: 10 }}>
          <button onClick={(e) => swapQuizzes(qIndex, -1, e, quiz)} disabled={qIndex === 0} style={{ padding: '4px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '8px' }} title="Переместить левее"><ChevronUp size={16} /></button>
          <button onClick={(e) => swapQuizzes(qIndex, 1, e, quiz)} disabled={qIndex === quizzesLength - 1} style={{ padding: '4px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '8px' }} title="Переместить правее"><ChevronDown size={16} /></button>
        </div>
      )}
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px' }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: '50px' }}>
          <h4 style={{ fontSize: '1.1rem', margin: 0, lineHeight: '1.4' }}>
            {quiz.title}
            {quiz.is_verified && <CheckCircle size={16} color="var(--primary-color)" style={{ marginLeft: '5px', display: 'inline' }} />}
            {quiz.resources && quiz.resources.length > 0 && (
              <span style={{ marginLeft: '10px', display: 'inline-flex', gap: '5px', verticalAlign: 'middle' }}>
                {quiz.resources.some(r => r.url.includes('youtube.com') || r.url.includes('youtu.be')) && (
                  <Youtube size={16} style={{ color: '#ef4444', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); const idx = quiz.resources.findIndex(r => r.url.includes('youtube.com') || r.url.includes('youtu.be')); if (idx !== -1) setActiveStandaloneResource(quiz.resources, idx); }} />
                )}
                {quiz.resources.some(r => r.url.includes('drive.google.com') || r.url.includes('docs.google.com')) && (
                  <FileText size={16} style={{ color: '#22c55e', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); const idx = quiz.resources.findIndex(r => r.url.includes('drive.google.com') || r.url.includes('docs.google.com')); if (idx !== -1) setActiveStandaloneResource(quiz.resources, idx); }} />
                )}
                {quiz.resources.some(r => !r.url.includes('youtube') && !r.url.includes('google')) && (
                  <Book size={16} style={{ color: 'var(--primary-color)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); const idx = quiz.resources.findIndex(r => !r.url.includes('youtube') && !r.url.includes('google')); if (idx !== -1) setActiveStandaloneResource(quiz.resources, idx); }} />
                )}
              </span>
            )}
          </h4>
          <p style={{ fontSize: '0.8rem', opacity: 0.5, margin: '4px 0 0 0' }}>Автор: {quiz.profiles?.last_name} {quiz.profiles?.first_name}</p>
        </div>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '15px' }}>
        <div className="flex-center" style={{ justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="flex-center" style={{ gap: '10px', flexDirection: 'column', alignItems: 'flex-start' }}>
            {statsLoading && !passState ? (
              <div className="skeleton-pulse" style={{ width: '80px', height: '24px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px' }} />
            ) : (
              passState !== undefined && (
                <div className="flex-center" style={{ gap: '6px', fontSize: '0.8rem', background: passState.is_passed ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)', color: passState.is_passed ? '#4ade80' : '#f87171', borderRadius: '10px', padding: '6px 12px', fontWeight: 'bold' }}>
                  {passState.score}/{passState.total} ({Math.round((passState.score / passState.total) * 100)}%)
                </div>
              )
            )}

            {quiz.avg_success_rate !== undefined && quiz.avg_success_rate > 0 && (
              <div className="flex-center" style={{ gap: '6px', fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 'bold', background: 'rgba(99, 102, 241, 0.05)', padding: '6px 12px', borderRadius: '10px' }} title="Общая успеваемость учеников (без учета наблюдателей)">
                <TrendingUp size={14} /> {quiz.avg_success_rate}% успех
              </div>
            )}
          </div>
          <div className="flex-center" style={{ gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
            <button
              onClick={(e) => { e.stopPropagation(); if (passState) navigate(`/analytics-details?quizId=${quiz.id}&userId=${userId}${quiz.is_personal ? '&mode=personal' : ''}`); }}
              disabled={!passState}
              style={{ padding: '8px', background: passState ? 'rgba(99, 102, 241, 0.1)' : 'rgba(0,0,0,0.03)', color: passState ? 'var(--primary-color)' : 'grey', boxShadow: 'none', borderRadius: '10px', opacity: passState ? 1 : 0.5, cursor: passState ? 'pointer' : 'not-allowed' }}
              title={passState ? "Моя детальная аналитика" : "Доступно после прохождения"}
            >
              <Info size={15} />
            </button>
            {canEditQuiz(quiz) && <button onClick={() => navigate(`/redactor?id=${quiz.id}`)} style={{ padding: '8px', background: 'rgba(99,102,241,0.08)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '10px' }} title="Редактировать"><Pencil size={15} /></button>}
            {canEditQuiz(quiz) && <button onClick={() => setHideModal(quiz)} style={{ padding: '8px', background: 'rgba(250,204,21,0.08)', color: '#ca8a04', boxShadow: 'none', borderRadius: '10px' }} title="Скрыть"><Eye size={15} /></button>}
            {quiz.is_personal && quiz.author_id === userId && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const { error } = await supabase.from('quizzes').update({ is_public: !quiz.is_public }).eq('id', quiz.id);
                  if (error) {
                    console.error("Error updating publicity:", error);
                    alert("Ошибка: " + error.message);
                  } else {
                    // Force invalidate cache for this specific list
                    localStorage.removeItem(`labtest_cache_catalog_quizzes_${quiz.section_id}`);
                    fetchData();
                  }
                }}
                style={{ padding: '8px', background: quiz.is_public ? 'rgba(74, 222, 128, 0.1)' : 'rgba(0,0,0,0.05)', color: quiz.is_public ? '#4ade80' : 'var(--text-color)', boxShadow: 'none', borderRadius: '10px' }}
                title={quiz.is_public ? "Сделать приватным" : "Сделать публичным"}
              >
                {quiz.is_public ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            )}
            {(userRole === 'admin' || userRole === 'creator' || userRole === 'teacher' || userId === quiz.author_id) && <button onClick={() => navigate(`/analytics-details?quizId=${quiz.id}${quiz.is_personal ? '&mode=personal' : ''}`)} style={{ padding: '8px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none', borderRadius: '10px' }} title="Аналитика"><BarChart2 size={15} /></button>}
            <button
              onClick={onShareClick}
              style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '10px' }}
              title="Поделиться"
            >
              <Share2 size={15} />
            </button>
            {(!quiz.is_personal || (quiz.is_personal && quiz.author_id !== userId)) && (
              <button
                onClick={(e) => { e.stopPropagation(); setDuplicateModal(quiz); }}
                style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '10px' }}
                title="Дублировать в мою библиотеку"
              >
                <Copy size={15} />
              </button>
            )}


            {toast.visible && (
              <div style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'var(--primary-color)',
                color: 'white',
                padding: '5px 12px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap',
                opacity: toast.opacity,
                transition: 'opacity 0.5s ease',
                pointerEvents: 'none'
              }}>
                <Check size={14} /> Скопировано!
              </div>
            )}
            <button onClick={(e) => { e.stopPropagation(); setSelectedQuiz(quiz); }} style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '10px' }}>
              <Play size={15} fill="currentColor" /> Начать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

const SectionContent = React.memo(({ section, profile, searchQuery, isExpanded, onQuizzesChange, setHideModal, setDuplicateModal, handleRenameTrigger, setSelectedQuiz, onPrepQuizSelect, setRandomQuizModal, activeTab, handleShare, fetchData, setActiveStandaloneResource }) => {
  const navigate = useNavigate();
  const [visibleCount, setVisibleCount] = useState(25); // Incremental rendering start

  // Keep a ref for swapping calculations to avoid dependency-related mass re-renders
  const quizzesRef = React.useRef([]);

  // We initialize straight from cache to prevent UI flash, without any artificial TTL (Data-Driven Updates)
  const [quizzes, setQuizzes] = useState(() => {
    try {
      const cached = localStorage.getItem(`labtest_cache_catalog_quizzes_${section.id}`);
      if (cached) {
        const parsed = JSON.parse(cached).data;
        quizzesRef.current = parsed;
        return parsed;
      }
    } catch (e) { }
    return [];
  });

  const [loading, setLoading] = useState(quizzes.length === 0);

  const [passedQuizzes, setPassedQuizzes] = useState(() => {
    try {
      const cached = localStorage.getItem(`labtest_cache_catalog_stats_${section.id}`);
      if (cached) return JSON.parse(cached).data?.passed || {};
    } catch (e) { }
    return {};
  });

  const [quizStats, setQuizStats] = useState(() => {
    try {
      const cached = localStorage.getItem(`labtest_cache_catalog_stats_${section.id}`);
      if (cached) return JSON.parse(cached).data?.stats || {};
    } catch (e) { }
    return {};
  });

  const [statsLoading, setStatsLoading] = useState(Object.keys(passedQuizzes).length === 0);

  const fetchQuizzes = useCallback(async () => {
    if (quizzesRef.current.length === 0) setLoading(true);

    const freshData = await fetchWithCache(`catalog_quizzes_${section.id}`, async () => {
      const { data: qData } = await supabase.from('quizzes')
        .select('id, title, section_id, is_hidden, is_public, is_verified, sort_order, content, author_id, is_personal, avg_success_rate, resources, profiles(first_name, last_name, role)')
        .eq('section_id', section.id)
        .eq('is_archived', false)
        .eq('is_hidden', false)
        .order('sort_order', { ascending: true });

      if (qData) return qData.map(q => ({ ...q, is_dirty: false }));
      return null;
    });

    if (freshData) {
      setQuizzes(prev => {
        if (prev.some(q => q.is_dirty)) return prev; // Do not overwrite if user is dragging
        quizzesRef.current = freshData;
        return freshData;
      });
    }
    setLoading(false);
  }, [section.id]);

  // SWR Event Listener for background quiz updates
  useCacheSync(`catalog_quizzes_${section.id}`, (freshData) => {
    setQuizzes(prev => {
      if (prev.some(q => q.is_dirty)) return prev;
      quizzesRef.current = freshData;
      return freshData;
    });
  });

  const fetchDetailedStats = useCallback(async (currentQuizzes) => {
    const quizIds = currentQuizzes.map(q => q.id);
    if (quizIds.length === 0) return;

    // Use SWR pattern for stats as well, with no background force for average stats unless cache is missing (wait, user wants 10 min TTL for avg score? yes, but since avg score is in main query, it naturally revalidates. Personal stats can be infinity).
    const freshData = await fetchWithCache(`catalog_stats_${section.id}`, async () => {
      const [resultsRes] = await Promise.all([
        profile?.id ? supabase.from('quiz_results')
          .select('quiz_id, is_passed, score, total_questions')
          .eq('user_id', profile.id)
          .in('quiz_id', quizIds) : Promise.resolve({ data: null })
      ]);

      const passMap = {};
      if (resultsRes.data) {
        resultsRes.data.forEach(r => { passMap[r.quiz_id] = { is_passed: r.is_passed, score: r.score, total: r.total_questions }; });
      }
      return { passed: passMap, stats: {} };
    });

    if (freshData) {
      setPassedQuizzes(freshData.passed);
      setQuizStats(freshData.stats);
    }
    setStatsLoading(false);
  }, [section.id, profile]);

  // SWR Event Listener for background stats updates
  useCacheSync(`catalog_stats_${section.id}`, (freshData) => {
    setPassedQuizzes(freshData.passed);
    setQuizStats(freshData.stats);
  });

  useEffect(() => {
    if (isExpanded) {
      fetchQuizzes();
    }
  }, [isExpanded, fetchQuizzes]);

  useEffect(() => {
    if (quizzes.length > 0) {
      fetchDetailedStats(quizzes);
    }
  }, [quizzes.length, fetchDetailedStats]);

  // Incremental rendering loop to avoid blocking UI
  useEffect(() => {
    if (isExpanded && visibleCount < quizzes.length) {
      const timer = setTimeout(() => {
        setVisibleCount(prev => Math.min(prev + 25, quizzes.length));
      }, 50); // Small delay to let browser breathe
      return () => clearTimeout(timer);
    }
  }, [isExpanded, visibleCount, quizzes.length]);

  const canEditQuiz = useCallback((quiz) => {
    if (!profile) return false;
    if (profile.role === 'creator') return true;
    if (profile.role === 'admin' && quiz.profiles?.role !== 'creator') return true;
    if ((profile.role === 'teacher' || profile.role === 'editor' || profile.role === 'player') && quiz.author_id === profile.id) return true;
    return false;
  }, [profile]);

  const canMoveQuiz = useCallback((quiz) => canEditQuiz(quiz), [canEditQuiz]);

  const swapQuizzes = useCallback((index, direction, e, quiz) => {
    e.stopPropagation();
    if (!canMoveQuiz(quiz)) return;
    const arr = [...quizzesRef.current];
    if (index + direction < 0 || index + direction >= arr.length) return;
    const temp = arr[index]; arr[index] = arr[index + direction]; arr[index + direction] = temp;

    const dirtied = arr.map((q, i) => ({ ...q, sort_order: i, is_dirty: true }));
    setQuizzes(dirtied);
    quizzesRef.current = dirtied;
    onQuizzesChange(section.id, dirtied);
  }, [canMoveQuiz, onQuizzesChange, section.id]);

  const handleStartRandomQuiz = (e) => {
    e?.stopPropagation?.();
    const validQuizzes = quizzes.filter(q => !q.content?.is_divider && !q.is_hidden);
    if (validQuizzes.length === 0) return alert('В этом предмете нет доступных тестов для прохождения.');
    const randomQuiz = validQuizzes[Math.floor(Math.random() * validQuizzes.length)];
    setRandomQuizModal({ sectionName: section.name, quiz: randomQuiz });
  };

  const filteredQuizzes = useMemo(() => {
    if (!searchQuery) return quizzes;
    return quizzes.filter(q => q.title.toLowerCase().includes(searchQuery.toLowerCase()) || q.content?.is_divider);
  }, [quizzes, searchQuery]);

  if (!isExpanded) return null;

  if (loading) {
    return (
      <div className="flex-center animate" style={{ padding: '30px', background: 'rgba(0,0,0,0.02)' }}>
        <Loader2 className="spinner" size={24} style={{ color: 'var(--primary-color)' }} />
      </div>
    );
  }

  return (
    <div className="catalog-section-content animate" style={{ padding: '15px', background: 'rgba(0,0,0,0.02)' }}>
      {quizzes.filter(q => !q.content?.is_divider).length > 0 && !searchQuery && (
        <button
          onClick={(e) => handleStartRandomQuiz(e)}
          className="flex-center animate"
          style={{ width: '100%', padding: '15px', marginBottom: '20px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)', color: 'var(--primary-color)', borderRadius: '16px', border: '1px solid rgba(99, 102, 241, 0.2)', boxShadow: 'none', fontWeight: 'bold', fontSize: '1.05rem', gap: '10px' }}
        >
          <Dices size={20} /> Случайный тест по предмету
        </button>
      )}
      <div className="grid-2" style={{ gap: '15px' }}>
        {(() => {
          let currentDividerHidden = false;
          return filteredQuizzes.slice(0, visibleCount).map((quiz, qIndex) => {
            if (quiz.content?.is_divider) {
              currentDividerHidden = quiz.is_hidden;
              if (searchQuery) return null;
              return (
                <DividerItem
                  key={quiz.id}
                  quiz={quiz}
                  qIndex={qIndex}
                  userRole={profile?.role}
                  searchQuery={searchQuery}
                  swapQuizzes={swapQuizzes}
                  handleRenameTrigger={handleRenameTrigger}
                  fetchQuizzes={fetchQuizzes}
                  quizzesLength={quizzes.length}
                  activeTab={activeTab}
                />
              );
            }
            if (currentDividerHidden && profile?.role !== 'creator' && profile?.role !== 'admin') return null;
            return (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                qIndex={qIndex}
                userId={profile?.id}
                userRole={profile?.role}
                searchQuery={searchQuery}
                passState={passedQuizzes[quiz.id]}
                statsLoading={statsLoading}
                canEditQuiz={canEditQuiz}
                canMoveQuiz={canMoveQuiz}
                swapQuizzes={swapQuizzes}
                navigate={navigate}
                setSelectedQuiz={setSelectedQuiz}
                onPrepQuizSelect={onPrepQuizSelect}
                setHideModal={setHideModal}
                setDuplicateModal={setDuplicateModal}
                isDimmed={currentDividerHidden}
                quizzesLength={quizzes.length}
                activeTab={activeTab}
                handleShare={handleShare}
                fetchData={fetchData}
                setActiveStandaloneResource={setActiveStandaloneResource}
              />
            );
          });
        })()}
      </div>
    </div>
  );
});

const CatalogSectionRow = React.memo(({
  section, clsId, sIndex, profile, searchQuery, isExpanded,
  onToggle, onQuizzesChange, setHideModal, setDuplicateModal, handleRenameTrigger, setSelectedQuiz, onPrepQuizSelect, setRandomQuizModal,
  handleCreateDivider, swapSections, setNewName, activeTab, handleShare, fetchData, setActiveStandaloneResource
}) => {
  return (
    <div className="catalog-container" style={{
      padding: '0',
      overflow: 'hidden',
      border: section.isEmpty ? '1px dashed rgba(0,0,0,0.1)' : '1px solid rgba(99, 102, 241, 0.15)',
      borderRadius: '20px',
      opacity: section.isEmpty ? 0.5 : 1,
      boxShadow: 'var(--soft-shadow)'
    }}>
      <div
        onClick={() => (!section.isEmpty || profile?.role === 'creator') && onToggle(section.id)}
        className="flex-center catalog-section-head"
        style={{
          padding: '15px 25px',
          background: section.isEmpty ? 'transparent' : 'rgba(99, 102, 241, 0.04)',
          borderRadius: '20px 20px 0 0',
          justifyContent: 'space-between',
          cursor: (!section.isEmpty || profile?.role === 'creator') ? 'pointer' : 'default'
        }}
      >
        <div className="flex-center" style={{ gap: '15px' }}>
          {(profile?.role === 'admin' || profile?.role === 'creator') && !searchQuery && (
            <div className="flex-center" style={{ gap: '5px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); swapSections(clsId, sIndex, -1, e); }}
                disabled={sIndex === 0}
                style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}
              >
                <ChevronUp size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); swapSections(clsId, sIndex, 1, e); }}
                style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}
              >
                <ChevronDown size={16} />
              </button>
            </div>
          )}
          {section.book_url && (
            <button
              onClick={(e) => { e.stopPropagation(); setActiveStandaloneResource({ url: section.book_url, title: section.name }); }}
              style={{ padding: '5px', background: 'var(--primary-color)', color: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', border: 'none', cursor: 'pointer', boxShadow: 'none' }}
              title="Открыть учебник"
            >
              <Book size={16} />
            </button>
          )}
          <h4 style={{ fontSize: '1.2rem', margin: 0 }}>
            {section.name}
            <span style={{ opacity: 0.5, fontSize: '0.9rem', marginLeft: '5px' }}>({section.realQuizCount})</span>
          </h4>
          {section.isEmpty && (
            <span style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
              <Clock size={10} /> В РАЗРАБОТКЕ
            </span>
          )}
          {(profile?.role === 'creator' || activeTab === 'personal') && (
            <div className="flex-center" style={{ gap: '10px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); handleCreateDivider(section.id); }}
                className="flex-center"
                style={{ padding: '5px 12px', fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '8px', border: 'none', boxShadow: 'none', fontWeight: 'bold' }}
              >
                <Plus size={14} style={{ marginRight: '4px' }} /> Разделитель
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleRenameTrigger({ id: section.id, name: section.name, type: 'section' }); }}
                style={{ background: 'transparent', color: 'var(--text-color)', opacity: 0.4, boxShadow: 'none', padding: '5px' }}
                title="Переименовать предмет"
              >
                <Pencil size={16} />
              </button>
            </div>
          )}
        </div>
        {(!section.isEmpty || profile?.role === 'creator') && (isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />)}
      </div>

      {(isExpanded || searchQuery) && (!section.isEmpty || profile?.role === 'creator') && (
        <SectionContent
          section={section}
          profile={profile}
          isExpanded={true}
          searchQuery={searchQuery}
          onQuizzesChange={onQuizzesChange}
          setHideModal={setHideModal}
          setDuplicateModal={setDuplicateModal}
          handleRenameTrigger={handleRenameTrigger}
          setSelectedQuiz={setSelectedQuiz}
          onPrepQuizSelect={onPrepQuizSelect}
          setRandomQuizModal={setRandomQuizModal}
          activeTab={activeTab}
          handleShare={handleShare}
          fetchData={fetchData}
          setActiveStandaloneResource={setActiveStandaloneResource}
        />
      )}
    </div>
  );
});

const CatalogClassRow = React.memo(({
  cls, cIndex, profile, searchQuery, isExpanded, expandedSections,
  onToggle, onSectionToggle, swapClasses, swapSections, handleRenameTrigger, handleCreateDivider, handleCreateSectionDivider, setNewName,
  onQuizzesChange, setHideModal, setDuplicateModal, setSelectedQuiz, onPrepQuizSelect, setRandomQuizModal, activeTab, handleShare, fetchData, setActiveStandaloneResource
}) => {
  return (
    <div className="card animate" style={{
      padding: '0',
      marginBottom: '40px',
      overflow: 'hidden',
      border: cls.isEmpty ? '1px dashed rgba(0,0,0,0.1)' : '1px solid var(--border-color)',
      background: 'var(--card-bg)',
      boxShadow: 'var(--soft-shadow)'
    }}>
      <div
        className="flex-center catalog-class-head"
        onClick={() => (!cls.isEmpty || profile?.role === 'creator') && onToggle(cls.id)}
        style={{
          padding: '20px 30px',
          background: cls.isEmpty ? 'rgba(0,0,0,0.02)' : 'rgba(99, 102, 241, 0.08)',
          borderRadius: '24px 24px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: (!cls.isEmpty || profile?.role === 'creator') ? 'pointer' : 'default'
        }}
      >
        <div className="flex-center" style={{ gap: '15px' }}>
          {(profile?.role === 'creator' || activeTab === 'personal') && !searchQuery && (
            <div className="flex-center" style={{ gap: '5px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); swapClasses(cIndex, -1, e); }}
                disabled={cIndex === 0}
                style={{ padding: '5px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}
              >
                <ChevronUp size={20} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); swapClasses(cIndex, 1, e); }}
                style={{ padding: '5px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}
              >
                <ChevronDown size={20} />
              </button>
            </div>
          )}
          <h3 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 'bold' }}>
            {cls.name} <span style={{ fontSize: '0.9rem', opacity: 0.5, marginLeft: '10px' }}>({cls.realSectionCount ?? 0} предметов)</span>
          </h3>
          {cls.isEmpty && (
            <span style={{ fontSize: '0.7rem', padding: '4px 10px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold', opacity: 0.6 }}>
              <Clock size={12} /> В РАЗРАБОТКЕ
            </span>
          )}
          {(profile?.role === 'creator' || activeTab === 'personal') && (
            <div className="flex-center" style={{ gap: '10px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); handleRenameTrigger({ id: cls.id, name: cls.name, type: 'class' }); }}
                style={{ background: 'transparent', color: 'var(--primary-color)', opacity: 0.5, boxShadow: 'none', padding: '5px' }}
                title="Переименовать класс"
              >
                <Pencil size={18} />
              </button>
              {cls.is_personal && cls.author_id === profile?.id && (
                <button
                  onClick={async (e) => { e.stopPropagation(); await supabase.from('quiz_classes').update({ is_public: !cls.is_public }).eq('id', cls.id); window.location.reload(); }}
                  style={{ padding: '8px', background: cls.is_public ? 'rgba(74, 222, 128, 0.1)' : 'rgba(0,0,0,0.05)', color: cls.is_public ? '#4ade80' : 'var(--text-color)', boxShadow: 'none', borderRadius: '10px' }}
                  title={cls.is_public ? "Сделать класс приватным" : "Сделать класс публичным"}
                >
                  {cls.is_public ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleCreateSectionDivider(cls.id); }}
                className="flex-center animate"
                style={{ padding: '8px 15px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '12px', boxShadow: 'none', fontWeight: 'bold', fontSize: '0.8rem', gap: '6px' }}
              >
                <Plus size={16} /> Разделитель предмета
              </button>
            </div>
          )}
        </div>
        {(!cls.isEmpty || profile?.role === 'creator') && (isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />)}
      </div>

      {isExpanded && (!cls.isEmpty || profile?.role === 'creator') && (
        <div className="animate catalog-class-content" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(0,0,0,0.02)' }}>
          {cls.sections.map((section, sIndex) => {
            if (section.is_divider) {
              return (
                <div key={section.id} className="animate" style={{ padding: '15px 0', borderBottom: '1px solid rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '15px', opacity: 0.8 }}>
                  <div style={{ height: '3px', background: 'var(--primary-color)', width: '25px', borderRadius: '2px', opacity: 0.6 }} />
                  <h4 style={{ fontSize: '1.4rem', fontWeight: '800', margin: 0, color: 'var(--text-color)' }}>{section.name}</h4>
                  <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', flex: 1 }} />
                  {(profile?.role === 'creator' || activeTab === 'personal') && !searchQuery && (
                    <div className="flex-center" style={{ gap: '8px' }}>
                      <div className="flex-center" style={{ gap: '3px' }}>
                        <button onClick={(e) => { e.stopPropagation(); swapSections(cls.id, sIndex, -1, e); }} disabled={sIndex === 0} style={{ padding: '4px', background: 'rgba(0,0,0,0.02)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}><ChevronUp size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); swapSections(cls.id, sIndex, 1, e); }} disabled={sIndex === cls.sections.length - 1} style={{ padding: '4px', background: 'rgba(0,0,0,0.02)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}><ChevronDown size={16} /></button>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleRenameTrigger({ id: section.id, name: section.name, type: 'section' }); }} style={{ padding: '5px', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}><Pencil size={16} /></button>
                      <button onClick={async (e) => { e.stopPropagation(); if (window.confirm('Удалить этот разделитель предметов?')) { await supabase.from('quiz_sections').delete().eq('id', section.id); fetchData(); } }} style={{ padding: '5px', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', borderRadius: '8px', boxShadow: 'none' }}><Trash2 size={16} /></button>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <CatalogSectionRow
                key={section.id}
                section={section}
                clsId={cls.id}
                sIndex={sIndex}
                profile={profile}
                searchQuery={searchQuery}
                isExpanded={expandedSections[section.id]}
                onToggle={onSectionToggle}
                onQuizzesChange={onQuizzesChange}
                setHideModal={setHideModal}
                setDuplicateModal={setDuplicateModal}
                handleRenameTrigger={handleRenameTrigger}
                setSelectedQuiz={setSelectedQuiz}
                onPrepQuizSelect={onPrepQuizSelect}
                setRandomQuizModal={setRandomQuizModal}
                handleCreateDivider={handleCreateDivider}
                swapSections={swapSections}
                activeTab={activeTab}
                handleShare={handleShare}
                fetchData={fetchData}
                setNewName={setNewName}
                setActiveStandaloneResource={setActiveStandaloneResource}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
};

const QuizCatalog = ({ profile }) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFromShare, setIsFromShare] = useState(false);
  const [cities, setCities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('catalog_tab') || 'official');
  const [activeStandaloneResource, setActiveStandaloneResourceState] = useState(null);
  const setActiveStandaloneResource = useCallback((resourceOrList, index = 0) => {
    if (!resourceOrList) {
      setActiveStandaloneResourceState(null);
      return;
    }
    if (Array.isArray(resourceOrList)) {
      setActiveStandaloneResourceState({ resources: resourceOrList, index });
    } else {
      setActiveStandaloneResourceState({ resources: [resourceOrList], index: 0 });
    }
  }, []);
  const [libraryUsers, setLibraryUsers] = useState([]);
  const [selectedLibraryUser, setSelectedLibraryUserState] = useState(() => {
    try {
      const saved = sessionStorage.getItem('catalog_selected_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });
  const [duplicateModal, setDuplicateModalState] = useState(null);

  // Sync selected user to session storage
  useEffect(() => {
    if (selectedLibraryUser) {
      sessionStorage.setItem('catalog_selected_user', JSON.stringify(selectedLibraryUser));
    } else {
      sessionStorage.removeItem('catalog_selected_user');
    }
  }, [selectedLibraryUser]);

  const [usersLoading, setUsersLoading] = useState(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    sessionStorage.setItem('catalog_tab', activeTab);
    if (activeTab === 'public' || activeTab === 'shared') {
      const fetchLibraryUsers = async () => {
        setUsersLoading(true);
        try {
          if (activeTab === 'public') {
            const { data } = await supabase.from('quiz_classes').select('author_id, profiles(id, first_name, last_name)').eq('is_public', true);
            if (data) {
              const uniqueUsers = Array.from(new Map(data.filter(d => d.profiles).map(item => [item.author_id, item.profiles])).values());
              setLibraryUsers(uniqueUsers);
            }
          } else if (activeTab === 'shared') {
            let query = supabase.from('library_access').select('owner_id, profiles!library_access_owner_id_fkey(id, first_name, last_name)');
            if (profile?.class_id) {
              query = query.or(`user_id.eq.${profile.id},target_class_id.eq.${profile.class_id}`);
            } else {
              query = query.eq('user_id', profile?.id);
            }
            const { data } = await query;
            if (data) {
              const uniqueUsers = Array.from(new Map(data.filter(d => d.profiles).map(item => [item.owner_id, item.profiles])).values());
              setLibraryUsers(uniqueUsers);
            }
          }
        } catch (e) { console.error(e); }
        setUsersLoading(false);
      };
      fetchLibraryUsers();
    }
  }, [activeTab, selectedLibraryUser, profile?.id, profile?.class_id]);


  const [expandedClasses, setExpandedClasses] = useState(() => {
    const saved = localStorage.getItem('catalog_expanded_classes_v2');
    return saved ? JSON.parse(saved) : {};
  });

  const [expandedSections, setExpandedSections] = useState(() => {
    const saved = localStorage.getItem('catalog_expanded_sections_v2');
    return saved ? JSON.parse(saved) : {};
  });

  useScrollRestoration(loading);

  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearchQuery(searchQuery); }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    localStorage.setItem('catalog_expanded_classes_v2', JSON.stringify(expandedClasses));
  }, [expandedClasses]);

  useEffect(() => {
    localStorage.setItem('catalog_expanded_sections_v2', JSON.stringify(expandedSections));
  }, [expandedSections]);

  const [selectedQuiz, setSelectedQuizState] = useState(null);
  const [prepQuiz, setPrepQuizState] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [shareModalQuiz, setShareModalQuiz] = useState(null);
  const [shareUserEmail, setShareUserEmail] = useState("");
  const [shareCityId, setShareCityId] = useState("");
  const [shareSchoolId, setShareSchoolId] = useState("");
  const [shareClassId, setShareClassId] = useState("");
  const [allCities, setAllCities] = useState([]);
  const [allSchools, setAllSchools] = useState([]);
  const [allBaseClasses, setAllBaseClasses] = useState([]);
  const [shareAccessList, setShareAccessList] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [personalClasses, setPersonalClasses] = useState([]);

  // Limits for personal library
  const LIMITS = {
    classes: 2,
    sections: 3,
    quizzes: 20
  };

  const getUsageStats = () => {
    if (activeTab !== 'personal') return null;

    // Count real items (not dividers)
    const realClassesCount = classes.filter(c => !c.is_divider).length;
    const dividerClassesCount = classes.filter(c => c.is_divider).length;

    let maxRealSectionsCount = 0;
    let maxDividerSectionsCount = 0;
    let maxRealQuizzesCount = 0;
    let maxDividerQuizzesCount = 0;

    classes.forEach(c => {
      if (c.is_divider) return;

      const realS = (c.sections || []).filter(s => !s.is_divider);
      const divS = (c.sections || []).filter(s => s.is_divider);

      if (realS.length > maxRealSectionsCount) maxRealSectionsCount = realS.length;
      if (divS.length > maxDividerSectionsCount) maxDividerSectionsCount = divS.length;

      realS.forEach(s => {
        const realQ = (s.basicQuizzes || []).filter(q => !q.content?.is_divider);
        const divQ = (s.basicQuizzes || []).filter(q => q.content?.is_divider);

        if (realQ.length > maxRealQuizzesCount) maxRealQuizzesCount = realQ.length;
        if (divQ.length > maxDividerQuizzesCount) maxDividerQuizzesCount = divQ.length;
      });
    });

    return {
      classes: realClassesCount,
      div_classes: dividerClassesCount,
      sections: maxRealSectionsCount,
      div_sections: maxDividerSectionsCount,
      quizzes: maxRealQuizzesCount,
      div_quizzes: maxDividerQuizzesCount
    };
  };

  const usage = getUsageStats();
  const [personalSections, setPersonalSections] = useState([]);
  const [destClassId, setDestClassId] = useState('');
  const [destSectionId, setDestSectionId] = useState('');
  const [duplicateTitle, setDuplicateTitle] = useState('');

  useEffect(() => {
    if (duplicateModal) {
      setDestClassId('');
      setDestSectionId('');
      setDuplicateTitle(duplicateModal.title || 'Копия');
      (async () => {
        const [{ data: c }, { data: s }] = await Promise.all([
          supabase.from('quiz_classes').select('*').eq('is_personal', true).eq('author_id', profile?.id).order('sort_order', { ascending: true }),
          supabase.from('quiz_sections').select('*').eq('is_personal', true).eq('author_id', profile?.id).order('sort_order', { ascending: true })
        ]);
        if (c) setPersonalClasses(c);
        if (s) setPersonalSections(s);
      })();
    }
  }, [duplicateModal, profile?.id]);

  const handleDuplicate = async () => {
    if (!destSectionId) return alert('Выберите папку и предмет');
    setDuplicateLoading(true);
    try {
      const contentStr = JSON.stringify(duplicateModal.content || {});
      const urlRegex = /https:\/\/raw\.githubusercontent\.com\/[^\s"']+/g;
      const urls = contentStr.match(urlRegex) || [];
      const uniqueUrls = [...new Set(urls)];

      let newContentStr = contentStr;
      const newQuizId = crypto.randomUUID();

      if (uniqueUrls.length > 0) {
        const res = await fetch('/api/github-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: uniqueUrls, path: `user_assets/${profile.id}/${newQuizId}` })
        });
        const data = await res.json();
        if (data.success && data.duplicated) {
          for (const [oldUrl, newUrl] of Object.entries(data.duplicated)) {
            newContentStr = newContentStr.split(oldUrl).join(newUrl);
          }
        } else {
          console.error('Duplication error', data);
          alert('Не удалось скопировать некоторые изображения. Текст будет скопирован.');
        }
      }

      const { error } = await supabase.from('quizzes').insert({
        id: newQuizId,
        title: duplicateTitle,
        section_id: destSectionId,
        author_id: profile.id,
        is_personal: true,
        is_public: false,
        content: JSON.parse(newContentStr),
        is_verified: true,
        sort_order: 9999
      });

      if (error) throw error;
      alert('Тест успешно продублирован в вашу личную библиотеку!');
      setDuplicateModalState(null);
    } catch (e) {
      console.error(e);
      alert('Ошибка: ' + e.message);
    }
    setDuplicateLoading(false);
  };

  const handleCreateClassDivider = async () => {
    const name = prompt('Введите название разделителя папок:');
    if (!name) return;
    const { error } = await supabase.from('quiz_classes').insert({
      name,
      is_divider: true,
      is_personal: activeTab === 'personal',
      author_id: activeTab === 'personal' ? profile.id : null,
      sort_order: (classes[classes.length - 1]?.sort_order || 0) + 1
    });
    if (error) alert(error.message);
    else {
      localStorage.removeItem('labtest_cache_catalog_struct_classes');
      fetchData(true);
    }
  };

  const handleCreateSectionDivider = async (classId) => {
    const name = prompt('Введите название разделителя секций:');
    if (!name) return;
    const classSections = classes.find(c => c.id === classId)?.sections || [];
    const { error } = await supabase.from('quiz_sections').insert({
      name,
      class_id: classId,
      is_divider: true,
      is_personal: activeTab === 'personal',
      author_id: activeTab === 'personal' ? profile.id : null,
      sort_order: (classSections[classSections.length - 1]?.sort_order || 0) + 1
    });
    if (error) alert(error.message);
    else {
      localStorage.removeItem('labtest_cache_catalog_struct_sections');
      fetchData(true);
    }
  };

  const handleCreateDivider = async (sectionId) => {
    const text = prompt('Введите текст разделителя тестов:');
    if (!text) return;
    const section = classes.flatMap(c => c.sections).find(s => s.id === sectionId);
    const sectionQuizzes = section?.basicQuizzes || [];
    const { error } = await supabase.from('quizzes').insert({
      title: 'Разделитель',
      section_id: sectionId,
      is_personal: activeTab === 'personal',
      author_id: activeTab === 'personal' ? profile.id : null,
      content: { is_divider: true, divider_text: text },
      sort_order: (sectionQuizzes[sectionQuizzes.length - 1]?.sort_order || 0) + 1
    });
    if (error) alert(error.message);
    else {
      localStorage.removeItem(`labtest_cache_catalog_quizzes_${sectionId}`);
      fetchData(true);
    }
  };

  const handleRenameItem = async (type, id, newName) => {
    let table = '';
    if (type === 'class') table = 'quiz_classes';
    else if (type === 'section') table = 'quiz_sections';
    else if (type === 'quiz') table = 'quizzes';

    if (!table) return;

    if (type === 'quiz') {
      const q = classes.flatMap(c => c.sections).flatMap(s => s.basicQuizzes).find(item => item.id === id);
      if (q?.content?.is_divider) {
        const newContent = { ...q.content, divider_text: newName };
        const { error } = await supabase.from('quizzes').update({ content: newContent }).eq('id', id);
        if (!error) {
          localStorage.removeItem(`labtest_cache_catalog_quizzes_${q.section_id}`);
          fetchData(true);
        }
        return;
      }
    }

    const { error } = await supabase.from(table).update({ name: newName }).eq('id', id);
    if (error) alert(error.message);
    else {
      // Invalidate cache based on type
      if (type === 'class') localStorage.removeItem('labtest_cache_catalog_struct_classes');
      if (type === 'section') localStorage.removeItem('labtest_cache_catalog_struct_sections');
      fetchData(true);
    }
  };

  const [dirtySections, setDirtySections] = useState({});

  const [hideModal, setHideModalState] = useState(null);
  const [renamingItem, setRenamingItem] = useState(null);
  const [newName, setNewName] = useState('');
  const [randomQuizModal, setRandomQuizModalState] = useState(null);

  // Stable setters for children
  const setSelectedQuiz = useCallback((v) => setSelectedQuizState(v), []);
  const setHideModal = useCallback((v) => setHideModalState(v), []);
  const setRandomQuizModal = useCallback((v) => setRandomQuizModalState(v), []);
  const onPrepQuizSelect = useCallback((v) => {
    setPrepQuizState(v);
    setActivePrepResourceIdx(null); // Reset when opening/closing
  }, []);
  const setDuplicateModal = useCallback((v) => setDuplicateModalState(v), []);
  const [activePrepResourceIdx, setActivePrepResourceIdx] = useState(null);

  const formatClasses = useCallback((c, s, basicQuizzes) => {
    if (!c || !s || !basicQuizzes) return [];
    return c.map(cls => {
      const clsSections = s.filter(sec => sec.class_id === cls.id).map(sec => {
        const quizzes = basicQuizzes.filter(quiz => quiz.section_id === sec.id);
        const realCount = quizzes.filter(q => !q.content?.is_divider).length;
        return {
          ...sec,
          basicQuizzes: quizzes,
          realQuizCount: realCount,
          isEmpty: realCount === 0
        };
      });
      const realSecCount = clsSections.filter(s => !s.is_divider).length;
      return {
        ...cls,
        sections: clsSections,
        realSectionCount: realSecCount,
        isEmpty: realSecCount === 0
      };
    });
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    const currentFetchId = ++fetchIdRef.current;

    if ((activeTab === 'public' || activeTab === 'shared') && !selectedLibraryUser && activeTab !== 'shared') {
      setClasses([]);
      if (!silent) setLoading(false);
      return;
    }

    if (!silent) setLoading(true);

    // 1. Сначала получаем список ID авторов, к чьим библиотекам у нас есть доступ
    let libraryAccessIds = [];
    if (activeTab === 'shared' && !selectedLibraryUser) {
      const { data: accessData } = await supabase
        .from('library_access')
        .select('owner_id')
        .or(`user_id.eq.${profile?.id},target_class_id.eq.${profile?.class_id}`);

      if (accessData) {
        libraryAccessIds = [...new Set(accessData.map(a => a.owner_id))];
      }
    }

    const isPrivileged = profile?.role === 'admin' || profile?.role === 'creator';
    const cacheKeyBase = `catalog_struct_${activeTab}_${selectedLibraryUser?.id || 'none'}`;

    const [citiesData, schoolsData, baseClassesData, c, s, basicQuizzes] = await Promise.all([
      fetchWithCache('cities_list', () => supabase.from('cities').select('*').order('name').then(r => r.data)),
      fetchWithCache('schools_list', () => supabase.from('schools').select('*').order('name').then(r => r.data)),
      fetchWithCache('classes_list', () => supabase.from('classes').select('*').order('order_index').then(r => r.data)),
      fetchWithCache(cacheKeyBase + '_classes', () => {
        let q = supabase.from('quiz_classes').select('*, is_public').order('sort_order', { ascending: true });
        if (activeTab === 'official') q = q.eq('is_personal', false);
        else if (activeTab === 'personal') q = q.eq('is_personal', true).eq('author_id', profile?.id);
        else if (selectedLibraryUser) q = q.eq('is_personal', true).eq('author_id', selectedLibraryUser.id);
        else if (activeTab === 'shared') return Promise.resolve([]);
        return q.then(r => r.data);
      }),
      fetchWithCache(cacheKeyBase + '_sections', () => {
        let q = supabase.from('quiz_sections').select('*, is_public').order('sort_order', { ascending: true });
        if (activeTab === 'official') q = q.eq('is_personal', false);
        else if (activeTab === 'personal') q = q.eq('is_personal', true).eq('author_id', profile?.id);
        else if (selectedLibraryUser) q = q.eq('is_personal', true).eq('author_id', selectedLibraryUser.id);
        else if (activeTab === 'shared') return Promise.resolve([]);
        return q.then(r => r.data);
      }),
      fetchWithCache(cacheKeyBase + `_quizzes_${isPrivileged ? 'all' : 'visible'}`, () => {
        let quizQuery = supabase.from('quizzes').select('id, title, section_id, is_hidden, is_public, content, is_personal, author_id').eq('is_archived', false).order('sort_order', { ascending: true });
        if (!isPrivileged) quizQuery = quizQuery.eq('is_hidden', false);

        if (activeTab === 'official') quizQuery = quizQuery.eq('is_personal', false);
        else if (activeTab === 'personal') quizQuery = quizQuery.eq('is_personal', true).eq('author_id', profile?.id);
        else if (selectedLibraryUser) quizQuery = quizQuery.eq('is_personal', true).eq('author_id', selectedLibraryUser.id);

        return quizQuery.then(r => r.data);
      })
    ]);

    if (currentFetchId !== fetchIdRef.current) return;

    setAllCities(citiesData || []);
    setAllSchools(schoolsData || []);
    setAllBaseClasses(baseClassesData || []);

    if (c && s && basicQuizzes) {
      setClasses(formatClasses(c, s, basicQuizzes));
    } else {
      setClasses([]);
    }
    if (!silent) setLoading(false);
  }, [profile, formatClasses, activeTab, selectedLibraryUser]);

  useEffect(() => {
    if (profile !== undefined) {
      fetchData();
    }
  }, [profile, fetchData]);

  useEffect(() => {
    if (!debouncedSearchQuery.trim()) return;
    (async () => {
      // Ищем тесты в БД чтобы раскрыть нужные папки
      const { data: hits } = await supabase.from('quizzes')
        .select('section_id')
        .ilike('title', `%${debouncedSearchQuery}%`)
        .eq('is_archived', false)
        .limit(100);

      if (hits && hits.length > 0) {
        const hitsSet = new Set(hits.map(h => h.section_id));
        const newExpSec = { ...expandedSections };
        const newExpCls = { ...expandedClasses };
        let changed = false;

        hitsSet.forEach(sId => {
          if (!newExpSec[sId]) { newExpSec[sId] = true; changed = true; }
          const cId = classes.find(c => c.sections.find(s => s.id === sId))?.id;
          if (cId && !newExpCls[cId]) { newExpCls[cId] = true; changed = true; }
        });

        if (changed) {
          startTransition(() => {
            setExpandedSections(newExpSec);
            setExpandedClasses(newExpCls);
          });
        }
      }
    })();
  }, [debouncedSearchQuery]); // eslint-disable-line

  const handleShare = useCallback((quiz) => {
    // Если это личный тест И мы его автор, открываем настройки
    // Либо если мы находимся во вкладке "Личная библиотека"
    if (quiz.is_personal && (quiz.author_id === profile?.id || activeTab === 'personal')) {
      setShareUserEmail("");
      setShareModalQuiz(quiz);
      return false; // Окно открыто, копирования не было
    }
    const url = `${window.location.origin}${window.location.pathname}?shareQuiz=${quiz.id}`;
    const text = `${quiz.title}\n${url}`;
    navigator.clipboard.writeText(text);
    return true; // Ссылка скопирована
  }, [profile?.id, activeTab]);

  // Logic for opening quiz from shared link
  useEffect(() => {
    const shareId = searchParams.get('shareQuiz');
    if (shareId && !selectedQuiz) {
      (async () => {
        const { data, error } = await supabase.from('quizzes')
          .select('*, profiles:author_id(id, first_name, last_name)')
          .eq('id', shareId)
          .single();
        if (data && !error) {
          setSelectedQuizState(data);
          // Очищаем параметры URL, чтобы окно не открывалось повторно при ререндере
          setSearchParams({}, { replace: true });
        }
      })();
    }
  }, [searchParams, selectedQuiz, setSearchParams]);

  // Fetch access list when share modal opens
  useEffect(() => {
    if (shareModalQuiz) {
      (async () => {
        const { data } = await supabase
          .from('library_access')
          .select('*, classes:target_class_id(name, schools(name))')
          .eq('owner_id', profile.id);
        setShareAccessList(data || []);
      })();
    }
  }, [shareModalQuiz, profile?.id]);



  // Sync cache events for structure
  useCacheSync('catalog_struct_classes', fetchData);
  useCacheSync('catalog_struct_sections', fetchData);
  useCacheSync(`catalog_struct_quizzes_${profile?.role === 'admin' || profile?.role === 'creator' ? 'all' : 'visible'}`, fetchData);

  const swapClasses = useCallback((index, direction, e) => {
    e.stopPropagation();
    const arr = [...classes];
    if (index + direction < 0 || index + direction >= arr.length) return;
    const temp = arr[index]; arr[index] = arr[index + direction]; arr[index + direction] = temp;
    setClasses(arr.map((x, i) => ({ ...x, sort_order: i, is_dirty: true })));
    setHasUnsavedChanges(true);
  }, [classes]);

  const swapSections = useCallback((classId, index, direction, e) => {
    e.stopPropagation();
    const newClasses = [...classes];
    const cIndex = newClasses.findIndex(c => c.id === classId);
    if (cIndex === -1) return;
    const secArr = [...newClasses[cIndex].sections];
    if (index + direction < 0 || index + direction >= secArr.length) return;
    const temp = secArr[index]; secArr[index] = secArr[index + direction]; secArr[index + direction] = temp;
    newClasses[cIndex].sections = secArr.map((x, i) => ({ ...x, sort_order: i, is_dirty: true }));
    setClasses(newClasses);
    setHasUnsavedChanges(true);
  }, [classes]);

  const handleQuizzesChange = useCallback((sectionId, updatedQuizzes) => {
    setDirtySections(prev => ({ ...prev, [sectionId]: updatedQuizzes }));
    setHasUnsavedChanges(true);
  }, []);

  const handleHideQuiz = useCallback(async () => {
    if (!hideModal) return;
    const { error } = await supabase.from('quizzes').update({ is_hidden: true }).eq('id', hideModal.id);
    if (error) alert('Ошибка: ' + error.message);
    else {
      localStorage.removeItem(`labtest_cache_catalog_struct_quizzes_all`);
      localStorage.removeItem(`labtest_cache_catalog_struct_quizzes_visible`);
      setHideModal(null);
      fetchData(true);
    }
  }, [hideModal, fetchData]);

  const handleRename = async () => {
    if (!renamingItem || !newName.trim()) return;
    const table = renamingItem.type === 'class' ? 'quiz_classes' : (renamingItem.type === 'section' ? 'quiz_sections' : 'quizzes');

    let updateData = { name: newName };
    if (renamingItem.type === 'quiz') {
      if (renamingItem.isDivider) {
        // КРИТИЧНО: Сохраняем структуру content, чтобы разделитель остался разделителем
        updateData = {
          title: 'Разделитель',
          content: { ...renamingItem.content, divider_text: newName, is_divider: true }
        };
      } else {
        updateData = { title: newName };
      }
    }

    const { error } = await supabase.from(table).update(updateData).eq('id', renamingItem.id);
    if (error) alert('Ошибка переименования: ' + error.message);
    else {
      setRenamingItem(null);
      setNewName('');
      fetchData(true);
    }
  };

  const handleRenameTrigger = useCallback((item) => {
    setRenamingItem(item);
    setNewName(item.name || item.title || (item.content?.is_divider ? item.content.divider_text : ''));
  }, []);

  const filteredClasses = useMemo(() => {
    if (!debouncedSearchQuery) return classes;
    const query = debouncedSearchQuery.toLowerCase();

    // We want to keep object references stable where possible to keep SectionContent React.memo effective
    const result = [];

    for (const cls of classes) {
      const clsMatches = cls.name.toLowerCase().includes(query);
      const matchingSections = [];

      for (const sec of cls.sections) {
        const secMatches = sec.name.toLowerCase().includes(query) || expandedSections[sec.id];
        if (secMatches) {
          matchingSections.push(sec);
        }
      }

      if (clsMatches || matchingSections.length > 0) {
        // If nothing changed in sections list, we could theoretically keep cls object but sections is already a new array after filter
        // The most important thing is that 'sec' objects themselves are stable
        result.push({ ...cls, sections: matchingSections });
      }
    }
    return result;
  }, [classes, debouncedSearchQuery, expandedSections]);

  const CatalogSkeleton = () => (
    <div style={{ width: '100%' }}>
      <div className="flex-center" style={{ marginBottom: '20px', opacity: 0.5, gap: '10px' }}>
        <Clock size={18} className="skeleton-pulse" />
        <span className="skeleton-text" style={{ width: '100px', height: '14px' }}>Загрузка структуры...</span>
      </div>
      {[1, 2].map(i => (
        <div key={i} className="card" style={{ marginBottom: '30px', padding: '0', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)', opacity: 0.6 }}>
          <div className="skeleton" style={{ height: '70px', width: '100%' }} />
          <div style={{ padding: '25px' }}>
            <div className="skeleton-text skeleton" style={{ width: '180px', height: '24px', marginBottom: '25px' }} />
          </div>
        </div>
      ))}
    </div>
  );

  const handleToggleClass = useCallback((id) => {
    setExpandedClasses(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleToggleSection = useCallback((id) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div className="container" style={{ padding: '40px 20px' }}>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '10px' }}>
        {['official', 'personal', 'public', 'shared'].filter(tab => {
          if (!profile) return tab === 'official' || tab === 'public';
          return true;
        }).map(tab => {
          const labels = { official: 'Официальный каталог', personal: 'Личная библиотека', public: 'Общая библиотека', shared: 'Доступные мне' };
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); }}
              style={{
                padding: '10px 20px',
                borderRadius: '20px',
                background: activeTab === tab ? 'var(--primary-color)' : 'rgba(0,0,0,0.05)',
                color: activeTab === tab ? 'white' : 'inherit',
                boxShadow: 'none',
                whiteSpace: 'nowrap',
                fontWeight: 'bold'
              }}
            >
              {labels[tab]}
            </button>
          )
        })}
      </div>

      {(activeTab === 'public' || activeTab === 'shared') && !selectedLibraryUser && (
        <div className="grid-2 animate" style={{ marginBottom: '40px' }}>
          {usersLoading ? null :
            libraryUsers.length === 0 ? (activeTab === 'public' ? <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', opacity: 0.5 }}>Библиотеки не найдены</div> : null) :
              libraryUsers.map(u => (
                <div key={u.id} className="card" onClick={() => setSelectedLibraryUserState(u)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px', padding: '20px' }}>
                  <div style={{ width: '50px', height: '50px', borderRadius: '25px', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {u.first_name?.[0] || 'U'}
                  </div>
                  <div>
                    <h4 style={{ margin: 0 }}>{u.last_name} {u.first_name}</h4>
                    <p style={{ margin: 0, opacity: 0.5, fontSize: '0.8rem' }}>Открыть библиотеку</p>
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {selectedLibraryUser && (
        <div className="flex-center" style={{ marginBottom: '20px', gap: '10px', justifyContent: 'flex-start' }}>
          <button onClick={() => setSelectedLibraryUserState(null)} style={{ padding: '8px 15px', background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none', borderRadius: '10px' }}>Назад</button>
          <h3 style={{ margin: 0 }}>Библиотека пользователя: {selectedLibraryUser.first_name}</h3>
        </div>
      )}

      {activeTab === 'personal' && usage && (
        <div className="flex-center" style={{ gap: '15px', padding: '10px 20px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '15px', border: '1px solid rgba(99, 102, 241, 0.1)', marginBottom: '20px' }}>
          {[
            { label: 'Папки', current: usage.classes, max: LIMITS.classes, dCurrent: usage.div_classes },
            { label: 'Секции', current: usage.sections, max: LIMITS.sections, dCurrent: usage.div_sections },
            { label: 'Тесты', current: usage.quizzes, max: LIMITS.quizzes, dCurrent: usage.div_quizzes }
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center', minWidth: '70px' }}>
              <div style={{ fontSize: '0.65rem', opacity: 0.5, marginBottom: '2px', textTransform: 'uppercase' }}>{stat.label}</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: stat.current >= stat.max ? '#ef4444' : 'var(--primary-color)' }}>
                {stat.current}/{stat.max}
                <span style={{ fontSize: '0.7rem', opacity: 0.4, marginLeft: '4px' }} title="Разделители">+{stat.dCurrent}</span>
              </div>
              <div style={{ width: '100%', height: '4px', background: 'rgba(0,0,0,0.05)', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, (stat.current / stat.max) * 100)}%`,
                  height: '100%',
                  background: stat.current >= stat.max ? '#ef4444' : 'var(--primary-color)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-center animate" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px', display: ((activeTab === 'public' || activeTab === 'shared') && !selectedLibraryUser) ? 'none' : 'flex' }}>
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-1px', margin: 0 }}>Каталог тестов</h2>
          <p style={{ opacity: 0.6, marginTop: '5px' }}>Выберите предмет и начните обучение</p>
        </div>
        <div style={{ position: 'relative', maxWidth: '400px', width: '100%', display: 'flex', gap: '15px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} size={20} />
            <input
              id="catalog-search"
              name="search"
              type="text"
              placeholder="Поиск по названию или предмету..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '45px' }}
            />
          </div>
          {(profile?.role === 'creator' || activeTab === 'personal') && (
            <button
              onClick={handleCreateClassDivider}
              className="flex-center animate"
              style={{ padding: '0 20px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', whiteSpace: 'nowrap', borderRadius: '15px', boxShadow: 'none', fontWeight: 'bold', gap: '8px' }}
            >
              <Plus size={18} /> Класс
            </button>
          )}
        </div>
      </div>

      <div style={{ minHeight: '400px' }}>
        {(loading || usersLoading) ? <CatalogSkeleton /> : (
          filteredClasses.map((cls, cIndex) => {
            if (cls.is_divider) {
              if (debouncedSearchQuery) return null;
              return (
                <div key={cls.id} className="animate" style={{ padding: '20px 0', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ height: '4px', background: 'var(--primary-color)', width: '40px', borderRadius: '2px' }} />
                  <h3 style={{ fontSize: '1.8rem', fontWeight: '900', margin: 0, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-color)' }}>{cls.name}</h3>
                  <div style={{ height: '1px', background: 'rgba(0,0,0,0.1)', flex: 1 }} />
                  {(profile?.role === 'creator' || activeTab === 'personal') && !debouncedSearchQuery && (
                    <div className="flex-center" style={{ gap: '10px' }}>
                      <button onClick={(e) => swapClasses(cIndex, -1, e)} disabled={cIndex === 0} style={{ padding: '8px', background: 'rgba(0,0,0,0.03)', color: 'var(--primary-color)', borderRadius: '10px', boxShadow: 'none' }}><ChevronUp size={20} /></button>
                      <button onClick={(e) => swapClasses(cIndex, 1, e)} disabled={cIndex === classes.length - 1} style={{ padding: '8px', background: 'rgba(0,0,0,0.03)', color: 'var(--primary-color)', borderRadius: '10px', boxShadow: 'none' }}><ChevronDown size={20} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleRenameTrigger({ id: cls.id, name: cls.name, type: 'class' }); }} style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '10px', boxShadow: 'none' }}><Pencil size={18} /></button>
                      <button onClick={async (e) => { e.stopPropagation(); if (window.confirm('Удалить этот разделитель?')) { await supabase.from('quiz_classes').delete().eq('id', cls.id); fetchData(true); } }} style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '10px', boxShadow: 'none' }}><Trash2 size={18} /></button>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <CatalogClassRow
                key={cls.id}
                cls={cls}
                cIndex={cIndex}
                profile={profile}
                searchQuery={debouncedSearchQuery}
                isExpanded={expandedClasses[cls.id]}
                expandedSections={expandedSections}
                onToggle={handleToggleClass}
                onSectionToggle={handleToggleSection}
                swapClasses={swapClasses}
                swapSections={swapSections}
                handleRenameTrigger={handleRenameTrigger}
                handleCreateDivider={handleCreateDivider}
                handleCreateSectionDivider={handleCreateSectionDivider}
                setNewName={setNewName}
                onQuizzesChange={handleQuizzesChange}
                setHideModal={setHideModal}
                setDuplicateModal={setDuplicateModal}
                setSelectedQuiz={setSelectedQuiz}
                onPrepQuizSelect={onPrepQuizSelect}
                setRandomQuizModal={setRandomQuizModal}
                activeTab={activeTab}
                handleShare={handleShare}
                fetchData={fetchData}
                setActiveStandaloneResource={setActiveStandaloneResource}
              />
            );
          })
        )}

        {!loading && activeTab === 'shared' && !selectedLibraryUser && libraryUsers.length === 0 && (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px' }}>
            <p style={{ opacity: 0.6 }}>У вас пока нет доступных тестов от других пользователей.</p>
          </div>
        )}

        {!loading && filteredClasses.length === 0 && !((activeTab === "public" || activeTab === "shared") && !selectedLibraryUser) && (
          <div className="card animate" style={{ textAlign: 'center', padding: '60px' }}>
            <h3>Ничего не найдено</h3>
            <p style={{ opacity: 0.6 }}>Попробуйте изменить поисковый запрос.</p>
          </div>
        )}
      </div>

      {hasUnsavedChanges && (
        <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: 'var(--card-bg)', padding: '15px 25px', borderRadius: '50px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 2000 }}>
          <span style={{ fontWeight: '500', fontSize: '0.95rem' }}>⚠ Порядок изменён</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setHasUnsavedChanges(false); setDirtySections({}); fetchData(true); }} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '9px 18px', borderRadius: '30px', boxShadow: 'none', fontSize: '0.9rem' }}>
              Отменить
            </button>
            <button onClick={async () => {
              try {
                setHasUnsavedChanges(false);
                setLoading(true);
                const updates = [];
                for (const c of classes) {
                  if (c.is_dirty) updates.push(supabase.from('quiz_classes').update({ sort_order: c.sort_order }).eq('id', c.id));
                  for (const s of c.sections) {
                    if (s.is_dirty) updates.push(supabase.from('quiz_sections').update({ sort_order: s.sort_order }).eq('id', s.id));
                  }
                }
                for (const sectionQuizzes of Object.values(dirtySections)) {
                  for (const q of sectionQuizzes) {
                    if (q.is_dirty) updates.push(supabase.from('quizzes').update({ sort_order: q.sort_order }).eq('id', q.id));
                  }
                }
                setDirtySections({});
                await Promise.all(updates);
                await fetchData(true);
              } catch (e) {
                console.error(e);
              } finally {
                setLoading(false);
              }
            }} style={{ padding: '9px 22px', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '600', background: 'var(--primary-color)' }} className="flex-center">
              Сохранить
            </button>
          </div>
        </div>
      )}

      {/* Share Settings Modal */}
      {shareModalQuiz && (
        <div
          className="modal-overlay animate"
          style={{ zIndex: 3000 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }}
          onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; setShareModalQuiz(null); } }}
        >
          <div className="card animate" style={{ width: '500px', padding: '30px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '25px' }}>
              <h3 style={{ margin: 0 }}>Настройки доступа</h3>
              <button onClick={() => setShareModalQuiz(null)} style={{ background: 'transparent', boxShadow: 'none' }}><X size={20} /></button>
            </div>

            <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '20px' }}>
              Тест: <strong>{shareModalQuiz.title}</strong>
            </p>

            <div style={{ marginBottom: '25px', padding: '20px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '15px' }}>
              <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: 0 }}>Публичный доступ</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', opacity: 0.6 }}>Любой со ссылкой сможет пройти тест</p>
                </div>
                <button
                  onClick={async () => {
                    const newStatus = !shareModalQuiz.is_public;
                    const { error } = await supabase.from('quizzes').update({ is_public: newStatus }).eq('id', shareModalQuiz.id);
                    if (error) {
                      console.error("Error updating publicity modal:", error);
                      alert("Ошибка сохранения: " + error.message);
                    } else {
                      setShareModalQuiz(null);
                      fetchData(true); // Обновляем весь каталог тихо
                    }
                  }}
                  style={{
                    padding: '8px 20px',
                    background: shareModalQuiz.is_public ? '#4ade80' : 'rgba(0,0,0,0.1)',
                    color: shareModalQuiz.is_public ? 'white' : 'inherit',
                    borderRadius: '10px'
                  }}
                >
                  {shareModalQuiz.is_public ? 'Включен' : 'Выключен'}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px' }}>Предоставить доступ</h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '20px', background: 'rgba(0,0,0,0.03)', borderRadius: '15px' }}>
                <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.6 }}>Доступ по UUID пользователя:</p>
                <div className="flex-center" style={{ gap: '10px' }}>
                  <input
                    type="text"
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                    value={shareUserEmail}
                    onChange={(e) => setShareUserEmail(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={async () => {
                      if (!shareUserEmail.trim()) return;
                      setShareLoading(true);
                      const { error } = await supabase.from('library_access').insert({
                        owner_id: profile.id,
                        user_id: shareUserEmail.trim(),
                        item_type: 'library'
                      });
                      setShareLoading(false);
                      if (error) alert('Ошибка доступа: ' + error.message);
                      else {
                        setShareUserEmail("");
                        // Refresh list
                        const { data } = await supabase.from('library_access').select('*, classes(name, schools(name))').eq('owner_id', profile.id);
                        setShareAccessList(data || []);
                      }
                    }}
                    disabled={shareLoading}
                    style={{ background: 'var(--primary-color)', color: 'white', padding: '12px' }}
                  >
                    {shareLoading ? <Loader2 className="spinner" size={18} /> : 'Добавить'}
                  </button>
                </div>

                <div style={{ height: '1px', background: 'rgba(0,0,0,0.05)', margin: '10px 0' }} />

                <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.6 }}>Доступ целому классу:</p>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <select value={shareCityId} onChange={(e) => { setShareCityId(e.target.value); setShareSchoolId(""); setShareClassId(""); }}>
                    <option value="">Выберите город...</option>
                    {allCities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select value={shareSchoolId} onChange={(e) => { setShareSchoolId(e.target.value); setShareClassId(""); }} disabled={!shareCityId}>
                    <option value="">Выберите школу...</option>
                    {allSchools.filter(s => s.city_id === shareCityId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <div className="flex-center" style={{ gap: '10px' }}>
                    <select value={shareClassId} onChange={(e) => setShareClassId(e.target.value)} disabled={!shareSchoolId} style={{ flex: 1 }}>
                      <option value="">Выберите класс...</option>
                      {allBaseClasses.filter(c => c.school_id === shareSchoolId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      onClick={async () => {
                        if (!shareClassId) return;
                        setShareLoading(true);
                        const { error } = await supabase.from('library_access').insert({
                          owner_id: profile.id,
                          target_class_id: shareClassId,
                          item_type: 'library'
                        });
                        setShareLoading(false);
                        if (error) alert('Ошибка доступа: ' + error.message);
                        else {
                          // Refresh list
                          const { data } = await supabase.from('library_access').select('*, classes:target_class_id(name, schools(name))').eq('owner_id', profile.id);
                          setShareAccessList(data || []);
                        }
                      }}
                      disabled={shareLoading || !shareClassId}
                      style={{ background: 'var(--primary-color)', color: 'white', padding: '12px' }}
                    >
                      {shareLoading ? <Loader2 className="spinner" size={18} /> : 'Добавить'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {shareAccessList.length > 0 && (
              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ marginBottom: '15px' }}>Текущие доступы</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {shareAccessList.map(access => (
                    <div key={access.id} className="flex-center" style={{ justifyContent: 'space-between', padding: '12px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px', fontSize: '0.85rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {access.user_id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '8px', height: '8px', background: '#4ade80', borderRadius: '50%' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Пользователь: {access.user_id.slice(0, 8)}...</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '8px', height: '8px', background: '#6366f1', borderRadius: '50%' }} />
                            <span>Класс: {access.classes?.schools?.name}, {access.classes?.name}</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          if (window.confirm('Отозвать доступ?')) {
                            const { error } = await supabase.from('library_access').delete().eq('id', access.id);
                            if (!error) {
                              setShareAccessList(prev => prev.filter(a => a.id !== access.id));
                            }
                          }
                        }}
                        style={{ background: 'transparent', color: 'red', boxShadow: 'none', padding: '5px' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gap: '10px' }}>
              <button
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?shareQuiz=${shareModalQuiz.id}`;
                  const text = `${shareModalQuiz.title}\n${url}`;
                  navigator.clipboard.writeText(text);
                  alert('Название и ссылка скопированы!');
                }}
                style={{ width: '100%', padding: '15px', background: 'var(--primary-color)', color: 'white', fontWeight: 'bold' }}
              >
                Копировать с названием
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?shareQuiz=${shareModalQuiz.id}`;
                  navigator.clipboard.writeText(url);
                  alert('Ссылка скопирована!');
                }}
                style={{ width: '100%', padding: '15px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', fontWeight: 'bold' }}
              >
                Копировать только ссылку
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedQuiz && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }} onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; (() => setSelectedQuiz(null))(e); } }}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()} style={{ width: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '5px' }}>
              <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', margin: '0 auto 25px' }}><Award size={32} /></div>
              {isFromShare && <div style={{ fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 'bold', marginBottom: '10px', textAlign: 'center' }}>Вы перешли по ссылке на этот предмет</div>}
              <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Вы готовы?</h2>
              <p style={{ opacity: 0.7, marginBottom: '25px', lineHeight: '1.6', textAlign: 'center' }}>Начать тест: <br /> <strong>"{selectedQuiz.title}"</strong>.</p>

              {/* Time info */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '25px' }}>
                <div style={{ padding: '8px 15px', background: 'rgba(0,0,0,0.03)', borderRadius: '12px', fontSize: '0.85rem' }}>
                  <strong>{selectedQuiz.content?.questions?.length || 0}</strong> вопр.
                </div>
                <div style={{ padding: '8px 15px', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--primary-color)', borderRadius: '12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} />
                  <strong>
                    {selectedQuiz.content?.time_limit ? (
                      Math.floor(selectedQuiz.content.time_limit / 60) + ' мин ' + (selectedQuiz.content.time_limit % 60) + ' сек'
                    ) : (
                      Math.floor(((selectedQuiz.content?.questions?.length || 0) * 25) / 60) + ' мин ' + (((selectedQuiz.content?.questions?.length || 0) * 25) % 60) + ' сек'
                    )}
                  </strong>
                </div>
              </div>

              {selectedQuiz.resources && selectedQuiz.resources.length > 0 && (
                <div style={{ marginBottom: '30px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', padding: '12px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
                    <Book size={18} style={{ color: 'var(--primary-color)' }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>Рекомендуем подготовиться:</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '5px' }} className="custom-scrollbar">
                    {selectedQuiz.resources.map((res, idx) => {
                      const isYoutube = res.url.includes('youtube.com') || res.url.includes('youtu.be');
                      const isDrive = res.url.includes('drive.google.com') || res.url.includes('docs.google.com');
                      return (
                        <div
                          key={idx}
                          onClick={() => { 
                            setActiveStandaloneResource(res);
                            setSelectedQuiz(null);
                          }}
                          className="flex-center animate"
                          style={{ 
                            cursor: 'pointer', 
                            justifyContent: 'space-between', 
                            padding: '12px 18px', 
                            background: 'rgba(99, 102, 241, 0.03)', 
                            borderRadius: '14px', 
                            border: '1px solid rgba(99, 102, 241, 0.1)', 
                            fontSize: '0.9rem',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div className="flex-center" style={{ gap: '12px' }}>
                            <div style={{ 
                              width: '32px', 
                              height: '32px', 
                              borderRadius: '10px', 
                              background: isYoutube ? 'rgba(239, 68, 68, 0.1)' : (isDrive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(99, 102, 241, 0.1)'),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {isYoutube ? <Youtube size={16} color="#ef4444" /> : (isDrive ? <FileText size={16} color="#22c55e" /> : <Book size={16} color="var(--primary-color)" />)}
                            </div>
                            <span style={{ fontWeight: '600', color: 'var(--text-color)' }}>{res.title || 'Материал ' + (idx + 1)}</span>
                          </div>
                          <div className="flex-center" style={{ gap: '10px' }}>
                            <span style={{ fontSize: '0.75rem', opacity: 0.4, fontWeight: '500' }}>Открыть</span>
                            <ChevronRight size={14} style={{ opacity: 0.3 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="grid-2" style={{ gap: '15px', marginTop: '10px' }}>
              <button onClick={() => setSelectedQuiz(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={() => {
                const id = selectedQuiz.id;
                localStorage.removeItem(`quiz_show_result_${id}`);
                localStorage.removeItem(`quiz_answers_${id}`);
                localStorage.removeItem(`quiz_current_idx_${id}`);
                localStorage.removeItem(`quiz_times_${id}`);
                localStorage.removeItem(`quiz_start_time_${id}`);
                localStorage.removeItem(`quiz_timer_${id}`);
                navigate(`/quiz/${id}`);
              }} style={{ padding: '15px', background: 'var(--primary-color)', color: 'white' }}>Начать тест</button>
            </div>
          </div>
        </div>
      )}

      {randomQuizModal && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }} onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; (() => setRandomQuizModal(null))(e); } }}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()} style={{ width: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '5px' }}>
              <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)', color: 'var(--primary-color)', margin: '0 auto 25px' }}>
                <Dices size={32} />
              </div>
              <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Случайный тест</h2>
              <p style={{ opacity: 0.7, marginBottom: '20px', lineHeight: '1.6', textAlign: 'center' }}>
                Вы выбрали прохождение случайного теста по предмету <br /> <strong>«{randomQuizModal.sectionName}»</strong>.
              </p>
              <div style={{ padding: '15px', background: 'rgba(0,0,0,0.03)', borderRadius: '12px', marginBottom: '25px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.85rem', opacity: 0.6, display: 'block', marginBottom: '5px' }}>Вам выпал тест:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{randomQuizModal.quiz.title}</span>
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{randomQuizModal.quiz.content?.questions?.length || 0} вопр.</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    {randomQuizModal.quiz.content?.time_limit ? (
                      Math.floor(randomQuizModal.quiz.content.time_limit / 60) + ':' + String(randomQuizModal.quiz.content.time_limit % 60).padStart(2, '0')
                    ) : (
                      Math.floor(((randomQuizModal.quiz.content?.questions?.length || 0) * 25) / 60) + ':' + String(((randomQuizModal.quiz.content?.questions?.length || 0) * 25) % 60).padStart(2, '0')
                    )}
                  </span>
                </div>
              </div>

              {randomQuizModal.quiz.resources && randomQuizModal.quiz.resources.length > 0 && (
                <div style={{ marginBottom: '30px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', padding: '12px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
                    <Book size={18} style={{ color: 'var(--primary-color)' }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>Материалы для подготовки:</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '5px' }} className="custom-scrollbar">
                    {randomQuizModal.quiz.resources.map((res, idx) => {
                      const isYoutube = res.url.includes('youtube.com') || res.url.includes('youtu.be');
                      const isDrive = res.url.includes('drive.google.com') || res.url.includes('docs.google.com');
                      return (
                        <div
                          key={idx}
                          onClick={() => { 
                            setActiveStandaloneResource(res);
                            setRandomQuizModal(null);
                          }}
                          className="flex-center animate"
                          style={{ 
                            cursor: 'pointer', 
                            justifyContent: 'space-between', 
                            padding: '12px 18px', 
                            background: 'rgba(99, 102, 241, 0.03)', 
                            borderRadius: '14px', 
                            border: '1px solid rgba(99, 102, 241, 0.1)', 
                            fontSize: '0.9rem',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div className="flex-center" style={{ gap: '12px' }}>
                            <div style={{ 
                              width: '32px', 
                              height: '32px', 
                              borderRadius: '10px', 
                              background: isYoutube ? 'rgba(239, 68, 68, 0.1)' : (isDrive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(99, 102, 241, 0.1)'),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {isYoutube ? <Youtube size={16} color="#ef4444" /> : (isDrive ? <FileText size={16} color="#22c55e" /> : <Book size={16} color="var(--primary-color)" />)}
                            </div>
                            <span style={{ fontWeight: '600', color: 'var(--text-color)' }}>{res.title || 'Материал ' + (idx + 1)}</span>
                          </div>
                          <div className="flex-center" style={{ gap: '10px' }}>
                            <span style={{ fontSize: '0.75rem', opacity: 0.4, fontWeight: '500' }}>Открыть</span>
                            <ChevronRight size={14} style={{ opacity: 0.3 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="grid-2" style={{ gap: '15px', marginTop: '10px' }}>
              <button onClick={() => setRandomQuizModal(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={() => {
                const id = randomQuizModal.quiz.id;
                localStorage.removeItem(`quiz_show_result_${id}`);
                localStorage.removeItem(`quiz_answers_${id}`);
                localStorage.removeItem(`quiz_current_idx_${id}`);
                localStorage.removeItem(`quiz_times_${id}`);
                localStorage.removeItem(`quiz_start_time_${id}`);
                localStorage.removeItem(`quiz_timer_${id}`);
                navigate(`/quiz/${id}`);
              }} style={{ padding: '15px', background: 'linear-gradient(135deg, var(--primary-color) 0%, #a855f7 100%)', color: 'white' }}>Начать тест</button>
            </div>
          </div>
        </div>
      )}

      {renamingItem && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }} onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; (() => setRenamingItem(null))(e); } }}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()} style={{ width: '400px' }}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '15px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', margin: '0 auto 20px' }}>
              <Pencil size={32} />
            </div>
            <h2 style={{ marginBottom: '10px', textAlign: 'center' }}>Переименовать</h2>
            <p style={{ fontSize: '0.85rem', opacity: 0.5, textAlign: 'center', marginBottom: '20px' }}>
              Старое название: <span style={{ fontWeight: '600' }}>{renamingItem.name}</span>
            </p>
            <div style={{ marginBottom: '25px' }}>
              <input
                autoFocus
                id="catalog-rename-input"
                name="new-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                placeholder="Введите новое название..."
                style={{ width: '100%', padding: '12px' }}
              />
            </div>
            <div className="grid-2" style={{ gap: '10px' }}>
              <button onClick={() => setRenamingItem(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none' }}>Отмена</button>
              <button onClick={handleRename} style={{ background: 'var(--primary-color)', color: 'white' }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}


      {duplicateModal && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !duplicateLoading) e.target.dataset.md = "true" }} onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true" && !duplicateLoading) { e.target.dataset.md = "false"; (() => setDuplicateModalState(null))(e); } }}>
          <div className="modal-content animate" style={{ width: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '55px', height: '55px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '15px', margin: '0 auto 20px' }}><Copy size={26} /></div>
            <h3 style={{ marginBottom: '10px', textAlign: 'center' }}>Дублировать тест</h3>
            <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '20px', textAlign: 'center', lineHeight: '1.6' }}>
              Создание копии в вашей Личной библиотеке. Все привязанные изображения будут скачаны и сохранены в ваш профиль.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.7, marginBottom: '8px' }}>Название копии</label>
              <input type="text" value={duplicateTitle} onChange={e => setDuplicateTitle(e.target.value)} disabled={duplicateLoading} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)' }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.7, marginBottom: '8px' }}>Папка</label>
                <select value={destClassId} onChange={e => { setDestClassId(e.target.value); setDestSectionId(''); }} disabled={duplicateLoading} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)' }}>
                  <option value="">Выберите папку...</option>
                  {personalClasses.filter(c => !c.is_divider).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.7, marginBottom: '8px' }}>Предмет</label>
                <select value={destSectionId} onChange={e => setDestSectionId(e.target.value)} disabled={!destClassId || duplicateLoading} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)' }}>
                  <option value="">Выберите предмет...</option>
                  {personalSections.filter(s => s.class_id === destClassId && !s.is_divider).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid-2" style={{ gap: '10px' }}>
              <button onClick={() => setDuplicateModalState(null)} disabled={duplicateLoading} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
              <button onClick={handleDuplicate} disabled={duplicateLoading} style={{ background: 'var(--primary-color)', color: 'white' }}>
                {duplicateLoading ? <Loader2 size={18} className="spinner" /> : 'Сохранить к себе'}
              </button>
            </div>
          </div>
        </div>
      )}

      {hideModal && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }} onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; (() => setHideModal(null))(e); } }}>
          <div className="modal-content animate" style={{ width: '430px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '55px', height: '55px', background: 'rgba(250,204,21,0.1)', color: '#ca8a04', borderRadius: '15px', margin: '0 auto 20px' }}><AlertTriangle size={26} /></div>
            <h3 style={{ marginBottom: '10px', textAlign: 'center' }}>Скрыть тест?</h3>
            <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '20px', textAlign: 'center', lineHeight: '1.6' }}>
              <strong>«{hideModal.title}»</strong> исчезнет из каталога для всех пользователей.<br />
              Найти его можно будет в разделе <strong>«Управление тестами»</strong> → Дерево тестов.
            </p>
            <div className="grid-2" style={{ gap: '10px' }}>
              <button onClick={() => setHideModal(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
              <button onClick={handleHideQuiz} style={{ background: '#ca8a04', color: 'white' }}>Скрыть</button>
            </div>
          </div>
        </div>
      )}
      {prepQuiz && (
        <div
          className="modal-overlay animate"
          style={{ zIndex: 3500 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }}
          onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; onPrepQuizSelect(null); } }}
        >
          <div className="card animate" style={{ width: activePrepResourceIdx !== null ? '95vw' : '550px', maxWidth: '1200px', padding: activePrepResourceIdx !== null ? '0' : '35px', textAlign: 'center', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: activePrepResourceIdx !== null ? '90vh' : 'auto' }} onClick={e => e.stopPropagation()}>

            {activePrepResourceIdx !== null ? (
              // Integrated Player View
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                <div className="flex-center" style={{ padding: '15px 25px', background: 'var(--card-bg)', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <div className="flex-center" style={{ gap: '15px' }}>
                    <button onClick={() => setActivePrepResourceIdx(null)} className="flex-center" style={{ background: 'rgba(0,0,0,0.05)', padding: '8px', borderRadius: '10px', color: 'inherit', boxShadow: 'none' }}>
                      <ChevronLeft size={20} />
                    </button>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{prepQuiz.resources[activePrepResourceIdx].title || 'Материал'}</h3>
                  </div>
                  <div className="flex-center" style={{ gap: '10px' }}>
                    <button 
                      onClick={() => window.open(prepQuiz.resources[activePrepResourceIdx].url, '_blank')} 
                      style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', padding: '8px', borderRadius: '10px', boxShadow: 'none', cursor: 'pointer' }}
                      title="Открыть в новой вкладке"
                    >
                      <ExternalLink size={20} />
                    </button>
                    <button onClick={() => onPrepQuizSelect(null)} style={{ background: 'transparent', boxShadow: 'none' }}><X size={20} /></button>
                  </div>
                </div>

                <div style={{ flex: 1, position: 'relative', background: '#000' }}>
                  <ResourcePlayer 
                    resources={prepQuiz.resources} 
                    activeIdx={activePrepResourceIdx} 
                    setActiveIdx={setActivePrepResourceIdx} 
                    isMobile={false} 
                    onOpenModal={null} 
                    inline={false} 
                  />
                </div>

                <div className="flex-center" style={{ padding: '20px 25px', background: 'var(--card-bg)', justifyContent: 'center', gap: '15px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                  <button onClick={() => setActivePrepResourceIdx(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none' }}>Назад к списку</button>
                  <button
                    onClick={() => {
                      const id = prepQuiz.id;
                      onPrepQuizSelect(null);
                      // DIRECT START LOGIC
                      localStorage.removeItem(`quiz_show_result_${id}`);
                      localStorage.removeItem(`quiz_answers_${id}`);
                      localStorage.removeItem(`quiz_current_idx_${id}`);
                      localStorage.removeItem(`quiz_times_${id}`);
                      localStorage.removeItem(`quiz_start_time_${id}`);
                      localStorage.removeItem(`quiz_timer_${id}`);
                      navigate(`/quiz/${id}?fresh=1`);
                    }}
                    style={{ padding: '12px 30px', background: 'var(--primary-color)' }}
                    className="flex-center"
                  >
                    <Play size={18} fill="currentColor" style={{ marginRight: '8px' }} /> Начать тест сейчас
                  </button>
                </div>
              </div>
            ) : (
              // Standard List View
              <>
                <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', margin: '0 auto 20px' }}>
                  <Book size={32} />
                </div>
                <h2 style={{ marginBottom: '10px' }}>Подготовка к тесту</h2>
                <h3 style={{ fontSize: '1.1rem', opacity: 0.7, marginBottom: '25px', fontWeight: '500' }}>«{prepQuiz.title}»</h3>

                <div style={{ textAlign: 'left', marginBottom: '30px', background: 'rgba(0,0,0,0.02)', padding: '20px', borderRadius: '15px', flex: 1, overflowY: 'auto' }}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '15px', fontWeight: 'bold' }}>Материалы для изучения:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(prepQuiz.resources || []).map((res, idx) => {
                      const isYoutube = res.url.includes('youtube.com') || res.url.includes('youtu.be');
                      const isDrive = res.url.includes('drive.google.com') || res.url.includes('docs.google.com');
                      return (
                        <div
                          key={idx}
                          onClick={() => setActivePrepResourceIdx(idx)}
                          className="flex-center animate"
                          style={{ cursor: 'pointer', justifyContent: 'space-between', padding: '12px 15px', background: 'var(--card-bg)', borderRadius: '12px', color: 'inherit', border: '1px solid var(--border-color)' }}
                        >
                          <div className="flex-center" style={{ gap: '12px' }}>
                            <div style={{ color: isYoutube ? '#ef4444' : (isDrive ? '#22c55e' : 'var(--primary-color)') }}>
                              {isYoutube ? <Youtube size={18} /> : (isDrive ? <FileText size={18} /> : <Book size={18} />)}
                            </div>
                            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{res.title || 'Ресурс ' + (idx + 1)}</span>
                          </div>
                          <Layout size={14} style={{ opacity: 0.3 }} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => onPrepQuizSelect(null)} style={{ flex: 1, background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none' }}>Закрыть</button>
                  <button
                    onClick={() => {
                      const id = prepQuiz.id;
                      onPrepQuizSelect(null);
                      // DIRECT START LOGIC
                      localStorage.removeItem(`quiz_show_result_${id}`);
                      localStorage.removeItem(`quiz_answers_${id}`);
                      localStorage.removeItem(`quiz_current_idx_${id}`);
                      localStorage.removeItem(`quiz_times_${id}`);
                      localStorage.removeItem(`quiz_start_time_${id}`);
                      localStorage.removeItem(`quiz_timer_${id}`);
                      navigate(`/quiz/${id}?fresh=1`);
                    }}
                    style={{ flex: 2 }}
                    className="flex-center"
                  >
                    <Play size={18} fill="currentColor" style={{ marginRight: '8px' }} /> Начать тест
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {activeStandaloneResource && (
        <div 
          className="modal-overlay animate" 
          style={{ zIndex: 4000 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }}
          onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; setActiveStandaloneResource(null); } }}
        >
          <div className="card animate" style={{ width: '95vw', maxWidth: '1200px', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ padding: '15px 25px', background: 'var(--card-bg)', borderBottom: '1px solid rgba(0,0,0,0.05)', position: 'relative' }}>
              {/* Title - Absolutely Centered */}
              <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: '40%', textAlign: 'center', pointerEvents: 'none', zIndex: 1 }}>
                <h3 className="text-truncate" style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>
                  {activeStandaloneResource.resources[activeStandaloneResource.index]?.title || 'Материал'}
                </h3>
              </div>

              {/* Left Placeholder/Content */}
              <div className="flex-center" style={{ flex: 1, justifyContent: 'flex-start' }}>
                {/* Empty or can put something here if needed */}
              </div>
              
              {/* Right - Controls */}
              <div className="flex-center" style={{ gap: '10px', flex: 1, justifyContent: 'flex-end', zIndex: 2 }}>
                {/* Middle - Arrows (Now on the right) */}
                {activeStandaloneResource.resources.length > 1 && (
                  <div className="flex-center" style={{ gap: '15px', padding: '0 15px', background: 'rgba(0,0,0,0.03)', borderRadius: '12px', marginRight: '10px' }}>
                    <button 
                      onClick={() => setActiveStandaloneResourceState(p => ({ ...p, index: (p.index - 1 + p.resources.length) % p.resources.length }))}
                      style={{ background: 'transparent', boxShadow: 'none', padding: '5px', opacity: 0.6 }}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', minWidth: '35px', textAlign: 'center' }}>
                      {activeStandaloneResource.index + 1} / {activeStandaloneResource.resources.length}
                    </span>
                    <button 
                      onClick={() => setActiveStandaloneResourceState(p => ({ ...p, index: (p.index + 1) % p.resources.length }))}
                      style={{ background: 'transparent', boxShadow: 'none', padding: '5px', opacity: 0.6 }}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}

                {(() => {
                  const res = activeStandaloneResource.resources[activeStandaloneResource.index];
                  const isYoutube = res.url.includes('youtube.com') || res.url.includes('youtu.be');
                  if (isYoutube) return null;
                  return (
                    <button 
                      onClick={() => window.open(res.url, '_blank')} 
                      style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', padding: '8px', borderRadius: '10px', boxShadow: 'none', cursor: 'pointer' }}
                      title="Открыть в новой вкладке"
                    >
                      <ExternalLink size={20} />
                    </button>
                  );
                })()}
                <button onClick={() => setActiveStandaloneResource(null)} style={{ background: 'transparent', boxShadow: 'none' }}><X size={20} /></button>
              </div>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <ResourcePlayer 
                resources={activeStandaloneResource.resources} 
                activeIdx={activeStandaloneResource.index} 
                setActiveIdx={(idx) => setActiveStandaloneResourceState(p => ({ ...p, index: idx }))} 
                isMobile={isMobile} 
                onOpenModal={null} 
                inline={false} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuizCatalog;