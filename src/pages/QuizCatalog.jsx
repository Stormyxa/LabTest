import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, Play, CheckCircle, ChevronDown, ChevronUp, Award, Save, BarChart2 } from 'lucide-react';

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
    const { data: s } = await supabase.from('quiz_sections').select('*').order('sort_order', { ascending: true });
    const { data: q } = await supabase.from('quizzes').select('*, profiles(first_name, last_name, patronymic)').eq('is_archived', false).order('sort_order', { ascending: true });
    
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
    if(cIndex === -1) return;
    
    const secArr = [...newClasses[cIndex].sections];
    if (index + direction < 0 || index + direction >= secArr.length) return;
    
    const temp = secArr[index]; secArr[index] = secArr[index + direction]; secArr[index + direction] = temp;
    newClasses[cIndex].sections = secArr.map((x, i) => ({ ...x, sort_order: i }));
    setClasses(newClasses);
    setHasUnsavedChanges(true);
  };

  const swapQuizzes = (classId, sectionId, index, direction, e) => {
    e.stopPropagation();
    const newClasses = [...classes];
    const cIndex = newClasses.findIndex(c => c.id === classId);
    if(cIndex === -1) return;
    
    const sIndex = newClasses[cIndex].sections.findIndex(s => s.id === sectionId);
    if(sIndex === -1) return;
    
    const qsArr = [...newClasses[cIndex].sections[sIndex].quizzes];
    if (index + direction < 0 || index + direction >= qsArr.length) return;
    
    const temp = qsArr[index]; qsArr[index] = qsArr[index + direction]; qsArr[index + direction] = temp;
    newClasses[cIndex].sections[sIndex].quizzes = qsArr.map((q, i) => ({ ...q, sort_order: i }));
    setClasses(newClasses);
    setHasUnsavedChanges(true);
  };

  const filteredData = classes.map(cls => {
    if (cls.name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery !== '') return cls;
    
    const filterSections = cls.sections.map(sec => {
      if(sec.name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery !== '') return sec;
      return {
        ...sec,
        quizzes: sec.quizzes.filter(q => q.title.toLowerCase().includes(searchQuery.toLowerCase()))
      };
    }).filter(sec => sec.quizzes.length > 0 || (sec.name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery !== ''));
    
    return { ...cls, sections: filterSections };
  }).filter(cls => cls.sections.length > 0 || (cls.name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery !== ''));


  if (loading) return <div className="flex-center" style={{height: '60vh'}}>Загрузка каталога...</div>;

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
          <div key={cls.id} className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--primary-color)' }}>
            
            {/* CLASS FOLDER HEAD */}
            <div 
              onClick={() => setExpandedClasses(prev => ({...prev, [cls.id]: !prev[cls.id]}))}
              style={{ padding: '20px 30px', background: 'rgba(99, 102, 241, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            >
              <div className="flex-center" style={{ gap: '15px' }}>
                {profile?.role === 'creator' && !searchQuery && (
                  <div className="flex-center" style={{ gap: '5px' }}>
                    <button onClick={(e) => swapClasses(cIndex, -1, e)} disabled={cIndex === 0} style={{ padding: '5px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronUp size={20}/></button>
                    <button onClick={(e) => swapClasses(cIndex, 1, e)} disabled={cIndex === classes.length-1} style={{ padding: '5px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronDown size={20}/></button>
                  </div>
                )}
                <h3 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 'bold' }}>{cls.name} <span style={{fontSize: '0.9rem', opacity: 0.5, marginLeft: '10px'}}>({cls.sections.length} предметов)</span></h3>
              </div>
              {expandedClasses[cls.id] ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
            </div>
            
            {expandedClasses[cls.id] && (
              <div style={{ padding: '20px' }}>
                {cls.sections.length === 0 ? (
                  <p style={{ opacity: 0.5, textAlign: 'center', padding: '20px' }}>В этом классе пока нет предметов.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {cls.sections.map((section, sIndex) => (
                      <div key={section.id} style={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: '15px', overflow: 'hidden' }}>
                        
                        {/* SECTION HEAD */}
                        <div 
                          onClick={() => setExpandedSections(prev => ({...prev, [section.id]: !prev[section.id]}))}
                          style={{ padding: '15px 20px', background: 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                        >
                          <div className="flex-center" style={{ gap: '15px' }}>
                            {(profile?.role === 'admin' || profile?.role === 'creator') && !searchQuery && (
                              <div className="flex-center" style={{ gap: '5px' }}>
                                <button onClick={(e) => swapSections(cls.id, sIndex, -1, e)} disabled={sIndex === 0} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronUp size={16}/></button>
                                <button onClick={(e) => swapSections(cls.id, sIndex, 1, e)} disabled={sIndex === cls.sections.length-1} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronDown size={16}/></button>
                              </div>
                            )}
                            <h4 style={{ fontSize: '1.2rem', margin: 0 }}>{section.name} <span style={{opacity: 0.5, fontSize: '0.9rem', marginLeft: '5px'}}>({section.quizzes.length})</span></h4>
                          </div>
                          {expandedSections[section.id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>

                        {/* QUIZZES */}
                        {expandedSections[section.id] && (
                          <div style={{ padding: '15px', background: 'rgba(0,0,0,0.02)' }}>
                            {section.quizzes.length === 0 ? (
                              <p style={{ opacity: 0.5, textAlign: 'center', margin: 0 }}>Нет добавленных тестов.</p>
                            ) : (
                              <div className="grid-2" style={{ gap: '15px' }}>
                                {section.quizzes.map((quiz, qIndex) => {
                                  const passState = passedQuizzes[quiz.id];
                                  return (
                                    <div key={quiz.id} className="card" style={{ padding: '20px', background: 'var(--card-bg)', boxShadow: 'none' }}>
                                      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px' }}>
                                        <div className="flex-center" style={{ gap: '10px' }}>
                                          {(profile?.role === 'admin' || profile?.role === 'creator') && !searchQuery && (
                                            <div className="flex-center" style={{ flexDirection: 'column', gap: '5px' }}>
                                              <button onClick={(e) => swapQuizzes(cls.id, section.id, qIndex, -1, e)} disabled={qIndex === 0} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronUp size={18}/></button>
                                              <button onClick={(e) => swapQuizzes(cls.id, section.id, qIndex, 1, e)} disabled={qIndex === section.quizzes.length-1} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronDown size={18}/></button>
                                            </div>
                                          )}
                                          <h4 style={{ fontSize: '1.1rem', margin: 0 }}>
                                            {quiz.title} 
                                            {quiz.is_verified && <CheckCircle size={16} color="var(--primary-color)" style={{marginLeft: '5px', display: 'inline'}} />}
                                          </h4>
                                        </div>
                                        {passState === true && <span style={{ fontSize: '0.75rem', padding: '4px 10px', background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', borderRadius: '100px', fontWeight: 'bold' }}>Пройдено</span>}
                                        {passState === false && <span style={{ fontSize: '0.75rem', padding: '4px 10px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', borderRadius: '100px', fontWeight: 'bold' }}>Перепройти</span>}
                                      </div>
                                      
                                      <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '20px' }}>
                                        Автор: {quiz.profiles?.last_name} {quiz.profiles?.first_name}
                                      </p>
                                      
                                      <div className="flex-center" style={{ justifyContent: 'flex-end', gap: '10px' }}>
                                        {(profile?.role === 'admin' || profile?.role === 'creator' || profile?.id === quiz.author_id) && (
                                          <button onClick={() => navigate(`/analytics?id=${quiz.id}`)} style={{ padding: '8px 15px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }} title="Аналитика"><BarChart2 size={16} /></button>
                                        )}
                                        <button onClick={() => setSelectedQuiz(quiz)} style={{ padding: '8px 25px', display: 'flex', alignItems: 'center', gap: '8px' }}><Play size={16} fill="currentColor" /> Начать</button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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
              <Save size={16} style={{marginRight: '5px'}}/> Сохранить порядок
            </button>
          </div>
        </div>
      )}

      {selectedQuiz && (
        <div className="modal-overlay" onClick={() => setSelectedQuiz(null)}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', margin: '0 auto 25px' }}><Award size={32} /></div>
            <h2 style={{ marginBottom: '15px' }}>Вы готовы?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>Начать тест: <br/> <strong>"{selectedQuiz.title}"</strong>.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button onClick={() => setSelectedQuiz(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={() => navigate(`/quiz/${selectedQuiz.id}`)} style={{ padding: '15px' }}>Начать обучение</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizCatalog;
