import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ChevronLeft, User, BarChart, Calendar, CheckCircle, XCircle, Mail, Trash2, AlertTriangle } from 'lucide-react';

const Analytics = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quizId = searchParams.get('id');
  
  const [quiz, setQuiz] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingQuizMode, setDeletingQuizMode] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    fetchProfile();
    if (quizId) fetchQuizData();
  }, [quizId]);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(p);
    }
  };

  const fetchQuizData = async () => {
    setLoading(true);
    
    // Fetch quiz info
    const { data: q } = await supabase.from('quizzes').select('*, author_id').eq('id', quizId).single();
    if (q) setQuiz(q);

    // Fetch quiz results independently to avoid Supabase join relation errors
    const { data: r, error } = await supabase
      .from('quiz_results')
      .select('*')
      .eq('quiz_id', quizId)
      .order('completed_at', { ascending: false });
      
    if (error) console.error("Ошибка при загрузке результатов:", error);
    
    if (r && r.length > 0) {
      const userIds = r.map(user => user.user_id);
      const { data: p } = await supabase.from('profiles').select('*').in('id', userIds);
      
      const combined = r.map(res => ({
        ...res,
        profiles: p?.find(profile => profile.id === res.user_id) || null
      }));
      setResults(combined);
    } else {
      setResults([]);
    }
    
    setLoading(false);
  };

  const handleDeleteResult = async (id) => {
    const { error } = await supabase.from('quiz_results').delete().eq('id', id);
    if (!error) {
      setResults(prev => prev.filter(res => res.id !== id));
      setDeletingId(null);
    }
  };

  const handleDeleteQuiz = async () => {
    const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
    if (!error) navigate('/catalog');
  };

  if (loading) return <div className="flex-center" style={{height: '60vh'}}>Загрузка аналитики...</div>;
  if (!quiz) return <div className="container">Тест не найден.</div>;

  const totalPotentialScore = results.reduce((acc, curr) => acc + curr.total_questions, 0);
  const totalEarnedScore = results.reduce((acc, curr) => acc + curr.score, 0);
  const avgScore = totalPotentialScore > 0 
    ? Math.round((totalEarnedScore / totalPotentialScore) * 100) 
    : 0;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '30px' }}>
        <button onClick={() => navigate(-1)} className="flex-center" style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none', padding: '10px 20px' }}>
          <ChevronLeft size={20} /> Назад
        </button>
        {(quiz?.author_id === profile?.id || profile?.role === 'admin' || profile?.role === 'creator') && (
          <button onClick={() => setDeletingQuizMode(true)} className="flex-center" style={{ background: 'rgba(255,0,0,0.05)', color: 'red', boxShadow: 'none', padding: '10px 20px' }}>
            <Trash2 size={18} style={{marginRight: '8px'}}/> Удалить тест
          </button>
        )}
      </div>

      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', marginBottom: '10px' }}>{quiz.title}</h2>
          <p style={{ opacity: 0.6 }}>Подробная статистика прохождений</p>
        </div>
        
        <div className="flex-center" style={{ gap: '20px' }}>
          <StatMini label="Участников" value={results.length} icon={<User size={18} />} />
          <StatMini label="Ср. результат" value={`${avgScore}% (${totalEarnedScore}/${totalPotentialScore})`} icon={<BarChart size={18} />} />
        </div>
      </div>

      {/* Question Stats Chart (Infographic) */}
      {results.length > 0 && quiz.content?.questions && (
        <div className="card" style={{ marginBottom: '40px' }}>
          <h3 style={{ marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart size={20} /> Успеваемость по вопросам
          </h3>
          <div style={{ display: 'grid', gap: '15px' }}>
            {quiz.content.questions.map((q, idx) => {
              // Calculate % of correct answers for this question index
              const correctAnswers = results.filter(r => r.answers_map && r.answers_map[idx] === true).length;
              const percent = Math.round((correctAnswers / results.length) * 100);
              return (
                <div key={idx}>
                  <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                    <span style={{ opacity: 0.8, maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {idx + 1}. {q.question}
                    </span>
                    <span style={{ fontWeight: '700', color: percent > 70 ? '#4ade80' : (percent > 40 ? '#facc15' : '#f87171') }}>
                      {percent}% ({correctAnswers}/{results.length})
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${percent}%`, height: '100%', 
                      background: percent > 70 ? '#4ade80' : (percent > 40 ? '#facc15' : '#f87171'),
                      transition: 'width 0.5s ease' 
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <tr>
              <th style={{ padding: '20px' }}>Ученик</th>
              <th style={{ padding: '20px' }}>Результат (Тек/1-й)</th>
              <th style={{ padding: '20px' }}>Баллы</th>
              <th style={{ padding: '20px' }}>Дата</th>
              <th style={{ padding: '20px' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {results.map((res, i) => {
              const profile = res.profiles;
              const hasName = profile?.first_name || profile?.last_name;
              const displayName = profile?.is_anonymous 
                ? 'Анонимный профиль' 
                : (hasName ? `${profile.last_name || ''} ${profile.first_name || ''}` : (profile?.email || 'Неизвестный ученик'));

              return (
                <tr key={res.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.01)' }}>
                  <td style={{ padding: '20px' }}>
                    <div style={{ fontWeight: '600' }}>{displayName}</div>
                    {profile?.email && !profile.is_anonymous && (
                      <div style={{ fontSize: '0.8rem', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Mail size={12} /> {profile.email}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '20px' }}>
                    <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                      <div style={{ position: 'relative', width: '60px', height: '14px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${(res.score / res.total_questions) * 100}%`, height: '100%', background: res.is_passed ? '#4ade80' : '#f87171' }} />
                        <span style={{ position: 'absolute', width: '100%', left: 0, top: 0, fontSize: '0.6rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-color)', lineHeight: '14px' }}>
                          {res.score}/{res.total_questions}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>/</span>
                      <div style={{ position: 'relative', width: '40px', height: '10px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${(res.first_score / res.total_questions) * 100}%`, height: '100%', background: 'var(--primary-color)', opacity: 0.5 }} />
                        <span style={{ position: 'absolute', width: '100%', left: 0, top: 0, fontSize: '0.5rem', textAlign: 'center', fontWeight: 'bold', color: 'black', lineHeight: '10px' }}>
                          {res.first_score}/{res.total_questions}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '20px', fontWeight: 'bold' }}>
                    {res.score} / {res.total_questions} 
                    <span style={{ fontSize: '0.75rem', fontWeight: '400', marginLeft: '5px', opacity: 0.5 }}>
                      (1-й: {res.first_score || res.score})
                    </span>
                  </td>
                  <td style={{ padding: '20px', opacity: 0.5, fontSize: '0.9rem' }}>
                    <div className="flex-center" style={{ gap: '5px', justifyContent: 'flex-start' }}>
                      <Calendar size={14} /> {new Date(res.completed_at).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ padding: '20px' }}>
                    <button 
                      onClick={() => setDeletingId(res.id)}
                      style={{ background: 'rgba(255,0,0,0.05)', color: 'red', padding: '8px', borderRadius: '10px', boxShadow: 'none' }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {results.length === 0 && (
              <tr>
                <td colSpan="5" style={{ padding: '60px', textAlign: 'center', opacity: 0.5 }}>Прохождений пока нет.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal for User Result */}
      {deletingId && (
        <div className="modal-overlay" onClick={() => setDeletingId(null)}>
          <div className="modal-content animate" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '50px', height: '50px', background: 'rgba(255,0,0,0.1)', color: 'red', borderRadius: '15px', margin: '0 auto 20px' }}>
              <AlertTriangle size={24} />
            </div>
            <h3 style={{ marginBottom: '10px' }}>Удалить результат?</h3>
            <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '25px' }}>Это действие необратимо и удалит запись ученика из статистики.</p>
            <div className="grid-2" style={{ gap: '10px' }}>
              <button onClick={() => setDeletingId(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
              <button onClick={() => handleDeleteResult(deletingId)} style={{ background: 'red', color: 'white' }}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Validation Modal for Entire Quiz */}
      {deletingQuizMode && (
        <div className="modal-overlay" onClick={() => setDeletingQuizMode(false)}>
          <div className="modal-content animate" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '50px', height: '50px', background: 'rgba(255,0,0,0.1)', color: 'red', borderRadius: '15px', margin: '0 auto 20px' }}>
              <AlertTriangle size={24} />
            </div>
            <h3 style={{ marginBottom: '10px', textAlign: 'center' }}>Удалить весь тест?</h3>
            <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '25px', textAlign: 'center' }}>Это действие уничтожит тест и всю его статистику. Восстановить будет невозможно.</p>
            <div className="grid-2" style={{ gap: '10px' }}>
              <button onClick={() => setDeletingQuizMode(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
              <button onClick={handleDeleteQuiz} style={{ background: 'red', color: 'white' }}>Удалить безвозвратно</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatMini = ({ label, value, icon }) => (
  <div className="card flex-center" style={{ gap: '15px', padding: '15px 25px', marginBottom: 0 }}>
    <div style={{ color: 'var(--primary-color)' }}>{icon}</div>
    <div style={{ textAlign: 'left' }}>
      <p style={{ fontSize: '0.75rem', opacity: 0.5, margin: 0 }}>{label}</p>
      <h4 style={{ margin: 0, fontSize: '1.2rem' }}>{value}</h4>
    </div>
  </div>
);

export default Analytics;
