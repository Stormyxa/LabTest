import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ChevronLeft, User, BarChart, Calendar, CheckCircle, XCircle, Mail } from 'lucide-react';

const Analytics = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quizId = searchParams.get('id');
  
  const [quiz, setQuiz] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (quizId) fetchQuizData();
  }, [quizId]);

  const fetchQuizData = async () => {
    setLoading(true);
    
    // Fetch quiz info
    const { data: q } = await supabase.from('quizzes').select('title').eq('id', quizId).single();
    if (q) setQuiz(q);

    // Fetch quiz results with user profiles
    const { data: r } = await supabase
      .from('quiz_results')
      .select('*, profiles(first_name, last_name, email, is_anonymous)')
      .eq('quiz_id', quizId)
      .order('completed_at', { ascending: false });
    
    if (r) setResults(r);
    setLoading(false);
  };

  if (loading) return <div className="flex-center" style={{height: '60vh'}}>Загрузка аналитики...</div>;
  if (!quiz) return <div className="container">Тест не найден.</div>;

  const avgScore = results.length > 0 
    ? Math.round((results.reduce((acc, curr) => acc + curr.score, 0) / results.reduce((acc, curr) => acc + curr.total_questions, 0)) * 100) 
    : 0;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <button onClick={() => navigate(-1)} className="flex-center" style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', marginBottom: '30px', boxShadow: 'none', padding: '10px 20px' }}>
        <ChevronLeft size={20} /> Назад
      </button>

      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', marginBottom: '10px' }}>{quiz.title}</h2>
          <p style={{ opacity: 0.6 }}>Подробная статистика прохождений</p>
        </div>
        
        <div className="flex-center" style={{ gap: '20px' }}>
          <StatMini label="Участников" value={results.length} icon={<User size={18} />} />
          <StatMini label="Ср. результат" value={`${avgScore}%`} icon={<BarChart size={18} />} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <tr>
              <th style={{ padding: '20px' }}>Ученик</th>
              <th style={{ padding: '20px' }}>Результат</th>
              <th style={{ padding: '20px' }}>Баллы</th>
              <th style={{ padding: '20px' }}>Дата</th>
              <th style={{ padding: '20px' }}>Статус</th>
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
                <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.01)' }}>
                  <td style={{ padding: '20px' }}>
                    <div style={{ fontWeight: '600' }}>{displayName}</div>
                    {profile?.email && !profile.is_anonymous && (
                      <div style={{ fontSize: '0.8rem', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Mail size={12} /> {profile.email}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '20px' }}>
                    <div style={{ width: '100px', height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ width: `${(res.score / res.total_questions) * 100}%`, height: '100%', background: res.is_passed ? '#4ade80' : '#f87171' }} />
                    </div>
                  </td>
                  <td style={{ padding: '20px', fontWeight: 'bold' }}>
                    {res.score} / {res.total_questions}
                  </td>
                  <td style={{ padding: '20px', opacity: 0.5, fontSize: '0.9rem' }}>
                    <div className="flex-center" style={{ gap: '5px', justifyContent: 'flex-start' }}>
                      <Calendar size={14} /> {new Date(res.completed_at).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ padding: '20px' }}>
                    {res.is_passed ? (
                      <span style={{ color: '#4ade80', fontSize: '0.85rem' }} className="flex-center"><CheckCircle size={16} style={{marginRight: '5px'}}/> Зачет</span>
                    ) : (
                      <span style={{ color: '#f87171', fontSize: '0.85rem' }} className="flex-center"><XCircle size={16} style={{marginRight: '5px'}}/> Не зачет</span>
                    )}
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
