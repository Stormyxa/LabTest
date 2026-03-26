import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, FileJson, AlertCircle, TrendingUp, CheckCircle, X, AlertTriangle } from 'lucide-react';

const Editor = ({ session, profile }) => {
  const navigate = useNavigate();
  const [sections, setSections] = useState([]);
  const [myQuizzes, setMyQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('create'); // 'create' or 'manage'
  const [deleteId, setDeleteId] = useState(null); // quiz to delete
  const [deleteSectionId, setDeleteSectionId] = useState(null); // section to delete
  
  const [title, setTitle] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [newSectionName, setNewSectionName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: s } = await supabase.from('quiz_sections').select('*');
    if (s) setSections(s);
    
    let query = supabase.from('quizzes').select('*, quiz_sections(name)');
    if (profile?.role === 'editor') {
      query = query.eq('author_id', session.user.id);
    }
    const { data: q } = await query.order('created_at', { ascending: false });
    
    if (q) {
      const quizzesWithStats = await Promise.all(q.map(async (quiz) => {
        const { data: res } = await supabase
          .from('quiz_results')
          .select('score, total_questions')
          .eq('quiz_id', quiz.id);
        
        const participants = res?.length || 0;
        const avgScore = participants > 0 
          ? Math.round((res.reduce((acc, curr) => acc + curr.score, 0) / res.reduce((acc, curr) => acc + curr.total_questions, 0)) * 100) 
          : 0;

        return { ...quiz, participants, avgScore };
      }));
      setMyQuizzes(quizzesWithStats);
    }
    setLoading(false);
  };

  const handleCreateQuiz = async (e) => {
    e.preventDefault();
    try {
      const parsedJson = JSON.parse(jsonInput);
      if (!parsedJson.questions || !Array.isArray(parsedJson.questions)) {
        throw new Error('Некорректный формат JSON: отсутствует массив questions');
      }

      const { error } = await supabase.from('quizzes').insert({
        title: title || parsedJson.title || 'Новый тест',
        section_id: sectionId,
        author_id: session.user.id,
        content: parsedJson,
        is_verified: profile?.role === 'admin' || profile?.role === 'creator'
      });

      if (error) throw error;
      fetchData();
      setTitle('');
      setJsonInput('');
      setSectionId('');
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  const handleCreateSection = async () => {
    if (!newSectionName) return;
    const { error } = await supabase.from('quiz_sections').insert({
      name: newSectionName,
      created_by: session.user.id
    });
    if (error) alert(error.message);
    else {
      setNewSectionName('');
      fetchData();
    }
  };

  const confirmDeleteQuiz = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('quizzes').delete().eq('id', deleteId);
    if (error) alert(error.message);
    else fetchData();
    setDeleteId(null);
  };

  const confirmDeleteSection = async () => {
    if (!deleteSectionId) return;
    
    const count = myQuizzes.filter(q => q.section_id === deleteSectionId).length;
    if (count > 0) {
      alert('Нельзя удалить секцию, в которой содержатся тесты. Сначала удалите или переместите тесты.');
      setDeleteSectionId(null);
      return;
    }

    const { error } = await supabase.from('quiz_sections').delete().eq('id', deleteSectionId);
    if (error) alert(error.message);
    else fetchData();
    setDeleteSectionId(null);
  };

  if (loading) return <div className="flex-center" style={{height: '60vh'}}>Загрузка панели редактора...</div>;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px' }}>
        <h2 style={{ fontSize: '2rem' }}>Управление тестами</h2>
        <div style={{ background: 'rgba(0,0,0,0.05)', padding: '5px', borderRadius: '15px', display: 'flex' }}>
          <button 
            onClick={() => setActiveTab('create')} 
            style={{ 
              background: activeTab === 'create' ? 'var(--primary-color)' : 'transparent', 
              color: activeTab === 'create' ? 'white' : 'inherit',
              boxShadow: 'none'
            }}
          >
            Создать тест
          </button>
          <button 
            onClick={() => setActiveTab('manage')} 
            style={{ 
              background: activeTab === 'manage' ? 'var(--primary-color)' : 'transparent', 
              color: activeTab === 'manage' ? 'white' : 'inherit',
              boxShadow: 'none'
            }}
          >
            Мои тесты
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start', gap: '30px' }}>
        {activeTab === 'create' ? (
          <>
            <div className="card">
              <h3 style={{ marginBottom: '25px' }}>Новый тест</h3>
              <form onSubmit={handleCreateQuiz} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <input 
                  type="text" 
                  placeholder="Название теста (необязательно, можно из JSON)" 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                />
                
                <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
                  <option value="">Выберите секцию во вложении...</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                <div style={{ position: 'relative' }}>
                  <textarea 
                    placeholder="Вставьте JSON формат вашего теста здесь..." 
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    style={{ width: '100%', height: '300px' }}
                    required
                  />
                  <FileJson size={24} style={{ position: 'absolute', right: '20px', top: '20px', opacity: 0.2 }} />
                </div>

                <button type="submit" style={{ width: '100%', padding: '15px' }}>
                  Опубликовать тест
                </button>
              </form>
            </div>

            <div className="card" style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px dashed var(--primary-color)' }}>
              <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px', marginBottom: '20px', color: 'var(--primary-color)' }}>
                <AlertCircle size={24} />
                <h3 style={{ margin: 0 }}>Промпт для ИИ</h3>
              </div>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '25px' }}>
                Скопируйте следующий текст и отправьте его любому ИИ, чтобы получить готовый файл для загрузки:
              </p>
              <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '15px', fontSize: '0.8rem', position: 'relative' }}>
                <code style={{ whiteSpace: 'pre-wrap' }}>
                  {`Создай тест на тему "[ВСТАВИТЬ ТЕМУ]" из [ЧИСЛО] вопросов. Выведи результат СТРОГО в формате JSON:
{
  "title": "Название",
  "questions": [
    {
      "question": "Текст вопроса?",
      "options": ["Ответ 1", "Ответ 2", "Ответ 3", "Ответ 4"],
      "correctIndex": 0
    }
  ]
}`}
                </code>
              </div>

              {(profile?.role === 'admin' || profile?.role === 'creator') && (
                <div style={{ marginTop: '40px' }}>
                  <h4 style={{ marginBottom: '15px' }}>Управление секциями</h4>
                  
                  <div style={{ marginBottom: '20px', maxHeight: '150px', overflowY: 'auto' }}>
                    {sections.map(s => (
                      <div key={s.id} className="flex-center" style={{ justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <span style={{ fontSize: '0.9rem' }}>{s.name}</span>
                        {profile?.role === 'creator' && (
                          <button 
                            onClick={() => setDeleteSectionId(s.id)}
                            style={{ padding: '5px', background: 'transparent', color: 'red', boxShadow: 'none' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex-center" style={{ gap: '10px' }}>
                    <input 
                      type="text" 
                      placeholder="Название новой секции" 
                      value={newSectionName} 
                      onChange={(e) => setNewSectionName(e.target.value)} 
                    />
                    <button onClick={handleCreateSection} style={{ padding: '10px 20px' }}>
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="grid-2">
              {myQuizzes.map(quiz => (
                <div key={quiz.id} className="card">
                  <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                      <h4 style={{ fontSize: '1.3rem' }}>{quiz.title}</h4>
                      <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>{quiz.quiz_sections?.name} | {new Date(quiz.created_at).toLocaleDateString()}</p>
                    </div>
                    {quiz.is_verified && <CheckCircle size={24} color="#4ade80" title="Верифицирован" />}
                  </div>

                  <div className="grid-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '30px' }}>
                    <div style={{ textAlign: 'center', padding: '15px', background: 'rgba(0,0,0,0.03)', borderRadius: '15px' }}>
                      <p style={{ fontSize: '1.2rem', fontWeight: '800' }}>{quiz.participants}</p>
                      <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Участников</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '15px', background: 'rgba(0,0,0,0.03)', borderRadius: '15px' }}>
                      <p style={{ fontSize: '1.2rem', fontWeight: '800' }}>{quiz.avgScore}%</p>
                      <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Средний балл</p>
                    </div>
                  </div>

                  <div className="flex-center" style={{ justifyContent: 'flex-end', gap: '10px' }}>
                    <button 
                      onClick={() => navigate(`/analytics?id=${quiz.id}`)}
                      style={{ background: 'rgba(0,0,0,0.03)', color: 'var(--text-color)', boxShadow: 'none' }}
                    >
                      Аналитика
                    </button>
                    <button 
                      onClick={() => setDeleteId(quiz.id)} 
                      style={{ background: 'rgba(255,0,0,0.1)', color: 'red', boxShadow: 'none' }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
              {myQuizzes.length === 0 && (
                <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px' }}>
                  <p style={{ opacity: 0.5 }}>Вы ещё не создали ни одного теста.</p>
                  <button onClick={() => setActiveTab('create')} style={{ marginTop: '20px' }}>Создать первый тест</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quiz Delete Modal */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal-content animate modal-content-danger" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}>
              <AlertTriangle size={32} />
            </div>
            <h2 style={{ marginBottom: '15px' }}>Удалить тест?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
              Это действие необратимо. <br/> Все результаты учеников по этому тесту будут навсегда удалены из базы.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button 
                onClick={() => setDeleteId(null)}
                style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}
              >
                Отмена
              </button>
              <button onClick={confirmDeleteQuiz} style={{ background: '#f87171', color: 'white' }}>
                Да, удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section Delete Modal */}
      {deleteSectionId && (
        <div className="modal-overlay" onClick={() => setDeleteSectionId(null)}>
          <div className="modal-content animate modal-content-danger" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}>
              <AlertTriangle size={32} />
            </div>
            <h2 style={{ marginBottom: '15px' }}>Удалить секцию?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
              Вы уверены? Это удалит категорию из списка. <br/> Если в секции есть тесты, удаление будет заблокировано.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button 
                onClick={() => setDeleteSectionId(null)}
                style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}
              >
                Отмена
              </button>
              <button onClick={confirmDeleteSection} style={{ background: '#f87171', color: 'white' }}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Editor;
