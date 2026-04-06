import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, Play, CheckCircle, ChevronDown, ChevronUp, Award, Save, BarChart2, Book, Pencil, Eye, AlertTriangle, Plus, Shield, EyeOff, Trash2, Dices, Clock, TrendingUp } from 'lucide-react';
import { useScrollRestoration } from '../lib/useScrollRestoration';

const QuizCatalog = ({ profile }) => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [passedQuizzes, setPassedQuizzes] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [quizStats, setQuizStats] = useState({}); // { quiz_id: { avgScore, participants } }

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
    localStorage.setItem('catalog_expanded_classes_v2', JSON.stringify(expandedClasses));
  }, [expandedClasses]);

  useEffect(() => {
    localStorage.setItem('catalog_expanded_sections_v2', JSON.stringify(expandedSections));
  }, [expandedSections]);

  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hideModal, setHideModal] = useState(null); // quiz object
  const [renamingItem, setRenamingItem] = useState(null);
  const [newName, setNewName] = useState('');
  const [randomQuizModal, setRandomQuizModal] = useState(null); // { sectionName, quiz }

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    const { data: results } = await supabase.from('quiz_results').select('quiz_id, is_passed, score, total_questions').eq('user_id', profile.id);
    if (results) {
      const passMap = {};
      results.forEach(r => { 
        passMap[r.quiz_id] = { is_passed: r.is_passed, score: r.score, total: r.total_questions }; 
      });
      setPassedQuizzes(passMap);
    }

    const { data: c } = await supabase.from('quiz_classes').select('*').order('sort_order', { ascending: true });
    const { data: s } = await supabase.from('quiz_sections').select('*').order('sort_order', { ascending: true });
    const isPrivileged = profile?.role === 'admin' || profile?.role === 'creator';
    let quizQuery = supabase.from('quizzes')
      .select('*, profiles(first_name, last_name, patronymic, role)')
      .eq('is_archived', false)
      .order('sort_order', { ascending: true });

    if (!isPrivileged) {
      quizQuery = quizQuery.eq('is_hidden', false);
    }
    const { data: q } = await quizQuery;

    if (c && s && q) {
      // Calculate global stats for each quiz (EXCLUDING OBSERVERS)
      const { data: allResults } = await supabase
        .from('quiz_results')
        .select('quiz_id, score, total_questions, profiles!inner(is_observer)')
        .eq('profiles.is_observer', false);
        
      const statsMap = {};
      if (allResults) {
        allResults.forEach(r => {
          if (!statsMap[r.quiz_id]) statsMap[r.quiz_id] = { earned: 0, total: 0, participants: 0 };
          statsMap[r.quiz_id].earned += r.score;
          statsMap[r.quiz_id].total += r.total_questions;
          statsMap[r.quiz_id].participants += 1;
        });
      }
      const finalStats = {};
      Object.keys(statsMap).forEach(id => {
        finalStats[id] = {
          avgScore: statsMap[id].total > 0 ? Math.round((statsMap[id].earned / statsMap[id].total) * 100) : 0,
          participants: statsMap[id].participants
        };
      });
      setQuizStats(finalStats);

      const formatted = c.map(cls => ({
        ...cls,
        sections: s.filter(sec => sec.class_id === cls.id).map(sec => ({
          ...sec,
          quizzes: q.filter(quiz => quiz.section_id === sec.id)
        }))
      }));
      setClasses(formatted);
    }
    setLoading(false);
  };

  const swapClasses = (index, direction, e) => {
    e.stopPropagation();
    const arr = [...classes];
    if (index + direction < 0 || index + direction >= arr.length) return;
    const temp = arr[index]; arr[index] = arr[index + direction]; arr[index + direction] = temp;
    setClasses(arr.map((x, i) => ({ ...x, sort_order: i, is_dirty: true })));
    setHasUnsavedChanges(true);
  };

  const swapSections = (classId, index, direction, e) => {
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
  };

  const swapQuizzes = (classId, sectionId, index, direction, e, quiz) => {
    e.stopPropagation();
    if (!canMoveQuiz(quiz)) return;
    const newClasses = [...classes];
    const cIndex = newClasses.findIndex(c => c.id === classId);
    if (cIndex === -1) return;
    const sIndex = newClasses[cIndex].sections.findIndex(s => s.id === sectionId);
    if (sIndex === -1) return;
    const qsArr = [...newClasses[cIndex].sections[sIndex].quizzes];
    if (index + direction < 0 || index + direction >= qsArr.length) return;
    const temp = qsArr[index]; qsArr[index] = qsArr[index + direction]; qsArr[index + direction] = temp;
    newClasses[cIndex].sections[sIndex].quizzes = qsArr.map((q, i) => ({ ...q, sort_order: i, is_dirty: true }));
    React.startTransition(() => {
      setClasses(newClasses);
      setHasUnsavedChanges(true);
    });
  };

  const handleHideQuiz = async () => {
    if (!hideModal) return;
    const { error } = await supabase.from('quizzes').update({ is_hidden: true }).eq('id', hideModal.id);
    if (error) alert('Ошибка: ' + error.message);
    else { setHideModal(null); fetchData(); }
  };

  const handleCreateDivider = async (sId, text = '') => {
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
      fetchData();
    } catch (err) { alert(`Ошибка: ${err.message}`); }
  };

  const handleRename = async () => {
    if (!renamingItem || !newName.trim()) return;
    if (renamingItem.type === 'quiz') {
      let targetQuiz = null;
      for (const c of classes) {
        for (const s of c.sections) {
          const found = s.quizzes.find(q => q.id === renamingItem.id);
          if (found) { targetQuiz = found; break; }
        }
        if (targetQuiz) break;
      }
      const updateData = { title: newName };
      if (targetQuiz?.content?.is_divider) { updateData.content = { ...targetQuiz.content, divider_text: newName }; }
      const { error } = await supabase.from('quizzes').update(updateData).eq('id', renamingItem.id);
      if (error) alert('Ошибка переименования: ' + error.message);
      else { setRenamingItem(null); setNewName(''); fetchData(); }
      return;
    }
    const table = renamingItem.type === 'class' ? 'quiz_classes' : 'quiz_sections';
    const { error } = await supabase.from(table).update({ name: newName }).eq('id', renamingItem.id);
    if (error) alert('Ошибка переименования: ' + error.message);
    else { setRenamingItem(null); setNewName(''); fetchData(); }
  };

  const handleStartRandomQuiz = (e, section) => {
    e?.stopPropagation?.();
    const validQuizzes = section.quizzes.filter(q => !q.content?.is_divider && !q.is_hidden);
    if (validQuizzes.length === 0) return alert('В этом предмете нет доступных тестов для прохождения.');
    const randomQuiz = validQuizzes[Math.floor(Math.random() * validQuizzes.length)];
    setRandomQuizModal({ sectionName: section.name, quiz: randomQuiz });
  };

  const canEditQuiz = (quiz) => {
    if (!profile) return false;
    if (profile.role === 'creator') return true;
    if (profile.role === 'admin' && quiz.profiles?.role !== 'creator') return true;
    if ((profile.role === 'teacher' || profile.role === 'editor') && quiz.author_id === profile.id) return true;
    return false;
  };
  const canMoveQuiz = (quiz) => {
    if (!profile) return false;
    if (profile.role === 'creator') return true;
    if (profile.role === 'admin' && quiz.profiles?.role !== 'creator') return true;
    if ((profile.role === 'teacher' || profile.role === 'editor') && quiz.author_id === profile.id) return true;
    return false;
  };

  const filteredData = React.useMemo(() => {
    if (!searchQuery) return classes;
    const query = searchQuery.toLowerCase();
    return classes.map(cls => ({
      ...cls,
      sections: cls.sections.map(sec => ({
        ...sec,
        quizzes: sec.quizzes.filter(quiz => quiz.title.toLowerCase().includes(query))
      })).filter(sec => sec.quizzes.length > 0 || sec.name.toLowerCase().includes(query))
    })).filter(cls => cls.sections.length > 0 || cls.name.toLowerCase().includes(query));
  }, [classes, searchQuery]);

  const CatalogSkeleton = () => (
    <div style={{ width: '100%' }}>
      <div className="flex-center" style={{ marginBottom: '20px', opacity: 0.5, gap: '10px' }}>
        <Clock size={18} className="skeleton-pulse" />
        <span className="skeleton-text" style={{ width: '100px', height: '14px' }}>Загрузка элементов...</span>
      </div>
      {[1, 2].map(i => (
        <div key={i} className="card" style={{ marginBottom: '30px', padding: '0', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)', opacity: 0.6 }}>
          <div className="skeleton" style={{ height: '70px', width: '100%' }} />
          <div style={{ padding: '25px' }}>
            <div className="skeleton-text skeleton" style={{ width: '180px', height: '24px', marginBottom: '25px' }} />
            <div className="grid-2">
              {[1, 2, 3, 4].map(j => (
                <div key={j} className="skeleton-card skeleton" style={{ height: '120px' }} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div className="flex-center animate" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-1px', margin: 0 }}>Каталог тестов</h2>
          <p style={{ opacity: 0.6, marginTop: '5px' }}>Выберите предмет и начните обучение</p>
        </div>
        <div style={{ position: 'relative', maxWidth: '400px', width: '100%' }}>
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
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        {loading ? (
          <CatalogSkeleton />
        ) : (
          filteredData.map((cls, cIndex) => {
            // Updated Locking Logic: Only lock if ALL sections are empty
            const isEmptyClass = cls.sections.length === 0 || cls.sections.every(sec =>
              sec.quizzes.filter(q => !q.content?.is_divider).length === 0
            );
            return (
              <div key={cls.id} className="catalog-container" style={{
                padding: '0',
                overflow: 'hidden',
                border: isEmptyClass ? '1px dashed rgba(0,0,0,0.1)' : '1px solid var(--border-color)',
                borderRadius: '24px',
                opacity: isEmptyClass ? 0.6 : 1
              }}>
                <div
                  onClick={() => (!isEmptyClass || profile?.role === 'creator') && setExpandedClasses(prev => ({ ...prev, [cls.id]: !prev[cls.id] }))}
                  style={{
                    padding: '20px 30px',
                    background: isEmptyClass ? 'rgba(0,0,0,0.02)' : 'rgba(99, 102, 241, 0.08)',
                    borderRadius: '24px 24px 0 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: (!isEmptyClass || profile?.role === 'creator') ? 'pointer' : 'default'
                  }}
                >
                  <div className="flex-center" style={{ gap: '15px' }}>
                    {profile?.role === 'creator' && !searchQuery && (
                      <div className="flex-center" style={{ gap: '5px' }}>
                        <button onClick={(e) => swapClasses(cIndex, -1, e)} disabled={cIndex === 0} style={{ padding: '5px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronUp size={20} /></button>
                        <button onClick={(e) => swapClasses(cIndex, 1, e)} disabled={cIndex === classes.length - 1} style={{ padding: '5px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronDown size={20} /></button>
                      </div>
                    )}
                    <h3 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 'bold' }}>{cls.name} <span style={{ fontSize: '0.9rem', opacity: 0.5, marginLeft: '10px' }}>({cls.sections.length} предметов)</span></h3>
                    {isEmptyClass && (
                      <span style={{ fontSize: '0.7rem', padding: '4px 10px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold', opacity: 0.6 }}>
                        <Clock size={12} /> В РАЗРАБОТКЕ
                      </span>
                    )}
                    {profile?.role === 'creator' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenamingItem({ id: cls.id, name: cls.name, type: 'class' }); setNewName(cls.name); }}
                        style={{ background: 'transparent', color: 'var(--primary-color)', opacity: 0.5, boxShadow: 'none', padding: '5px' }}
                        title="Переименовать класс"
                      >
                        <Pencil size={18} />
                      </button>
                    )}
                  </div>
                  {(!isEmptyClass || profile?.role === 'creator') && (expandedClasses[cls.id] ? <ChevronUp size={24} /> : <ChevronDown size={24} />)}
                </div>

                {expandedClasses[cls.id] && (!isEmptyClass || profile?.role === 'creator') && (
                  <div className="animate catalog-class-content" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(0,0,0,0.02)' }}>
                    {cls.sections.map((section, sIndex) => {
                      const isEmptySection = section.quizzes.filter(q => !q.content?.is_divider).length === 0;
                      return (
                        <div key={section.id} className="catalog-container" style={{
                          padding: '0',
                          overflow: 'hidden',
                          border: isEmptySection ? '1px dashed rgba(0,0,0,0.1)' : '1px solid rgba(0,0,0,0.05)',
                          borderRadius: '20px',
                          opacity: isEmptySection ? 0.5 : 1
                        }}>
                          <div
                            onClick={() => (!isEmptySection || profile?.role === 'creator') && setExpandedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                            className="flex-center catalog-section-head"
                            style={{
                              padding: '15px 25px',
                              background: isEmptySection ? 'transparent' : 'rgba(99, 102, 241, 0.04)',
                              borderRadius: '20px 20px 0 0',
                              justifyContent: 'space-between',
                              cursor: (!isEmptySection || profile?.role === 'creator') ? 'pointer' : 'default'
                            }}
                          >
                            <div className="flex-center" style={{ gap: '15px' }}>
                              {(profile?.role === 'admin' || profile?.role === 'creator') && !searchQuery && (
                                <div className="flex-center" style={{ gap: '5px' }}>
                                  <button onClick={(e) => swapSections(cls.id, sIndex, -1, e)} disabled={sIndex === 0} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronUp size={16} /></button>
                                  <button onClick={(e) => swapSections(cls.id, sIndex, 1, e)} disabled={sIndex === cls.sections.length - 1} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronDown size={16} /></button>
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
                              <h4 style={{ fontSize: '1.2rem', margin: 0 }}>{section.name} <span style={{ opacity: 0.5, fontSize: '0.9rem', marginLeft: '5px' }}>({section.quizzes.filter(q => !q.content?.is_divider).length})</span></h4>
                              {isEmptySection && (
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
                            {(!isEmptySection || profile?.role === 'creator') && (expandedSections[section.id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />)}
                          </div>

                          {expandedSections[section.id] && (!isEmptySection || profile?.role === 'creator') && (
                            <div className="catalog-section-content" style={{ padding: '15px', background: 'rgba(0,0,0,0.02)' }}>
                              {section.quizzes.filter(q => !q.content?.is_divider).length > 0 && (
                                <button
                                  onClick={(e) => handleStartRandomQuiz(e, section)}
                                  className="flex-center animate"
                                  style={{ width: '100%', padding: '15px', marginBottom: '20px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)', color: 'var(--primary-color)', borderRadius: '16px', border: '1px solid rgba(99, 102, 241, 0.2)', boxShadow: 'none', fontWeight: 'bold', fontSize: '1.05rem', gap: '10px' }}
                                >
                                  <Dices size={20} /> Случайный тест по предмету
                                </button>
                              )}
                              <div className="grid-2" style={{ gap: '15px' }}>
                                {(() => {
                                  let currentDividerHidden = false;
                                  return section.quizzes.map((quiz, qIndex) => {
                                    if (quiz.content?.is_divider) {
                                      currentDividerHidden = quiz.is_hidden;
                                      return (
                                        <div key={quiz.id} className="grid-full animate" style={{ gridColumn: '1 / -1', margin: '10px 0', padding: '10px 0', display: 'flex', alignItems: 'center', gap: '15px' }}>
                                          <div className="flex-center" style={{ gap: '15px' }}>
                                            {profile?.role === 'creator' && !searchQuery && (
                                              <div className="flex-center" style={{ flexDirection: 'column', gap: '2px' }}>
                                                <button onClick={(e) => swapQuizzes(cls.id, section.id, qIndex, -1, e, quiz)} disabled={qIndex === 0} style={{ padding: '0', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronUp size={14} /></button>
                                                <button onClick={(e) => swapQuizzes(cls.id, section.id, qIndex, 1, e, quiz)} disabled={qIndex === section.quizzes.length - 1} style={{ padding: '0', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronDown size={14} /></button>
                                              </div>
                                            )}
                                            <div style={{ height: '1px', background: 'rgba(99, 102, 241, 0.2)', width: '20px' }} />
                                          </div>
                                          <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--primary-color)', opacity: quiz.is_hidden ? 0.5 : 1 }}>
                                            {quiz.content.divider_text || ''}
                                            {quiz.is_hidden && <Shield size={14} style={{ marginLeft: '8px', verticalAlign: 'middle' }} />}
                                          </span>
                                          <div style={{ height: '1px', background: 'rgba(99, 102, 241, 0.2)', flex: 1 }} />
                                          {profile?.role === 'creator' && (
                                            <div className="flex-center" style={{ gap: '5px' }}>
                                              <button onClick={(e) => { e.stopPropagation(); setRenamingItem({ id: quiz.id, name: quiz.title, type: 'quiz' }); setNewName(quiz.title); }} style={{ background: 'transparent', color: 'var(--primary-color)', opacity: 0.4, padding: '5px', boxShadow: 'none' }}><Pencil size={14} /></button>
                                              <button onClick={async (e) => { e.stopPropagation(); await supabase.from('quizzes').update({ is_hidden: !quiz.is_hidden }).eq('id', quiz.id); fetchData(); }} style={{ background: 'transparent', color: quiz.is_hidden ? '#ca8a04' : 'inherit', opacity: 0.4, padding: '5px', boxShadow: 'none' }}>
                                                {quiz.is_hidden ? <Shield size={14} /> : <EyeOff size={14} />}
                                              </button>
                                              <button onClick={async (e) => { e.stopPropagation(); if (confirm('Удалить разделитель?')) { await supabase.from('quizzes').delete().eq('id', quiz.id); fetchData(); } }} style={{ background: 'transparent', color: 'red', opacity: 0.4, padding: '5px', boxShadow: 'none' }}><Trash2 size={14} /></button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }
                                    if (currentDividerHidden && profile?.role !== 'creator' && profile?.role !== 'admin') return null;
                                    const passState = passedQuizzes[quiz.id];
                                    return (
                                      <div key={quiz.id} className="card animate" style={{ padding: '20px', background: 'var(--card-bg)', boxShadow: 'var(--soft-shadow)', display: 'flex', flexDirection: 'column', height: '100%', opacity: currentDividerHidden ? 0.5 : 1, border: currentDividerHidden ? '1px dashed #ca8a04' : '1px solid rgba(99, 102, 241, 0.1)', position: 'relative' }}>
                                        {canMoveQuiz(quiz) && !searchQuery && (
                                          <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', gap: '5px', zIndex: 10 }}>
                                            <button onClick={(e) => swapQuizzes(cls.id, section.id, qIndex, -1, e, quiz)} disabled={qIndex === 0} style={{ padding: '4px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '8px' }} title="Переместить левее"><ChevronUp size={16} /></button>
                                            <button onClick={(e) => swapQuizzes(cls.id, section.id, qIndex, 1, e, quiz)} disabled={qIndex === section.quizzes.length - 1} style={{ padding: '4px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '8px' }} title="Переместить правее"><ChevronDown size={16} /></button>
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
                                              {passState !== undefined && (
                                                <div className="flex-center" style={{ gap: '6px', fontSize: '0.8rem', background: passState.is_passed ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)', color: passState.is_passed ? '#4ade80' : '#f87171', borderRadius: '10px', padding: '6px 12px', fontWeight: 'bold' }}>
                                                   {passState.score}/{passState.total} ({Math.round((passState.score / passState.total) * 100)}%)
                                                </div>
                                              )}
                                              {quizStats[quiz.id] && (
                                                <div className="flex-center" style={{ gap: '6px', fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 'bold', background: 'rgba(99, 102, 241, 0.05)', padding: '6px 12px', borderRadius: '10px' }} title="Общая успеваемость учеников (без учета наблюдателей)">
                                                  <TrendingUp size={14} /> {quizStats[quiz.id].avgScore}% успех
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex-center" style={{ gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
                                              {canEditQuiz(quiz) && <button onClick={() => navigate(`/redactor?id=${quiz.id}`)} style={{ padding: '8px', background: 'rgba(99,102,241,0.08)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '10px' }} title="Редактировать"><Pencil size={15} /></button>}
                                              {canEditQuiz(quiz) && <button onClick={() => setHideModal(quiz)} style={{ padding: '8px', background: 'rgba(250,204,21,0.08)', color: '#ca8a04', boxShadow: 'none', borderRadius: '10px' }} title="Скрыть"><Eye size={15} /></button>}
                                              {(profile?.role === 'admin' || profile?.role === 'creator' || profile?.role === 'teacher' || profile?.id === quiz.author_id) && <button onClick={() => navigate(`/analytics?id=${quiz.id}`)} style={{ padding: '8px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none', borderRadius: '10px' }} title="Аналитика"><BarChart2 size={15} /></button>}
                                              <button onClick={() => setSelectedQuiz(quiz)} style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '10px' }}><Play size={15} fill="currentColor" /> Начать</button>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}

        {!loading && filteredData.length === 0 && (
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
            <button onClick={() => { setHasUnsavedChanges(false); fetchData(); }} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '9px 18px', borderRadius: '30px', boxShadow: 'none', fontSize: '0.9rem' }}>
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
                    for (const q of s.quizzes) {
                      if (q.is_dirty) updates.push(supabase.from('quizzes').update({ sort_order: q.sort_order }).eq('id', q.id));
                    }
                  }
                }
                await Promise.all(updates);
                await fetchData();
              } catch (e) {
                console.error(e);
              } finally {
                setLoading(false);
              }
            }} style={{ padding: '9px 22px', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '600' }} className="flex-center">
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
              <button onClick={() => navigate(`/quiz/${selectedQuiz.id}`)} style={{ padding: '15px' }}>Начать обучение</button>
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

      {hideModal && <HideModal />}
    </div>
  );

  function HideModal() {
    if (!hideModal) return null;
    return (
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
    );
  }

};

export default QuizCatalog;