import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, Play, Edit2, CheckCircle, ChevronDown, ChevronUp, Clock, Award, X } from 'lucide-react';

const QuizCatalog = ({ profile }) => {
  const navigate = useNavigate();
  const [sections, setSections] = useState([]);
  const [passedQuizzes, setPassedQuizzes] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState({});
  const [selectedQuiz, setSelectedQuiz] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch passed quizzes for this user
    const { data: results } = await supabase
      .from('quiz_results')
      .select('quiz_id')
      .eq('user_id', profile.id)
      .eq('is_passed', true);
    
    if (results) {
      setPassedQuizzes(new Set(results.map(r => r.quiz_id)));
    }

    // Fetch sections and nested quizzes
    const { data: sectionsData } = await supabase.from('quiz_sections').select('*').order('sort_order', { ascending: true });
    const { data: quizzesData } = await supabase.from('quizzes').select('*, profiles(first_name, last_name, patronymic)').eq('is_archived', false).order('sort_order', { ascending: true });
    
    if (sectionsData) {
      const formatted = sectionsData.map(section => ({
        ...section,
        quizzes: quizzesData?.filter(q => q.section_id === section.id) || []
      }));
      setSections(formatted);
      
      const initialExpanded = {};
      formatted.forEach(s => initialExpanded[s.id] = true);
      setExpandedSections(initialExpanded);
    }
    setLoading(false);
  };

  const toggleSection = (id) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredSections = sections.map(section => ({
    ...section,
    quizzes: section.quizzes.filter(q => 
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      section.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(s => s.quizzes.length > 0 || (s.name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery !== ''));

  if (loading) return <div className="flex-center" style={{height: '60vh'}}>Загрузка каталога...</div>;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '30px', flexWrap: 'wrap', gap: '20px' }}>
        <h2 style={{ fontSize: '2rem' }}>Каталог тестов</h2>
        <div style={{ position: 'relative', width: '300px' }}>
          <Search size={20} style={{ position: 'absolute', left: '15px', top: '12px', opacity: 0.5 }} />
          <input 
            type="text" 
            placeholder="Поиск теста или секции..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '45px' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
        {filteredSections.map(section => (
          <div key={section.id} className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div 
              onClick={() => toggleSection(section.id)}
              style={{ padding: '20px 30px', background: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            >
              <h3 style={{ fontSize: '1.2rem', opacity: 0.8 }}>{section.name} <span style={{fontSize: '0.9rem', opacity: 0.5, marginLeft: '10px'}}>({section.quizzes.length})</span></h3>
              {expandedSections[section.id] ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
            </div>
            
            {expandedSections[section.id] && (
              <div style={{ padding: '20px' }}>
                {section.quizzes.length === 0 ? (
                  <p style={{ opacity: 0.5, textAlign: 'center', padding: '20px' }}>В этой секции пока нет тестов.</p>
                ) : (
                  <div className="grid-2" style={{ gap: '15px' }}>
                    {section.quizzes.map(quiz => {
                      const isPassed = passedQuizzes.has(quiz.id);
                      return (
                        <div key={quiz.id} className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid rgba(0,0,0,0.05)', boxShadow: 'none' }}>
                          <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px' }}>
                            <h4 style={{ fontSize: '1.1rem' }}>
                              {quiz.title} 
                              {quiz.is_verified && <CheckCircle size={16} color="var(--primary-color)" style={{marginLeft: '5px', display: 'inline'}} />}
                            </h4>
                            {isPassed && (
                              <span style={{ fontSize: '0.75rem', padding: '4px 10px', background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', borderRadius: '100px', fontWeight: 'bold' }}>
                                Пройдено
                              </span>
                            )}
                          </div>
                          
                          <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '20px' }}>
                            Автор: {quiz.profiles?.last_name} {quiz.profiles?.first_name}
                          </p>
                          
                          <div className="flex-center" style={{ justifyContent: 'flex-end', gap: '10px' }}>
                            {(profile?.role === 'admin' || profile?.role === 'creator' || profile?.id === quiz.author_id) && (
                              <button 
                                onClick={() => navigate(`/editor?id=${quiz.id}`)}
                                style={{ padding: '8px 15px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}
                              >
                                <Edit2 size={16} />
                              </button>
                            )}
                            <button 
                              onClick={() => setSelectedQuiz(quiz)}
                              style={{ padding: '8px 25px', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                              <Play size={16} fill="currentColor" /> Начать
                            </button>
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
        
        {filteredSections.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
            <h3>Ничего не найдено</h3>
            <p style={{ opacity: 0.6 }}>Попробуйте изменить поисковый запрос.</p>
          </div>
        )}
      </div>

      {/* Start Quiz Modal */}
      {selectedQuiz && (
        <div className="modal-overlay" onClick={() => setSelectedQuiz(null)}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', margin: '0 auto 25px' }}>
              <Award size={32} />
            </div>
            <h2 style={{ marginBottom: '15px' }}>Вы готовы?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
              Вы собираетесь начать тест: <br/> <strong>"{selectedQuiz.title}"</strong>. <br/>
              Убедитесь, что у вас есть свободное время и стабильное интернет-соединение.
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button 
                onClick={() => setSelectedQuiz(null)}
                style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}
              >
                Отмена
              </button>
              <button 
                onClick={() => navigate(`/quiz/${selectedQuiz.id}`)}
                style={{ padding: '15px' }}
              >
                Начать обучение
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizCatalog;
