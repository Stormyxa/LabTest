import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, Play, CheckCircle, ChevronDown, ChevronUp, Award, Save, BarChart2, Book, Pencil, Eye, AlertTriangle, Plus, Shield, EyeOff, Trash2 } from 'lucide-react';

const QuizCatalog = ({ profile }) => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [passedQuizzes, setPassedQuizzes] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [expandedClasses, setExpandedClasses] = useState({});
  const [expandedSections, setExpandedSections] = useState({});

  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hideModal, setHideModal] = useState(null); // quiz object
  const [renamingItem, setRenamingItem] = useState(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    const { data: results } = await supabase.from('quiz_results').select('quiz_id, is_passed').eq('user_id', profile.id);
    if (results) {
      const passMap = {};
      results.forEach(r => { passMap[r.quiz_id] = r.is_passed; });
      setPassedQuizzes(passMap);
    }

    const { data: c } = await supabase.from('quiz_classes').select('*').order('sort_order', { ascending: true });
    // Поскольку мы делаем select('*'), book_url подтянется автоматически из таблицы quiz_sections
    const { data: s } = await supabase.from('quiz_sections').select('*').order('sort_order', { ascending: true });
    const { data: q } = await supabase.from('quizzes').select('*, profiles(first_name, last_name, patronymic, role)').eq('is_archived', false).eq('is_hidden', false).order('sort_order', { ascending: true });

    if (c && s && q) {
      const formatted = c.map(cls => ({
        ...cls,
        sections: s.filter(sec => sec.class_id === cls.id).map(sec => ({
          ...sec,
          quizzes: q.filter(quiz => quiz.section_id === sec.id)
        }))
      }));
      setClasses(formatted);

      const initExpC = {}; const initExpS = {};
      formatted.forEach(cls => {
        initExpC[cls.id] = true;
        cls.sections.forEach(sec => initExpS[sec.id] = true);
      });
      setExpandedClasses(initExpC);
      setExpandedSections(initExpS);
    }
    setLoading(false);
  };

  const swapClasses = (index, direction, e) => {
    e.stopPropagation();
    const arr = [...classes];
    if (index + direction < 0 || index + direction >= arr.length) return;
    const temp = arr[index]; arr[index] = arr[index + direction]; arr[index + direction] = temp;
    setClasses(arr.map((x, i) => ({ ...x, sort_order: i })));
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
    newClasses[cIndex].sections = secArr.map((x, i) => ({ ...x, sort_order: i }));
    setClasses(newClasses);
    setHasUnsavedChanges(true);
  };

  const swapQuizzes = (classId, sectionId, index, direction, e, quiz) => {
    e.stopPropagation();
    const isAdminOrCreator = profile?.role === 'admin' || profile?.role === 'creator';
    if (!isAdminOrCreator && quiz?.author_id !== profile?.id) return;
    const newClasses = [...classes];
    const cIndex = newClasses.findIndex(c => c.id === classId);
    if (cIndex === -1) return;

    const sIndex = newClasses[cIndex].sections.findIndex(s => s.id === sectionId);
    if (sIndex === -1) return;

    const qsArr = [...newClasses[cIndex].sections[sIndex].quizzes];
    if (index + direction < 0 || index + direction >= qsArr.length) return;

    const temp = qsArr[index]; qsArr[index] = qsArr[index + direction]; qsArr[index + direction] = temp;
    newClasses[cIndex].sections[sIndex].quizzes = qsArr.map((q, i) => ({ ...q, sort_order: i }));
    setClasses(newClasses);
    setHasUnsavedChanges(true);
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
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  const handleRename = async () => {
    if (!renamingItem || !newName.trim()) return;

    if (renamingItem.type === 'quiz') {
      // Find the quiz to get current content
      let targetQuiz = null;
      for (const c of classes) {
        for (const s of c.sections) {
          const found = s.quizzes.find(q => q.id === renamingItem.id);
          if (found) { targetQuiz = found; break; }
        }
        if (targetQuiz) break;
      }

      const updateData = { title: newName };
      if (targetQuiz?.content?.is_divider) {
        updateData.content = { ...targetQuiz.content, divider_text: newName };
      }

      const { error } = await supabase.from('quizzes').update(updateData).eq('id', renamingItem.id);
      if (error) alert('Ошибка переименования: ' + error.message);
      else {
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
      setRenamingItem(null);
      setNewName('');
      fetchData();
    }
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
    if (profile.role === 'admin' || profile.role === 'creator') return true;
    return (profile.role === 'teacher' || profile.role === 'editor') && quiz.author_id === profile.id;
  };

  const filteredData = classes.map(cls => {
    if (cls.name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery !== '') return cls;

    const filterSections = cls.sections.map(sec => {
      if (sec.name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery !== '') return sec;
      return {
        ...sec,
        quizzes: sec.quizzes.filter(q => q.title.toLowerCase().includes(searchQuery.toLowerCase()))
      };
    }).filter(sec => sec.quizzes.length > 0 || (sec.name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery !== ''));

    return { ...cls, sections: filterSections };
  }).filter(cls => cls.sections.length > 0 || (cls.name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery !== ''));

  if (loading) return <div className="flex-center" style={{ height: '60vh' }}>Загрузка каталога...</div>;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '30px', flexWrap: 'wrap', gap: '20px' }}>
        <h2 style={{ fontSize: '2rem' }}>Каталог тестов</h2>
        <div style={{ position: 'relative', width: '300px' }}>
          <Search size={20} style={{ position: 'absolute', left: '15px', top: '12px', opacity: 0.5 }} />
          <input
            type="text"
            placeholder="Поиск по классам, темам..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '45px' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        {filteredData.map((cls, cIndex) => (
          <div key={cls.id} className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--primary-color)', borderRadius: '24px' }}>

            {/* CLASS FOLDER HEAD */}
            <div
              onClick={() => setExpandedClasses(prev => ({ ...prev, [cls.id]: !prev[cls.id] }))}
              style={{ padding: '20px 30px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '24px 24px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            >
              <div className="flex-center" style={{ gap: '15px' }}>
                {profile?.role === 'creator' && !searchQuery && (
                  <div className="flex-center" style={{ gap: '5px' }}>
                    <button onClick={(e) => swapClasses(cIndex, -1, e)} disabled={cIndex === 0} style={{ padding: '5px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronUp size={20} /></button>
                    <button onClick={(e) => swapClasses(cIndex, 1, e)} disabled={cIndex === classes.length - 1} style={{ padding: '5px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronDown size={20} /></button>
                  </div>
                )}
                <h3 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 'bold' }}>{cls.name} <span style={{ fontSize: '0.9rem', opacity: 0.5, marginLeft: '10px' }}>({cls.sections.length} предметов)</span></h3>
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
              {expandedClasses[cls.id] ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
            </div>

            {expandedClasses[cls.id] && (
              <div className="animate catalog-class-content" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(0,0,0,0.02)' }}>
                {cls.sections.length === 0 ? (
                  <p style={{ opacity: 0.5, textAlign: 'center', padding: '20px' }}>В этом классе пока нет предметов.</p>
                ) : (
                  cls.sections.map((section, sIndex) => (
                    <div key={section.id} className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '20px' }}>
                      {/* SECTION HEAD */}
                    <div 
                      onClick={() => setExpandedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                      className="flex-center catalog-section-head" 
                      style={{ padding: '15px 25px', background: 'rgba(99, 102, 241, 0.04)', borderRadius: '20px 20px 0 0', justifyContent: 'space-between', cursor: 'pointer' }}
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
                            {profile?.role === 'creator' && (
                              <div className="flex-center" style={{ gap: '10px' }}>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleCreateDivider(section.id); }} 
                                  className="flex-center" 
                                  style={{ 
                                    padding: '5px 12px', 
                                    fontSize: '0.75rem', 
                                    background: 'rgba(99, 102, 241, 0.1)', 
                                    color: 'var(--primary-color)', 
                                    borderRadius: '8px',
                                    border: 'none',
                                    boxShadow: 'none',
                                    fontWeight: 'bold'
                                  }}
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
                          {expandedSections[section.id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>

                        {/* QUIZZES */}
                        {expandedSections[section.id] && (
                          <div className="catalog-section-content" style={{ padding: '15px', background: 'rgba(0,0,0,0.02)' }}>
                            {section.quizzes.length === 0 ? (
                              <p style={{ opacity: 0.5, textAlign: 'center', margin: 0 }}>Нет добавленных тестов.</p>
                            ) : (
                              <div className="grid-2" style={{ gap: '15px' }}>
                                {(() => {
                                  let currentDividerHidden = false;
                                  return section.quizzes.map((quiz, qIndex) => {
                                    if (quiz.content?.is_divider) {
                                      currentDividerHidden = quiz.is_hidden;
                                      return (
                                        <div key={quiz.id} className="grid-full" style={{ 
                                          gridColumn: '1 / -1', 
                                          margin: '10px 0',
                                          padding: '10px 0',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '15px'
                                        }}>
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
                                              <button onClick={async (e) => { 
                                                e.stopPropagation(); 
                                                await supabase.from('quizzes').update({ is_hidden: !quiz.is_hidden }).eq('id', quiz.id); 
                                                fetchData(); 
                                              }} style={{ background: 'transparent', color: quiz.is_hidden ? '#ca8a04' : 'inherit', opacity: 0.4, padding: '5px', boxShadow: 'none' }}>
                                                {quiz.is_hidden ? <Shield size={14} /> : <EyeOff size={14} />}
                                              </button>
                                              <button onClick={async (e) => {
                                                e.stopPropagation();
                                                if (confirm('Удалить разделитель?')) {
                                                  await supabase.from('quizzes').delete().eq('id', quiz.id);
                                                  fetchData();
                                                }
                                              }} style={{ background: 'transparent', color: 'red', opacity: 0.4, padding: '5px', boxShadow: 'none' }}><Trash2 size={14} /></button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }

                                    if (currentDividerHidden && profile?.role !== 'creator' && profile?.role !== 'admin') return null;

                                    const passState = passedQuizzes[quiz.id];
                                    const canEdit = canEditQuiz(quiz);
                                    const canMove = canMoveQuiz(quiz);
                                    return (
                                      <div key={quiz.id} className="card" style={{ 
                                        padding: '20px', 
                                        background: 'var(--card-bg)', 
                                        boxShadow: 'var(--soft-shadow)', 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        height: '100%',
                                        opacity: currentDividerHidden ? 0.5 : 1,
                                        border: currentDividerHidden ? '1px dashed #ca8a04' : '1px solid rgba(99, 102, 241, 0.1)'
                                      }}>
                                      <div className="flex-center" style={{ 
                                        justifyContent: 'space-between', 
                                        marginBottom: '15px', 
                                        flexWrap: 'wrap', 
                                        gap: '10px' 
                                      }}>
                                        <div className="flex-center" style={{ gap: '10px', minWidth: '200px', flex: 1 }}>
                                          {canMove && !searchQuery && (
                                            <div className="flex-center" style={{ flexDirection: 'column', gap: '5px' }}>
                                              <button onClick={(e) => swapQuizzes(cls.id, section.id, qIndex, -1, e, quiz)} disabled={qIndex === 0} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronUp size={18} /></button>
                                              <button onClick={(e) => swapQuizzes(cls.id, section.id, qIndex, 1, e, quiz)} disabled={qIndex === section.quizzes.length - 1} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronDown size={18} /></button>
                                            </div>
                                          )}
                                          <h4 style={{ fontSize: '1.1rem', margin: 0, lineHeight: '1.4' }}>
                                            {quiz.title}
                                            {quiz.is_verified && <CheckCircle size={16} color="var(--primary-color)" style={{ marginLeft: '5px', display: 'inline' }} />}
                                          </h4>
                                        </div>
                                        <div style={{ flexShrink: 0 }}>
                                          {passState === true && <span style={{ fontSize: '0.8rem', padding: '6px 16px', background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', borderRadius: '100px', fontWeight: 'bold', whiteSpace: 'nowrap', display: 'inline-block', minWidth: '95px', textAlign: 'center' }}>Пройдено</span>}
                                          {passState === false && <span style={{ fontSize: '0.8rem', padding: '6px 16px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', borderRadius: '100px', fontWeight: 'bold', whiteSpace: 'nowrap', display: 'inline-block', minWidth: '95px', textAlign: 'center' }}>Перепройти</span>}
                                        </div>
                                      </div>

                                      <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '20px' }}>
                                        Автор: {quiz.profiles?.last_name} {quiz.profiles?.first_name}
                                      </p>

                                      <div className="flex-center" style={{ justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
                                        {canEdit && (
                                          <button onClick={() => navigate(`/redactor?id=${quiz.id}`)} style={{ padding: '8px', background: 'rgba(99,102,241,0.08)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '10px' }} title="Редактировать"><Pencil size={15} /></button>
                                        )}
                                        {canEdit && (
                                          <button onClick={() => setHideModal(quiz)} style={{ padding: '8px', background: 'rgba(250,204,21,0.08)', color: '#ca8a04', boxShadow: 'none', borderRadius: '10px' }} title="Скрыть тест"><Eye size={15} /></button>
                                        )}
                                        {(profile?.role === 'admin' || profile?.role === 'creator' || profile?.role === 'teacher' || profile?.id === quiz.author_id) && (
                                          <button onClick={() => navigate(`/analytics?id=${quiz.id}`)} style={{ padding: '8px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none', borderRadius: '10px' }} title="Аналитика"><BarChart2 size={15} /></button>
                                        )}
                                        <button onClick={() => setSelectedQuiz(quiz)} style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '10px' }}><Play size={15} fill="currentColor" /> Начать</button>
                                      </div>
                                    </div>
                                  );
                                  });
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}

        {filteredData.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
            <h3>Ничего не найдено</h3>
            <p style={{ opacity: 0.6 }}>Попробуйте изменить поисковый запрос.</p>
          </div>
        )}
      </div>

      {hasUnsavedChanges && (
        <div className="animate" style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--card-bg)', padding: '15px 25px', borderRadius: '50px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 1000 }}>
          <span style={{ fontWeight: '500' }}>Порядок изменён</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setHasUnsavedChanges(false); fetchData(); }} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '8px 15px', borderRadius: '30px', boxShadow: 'none', fontSize: '0.9rem' }}>Отмена</button>
            <button onClick={async () => {
              setLoading(true);
              for (const c of classes) {
                await supabase.from('quiz_classes').update({ sort_order: c.sort_order }).eq('id', c.id);
                for (const s of c.sections) {
                  await supabase.from('quiz_sections').update({ sort_order: s.sort_order }).eq('id', s.id);
                  for (const q of s.quizzes) {
                    await supabase.from('quizzes').update({ sort_order: q.sort_order }).eq('id', q.id);
                  }
                }
              }
              setHasUnsavedChanges(false);
              fetchData();
            }} style={{ padding: '8px 15px', borderRadius: '30px', fontSize: '0.9rem' }} className="flex-center">
              <Save size={16} style={{ marginRight: '5px' }} /> Сохранить порядок
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button onClick={() => setSelectedQuiz(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={() => navigate(`/quiz/${selectedQuiz.id}`)} style={{ padding: '15px' }}>Начать обучение</button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА ПЕРЕИМЕНОВАНИЯ КЛАССА / СЕКЦИИ */}
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

  // ─── Hide quiz modal ──────────────────────────────────────────────
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