import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchWithCache, useCacheSync } from '../lib/cache';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Trophy, Download, Users, School, Filter, AlertTriangle, MapPin, Building, Info } from 'lucide-react';
import { useScrollRestoration } from '../lib/useScrollRestoration';

const Statistics = ({ session, profile }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState([]);

  const [cities, setCities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teacherClasses, setTeacherClasses] = useState([]);

  const [loading, setLoading] = useState(true);

  useScrollRestoration(loading);

  const [filterCity, setFilterCity] = useState(sessionStorage.getItem('f_city') || 'all');
  const [filterSchool, setFilterSchool] = useState(sessionStorage.getItem('f_school') || 'all');
  const [filterClass, setFilterClass] = useState(sessionStorage.getItem('f_class') || 'all');

  useEffect(() => { sessionStorage.setItem('f_city', filterCity); }, [filterCity]);
  useEffect(() => { sessionStorage.setItem('f_school', filterSchool); }, [filterSchool]);
  useEffect(() => { sessionStorage.setItem('f_class', filterClass); }, [filterClass]);
  const [sortBy, setSortBy] = useState('points');

  useEffect(() => {
    fetchData();
    // Set defaults from profile if not already set in session
    if (profile) {
      const isRestricted = profile.role === 'teacher' || profile.role === 'player';
      const hasStoredCity = sessionStorage.getItem('f_city');
      const hasStoredSchool = sessionStorage.getItem('f_school');
      
      if (isRestricted) {
        // Force-lock for restricted roles to prevent seeing "All"
        if (profile.city_id) setFilterCity(profile.city_id);
        if (profile.school_id) setFilterSchool(profile.school_id);
      } else {
        // Defaults for privileged roles (Persistence within session)
        if (!hasStoredCity && profile.city_id) setFilterCity(profile.city_id);
        if (!hasStoredSchool && profile.school_id) setFilterSchool(profile.school_id);
      }
    }
  }, [profile]);

  const fetchData = async () => {
    setLoading(true);

    const [ c, s, cl, pData, tClassesData ] = await Promise.all([
      fetchWithCache('cities', () => supabase.from('cities').select('*').order('name').then(r => r.data)),
      fetchWithCache('schools', () => supabase.from('schools').select('*').order('name').then(r => r.data)),
      fetchWithCache('classes', () => supabase.from('classes').select('*').order('name').then(r => r.data)),
      fetchWithCache('statistics_all_profiles', () => supabase
        .from('profiles')
        .select('*, quiz_results(score, total_questions, is_passed, quiz_id), quiz_attempts(is_suspicious, is_passed, quiz_id)')
        .then(r => r.data)),
      profile?.role === 'teacher' ? supabase.from('class_teachers').select('class_id').eq('email', session.user.email.toLowerCase()).then(r => r.data) : Promise.resolve([])
    ]);

    if (c) setCities(c); 
    if (s) setSchools(s); 
    if (cl) setClasses(cl);
    if (tClassesData) setTeacherClasses(tClassesData.map(tc => tc.class_id));

    const processProfiles = (profilesData) => {
      return profilesData.map(u => {
        const results = [...(u.quiz_results || [])].sort((a, b) => b.score - a.score);
        const attempts = [...(u.quiz_attempts || [])];
        
        // Group attempts by quiz_id to find per-quiz status
        const quizStatsMap = {};
        attempts.forEach(a => {
          if (!quizStatsMap[a.quiz_id]) quizStatsMap[a.quiz_id] = { total: 0, suspicious: 0, failed: 0 };
          quizStatsMap[a.quiz_id].total++;
          if (a.is_suspicious) quizStatsMap[a.quiz_id].suspicious++;
          if (!a.is_passed) quizStatsMap[a.quiz_id].failed++;
        });

        let redQuizzes = 0;
        let yellowQuizzes = 0;
        const quizIds = Object.keys(quizStatsMap);
        
        quizIds.forEach(qId => {
          const s = quizStatsMap[qId];
          if (s.suspicious / s.total >= 0.4) redQuizzes++;
          else if (s.failed / s.total > 0.5) yellowQuizzes++;
        });

        const totalUniqueQuizzes = quizIds.length;
        const isSuspicious = totalUniqueQuizzes > 0 && (redQuizzes / totalUniqueQuizzes) >= 0.4;
        
        const totalPointsScored = results.reduce((acc, curr) => acc + (curr.score || 0), 0);
        const totalPointsPossible = results.reduce((acc, curr) => acc + (curr.total_questions || 1), 0);
        const rawAvgScore = totalPointsPossible > 0 ? (totalPointsScored / totalPointsPossible) : 1;
        
        const isUnderperforming = rawAvgScore <= 0.5 && !isSuspicious;

        return {
          ...u,
          passedQuizzes: results.filter(r => r.is_passed).length,
          totalPoints: results.reduce((acc, curr) => acc + curr.score, 0),
          avgScore: results.length > 0 ? Math.round(rawAvgScore * 100) : 0,
          isSuspicious,
          isUnderperforming
        };
      });
    };

    if (pData) {
      setStats(processProfiles(pData));
    }
    setLoading(false);
  };

  useCacheSync('cities', (data) => { if (data) setCities(data); });
  useCacheSync('schools', (data) => { if (data) setSchools(data); });
  useCacheSync('classes', (data) => { if (data) setClasses(data); });
  useCacheSync('statistics_all_profiles', (data) => {
    if (data) {
      const processProfiles = (profilesData) => {
        return profilesData.map(u => {
          const results = [...(u.quiz_results || [])].sort((a, b) => b.score - a.score);
          const attempts = [...(u.quiz_attempts || [])];
          const quizStatsMap = {};
          attempts.forEach(a => {
            if (!quizStatsMap[a.quiz_id]) quizStatsMap[a.quiz_id] = { total: 0, suspicious: 0, failed: 0 };
            quizStatsMap[a.quiz_id].total++;
            if (a.is_suspicious) quizStatsMap[a.quiz_id].suspicious++;
            if (!a.is_passed) quizStatsMap[a.quiz_id].failed++;
          });
          let redQuizzes = 0; let yellowQuizzes = 0;
          const quizIds = Object.keys(quizStatsMap);
          quizIds.forEach(qId => {
            const s = quizStatsMap[qId];
            if (s.suspicious / s.total >= 0.4) redQuizzes++;
            else if (s.failed / s.total > 0.5) yellowQuizzes++;
          });
          const totalUniqueQuizzes = quizIds.length;
          const isSuspicious = totalUniqueQuizzes > 0 && (redQuizzes / totalUniqueQuizzes) >= 0.4;
          const totalPointsScored = results.reduce((acc, curr) => acc + (curr.score || 0), 0);
          const totalPointsPossible = results.reduce((acc, curr) => acc + (curr.total_questions || 1), 0);
          const rawAvgScore = totalPointsPossible > 0 ? (totalPointsScored / totalPointsPossible) : 1;
          const isUnderperforming = rawAvgScore <= 0.5 && !isSuspicious;

          return {
            ...u,
            passedQuizzes: results.filter(r => r.is_passed).length,
            totalPoints: results.reduce((acc, curr) => acc + curr.score, 0),
            avgScore: results.length > 0 ? Math.round(rawAvgScore * 100) : 0,
            isSuspicious,
            isUnderperforming
          };
        });
      };
      setStats(processProfiles(data));
    }
  });
    // Original Processing is now inside processProfiles


  const availableSchools = schools.filter(s => {
    if (profile?.role === 'teacher') return s.id === profile.school_id;
    return filterCity === 'all' || s.city_id === filterCity;
  });
  
  const availableClasses = classes.filter(c => {
    if (profile?.role === 'teacher') return teacherClasses.includes(c.id);
    return filterSchool === 'all' || c.school_id === filterSchool;
  });

  const filteredStats = stats
    .filter(u => {
      // 1. Исключаем наблюдателей, скрытых и неподтвержденных пользователей из рейтинга
      if (u.is_observer || u.is_hidden || !u.is_profile_setup_completed) return false;

      // 2. ЖЕСТКОЕ ОГРАНИЧЕНИЕ ДЛЯ УЧИТЕЛЕЙ (только приписанные классы)
      if (profile?.role === 'teacher' && !teacherClasses.includes(u.class_id)) return false;
      
      // 3. ЖЕСТКОЕ ОГРАНИЧЕНИЕ ДЛЯ УЧЕНИКОВ (видят только свою школу)
      if (profile?.role === 'player' && u.school_id !== profile?.school_id) return false;

      // 4. Стандартные фильтры
      if (filterCity !== 'all' && u.city_id !== filterCity) return false;
      if (filterSchool !== 'all' && u.school_id !== filterSchool) return false;
      if (filterClass !== 'all' && u.class_id !== filterClass) return false;
      return true;
    })
    .sort((a, b) => sortBy === 'points' ? b.totalPoints - a.totalPoints : b.passedQuizzes - a.passedQuizzes);

  const getDisplayName = (u) => {
    const isMe = u.id === session.user.id;
    const isAdminOrCreator = profile?.role === 'admin' || profile?.role === 'creator';
    // Учитель также может видеть имена учеников СВОЕЙ школы (это уже отфильтровано выше)
    const isTeacher = profile?.role === 'teacher';

    if (!u.is_anonymous || isAdminOrCreator || isTeacher || isMe) return `${u.last_name || ''} ${u.first_name || ''}`.trim() || 'Без имени';
    return 'Анонимный пользователь';
  };

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

      doc.text(`Отчет по успеваемости`, 20, 20);

      const tableData = filteredStats.map(u => [
        getDisplayName(u),
        cities.find(c => c.id === u.city_id)?.name || '—',
        schools.find(s => s.id === u.school_id)?.name || '—',
        classes.find(c => c.id === u.class_id)?.name || '—',
        u.passedQuizzes,
        u.totalPoints,
        `${u.avgScore}%`
      ]);

      autoTable(doc, {
        head: [['ФИО', 'Город', 'Школа', 'Класс', 'Пройдено', 'Баллы', 'Ср. %']],
        body: tableData,
        startY: 30,
        styles: { font: 'Roboto' },
        headStyles: { fontStyle: 'normal' }
      });

      doc.save(`Статистика_${new Date().toLocaleDateString()}.pdf`);
    } catch (error) {
      alert("Не удалось создать PDF.");
    }
  };

  const StatSkeleton = () => (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px' }}>
        <div className="skeleton" style={{ height: '35px', width: '300px' }} />
        <div className="skeleton" style={{ height: '45px', width: '160px', borderRadius: '100px' }} />
      </div>
      <div className="card" style={{ marginBottom: '30px', height: '80px' }}>
        <div className="skeleton" style={{ height: '100%', width: '100%' }} />
      </div>
      <div className="grid-2" style={{ gap: '20px', marginBottom: '40px' }}>
        {[1, 2].map(i => (
          <div key={i} className="card" style={{ height: '120px' }}>
            <div className="skeleton" style={{ height: '100%', width: '100%' }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 0 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ padding: '20px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <div className="skeleton" style={{ height: '30px', width: '100%' }} />
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) return <StatSkeleton />;

  const isObserver = profile?.role === 'player' && profile?.is_observer;
  const hasAccess = session && !isObserver;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <h2 style={{ fontSize: '2rem' }}>Статистика и Рейтинг</h2>
        {hasAccess && (profile?.role === 'admin' || profile?.role === 'creator' || profile?.role === 'editor' || profile?.role === 'teacher') && (
          <button onClick={generatePDF} style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none' }}>
            <Download size={18} style={{ marginRight: '8px' }} /> Скачать PDF
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: '30px', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={20} style={{ opacity: 0.5 }} />
        <select
          id="stat-filter-city"
          name="city"
          value={filterCity}
          onChange={e => { setFilterCity(e.target.value); setFilterSchool('all'); setFilterClass('all'); }}
          style={{ width: 'auto', flex: 1, minWidth: '150px' }}
          disabled={!hasAccess || profile?.role === 'teacher' || profile?.role === 'player'}
        >
          <option value="all">Все города</option>
          {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select
          id="stat-filter-school"
          name="school"
          value={filterSchool}
          onChange={e => { setFilterSchool(e.target.value); setFilterClass('all'); }}
          style={{ width: 'auto', flex: 1, minWidth: '150px' }}
          disabled={!hasAccess || profile?.role === 'teacher' || profile?.role === 'player'}
        >
          <option value="all">Все школы</option>
          {availableSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select
          id="stat-filter-class"
          name="class"
          value={filterClass}
          onChange={e => setFilterClass(e.target.value)}
          style={{ width: 'auto', flex: 1, minWidth: '150px' }}
          disabled={!hasAccess}
        >
          <option value="all">Все классы</option>
          {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!hasAccess ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 30px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.02) 0%, rgba(168, 85, 247, 0.02) 100%)', border: '1px dashed rgba(99, 102, 241, 0.2)' }}>
          <div style={{ 
            width: '80px', height: '80px', borderRadius: '24px', 
            background: 'rgba(99, 102, 241, 0.08)', color: 'var(--primary-color)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            margin: '0 auto 25px', transform: 'rotate(-5deg)' 
          }}>
            {!session ? <Users size={40} /> : <MapPin size={40} />}
          </div>
          <h2 style={{ marginBottom: '15px', fontSize: '1.8rem' }}>
            {!session ? 'Требуется авторизация' : 'Доступ ограничен'}
          </h2>
          <p style={{ opacity: 0.7, lineHeight: '1.6', marginBottom: '30px', maxWidth: '500px', margin: '0 auto 30px' }}>
            {!session 
              ? 'Статистика и мировой рейтинг доступны только авторизованным пользователям системы. Пожалуйста, войдите в свой аккаунт.' 
              : 'Вы находитесь в режиме наблюдателя. Рейтинг и детальная статистика доступны только ученикам, привязанным к конкретному классу и школе.'}
          </p>
          {!session ? (
            <button onClick={() => navigate('/auth')} style={{ padding: '12px 35px' }}>Войти в систему</button>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'rgba(0,0,0,0.03)', borderRadius: '12px', fontSize: '0.9rem', opacity: 0.6 }}>
              <AlertTriangle size={16} /> Свяжитесь с учителем для активации профиля
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '40px' }}>
            <StatSummaryCard icon={<Users size={24} />} label="Всего учеников" value={filteredStats.length} />
            <StatSummaryCard icon={<School size={24} />} label={profile?.role === 'teacher' ? 'Моя школа' : 'Классов'} value={profile?.role === 'teacher' ? schools.find(s => s.id === profile.school_id)?.name || '—' : availableClasses.length} />
            <StatSummaryCard icon={<Trophy size={24} />} label="Лидер" value={filteredStats.length > 0 ? getDisplayName(filteredStats[0]) : '—'} />
          </div>

          <div className="card" style={{ padding: '0' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: '20px' }}>
              <button onClick={() => setSortBy('points')} style={{ padding: '8px 20px', background: sortBy === 'points' ? 'var(--primary-color)' : 'transparent', color: sortBy === 'points' ? 'white' : 'inherit', boxShadow: 'none' }}>По баллам</button>
              <button onClick={() => setSortBy('quizzes')} style={{ padding: '8px 20px', background: sortBy === 'quizzes' ? 'var(--primary-color)' : 'transparent', color: sortBy === 'quizzes' ? 'white' : 'inherit', boxShadow: 'none' }}>По кол-ву тестов</button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <tr>
                    <th style={{ padding: '20px' }}>Место</th>
                    <th style={{ padding: '20px' }}>Ученик</th>
                    <th style={{ padding: '20px' }}>Учебное заведение</th>
                    <th style={{ padding: '20px' }}>Пройдено</th>
                    <th style={{ padding: '20px' }}>Баллы</th>
                    <th style={{ padding: '20px' }}>Ср. %</th>
                    <th style={{ padding: '20px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStats.map((u, idx) => {
                    const isMe = u.id === session.user.id;
                    const rowBg = u.isSuspicious ? 'rgba(239, 68, 68, 0.25)' : (u.isUnderperforming ? 'rgba(250, 204, 21, 0.3)' : (isMe ? 'rgba(99, 102, 241, 0.05)' : 'transparent'));
                    
                    return (
                      <tr key={u.id} style={{
                        borderBottom: '1px solid rgba(0,0,0,0.01)',
                      }}>
                        <td style={{ padding: '20px', background: rowBg, verticalAlign: 'middle' }}>
                          <div className="flex-center" style={{ width: '30px', height: '30px', borderRadius: '50%', background: idx < 3 ? 'var(--accent-color)' : 'rgba(0,0,0,0.05)', color: idx < 3 ? 'white' : 'inherit', fontSize: '0.8rem', fontWeight: '800' }}>{idx + 1}</div>
                        </td>
                        <td style={{ padding: '20px', fontWeight: isMe ? '700' : '400', color: u.isSuspicious ? '#ef4444' : 'inherit', background: rowBg, verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', lineHeight: '1.2' }}>
                            {getDisplayName(u)}
                            <div style={{ display: 'flex', alignItems: 'center', height: '14px' }}>
                              {u.isSuspicious && <AlertTriangle size={14} title="Подозрение в читерстве" color="#ef4444" />}
                              {!u.isSuspicious && u.isUnderperforming && <AlertTriangle size={14} title="Низкая успеваемость" color="#ca8a04" />}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '20px', background: rowBg, verticalAlign: 'middle' }}>
                          <div style={{ opacity: 0.7, fontSize: '0.85rem' }}>
                            <div>{cities.find(c => c.id === u.city_id)?.name || '—'}</div>
                            <div>{schools.find(s => s.id === u.school_id)?.name || '—'}</div>
                            <div style={{ fontWeight: 'bold' }}>{classes.find(c => c.id === u.class_id)?.name || '—'}</div>
                          </div>
                        </td>
                        <td style={{ padding: '20px', fontWeight: '500', background: rowBg }}>{u.passedQuizzes}</td>
                        <td style={{ padding: '20px', fontWeight: '700', color: 'var(--primary-color)', background: rowBg }}>{u.totalPoints}</td>
                        <td style={{ padding: '20px', background: rowBg, verticalAlign: 'middle' }}>
                          <div className="flex-center" style={{ gap: '10px', justifyContent: 'flex-start', height: '100%' }}>
                            <div style={{ width: '60px', height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', overflow: 'hidden', display: 'flex' }}>
                              <div style={{ width: `${u.avgScore}%`, height: '100%', background: u.avgScore >= 50 ? '#4ade80' : '#f87171' }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', opacity: 0.6, lineHeight: '1' }}>{u.avgScore}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '20px', background: rowBg, verticalAlign: 'middle' }}>
                          {(profile?.role === 'teacher' || profile?.role === 'admin' || profile?.role === 'creator') && (
                            <button
                              onClick={() => navigate(`/user-analytics?userId=${u.id}`)}
                              style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', padding: '6px', borderRadius: '8px', boxShadow: 'none' }}
                              title="Аналитика ученика"
                            >
                              <Info size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const StatSummaryCard = ({ icon, label, value }) => (
  <div className="card flex-center" style={{ gap: '20px', justifyContent: 'flex-start' }}>
    <div style={{ padding: '15px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '15px' }}>{icon}</div>
    <div><p style={{ fontSize: '0.8rem', opacity: 0.5 }}>{label}</p><h3 style={{ fontSize: '1.5rem', margin: 0 }}>{value}</h3></div>
  </div>
);

export default Statistics;