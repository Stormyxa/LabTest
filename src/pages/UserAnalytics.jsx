import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ChevronLeft, BarChart2, Search, Filter, Shield, EyeOff, AlertTriangle, Menu } from 'lucide-react';

const UserAnalytics = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const userIdParam = searchParams.get('userId');

  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  
  // Sidebar data
  const [cities, setCities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [users, setUsers] = useState([]);
  
  // Filters
  const [filterCity, setFilterCity] = useState(sessionStorage.getItem('ua_u_city') || 'all');
  const [filterSchool, setFilterSchool] = useState(sessionStorage.getItem('ua_u_school') || 'all');
  const [filterClass, setFilterClass] = useState(sessionStorage.getItem('ua_u_class') || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = React.useRef(null);

  useEffect(() => { sessionStorage.setItem('ua_u_city', filterCity); }, [filterCity]);
  useEffect(() => { sessionStorage.setItem('ua_u_school', filterSchool); }, [filterSchool]);
  useEffect(() => { sessionStorage.setItem('ua_u_class', filterClass); }, [filterClass]);

  // Main View
  const [targetUser, setTargetUser] = useState(null);
  const [latestAttempts, setLatestAttempts] = useState([]);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [quizzesMap, setQuizzesMap] = useState({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(p);
      
      const isPrivileged = p.role === 'admin' || p.role === 'creator' || p.role === 'teacher' || p.role === 'editor';
      if (!isPrivileged) {
        setSidebarOpen(false);
      }

      if (isPrivileged) {
        // Fetch structure for filters
        const { data: c } = await supabase.from('cities').select('*').order('name');
        const { data: s } = await supabase.from('schools').select('*').order('name');
        const { data: cl } = await supabase.from('classes').select('*').order('name');
        if (c) setCities(c);
        if (s) setSchools(s);
        if (cl) setClasses(cl);

        // Fetch users
        let query = supabase.from('profiles').select('*');
        if (p.role === 'teacher') query = query.eq('school_id', p.school_id);
        
        const { data: allProfs } = await query;
        if (allProfs) setUsers(allProfs);
      }

      const effectiveUserId = userIdParam || (!isPrivileged ? p.id : null);
      if (effectiveUserId) {
        if (!isPrivileged && effectiveUserId !== p.id) {
            // Unprivileged users can only see their own
            await fetchUserAnalytics(p.id, p);
        } else {
            await fetchUserAnalytics(effectiveUserId, p);
        }
      }
    }
    setLoading(false);
    
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = sessionStorage.getItem('ua_list_scroll') || 0;
    }, 100);
  };

  const fetchUserAnalytics = async (uId, currentUserProfile = profile) => {
    setContentLoading(true);
    const { data: u } = await supabase.from('profiles').select('*').eq('id', uId).single();
    if (u) setTargetUser(u);

    // Fetch all attempts for user, ordered by date desc
    let attsQuery = supabase.from('quiz_attempts').select('*').eq('user_id', uId).order('created_at', { ascending: false });
    
    // If editor, we need to only fetch attempts for quizzes they authored
    if (currentUserProfile?.role === 'editor') {
      const { data: myQuizzes } = await supabase.from('quizzes').select('id').eq('author_id', currentUserProfile.id);
      if (myQuizzes && myQuizzes.length > 0) {
        attsQuery = attsQuery.in('quiz_id', myQuizzes.map(q => q.id));
      } else {
        // Editor has no quizzes, return 0 attempts
        attsQuery = supabase.from('quiz_attempts').select('*').eq('id', 'uuid-that-does-not-exist'); // hacky way to force empty
      }
    }

    const { data: atts } = await attsQuery;

    if (atts && atts.length > 0) {
      // Find latest distinct 20 quizzes
      const distinctQuizzes = [];
      const seenQuizIds = new Set();
      
      for (const att of atts) {
        if (!seenQuizIds.has(att.quiz_id)) {
          seenQuizIds.add(att.quiz_id);
          distinctQuizzes.push(att);
          if (distinctQuizzes.length === 20) break;
        }
      }
      
      // Reverse to chronological for x-axis
      distinctQuizzes.reverse();
      setLatestAttempts(distinctQuizzes);

      // Fetch titles for these quizzes
      const qIds = distinctQuizzes.map(a => a.quiz_id);
      const { data: qz } = await supabase.from('quizzes').select('id, title').in('id', qIds);
      const qMap = {};
      if (qz) qz.forEach(q => qMap[q.id] = q.title);
      setQuizzesMap(qMap);

      if (distinctQuizzes.length > 0) setSelectedAttempt(distinctQuizzes[distinctQuizzes.length - 1]);
    } else {
      setLatestAttempts([]);
      setSelectedAttempt(null);
    }
    setContentLoading(false);
  };

  const handleScroll = (e) => {
    sessionStorage.setItem('ua_list_scroll', e.target.scrollTop);
  };

  const handleUserSelect = (uId) => {
    setSearchParams({ userId: uId });
    fetchUserAnalytics(uId);
  };

  const filteredUsers = users.filter(u => {
    if (!u.first_name?.trim() && !u.last_name?.trim()) return false;
    if (filterCity !== 'all' && u.city_id !== filterCity) return false;
    if (filterSchool !== 'all' && u.school_id !== filterSchool) return false;
    if (filterClass !== 'all' && u.class_id !== filterClass) return false;
    if (searchQuery) {
      const name = `${u.last_name || ''} ${u.first_name || ''}`.toLowerCase();
      if (!name.includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  });

  const aggregateStats = () => {
    if (latestAttempts.length === 0) return { passed: 0, failed: 0, suspicious: 0 };
    let passed = 0; let failed = 0; let suspicious = 0;
    latestAttempts.forEach(a => {
      if (a.is_suspicious) suspicious++;
      else if (a.is_passed) passed++;
      else failed++;
    });
    return { passed, failed, suspicious };
  };

  const currentStats = aggregateStats();
  const isPrivileged = profile?.role === 'admin' || profile?.role === 'creator' || profile?.role === 'teacher' || profile?.role === 'editor';

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 70px)', overflow: 'hidden' }}>
      {isPrivileged && (
        <div style={{ 
            width: sidebarOpen ? '320px' : '0', 
            background: 'var(--card-bg)', 
            borderRight: '1px solid rgba(0,0,0,0.05)', 
            transition: 'width 0.3s', 
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column'
          }}>
          <div style={{ padding: '20px', width: '320px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px' }}>
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Аналитика</h3>
              <button onClick={() => setSidebarOpen(false)} style={{ background: 'transparent', color: 'inherit', boxShadow: 'none', padding: '5px' }}><ChevronLeft size={20}/></button>
            </div>

            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', padding: '4px', marginBottom: '20px' }}>
              <button onClick={() => navigate('/analytics-details')} style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '0.8rem', background: 'transparent', border: 'none', boxShadow: 'none', cursor: 'pointer', color: 'var(--text-color)', opacity: 0.7 }}>По Тестам</button>
              <button style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '0.8rem', background: 'white', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', cursor: 'default', fontWeight: 'bold' }}>По Ученикам</button>
            </div>

            {loading ? (
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: '30px', marginBottom: '10px' }} />
                <div className="skeleton" style={{ height: '30px', marginBottom: '20px' }} />
                <div className="skeleton" style={{ height: '100px' }} />
              </div>
            ) : (
              <>
                <label htmlFor="ua-city" style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '10px', display: 'block' }}>Фильтры</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                  <select id="ua-city" value={filterCity} onChange={e => {setFilterCity(e.target.value); setFilterSchool('all'); setFilterClass('all');}} style={{ padding: '6px', fontSize: '0.85rem' }}>
                    <option value="all">Все города</option>
                    {cities.map(c => <option key={c.id} value={c.id} disabled={!users.some(u => u.city_id === c.id)}>{c.name}</option>)}
                  </select>
                  <select id="ua-school" value={filterSchool} onChange={e => {setFilterSchool(e.target.value); setFilterClass('all');}} disabled={profile?.role === 'teacher'} style={{ padding: '6px', fontSize: '0.85rem' }} aria-label="Школа">
                    <option value="all">Все школы</option>
                    {schools.filter(s => filterCity==='all' || s.city_id === filterCity).map(s => <option key={s.id} value={s.id} disabled={!users.some(u => u.school_id === s.id)}>{s.name}</option>)}
                  </select>
                  <select id="ua-class" value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ padding: '6px', fontSize: '0.85rem' }} aria-label="Класс">
                    <option value="all">Все классы</option>
                    {classes.filter(c => filterSchool==='all' || c.school_id === filterSchool).map(c => <option key={c.id} value={c.id} disabled={!users.some(u => u.class_id === c.id)}>{c.name}</option>)}
                  </select>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', opacity: 0.5 }} />
                    <label htmlFor="ua-search" style={{ display: 'none' }}>Поиск</label>
                    <input id="ua-search" type="text" placeholder="Поиск по имени..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '6px 10px 6px 30px', fontSize: '0.85rem' }} />
                  </div>
                </div>

                <label style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '10px', display: 'block' }}>Ученики ({filteredUsers.length})</label>
                <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', paddingRight: '5px' }}>
                  {filteredUsers.map(u => (
                    <button 
                      key={u.id} 
                      onClick={() => handleUserSelect(u.id)}
                      style={{ 
                        textAlign: 'left', padding: '10px', 
                        background: targetUser?.id === u.id ? 'var(--primary-color)' : 'rgba(0,0,0,0.02)',
                        color: targetUser?.id === u.id ? 'white' : 'var(--text-color)',
                        borderRadius: '8px', border: 'none', cursor: 'pointer',
                        fontSize: '0.85rem', width: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                      }}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{u.last_name} {u.first_name}</div>
                        <div style={{ opacity: 0.7, fontSize: '0.75rem' }}>{u.email}</div>
                      </div>
                      {u.is_observer && <Shield size={14} title="Наблюдатель" />}
                    </button>
                  ))}
                  {filteredUsers.length === 0 && <div style={{ fontSize: '0.8rem', opacity: 0.5, textAlign: 'center', marginTop: '10px' }}>Нет учеников по фильтру</div>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '40px 60px', overflowY: 'auto', position: 'relative', height: '100%' }}>
        {isPrivileged && !sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="flex-center" style={{ position: 'absolute', left: '20px', top: '40px', background: 'var(--card-bg)', color: 'inherit', padding: '10px', borderRadius: '10px', zIndex: 10 }}>
            <Menu size={20} />
          </button>
        )}
        <button onClick={() => navigate(-1)} className="flex-center" style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none', padding: '10px 20px', marginBottom: '20px', width: 'max-content', marginLeft: (!sidebarOpen && isPrivileged) ? '50px' : '0' }}>
          <ChevronLeft size={20} /> Вернуться
        </button>

        {loading || contentLoading ? (
          <div className="animate" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="skeleton" style={{ height: '40px', width: '300px' }} />
            <div className="skeleton" style={{ height: '30px', width: '200px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', margin: '30px 0' }}>
               <div className="skeleton" style={{ height: '100px' }} />
               <div className="skeleton" style={{ height: '100px' }} />
               <div className="skeleton" style={{ height: '100px' }} />
            </div>
            <div className="skeleton" style={{ height: '280px' }} />
          </div>
        ) : !targetUser ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', flexDirection: 'column', opacity: 0.5 }}>
            <BarChart2 size={64} style={{ marginBottom: '20px', color: 'var(--primary-color)' }} />
            <h2>Выберите ученика для анализа</h2>
          </div>
        ) : (
          <div className="animate">
            <h2 style={{ fontSize: '2rem', marginBottom: '10px' }}>
              {targetUser.last_name} {targetUser.first_name} 
              {targetUser.is_observer && <span style={{ marginLeft: '10px', fontSize: '0.8rem', background: 'rgba(250, 204, 21, 0.1)', color: '#ca8a04', padding: '4px 10px', borderRadius: '10px' }}>Наблюдатель</span>}
            </h2>
            <h3 style={{ opacity: 0.6, fontSize: '1.2rem', marginBottom: '30px' }}>Общая успеваемость по тестам</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
               <div className="card" style={{ padding: '20px' }}>
                 <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Пройдено (Уникальных)</div>
                 <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{latestAttempts.length} шт.</div>
               </div>
               <div className="card" style={{ padding: '20px' }}>
                 <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Успешных / Провальных</div>
                 <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#4ade80' }}>
                   {currentStats.passed} <span style={{color: 'var(--text-color)', opacity: 0.3}}>/</span> <span style={{color: '#facc15'}}>{currentStats.failed}</span>
                 </div>
               </div>
               <div className="card" style={{ padding: '20px' }}>
                 <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Подозрительных</div>
                 <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: currentStats.suspicious > 0 ? '#ef4444' : 'inherit' }}>{currentStats.suspicious}</div>
               </div>
            </div>

            <div className="card" style={{ marginBottom: '30px' }}>
              <h3 style={{ marginBottom: '20px' }}>Последние 20 активностей (Лучший из последних)</h3>
              {latestAttempts.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>Ученик ещё не проходил тесты{profile?.role === 'editor' && ' (либо не проходил ВАШИ тесты)'}</div>
              ) : (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', height: '240px', padding: '20px', background: 'rgba(0,0,0,0.02)', borderRadius: '15px' }}>
                  {/* Background Guide Lines + Text Labels */}
                  <div style={{ position: 'absolute', left: 0, top: '0%', width: '100%', borderTop: '2px dashed transparent', pointerEvents: 'none' }}>
                     <span style={{ position: 'absolute', left: '15px', top: '-10px', fontSize: '0.7rem', opacity: 0.5, fontWeight: 'bold' }}>100%</span>
                  </div>
                  <div style={{ position: 'absolute', left: 0, top: '20%', width: '100%', borderTop: '2px dashed rgba(74, 222, 128, 0.3)', pointerEvents: 'none' }}>
                     <span style={{ position: 'absolute', left: '15px', top: '-10px', fontSize: '0.7rem', color: '#4ade80', fontWeight: 'bold' }}>80%</span>
                  </div>
                  <div style={{ position: 'absolute', left: 0, top: '50%', width: '100%', borderTop: '2px dashed rgba(250, 204, 21, 0.3)', pointerEvents: 'none' }}>
                     <span style={{ position: 'absolute', left: '15px', top: '-10px', fontSize: '0.7rem', color: '#ca8a04', fontWeight: 'bold' }}>50%</span>
                  </div>
                  <div style={{ position: 'absolute', left: 0, top: '80%', width: '100%', borderTop: '2px dashed rgba(239, 68, 68, 0.3)', pointerEvents: 'none' }}>
                     <span style={{ position: 'absolute', left: '15px', top: '-10px', fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold' }}>20%</span>
                  </div>
                  
                  {/* Vertical Colorful Axis */}
                  <div style={{ zIndex: 5, width: '6px', height: '100%', background: 'linear-gradient(to top, rgba(239, 68, 68, 0.8) 0%, rgba(239, 68, 68, 0.8) 20%, rgba(250, 204, 21, 0.8) 20%, rgba(250, 204, 21, 0.8) 50%, rgba(74, 222, 128, 0.8) 50%, rgba(74, 222, 128, 0.8) 100%)', borderRadius: '3px', marginLeft: '35px', marginRight: '15px' }} />

                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '100%', flex: 1 }}>
                    {latestAttempts.map((att) => {
                      const heightPercent = (att.score / att.max_score) * 100;
                      const isZero = att.score === 0;
                      const isSelected = selectedAttempt?.id === att.id;
                      
                      let color = '#4ade80'; // Green
                      if (att.is_suspicious) color = '#ef4444'; // Red
                      else if (!att.is_passed) color = '#facc15'; // Yellow
                      
                      return (
                        <div 
                          key={att.id}
                          onClick={() => setSelectedAttempt(att)}
                          style={{
                            flex: 1, minWidth: '20px', maxWidth: '60px', height: '100%',
                            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                            cursor: 'pointer',
                            opacity: isSelected ? 1 : 0.6,
                            transition: 'opacity 0.2s',
                            position: 'relative', zIndex: 1
                          }}
                          title={`Тест: ${quizzesMap[att.quiz_id]}\nБалл: ${att.score}/${att.max_score}\nВремя: ${att.time_spent_total}с\n${att.is_suspicious ? '(Подозрительно)' : ''}`}
                        >
                          {/* Background representing Max Score for relativity */}
                          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.03)', borderRadius: '6px 6px 0 0', zIndex: 0 }} />
                          
                          <div style={{ textAlign: 'center', fontSize: '0.7rem', paddingBottom: '4px', fontWeight: 'bold', zIndex: 1 }}>{att.score}</div>
                          <div style={{ 
                            width: '100%', 
                            height: isZero ? '5px' : `${heightPercent}%`, 
                            background: isZero ? 'rgba(239, 68, 68, 0.3)' : color, 
                            borderRadius: '6px 6px 0 0',
                            borderBottom: 'none',
                            zIndex: 1
                          }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {selectedAttempt && (
               <div className="card animate" style={{ padding: '30px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                      <h3 style={{ marginBottom: '5px' }}>{quizzesMap[selectedAttempt.quiz_id] || 'Неизвестный тест'}</h3>
                      <div style={{ opacity: 0.6, fontSize: '0.85rem' }}>Дата: {new Date(selectedAttempt.created_at).toLocaleString()}</div>
                    </div>
                    {selectedAttempt.is_suspicious && (
                       <span style={{ fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: '10px' }}>
                         <AlertTriangle size={14} style={{ display: 'inline', marginRight: '4px' }}/> Подозрительная активность
                       </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                    <div style={{ background: 'rgba(0,0,0,0.02)', padding: '15px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Результат</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: selectedAttempt.is_passed ? '#4ade80' : '#facc15' }}>{selectedAttempt.score} из {selectedAttempt.max_score}</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.02)', padding: '15px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Время прохождения</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{selectedAttempt.time_spent_total} сек</div>
                    </div>
                    {isPrivileged && (
                       <div style={{ display: 'flex', alignItems: 'center' }}>
                         <button onClick={() => navigate(`/analytics-details?quizId=${selectedAttempt.quiz_id}&userId=${targetUser.id}`)} style={{ width: '100%', padding: '15px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)' }}>
                           Детальный разбор
                         </button>
                       </div>
                    )}
                  </div>
               </div>
            )}
            
          </div>
        )}
      </div>
    </div>
  );
};

export default UserAnalytics;
