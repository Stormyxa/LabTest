import React, { useState, useEffect, useMemo, useCallback, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, Play, CheckCircle, ChevronDown, ChevronUp, Award, Save, BarChart2, Book, Pencil, Eye, AlertTriangle, Plus, Shield, EyeOff, Trash2, Dices, Clock, TrendingUp, Info, Loader2 } from 'lucide-react';
import { useScrollRestoration } from '../lib/useScrollRestoration';
import { fetchWithCache, useCacheSync } from '../lib/cache';

const DividerItem = React.memo(({ quiz, qIndex, userRole, searchQuery, swapQuizzes, setRenamingItem, fetchQuizzes, quizzesLength }) => (
  <div className="grid-full animate" style={{ gridColumn: '1 / -1', margin: '10px 0', padding: '10px 0', display: 'flex', alignItems: 'center', gap: '15px' }}>
    <div className="flex-center" style={{ gap: '15px' }}>
      {userRole === 'creator' && !searchQuery && (
        <div className="flex-center" style={{ flexDirection: 'column', gap: '2px' }}>
          <button onClick={(e) => swapQuizzes(qIndex, -1, e, quiz)} disabled={qIndex === 0} style={{ padding: '0', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronUp size={14} /></button>
          <button onClick={(e) => swapQuizzes(qIndex, 1, e, quiz)} disabled={qIndex === quizzesLength - 1} style={{ padding: '0', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronDown size={14} /></button>
        </div>
      )}
      <div style={{ height: '1px', background: 'rgba(99, 102, 241, 0.2)', width: '20px' }} />
    </div>
    <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--primary-color)', opacity: quiz.is_hidden ? 0.5 : 1 }}>
      {quiz.content.divider_text || ''}
      {quiz.is_hidden && <Shield size={14} style={{ marginLeft: '8px', verticalAlign: 'middle' }} />}
    </span>
    <div style={{ height: '1px', background: 'rgba(99, 102, 241, 0.2)', flex: 1 }} />
    {userRole === 'creator' && (
      <div className="flex-center" style={{ gap: '5px' }}>
        <button onClick={(e) => { e.stopPropagation(); setRenamingItem({ id: quiz.id, name: quiz.title, type: 'quiz' }); }} style={{ background: 'transparent', color: 'var(--primary-color)', opacity: 0.4, padding: '5px', boxShadow: 'none' }}><Pencil size={14} /></button>
        <button onClick={async (e) => { e.stopPropagation(); await supabase.from('quizzes').update({ is_hidden: !quiz.is_hidden }).eq('id', quiz.id); fetchQuizzes(); }} style={{ background: 'transparent', color: quiz.is_hidden ? '#ca8a04' : 'inherit', opacity: 0.4, padding: '5px', boxShadow: 'none' }}>
          {quiz.is_hidden ? <Shield size={14} /> : <EyeOff size={14} />}
        </button>
        <button onClick={async (e) => { e.stopPropagation(); if (window.confirm('Удалить разделитель?')) { await supabase.from('quizzes').delete().eq('id', quiz.id); fetchQuizzes(); } }} style={{ background: 'transparent', color: 'red', opacity: 0.4, padding: '5px', boxShadow: 'none' }}><Trash2 size={14} /></button>
      </div>
    )}
  </div>
));

const QuizCard = React.memo(({ quiz, qIndex, userId, userRole, searchQuery, passState, statsLoading, canEditQuiz, canMoveQuiz, swapQuizzes, navigate, setSelectedQuiz, setHideModal, isDimmed, quizzesLength }) => (
  <div className="card animate" style={{ padding: '20px', background: 'var(--card-bg)', boxShadow: 'var(--soft-shadow)', display: 'flex', flexDirection: 'column', height: '100%', opacity: isDimmed ? 0.5 : 1, border: isDimmed ? '1px dashed #ca8a04' : '1px solid rgba(99, 102, 241, 0.1)', position: 'relative' }}>
    {canMoveQuiz(quiz) && !searchQuery && (
      <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', gap: '5px', zIndex: 10 }}>
        <button onClick={(e) => swapQuizzes(qIndex, -1, e, quiz)} disabled={qIndex === 0} style={{ padding: '4px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '8px' }} title="Переместить левее"><ChevronUp size={16} /></button>
        <button onClick={(e) => swapQuizzes(qIndex, 1, e, quiz)} disabled={qIndex === quizzesLength - 1} style={{ padding: '4px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '8px' }} title="Переместить правее"><ChevronDown size={16} /></button>
      </div>
    )}
    <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px' }}>
      <div style={{ flex: 1, minWidth: 0, paddingRight: '50px' }}>
        <h4 style={{ fontSize: '1.1rem', margin: 0, lineHeight: '1.4' }}>{quiz.title}{quiz.is_verified && <CheckCircle size={16} color="var(--primary-color)" style={{ marginLeft: '5px', display: 'inline' }} />}</h4>
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
            onClick={(e) => { e.stopPropagation(); if (passState) navigate(`/analytics-details?quizId=${quiz.id}&userId=${userId}`); }}
            disabled={!passState}
            style={{ padding: '8px', background: passState ? 'rgba(99, 102, 241, 0.1)' : 'rgba(0,0,0,0.03)', color: passState ? 'var(--primary-color)' : 'grey', boxShadow: 'none', borderRadius: '10px', opacity: passState ? 1 : 0.5, cursor: passState ? 'pointer' : 'not-allowed' }}
            title={passState ? "Моя детальная аналитика" : "Доступно после прохождения"}
          >
            <Info size={15} />
          </button>
          {canEditQuiz(quiz) && <button onClick={() => navigate(`/redactor?id=${quiz.id}`)} style={{ padding: '8px', background: 'rgba(99,102,241,0.08)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '10px' }} title="Редактировать"><Pencil size={15} /></button>}
          {canEditQuiz(quiz) && <button onClick={() => setHideModal(quiz)} style={{ padding: '8px', background: 'rgba(250,204,21,0.08)', color: '#ca8a04', boxShadow: 'none', borderRadius: '10px' }} title="Скрыть"><Eye size={15} /></button>}
          {(userRole === 'admin' || userRole === 'creator' || userRole === 'teacher' || userId === quiz.author_id) && <button onClick={() => navigate(`/analytics?id=${quiz.id}`)} style={{ padding: '8px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none', borderRadius: '10px' }} title="Аналитика"><BarChart2 size={15} /></button>}
          <button onClick={() => setSelectedQuiz(quiz)} style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '10px' }}><Play size={15} fill="currentColor" /> Начать</button>
        </div>
      </div>
    </div>
  </div>
));

const SectionContent = React.memo(({ section, profile, searchQuery, isExpanded, onQuizzesChange, setHideModal, setRenamingItem, setSelectedQuiz, setRandomQuizModal }) => {
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
        .select('id, title, section_id, is_hidden, is_verified, sort_order, content, author_id, avg_success_rate, profiles(first_name, last_name, role)')
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
    if ((profile.role === 'teacher' || profile.role === 'editor') && quiz.author_id === profile.id) return true;
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
                  setRenamingItem={setRenamingItem}
                  fetchQuizzes={fetchQuizzes}
                  quizzesLength={quizzes.length}
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
                setHideModal={setHideModal}
                isDimmed={currentDividerHidden}
                quizzesLength={quizzes.length}
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
  onToggle, onQuizzesChange, setHideModal, setRenamingItem, setSelectedQuiz, setRandomQuizModal,
  handleCreateDivider, swapSections, setNewName
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
            <a
              href={section.book_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ padding: '5px', background: 'var(--primary-color)', color: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center' }}
            >
              <Book size={16} />
            </a>
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
          {profile?.role === 'creator' && (
            <div className="flex-center" style={{ gap: '10px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); handleCreateDivider(section.id); }}
                className="flex-center"
                style={{ padding: '5px 12px', fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '8px', border: 'none', boxShadow: 'none', fontWeight: 'bold' }}
              >
                <Plus size={14} style={{ marginRight: '4px' }} /> Разделитель
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setRenamingItem({ id: section.id, name: section.name, type: 'section' }); setNewName(section.name); }}
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
          setRenamingItem={setRenamingItem}
          setSelectedQuiz={setSelectedQuiz}
          setRandomQuizModal={setRandomQuizModal}
        />
      )}
    </div>
  );
});

const CatalogClassRow = React.memo(({
  cls, cIndex, profile, searchQuery, isExpanded, expandedSections,
  onToggle, onSectionToggle, swapClasses, swapSections, handleRenameItem, handleCreateDivider, handleCreateSectionDivider, setNewName,
  onQuizzesChange, setHideModal, setSelectedQuiz, setRandomQuizModal
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
          {profile?.role === 'creator' && !searchQuery && (
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
            {cls.name} <span style={{ fontSize: '0.9rem', opacity: 0.5, marginLeft: '10px' }}>({cls.sections.length} предметов)</span>
          </h3>
          {cls.isEmpty && (
            <span style={{ fontSize: '0.7rem', padding: '4px 10px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold', opacity: 0.6 }}>
              <Clock size={12} /> В РАЗРАБОТКЕ
            </span>
          )}
          {profile?.role === 'creator' && (
            <div className="flex-center" style={{ gap: '10px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); handleRenameItem({ id: cls.id, name: cls.name, type: 'class' }); }}
                style={{ background: 'transparent', color: 'var(--primary-color)', opacity: 0.5, boxShadow: 'none', padding: '5px' }}
                title="Переименовать класс"
              >
                <Pencil size={18} />
              </button>
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
                  {profile?.role === 'creator' && !searchQuery && (
                    <div className="flex-center" style={{ gap: '8px' }}>
                      <div className="flex-center" style={{ gap: '3px' }}>
                        <button onClick={(e) => { e.stopPropagation(); swapSections(cls.id, sIndex, -1, e); }} disabled={sIndex === 0} style={{ padding: '4px', background: 'rgba(0,0,0,0.02)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}><ChevronUp size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); swapSections(cls.id, sIndex, 1, e); }} disabled={sIndex === cls.sections.length - 1} style={{ padding: '4px', background: 'rgba(0,0,0,0.02)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}><ChevronDown size={16} /></button>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleRenameItem({ id: section.id, name: section.name, type: 'section' }); }} style={{ padding: '5px', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}><Pencil size={16} /></button>
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
                setRenamingItem={handleRenameItem}
                setSelectedQuiz={setSelectedQuiz}
                setRandomQuizModal={setRandomQuizModal}
                handleCreateDivider={handleCreateDivider}
                swapSections={swapSections}
                setNewName={setNewName}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});

const QuizCatalog = ({ profile }) => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [dirtySections, setDirtySections] = useState({});

  const [hideModal, setHideModalState] = useState(null);
  const [renamingItem, setRenamingItem] = useState(null);
  const [newName, setNewName] = useState('');
  const [randomQuizModal, setRandomQuizModalState] = useState(null);

  // Stable setters for children
  const setSelectedQuiz = useCallback((v) => setSelectedQuizState(v), []);
  const setHideModal = useCallback((v) => setHideModalState(v), []);
  const setRandomQuizModal = useCallback((v) => setRandomQuizModalState(v), []);

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
      return {
        ...cls,
        sections: clsSections,
        isEmpty: clsSections.length === 0
      };
    });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const isPrivileged = profile?.role === 'admin' || profile?.role === 'creator';

    const [c, s, basicQuizzes] = await Promise.all([
      fetchWithCache('catalog_struct_classes', () => supabase.from('quiz_classes').select('*').order('sort_order', { ascending: true }).then(r => r.data)),
      fetchWithCache('catalog_struct_sections', () => supabase.from('quiz_sections').select('*').order('sort_order', { ascending: true }).then(r => r.data)),
      fetchWithCache(`catalog_struct_quizzes_${isPrivileged ? 'all' : 'visible'}`, () => {
        let quizQuery = supabase.from('quizzes').select('id, section_id, is_hidden, content').eq('is_archived', false);
        if (!isPrivileged) quizQuery = quizQuery.eq('is_hidden', false);
        return quizQuery.then(r => r.data);
      })
    ]);

    if (c && s && basicQuizzes) {
      setClasses(formatClasses(c, s, basicQuizzes));
    }
    setLoading(false);
  }, [profile, formatClasses]);

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
      localStorage.removeItem(`labtest_cache_catalog_quizzes_${hideModal.section_id}`);
      localStorage.removeItem(`labtest_cache_catalog_struct_quizzes_all`);
      localStorage.removeItem(`labtest_cache_catalog_struct_quizzes_visible`);
      setHideModal(null);
      fetchData();
    }
  }, [hideModal, fetchData]);

  const handleCreateDivider = useCallback(async (sId, text = '') => {
    try {
      const { data: q } = await supabase.from('quizzes').select('sort_order').eq('section_id', sId).order('sort_order', { ascending: false }).limit(1);
      const maxOrder = q && q.length > 0 ? q[0].sort_order : -1;
      const { error } = await supabase.from('quizzes').insert({
        title: text || 'Разделитель',
        section_id: sId,
        author_id: profile.id,
        content: { is_divider: true, divider_text: text },
        is_verified: true,
        sort_order: maxOrder + 1
      });
      if (error) throw error;
      localStorage.removeItem(`labtest_cache_catalog_quizzes_${sId}`);
      fetchData();
    } catch (err) { alert(`Ошибка: ${err.message}`); }
  }, [profile?.id, fetchData]);

  const handleCreateClassDivider = useCallback(async () => {
    try {
      const { data: lastCls } = await supabase.from('quiz_classes').select('sort_order').order('sort_order', { ascending: false }).limit(1);
      const maxOrder = lastCls && lastCls.length > 0 ? lastCls[0].sort_order : -1;
      const { error } = await supabase.from('quiz_classes').insert({
        name: 'Новый разделитель',
        is_divider: true,
        sort_order: maxOrder + 1
      });
      if (error) throw error;
      localStorage.removeItem('labtest_cache_catalog_struct_classes');
      fetchData();
    } catch (err) { alert(`Ошибка: ${err.message}`); }
  }, [fetchData]);

  const handleCreateSectionDivider = useCallback(async (classId) => {
    try {
      const { data: lastSec } = await supabase.from('quiz_sections').select('sort_order').eq('class_id', classId).order('sort_order', { ascending: false }).limit(1);
      const maxOrder = lastSec && lastSec.length > 0 ? lastSec[0].sort_order : -1;
      const { error } = await supabase.from('quiz_sections').insert({
        name: 'Новый разделитель предмета',
        class_id: classId,
        is_divider: true,
        sort_order: maxOrder + 1
      });
      if (error) throw error;
      localStorage.removeItem('labtest_cache_catalog_struct_sections');
      fetchData();
    } catch (err) { alert(`Ошибка: ${err.message}`); }
  }, [fetchData]);

  const handleRename = useCallback(async () => {
    if (!renamingItem || !newName.trim()) return;
    if (renamingItem.type === 'quiz') {
      const { error } = await supabase.from('quizzes').update({ title: newName }).eq('id', renamingItem.id);
      if (error) alert('Ошибка переименования: ' + error.message);
      else {
        localStorage.removeItem(`labtest_cache_catalog_struct_quizzes_all`);
        localStorage.removeItem(`labtest_cache_catalog_struct_quizzes_visible`);
        setRenamingItem(null);
        setNewName('');
        fetchData();
      }
      return;
    }
    const table = renamingItem.type === 'class' ? 'quiz_classes' : 'quiz_sections';
    const { error } = await supabase.from(table).update({ name: newName }).eq('id', renamingItem.id);
    if (error) alert('Ошибка переименования: ' + error.message);
    else {
      localStorage.removeItem(renamingItem.type === 'class' ? 'labtest_cache_catalog_struct_classes' : 'labtest_cache_catalog_struct_sections');
      setRenamingItem(null);
      setNewName('');
      fetchData();
    }
  }, [renamingItem, newName, fetchData]);

  const handleRenameItem = useCallback((item) => {
    setRenamingItem(item);
    setNewName(item.name);
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
      <div className="flex-center animate" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
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
          {profile?.role === 'creator' && (
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
        {loading ? <CatalogSkeleton /> : (
          filteredClasses.map((cls, cIndex) => {
            if (cls.is_divider) {
              if (debouncedSearchQuery) return null;
              return (
                <div key={cls.id} className="animate" style={{ padding: '20px 0', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ height: '4px', background: 'var(--primary-color)', width: '40px', borderRadius: '2px' }} />
                  <h3 style={{ fontSize: '1.8rem', fontWeight: '900', margin: 0, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-color)' }}>{cls.name}</h3>
                  <div style={{ height: '1px', background: 'rgba(0,0,0,0.1)', flex: 1 }} />
                  {profile?.role === 'creator' && !debouncedSearchQuery && (
                    <div className="flex-center" style={{ gap: '10px' }}>
                      <button onClick={(e) => swapClasses(cIndex, -1, e)} disabled={cIndex === 0} style={{ padding: '8px', background: 'rgba(0,0,0,0.03)', color: 'var(--primary-color)', borderRadius: '10px', boxShadow: 'none' }}><ChevronUp size={20} /></button>
                      <button onClick={(e) => swapClasses(cIndex, 1, e)} disabled={cIndex === classes.length - 1} style={{ padding: '8px', background: 'rgba(0,0,0,0.03)', color: 'var(--primary-color)', borderRadius: '10px', boxShadow: 'none' }}><ChevronDown size={20} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setRenamingItem({ id: cls.id, name: cls.name, type: 'class' }); setNewName(cls.name); }} style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '10px', boxShadow: 'none' }}><Pencil size={18} /></button>
                      <button onClick={async (e) => { e.stopPropagation(); if (window.confirm('Удалить этот разделитель?')) { await supabase.from('quiz_classes').delete().eq('id', cls.id); fetchData(); } }} style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '10px', boxShadow: 'none' }}><Trash2 size={18} /></button>
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
                handleRenameItem={handleRenameItem}
                handleCreateDivider={handleCreateDivider}
                handleCreateSectionDivider={handleCreateSectionDivider}
                setNewName={setNewName}
                onQuizzesChange={handleQuizzesChange}
                setHideModal={setHideModal}
                setSelectedQuiz={setSelectedQuiz}
                setRandomQuizModal={setRandomQuizModal}
              />
            );
          })
        )}

        {!loading && filteredClasses.length === 0 && (
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
            <button onClick={() => { setHasUnsavedChanges(false); setDirtySections({}); fetchData(); }} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '9px 18px', borderRadius: '30px', boxShadow: 'none', fontSize: '0.9rem' }}>
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
                await fetchData();
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

      {selectedQuiz && (
        <div className="modal-overlay" onClick={() => setSelectedQuiz(null)}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', margin: '0 auto 25px' }}><Award size={32} /></div>
            <h2 style={{ marginBottom: '15px' }}>Вы готовы?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>Начать тест: <br /> <strong>"{selectedQuiz.title}"</strong>.</p>
            <div className="grid-2" style={{ gap: '15px' }}>
              <button onClick={() => setSelectedQuiz(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={() => navigate(`/quiz/${selectedQuiz.id}`)} style={{ padding: '15px', background: 'var(--primary-color)' }}>Начать обучение</button>
            </div>
          </div>
        </div>
      )}

      {randomQuizModal && (
        <div className="modal-overlay" onClick={() => setRandomQuizModal(null)}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()} style={{ width: '450px' }}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)', color: 'var(--primary-color)', margin: '0 auto 25px' }}>
              <Dices size={32} />
            </div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Случайный тест</h2>
            <p style={{ opacity: 0.7, marginBottom: '20px', lineHeight: '1.6', textAlign: 'center' }}>
              Вы выбрали прохождение случайного теста по предмету <br /> <strong>«{randomQuizModal.sectionName}»</strong>.
            </p>
            <div style={{ padding: '15px', background: 'rgba(0,0,0,0.03)', borderRadius: '12px', marginBottom: '30px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.6, display: 'block', marginBottom: '5px' }}>Вам выпал тест:</span>
              <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{randomQuizModal.quiz.title}</span>
            </div>
            <div className="grid-2" style={{ gap: '15px' }}>
              <button onClick={() => setRandomQuizModal(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={() => navigate(`/quiz/${randomQuizModal.quiz.id}`)} style={{ padding: '15px', background: 'linear-gradient(135deg, var(--primary-color) 0%, #a855f7 100%)' }}>Начать обучение</button>
            </div>
          </div>
        </div>
      )}

      {renamingItem && (
        <div className="modal-overlay" onClick={() => setRenamingItem(null)}>
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

      {hideModal && (
        <div className="modal-overlay" onClick={() => setHideModal(null)}>
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
    </div>
  );
};

export default QuizCatalog;