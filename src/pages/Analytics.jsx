import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ChevronLeft, User, BarChart, Calendar, CheckCircle, XCircle, Mail, Trash2, AlertTriangle, Filter, Download, Pencil, Shield, EyeOff, ArrowDown, ArrowUp, Info } from 'lucide-react';

const Analytics = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quizId = searchParams.get('id');

  const [quiz, setQuiz] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingQuizMode, setDeletingQuizMode] = useState(false);
  const [showEditBlockedModal, setShowEditBlockedModal] = useState(false);
  const [profile, setProfile] = useState(null);
  const [quizAuthorRole, setQuizAuthorRole] = useState(null);
  
  const [showObservers, setShowObservers] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [sortConfig, setSortConfig] = useState('date_desc'); // default

  useEffect(() => {
    if (searchParams.get('blocked')) {
      setShowEditBlockedModal(true);
    }
  }, [searchParams]);

  // Структура для фильтров
  const [cities, setCities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [filterCity, setFilterCity] = useState('all');
  const [filterSchool, setFilterSchool] = useState('all');
  const [filterClass, setFilterClass] = useState('all');

  useEffect(() => {
    fetchProfile();
    fetchStructure();
    if (quizId) fetchQuizData();
  }, [quizId]);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(p);
    }
  };

  const fetchStructure = async () => {
    const { data: c } = await supabase.from('cities').select('*').order('name');
    const { data: s } = await supabase.from('schools').select('*').order('name');
    const { data: cl } = await supabase.from('classes').select('*').order('name');
    if (c) setCities(c); if (s) setSchools(s); if (cl) setClasses(cl);
  };

  const fetchQuizData = async () => {
    setLoading(true);
    // Получаем тест и роль его автора
    const { data: q } = await supabase.from('quizzes').select('*, profiles!quizzes_author_id_fkey(role)').eq('id', quizId).single();
    if (q) {
      setQuiz(q);
      setQuizAuthorRole(q.profiles?.role);
    }

    const { data: r, error } = await supabase.from('quiz_results').select('*').eq('quiz_id', quizId).order('completed_at', { ascending: false });

    if (error) console.error("Ошибка при загрузке результатов:", error);

    if (r && r.length > 0) {
      const userIds = r.map(user => user.user_id);
      const { data: p } = await supabase.from('profiles').select('*').in('id', userIds);

      const combined = r.map(res => ({
        ...res,
        profiles: p?.find(pr => pr.id === res.user_id) || null
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
    } else {
      alert("Недостаточно прав для удаления этого результата: " + error.message);
      setDeletingId(null);
    }
  };

  const handleDeleteQuiz = async () => {
    const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
    if (!error) {
      navigate('/catalog');
    } else {
      alert("Недостаточно прав для удаления этого теста: " + error.message);
      setDeletingQuizMode(false);
    }
  };

  const handleDeleteAllResults = async () => {
    setLoading(true);
    const { error } = await supabase.from('quiz_results').delete().eq('quiz_id', quizId);
    if (!error) {
      fetchQuizData();
      setShowDeleteAllModal(false);
    } else {
      alert("Ошибка при удалении: " + error.message);
      setLoading(false);
    }
  };

  const isTeacher = profile?.role === 'teacher';

  // Логика фильтрации
  const availableSchools = schools.filter(s => filterCity === 'all' || s.city_id === filterCity);
  const availableClasses = classes.filter(c => filterSchool === 'all' || c.school_id === filterSchool);

  const filteredResults = results.filter(res => {
    const p = res.profiles;
    if (!p) return false;

    // 0. Скрыть наблюдателей если не выбран фильтр
    if (!showObservers && p.is_observer) return false;

    // Ограничение видимости для учителя
    if (isTeacher && quiz?.author_id !== profile?.id) {
      if (p.school_id !== profile?.school_id) return false;
    }

    if (filterCity !== 'all' && p.city_id !== filterCity) return false;
    if (filterSchool !== 'all' && p.school_id !== filterSchool) return false;
    if (filterClass !== 'all' && p.class_id !== filterClass) return false;
    return true;
  });

  const sortedResults = [...filteredResults].sort((a, b) => {
    if (!sortConfig) return 0;
    
    if (sortConfig.includes('name')) {
      const nameA = `${a.profiles?.last_name || ''} ${a.profiles?.first_name || ''}`.trim().toLowerCase() || 'яяя';
      const nameB = `${b.profiles?.last_name || ''} ${b.profiles?.first_name || ''}`.trim().toLowerCase() || 'яяя';
      if (sortConfig === 'name_asc') return nameA.localeCompare(nameB, 'ru');
      return nameB.localeCompare(nameA, 'ru');
    }
    
    if (sortConfig.includes('date')) {
      const dateA = new Date(a.completed_at).getTime();
      const dateB = new Date(b.completed_at).getTime();
      if (sortConfig === 'date_asc') return dateA - dateB;
      return dateB - dateA;
    }
    
    return 0;
  });

  // Логика прав на удаление (Создатель, Сам автор, либо Админ для тестов рангов ниже)
  const canDelete =
    profile?.role === 'creator' ||
    profile?.id === quiz?.author_id ||
    (profile?.role === 'admin' && quizAuthorRole !== 'creator' && quizAuthorRole !== 'admin');

  // Генерация PDF
  const generatePDF = async () => {
    try {
      const doc = new jsPDF();
      const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf';
      const response = await fetch(fontUrl);
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
      const base64Font = window.btoa(binary);

      doc.addFileToVFS('Roboto-Regular.ttf', base64Font);
      doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
      doc.setFont('Roboto');
      doc.text(`Аналитика теста: ${quiz?.title}`, 20, 20);

      const tableData = sortedResults.map(res => {
        const p = res.profiles;
        const hasName = p?.first_name || p?.last_name;
        const displayName = p?.is_anonymous ? 'Анонимный профиль' : (hasName ? `${p.last_name || ''} ${p.first_name || ''}`.trim() : (p?.email || 'Неизвестный ученик'));
        const institution = [cities.find(c => c.id === p?.city_id)?.name, schools.find(s => s.id === p?.school_id)?.name, classes.find(c => c.id === p?.class_id)?.name].filter(Boolean).join(' / ') || '—';
        const answers = res.answers_array || res.answers_map || [];

        return [displayName, institution, `${res.score} / ${res.total_questions}`, `${res.first_score} / ${res.total_questions}`, new Date(res.completed_at).toLocaleDateString()];
      });

      autoTable(doc, {
        head: [['Ученик', 'Заведение', 'Текущий рез.', '1-я попытка', 'Дата']],
        body: tableData,
        startY: 30,
        styles: { font: 'Roboto' },
        headStyles: { fontStyle: 'normal' }
      });

      const safeTitle = quiz?.title.replace(/[/\\?%*:|"<>]/g, '-');
      doc.save(`Аналитика_${safeTitle}_${new Date().toLocaleDateString()}.pdf`);
    } catch (error) {
      alert("Не удалось создать PDF.");
    }
  };

  if (loading) return <div className="flex-center" style={{ height: '60vh' }}>Загрузка аналитики...</div>;
  if (!quiz) return <div className="container">Тест не найден.</div>;

  const totalPotentialScore = filteredResults.reduce((acc, curr) => acc + curr.total_questions, 0);
  const totalEarnedScore = filteredResults.reduce((acc, curr) => acc + curr.score, 0);
  const avgScore = totalPotentialScore > 0 ? Math.round((totalEarnedScore / totalPotentialScore) * 100) : 0;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '30px' }}>
        <button onClick={() => navigate(-1)} className="flex-center" style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none', padding: '10px 20px' }}>
          <ChevronLeft size={20} /> Назад
        </button>
        <div className="flex-center" style={{ gap: '10px' }}>
          {canDelete && (
            <button
              onClick={() => {
                if (results.length > 0) setShowEditBlockedModal(true);
                else navigate(`/redactor?id=${quizId}`);
              }}
              className="flex-center"
              style={{ background: 'rgba(99, 102, 241, 0.05)', color: 'var(--primary-color)', boxShadow: 'none', padding: '10px 20px' }}>
              <Pencil size={18} style={{ marginRight: '8px' }} /> Редактировать
            </button>
          )}
          {canDelete && (
            <button onClick={() => setDeletingQuizMode(true)} className="flex-center" style={{ background: 'rgba(255,0,0,0.05)', color: 'red', boxShadow: 'none', padding: '10px 20px' }}>
              <Trash2 size={18} style={{ marginRight: '8px' }} /> Удалить тест
            </button>
          )}
        </div>
      </div>

      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', marginBottom: '10px' }}>{quiz.title}</h2>
          <p style={{ opacity: 0.6 }}>Подробная статистика прохождений {isTeacher && quiz.author_id !== profile?.id ? '(Только ваша школа)' : ''}</p>
        </div>

        <div className="flex-center" style={{ gap: '15px' }}>
          <button onClick={generatePDF} className="flex-center card" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none', padding: '15px 20px', marginBottom: 0, cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>
            <Download size={20} style={{ marginRight: '8px' }} /> Отчет PDF
          </button>
          <StatMini label="Участников" value={filteredResults.length} icon={<User size={18} />} />
          <StatMini label="Ср. результат" value={`${avgScore}% (${totalEarnedScore}/${totalPotentialScore})`} icon={<BarChart size={18} />} />
        </div>
      </div>

      {/* Фильтры и инструменты */}
      <div className="flex-center" style={{ gap: '15px', marginBottom: '30px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div className="card" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center', marginBottom: 0, flex: 1 }}>
          <Filter size={20} style={{ opacity: 0.5 }} />
          <select 
            id="analytics-filter-city"
            name="city"
            value={filterCity} 
            onChange={e => { setFilterCity(e.target.value); setFilterSchool('all'); setFilterClass('all'); }} 
            style={{ width: 'auto', flex: 1, minWidth: '150px' }} 
            disabled={isTeacher}
          >
            <option value="all">Все города</option>
            {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select 
            id="analytics-filter-school"
            name="school"
            value={filterSchool} 
            onChange={e => { setFilterSchool(e.target.value); setFilterClass('all'); }} 
            style={{ width: 'auto', flex: 1, minWidth: '150px' }} 
            disabled={isTeacher}
          >
            <option value="all">Все школы</option>
            {availableSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select 
            id="analytics-filter-class"
            name="class"
            value={filterClass} 
            onChange={e => setFilterClass(e.target.value)} 
            style={{ width: 'auto', flex: 1, minWidth: '150px' }}
          >
            <option value="all">Все классы</option>
            {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="flex-center" style={{ gap: '10px' }}>
          <button 
            onClick={() => setShowObservers(!showObservers)} 
            className="flex-center" 
            style={{ 
              background: showObservers ? 'rgba(250, 204, 21, 0.15)' : 'rgba(0,0,0,0.05)', 
              color: showObservers ? '#ca8a04' : 'inherit', 
              boxShadow: 'none', 
              padding: '10px 20px',
              border: 'none',
              fontWeight: 'bold'
            }}
          >
            {showObservers ? <Shield size={18} style={{ marginRight: '8px' }} /> : <EyeOff size={18} style={{ marginRight: '8px' }} />}
            {showObservers ? 'Скрыть наблюдателей' : 'Показать наблюдателей'}
          </button>

          {canDelete && (
            <button 
              onClick={() => setShowDeleteAllModal(true)} 
              disabled={results.length === 0}
              className="flex-center" 
              style={{ background: 'rgba(255,0,0,0.05)', color: 'red', boxShadow: 'none', padding: '10px 20px', fontWeight: 'bold', border: 'none', opacity: results.length === 0 ? 0.4 : 1 }}
            >
              <Trash2 size={18} style={{ marginRight: '8px' }} /> Удалить все
            </button>
          )}
        </div>
      </div>

      {/* Успеваемость по вопросам (Инфографика) */}
      {filteredResults.length > 0 && quiz.content?.questions && (
        <div className="card" style={{ marginBottom: '40px' }}>
          <h3 style={{ marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart size={20} /> Успеваемость по вопросам (с учетом фильтров)
          </h3>
          <div style={{ display: 'grid', gap: '15px' }}>
            {quiz.content.questions.map((q, idx) => {
              const correctAnswers = filteredResults.filter(r => {
                const answers = r.answers_array || r.answers_map;
                return answers && answers[idx] === true;
              }).length;
              const percent = Math.round((correctAnswers / filteredResults.length) * 100);
              return (
                <div key={idx}>
                  <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                    <span style={{ opacity: 0.8, maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {idx + 1}. {q.question}
                    </span>
                    <span style={{ fontWeight: '700', color: percent > 70 ? '#4ade80' : (percent > 40 ? '#facc15' : '#f87171') }}>
                      {percent}% ({correctAnswers}/{filteredResults.length})
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ width: `${percent}%`, height: '100%', background: percent > 70 ? '#4ade80' : (percent > 40 ? '#facc15' : '#f87171'), transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Таблица результатов */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        
        {/* HEADER & SORTING */}
        <div className="flex-center" style={{ padding: '20px 25px', background: 'rgba(99, 102, 241, 0.04)', borderBottom: '1px solid rgba(0,0,0,0.05)', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
          <div className="flex-center" style={{ gap: '15px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--primary-color)' }}>Результаты учеников</span>
            <div className="flex-center" style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(0,0,0,0.05)', gap: '4px' }}>
              <button 
                onClick={() => setSortConfig(sortConfig === 'name_asc' ? 'name_desc' : 'name_asc')}
                style={{ 
                  background: sortConfig.includes('name') ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  color: sortConfig.includes('name') ? 'var(--primary-color)' : 'var(--text-color)',
                  padding: '6px 12px', fontSize: '0.8rem', boxShadow: 'none', borderRadius: '8px', opacity: sortConfig.includes('name') ? 1 : 0.6
                }} className="flex-center">
                Алфавит {sortConfig === 'name_asc' && <ArrowDown size={14} style={{ marginLeft: '4px' }}/>} {sortConfig === 'name_desc' && <ArrowUp size={14} style={{ marginLeft: '4px' }}/>}
              </button>
              <button 
                onClick={() => setSortConfig(sortConfig === 'date_desc' ? 'date_asc' : 'date_desc')}
                style={{ 
                  background: sortConfig.includes('date') ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  color: sortConfig.includes('date') ? 'var(--primary-color)' : 'var(--text-color)',
                  padding: '6px 12px', fontSize: '0.8rem', boxShadow: 'none', borderRadius: '8px', opacity: sortConfig.includes('date') ? 1 : 0.6
                }} className="flex-center">
                Дата {sortConfig === 'date_desc' && <ArrowDown size={14} style={{ marginLeft: '4px' }}/>} {sortConfig === 'date_asc' && <ArrowUp size={14} style={{ marginLeft: '4px' }}/>}
              </button>
            </div>
          </div>
          
          <div className="flex-center" style={{ gap: '8px', opacity: 0.6, fontSize: '0.8rem', maxWidth: '350px' }}>
            <Info size={24} style={{ flexShrink: 0, color: 'var(--primary-color)' }} />
            <span>Если ученика нет в списке, убедитесь, что его аккаунт привязан к правильному классу, а не находится в режиме наблюдателя.</span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
            <thead style={{ background: 'rgba(0,0,0,0.02)', fontSize: '0.9rem', opacity: 0.7 }}>
            <tr>
              <th style={{ padding: '20px' }}>Ученик</th>
              <th style={{ padding: '20px' }}>Учебное заведение</th>
              <th style={{ padding: '20px' }}>Результат (Тек/1-й)</th>
              <th style={{ padding: '20px' }}>Баллы</th>
              <th style={{ padding: '20px' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {sortedResults.map((res) => {
              const p = res.profiles;
              const hasName = p?.first_name || p?.last_name;
              const displayName = p?.is_anonymous ? 'Анонимный профиль' : (hasName ? `${p.last_name || ''} ${p.first_name || ''}` : (p?.email || 'Неизвестный ученик'));
              const cityName = cities.find(c => c.id === p?.city_id)?.name || '';
              const schoolName = schools.find(s => s.id === p?.school_id)?.name || '';
              const className = classes.find(c => c.id === p?.class_id)?.name || '';

              return (
                <tr key={res.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.01)' }}>
                  <td style={{ padding: '20px' }}>
                    <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}>
                      <div style={{ fontWeight: '600' }}>{displayName}</div>
                      {p?.is_observer && <span style={{ padding: '2px 8px', background: 'rgba(250, 204, 21, 0.1)', color: '#ca8a04', borderRadius: '50px', fontSize: '0.65rem', fontWeight: 'bold' }}>НАБЛЮДАТЕЛЬ</span>}
                      {p?.is_hidden && <span style={{ background: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '50px', fontSize: '0.65rem' }} title="Скрытый пользователь"><EyeOff size={10} /></span>}
                    </div>
                    {p?.email && !p.is_anonymous && (
                      <div style={{ fontSize: '0.8rem', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={12} /> {p.email}</div>
                    )}
                  </td>
                  <td style={{ padding: '20px', fontSize: '0.85rem', opacity: 0.7 }}>
                    <div>{cityName}</div>
                    <div>{schoolName}</div>
                    <div style={{ fontWeight: 'bold' }}>{className}</div>
                  </td>
                  <td style={{ padding: '20px' }}>
                    <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                      <div style={{ position: 'relative', width: '60px', height: '14px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${(res.score / res.total_questions) * 100}%`, height: '100%', background: res.is_passed ? '#4ade80' : '#f87171' }} />
                        <span style={{ position: 'absolute', width: '100%', left: 0, top: 0, fontSize: '0.6rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-color)', lineHeight: '14px' }}>{res.score}/{res.total_questions}</span>
                      </div>
                      <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>/</span>
                      <div style={{ position: 'relative', width: '40px', height: '10px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${(res.first_score / res.total_questions) * 100}%`, height: '100%', background: 'var(--primary-color)', opacity: 0.5 }} />
                        <span style={{ position: 'absolute', width: '100%', left: 0, top: 0, fontSize: '0.5rem', textAlign: 'center', fontWeight: 'bold', color: 'black', lineHeight: '10px' }}>{res.first_score}/{res.total_questions}</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '20px', fontWeight: 'bold' }}>
                    {res.score} / {res.total_questions}
                  </td>
                  <td style={{ padding: '20px' }}>
                    {canDelete && (
                      <button onClick={() => setDeletingId(res.id)} style={{ background: 'rgba(255,0,0,0.05)', color: 'red', padding: '8px', borderRadius: '10px', boxShadow: 'none' }}>
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {sortedResults.length === 0 && <tr><td colSpan="5" style={{ padding: '60px', textAlign: 'center', opacity: 0.5 }}>Прохождений пока нет.</td></tr>}
          </tbody>
        </table>
      </div>
      </div>

      {/* Модальное окно: удаление результата */}
      {deletingId && (
        <div className="modal-overlay" onClick={() => setDeletingId(null)}>
          <div className="modal-content animate" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '50px', height: '50px', background: 'rgba(255,0,0,0.1)', color: 'red', borderRadius: '15px', margin: '0 auto 20px' }}><AlertTriangle size={24} /></div>
            <h3 style={{ marginBottom: '10px', textAlign: 'center' }}>Удалить результат?</h3>
            <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '25px', textAlign: 'center' }}>Это действие необратимо.</p>
            <div className="grid-2" style={{ gap: '10px' }}>
              <button onClick={() => setDeletingId(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
              <button onClick={() => handleDeleteResult(deletingId)} style={{ background: 'red', color: 'white' }}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно: удаление теста */}
      {deletingQuizMode && (
        <div className="modal-overlay" onClick={() => setDeletingQuizMode(false)}>
          <div className="modal-content animate" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '50px', height: '50px', background: 'rgba(255,0,0,0.1)', color: 'red', borderRadius: '15px', margin: '0 auto 20px' }}><AlertTriangle size={24} /></div>
            <h3 style={{ marginBottom: '10px', textAlign: 'center' }}>Удалить весь тест?</h3>
            <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '25px', textAlign: 'center' }}>Уничтожит тест и всю статистику.</p>
            <div className="grid-2" style={{ gap: '10px' }}>
              <button onClick={() => setDeletingQuizMode(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
              <button onClick={handleDeleteQuiz} style={{ background: 'red', color: 'white' }}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно: удаление всех результатов */}
      {showDeleteAllModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteAllModal(false)}>
          <div className="modal-content animate" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(255, 0, 0, 0.1)', color: 'red', margin: '0 auto 25px' }}><AlertTriangle size={32} /></div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Удалить ВСЕ результаты?</h2>
            <p style={{ opacity: 0.7, marginBottom: '25px', lineHeight: '1.6', textAlign: 'center' }}>
              Это действие полностью очистит таблицу результатов и сбросит статистику теста.<br />
              <strong>Внимание: восстановление данных невозможно.</strong>
            </p>
            <div className="grid-2" style={{ gap: '15px' }}>
              <button onClick={() => setShowDeleteAllModal(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
              <button onClick={handleDeleteAllResults} style={{ background: 'red', color: 'white', fontWeight: 'bold' }}>Да, удалить всё</button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно: блокировка редактирования */}
      {showEditBlockedModal && (
        <div className="modal-overlay" onClick={() => setShowEditBlockedModal(false)}>
          <div className="modal-content animate" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(255, 204, 21, 0.1)', color: '#ca8a04', margin: '0 auto 25px' }}><AlertTriangle size={32} /></div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Редактирование заблокировано</h2>
            <p style={{ opacity: 0.7, marginBottom: '25px', lineHeight: '1.6', textAlign: 'center' }}>
              Нельзя редактировать тест, если он был пройден хотя бы одним учеником.<br />
              В тесте обнаружено <strong>{results.length}</strong> результатов.<br /><br />
              <span style={{ fontSize: '0.9rem' }}>Чтобы внести правки, удалите все результаты с помощью кнопки <strong>«Удалить все»</strong> ниже.</span>
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button onClick={() => setShowEditBlockedModal(false)} style={{ background: 'var(--primary-color)', color: 'white', padding: '12px 30px' }}>Понятно</button>
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