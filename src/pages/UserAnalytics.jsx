import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchWithCache, useCacheSync } from '../lib/cache';
import { ChevronLeft, BarChart2, Search, Filter, Shield, EyeOff, AlertTriangle, Menu, X, Clock, Calendar } from 'lucide-react';

const UserListItem = React.memo(({ u, isSelected, onSelect }) => (
  <button 
    onClick={() => onSelect(u.id)}
    className="user-sidebar-item"
    style={{ 
      textAlign: 'left', padding: '10px', 
      background: isSelected ? 'var(--primary-color)' : 'rgba(0,0,0,0.02)',
      color: isSelected ? 'white' : 'var(--text-color)',
      borderRadius: '8px', border: 'none', cursor: 'pointer',
      fontSize: '0.85rem', width: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      transition: 'background 0.2s, transform 0.2s'
    }}>
    <div>
      <div style={{ fontWeight: 'bold' }}>{u.last_name} {u.first_name}</div>
      <div style={{ opacity: 0.7, fontSize: '0.75rem' }}>{u.email}</div>
    </div>
    {u.is_observer && <Shield size={14} title="Наблюдатель" />}
  </button>
));

const SidebarUserList = React.memo(({ 
  users, 
  filteredUsers, 
  targetUser, 
  handleUserSelect, 
  scrollRef, 
  handleScroll, 
  loading 
}) => {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {loading ? (
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: '30px', marginBottom: '10px' }} />
          <div className="skeleton" style={{ height: '30px', marginBottom: '20px' }} />
          <div className="skeleton" style={{ height: '100px' }} />
        </div>
      ) : (
        <>
          <label style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '10px', display: 'block' }}>Ученики ({filteredUsers.length})</label>
          <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', paddingRight: '5px' }}>
            {filteredUsers.map(u => (
              <UserListItem
                key={u.id}
                u={u}
                isSelected={targetUser?.id === u.id}
                onSelect={handleUserSelect}
              />
            ))}
            {filteredUsers.length === 0 && <div style={{ fontSize: '0.8rem', opacity: 0.5, textAlign: 'center', marginTop: '10px' }}>Нет учеников по фильтру</div>}
          </div>
        </>
      )}
    </div>
  );
});

const ActivityHeatMap = React.memo(({ weeks, selectedDay, setSelectedDay }) => {
  const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const rowLabels = ['Пн', '', 'Ср', '', 'Пт', '', 'Вс'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: 'max-content', maxWidth: '100%' }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
        <div style={{ width: '30px' }} />
        <div style={{ display: 'flex', flex: 1, gap: '4px', position: 'relative', fontSize: '0.7rem', opacity: 0.5, height: '15px' }}>
          {weeks.map((week, wIdx) => week.monthLabel ? (
            <div key={wIdx} style={{ position: 'absolute', left: `${wIdx * 16}px`, whiteSpace: 'nowrap' }}>
              {monthNames[week.monthLabel - 1]}
            </div>
          ) : null)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', opacity: 0.5, paddingTop: '2px' }}>
          {rowLabels.map((l, i) => <div key={i} style={{ height: '12px' }}>{l}</div>)}
        </div>
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '10px', flex: 1 }}>
          {weeks.map((week, wIdx) => (
            <div key={wIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {week.days.map((day, dIdx) => (
                <div 
                  key={dIdx}
                  title={`${day.dateStr}: ${day.stats.total} тестов`}
                  onClick={() => setSelectedDay(day.dateStr)}
                  className={`heatmap-day ${selectedDay === day.dateStr ? 'selected' : ''}`}
                  style={{ 
                    width: '12px', height: '12px', 
                    background: day.color, 
                    borderRadius: '2px',
                    cursor: 'pointer',
                    border: selectedDay === day.dateStr ? '1px solid var(--primary-color)' : '1px solid transparent',
                    boxSizing: 'border-box'
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex-center" style={{ justifyContent: 'space-between', gap: '10px', fontSize: '0.75rem', opacity: 0.6, marginTop: '10px', width: '100%' }}>
        <div className="flex-center" style={{ gap: '15px' }}>
          <div className="flex-center" style={{ gap: '5px' }}><div style={{ width: '10px', height: '10px', background: 'rgba(74, 222, 128, 0.9)', borderRadius: '2px' }} /> <span>Успешно</span></div>
          <div className="flex-center" style={{ gap: '5px' }}><div style={{ width: '10px', height: '10px', background: 'rgba(250, 204, 21, 0.9)', borderRadius: '2px' }} /> <span>Провалено</span></div>
          <div className="flex-center" style={{ gap: '5px' }}><div style={{ width: '10px', height: '10px', background: 'rgba(239, 68, 68, 0.9)', borderRadius: '2px' }} /> <span>Подозрительно</span></div>
        </div>
        <div className="flex-center" style={{ gap: '8px' }}>
          <span>Меньше</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            <div style={{ width: '10px', height: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '2px' }} />
            <div style={{ width: '10px', height: '10px', background: 'rgba(74, 222, 128, 0.3)', borderRadius: '2px' }} />
            <div style={{ width: '10px', height: '10px', background: 'rgba(74, 222, 128, 0.6)', borderRadius: '2px' }} />
            <div style={{ width: '10px', height: '10px', background: 'rgba(74, 222, 128, 0.9)', borderRadius: '2px' }} />
          </div>
          <span>Больше</span>
        </div>
      </div>
    </div>
  );
});

const UserAnalytics = ({ session, profile: initialProfile }) => {
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
  const [filterCity, setFilterCity] = useState(sessionStorage.getItem('f_city') || 'all');
  const [filterSchool, setFilterSchool] = useState(sessionStorage.getItem('f_school') || 'all');
  const [filterClass, setFilterClass] = useState(sessionStorage.getItem('f_class') || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showObservers, setShowObservers] = useState(sessionStorage.getItem('an_show_observers') === 'true');
  const [sidebarOpen, setSidebarOpen] = useState(sessionStorage.getItem('ua_sidebar_open') !== 'false');
  const [viewMode, setViewMode] = useState('heatmap'); // 'heatmap' | 'histogram'
  const [heatmapRange, setHeatmapRange] = useState('last12'); // 'last12' | '2026' | '2025'
  const [totalUniqueQuizzes, setTotalUniqueQuizzes] = useState(0);
  const [allUserAttempts, setAllUserAttempts] = useState([]);
  const [quizzesMap, setQuizzesMap] = useState({});
  const scrollRef = React.useRef(null);

  useEffect(() => { sessionStorage.setItem('ua_sidebar_open', sidebarOpen); }, [sidebarOpen]);

  useEffect(() => { sessionStorage.setItem('an_show_observers', showObservers); }, [showObservers]);

  useEffect(() => { sessionStorage.setItem('f_city', filterCity); }, [filterCity]);
  useEffect(() => { sessionStorage.setItem('f_school', filterSchool); }, [filterSchool]);
  useEffect(() => { sessionStorage.setItem('f_class', filterClass); }, [filterClass]);

  // Main View
  const [targetUser, setTargetUser] = useState(null);
  const [latestAttempts, setLatestAttempts] = useState([]);
  const [firstAttemptsDates, setFirstAttemptsDates] = useState({});
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    if (initialProfile) {
      fetchInitialData();
    }
  }, [initialProfile]);

  const fetchInitialData = async () => {
    setLoading(true);
    const p = initialProfile;
    if (p) {
      setProfile(p);
      
      const isPrivileged = p.role === 'admin' || p.role === 'creator' || p.role === 'teacher' || p.role === 'editor';
      if (!isPrivileged) {
        setSidebarOpen(false);
      }

      if (isPrivileged) {
        // Fetch structure for filters with caching in parallel
        const [c, s, cl] = await Promise.all([
          fetchWithCache('cities', () => supabase.from('cities').select('*').order('name').then(res => res.data)),
          fetchWithCache('schools', () => supabase.from('schools').select('*').order('name').then(res => res.data)),
          fetchWithCache('classes', () => supabase.from('classes').select('*').order('name').then(res => res.data))
        ]);
        if (c) setCities(c);
        if (s) setSchools(s);
        if (cl) setClasses(cl);

        // Automated Filtering Defaults
        if (p.role === 'teacher' || p.role === 'admin' || p.role === 'creator') {
          const sCity = sessionStorage.getItem('f_city');
          const sSchool = sessionStorage.getItem('f_school');
          
          if ((!sCity || sCity === 'all') && p.city_id) setFilterCity(p.city_id);
          if ((!sSchool || sSchool === 'all') && p.school_id) setFilterSchool(p.school_id);

          if (p.role === 'teacher') {
            if (p.city_id) setFilterCity(p.city_id);
            if (p.school_id) setFilterSchool(p.school_id);
          }
        }

        // Fetch users with SWR
        const usersCacheKey = `ua_users_${p.role === 'teacher' ? p.school_id : 'all'}`;
        const cachedUsers = await fetchWithCache(usersCacheKey, async () => {
          let query = supabase.from('profiles').select('id, first_name, last_name, city_id, school_id, class_id, is_observer');
          if (p.role === 'teacher') query = query.eq('school_id', p.school_id);
          
          const { data: allProfs } = await query;
          if (allProfs) {
            allProfs.sort((a, b) => {
              const res = (a.last_name || a.first_name || '').trim().localeCompare((b.last_name || b.first_name || '').trim(), 'ru');
              if (res !== 0) return res;
              return (a.first_name || '').trim().localeCompare((b.first_name || '').trim(), 'ru');
            });
            return allProfs;
          }
          return [];
        });

        if (cachedUsers && cachedUsers.length > 0) setUsers(cachedUsers);
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

  const fetchUserAnalytics = useCallback(async (uId, currentUserProfile = profile) => {
    setContentLoading(true);

    const targetUserCacheKey = `ua_target_${uId}`;
    const data = await fetchWithCache(targetUserCacheKey, async () => {
      // Parallel profile and initial attempts query check
      const [{ data: u }, { data: myQuizzes }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uId).single(),
        (async () => {
          if (currentUserProfile?.role === 'editor') {
            return await supabase.from('quizzes').select('id').eq('author_id', currentUserProfile.id);
          }
          return { data: null };
        })()
      ]);

      if (u) setTargetUser(u);

      // Build the attempts query based on the fetched quiz list (if editor)
      let attsQuery = supabase.from('quiz_attempts').select('*').eq('user_id', uId).order('created_at', { ascending: false });
      
      if (currentUserProfile?.role === 'editor') {
        if (myQuizzes && myQuizzes.length > 0) {
          attsQuery = attsQuery.in('quiz_id', myQuizzes.map(q => q.id));
        } else {
          attsQuery = supabase.from('quiz_attempts').select('*').eq('id', '00000000-0000-0000-0000-000000000000'); // empty
        }
      }

      const { data: atts } = await attsQuery;
      
      return { profile: u, attempts: atts || [] };
    });

    if (data) {
      if (data.profile) setTargetUser(data.profile);
      const atts = data.attempts;

      if (atts && atts.length > 0) {
      // Find the first attempt date for each quiz
      const firstMap = {};
      atts.forEach(att => {
        if (!firstMap[att.quiz_id] || new Date(att.created_at) < new Date(firstMap[att.quiz_id])) {
          firstMap[att.quiz_id] = att.created_at;
        }
      });
      setFirstAttemptsDates(firstMap);

      // Group by quiz to find suspicious tests
      const quizStats = {};
      atts.forEach(a => {
        if (!quizStats[a.quiz_id]) quizStats[a.quiz_id] = { total: 0, suspicious: 0, failed: 0 };
        quizStats[a.quiz_id].total++;
        if (a.is_suspicious) quizStats[a.quiz_id].suspicious++;
        if (!a.is_passed) quizStats[a.quiz_id].failed++;
      });

      // Mark quizes as "Red" (suspicious) or "Yellow" (underperforming)
      const redQuizIds = new Set();
      const failedQuizIds = new Set();
      Object.entries(quizStats).forEach(([qId, s]) => {
        if (s.suspicious / s.total >= 0.4) redQuizIds.add(qId);
        else if (s.failed / s.total > 0.5) failedQuizIds.add(qId);
      });

      // Find latest distinct 20 quizzes
      const distinctQuizzes = [];
      const seenQuizIds = new Set();
      
      for (const att of atts) {
        if (!seenQuizIds.has(att.quiz_id)) {
          seenQuizIds.add(att.quiz_id);
          // Attach the "red" status to the attempt object for easy rendering
          distinctQuizzes.push({
            ...att,
            isQuizRed: redQuizIds.has(att.quiz_id)
          });
          if (distinctQuizzes.length === 20) break;
        }
      }
      
      // Reverse to chronological for x-axis
      distinctQuizzes.reverse();
      setLatestAttempts(distinctQuizzes);

      // Calculate total unique quizzes correctly before capping
      const totalUnique = new Set(atts.map(a => a.quiz_id)).size;
      setTotalUniqueQuizzes(totalUnique);
      setAllUserAttempts(atts);

      // Fetch titles for these quizzes
      const qIds = Array.from(new Set(atts.map(a => a.quiz_id)));
      const { data: qz } = await supabase.from('quizzes').select('id, title').in('id', qIds);
      const qMap = {};
      if (qz) qz.forEach(q => qMap[q.id] = q.title);
      setQuizzesMap(qMap);

      if (distinctQuizzes.length > 0) setSelectedAttempt(distinctQuizzes[distinctQuizzes.length - 1]);
      setSelectedDay(null);
      setSelectedDay(null);
    } else {
      setLatestAttempts([]);
      setTotalUniqueQuizzes(0);
      setAllUserAttempts([]);
      setSelectedAttempt(null);
      setSelectedDay(null);
    }
    }
    setContentLoading(false);
  }, [profile]);

  useCacheSync(`ua_target_${targetUser?.id}`, async (freshData) => {
    if (!freshData) return;
    if (freshData.profile) setTargetUser(freshData.profile);
    const atts = freshData.attempts;
    if (atts && atts.length > 0) {
      const distinctQuizzes = [];
      const seenQuizIds = new Set();
      for (const att of atts) {
        if (!seenQuizIds.has(att.quiz_id)) {
          seenQuizIds.add(att.quiz_id);
          distinctQuizzes.push(att);
          if (distinctQuizzes.length === 20) break;
        }
      }
      distinctQuizzes.reverse();
      setLatestAttempts(distinctQuizzes);
      setTotalUniqueQuizzes(new Set(atts.map(a => a.quiz_id)).size);
      setAllUserAttempts(atts);
      
      const qIds = Array.from(new Set(atts.map(a => a.quiz_id)));
      const { data: qz } = await supabase.from('quizzes').select('id, title').in('id', qIds);
      const qMap = {};
      if (qz) qz.forEach(q => qMap[q.id] = q.title);
      setQuizzesMap(qMap);
      
      if (distinctQuizzes.length > 0) setSelectedAttempt(distinctQuizzes[distinctQuizzes.length - 1]);
    } else {
      setLatestAttempts([]);
      setAllUserAttempts([]);
      setSelectedAttempt(null);
    }
  });

  useCacheSync(`ua_users_${profile?.role === 'teacher' ? profile?.school_id : 'all'}`, (cachedUsers) => {
    if (cachedUsers && cachedUsers.length > 0) setUsers(cachedUsers);
  });

  const handleScroll = useCallback((e) => {
    sessionStorage.setItem('ua_list_scroll', e.target.scrollTop);
  }, []);

  const handleUserSelect = useCallback((uId) => {
    // Immediate UI feedback
    const u = users.find(user => user.id === uId);
    if (u) {
      React.startTransition(() => {
        setTargetUser(u);
      });
    }
    setSearchParams({ userId: uId });
    fetchUserAnalytics(uId);
  }, [fetchUserAnalytics, setSearchParams, users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (!u.first_name?.trim() && !u.last_name?.trim()) return false;
      if (!showObservers && u.is_observer) return false;
      if (filterCity !== 'all' && u.city_id !== filterCity) return false;
      if (filterSchool !== 'all' && u.school_id !== filterSchool) return false;
      if (filterClass !== 'all' && u.class_id !== filterClass) return false;
      if (searchQuery) {
        const name = `${u.last_name || ''} ${u.first_name || ''}`.toLowerCase();
        if (!name.includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }, [users, showObservers, filterCity, filterSchool, filterClass, searchQuery]);

  const selectedDayAttempts = useMemo(() => {
    if (!selectedDay || !allUserAttempts.length) return [];
    return allUserAttempts.filter(a => {
      const d = new Date(a.created_at);
      d.setHours(d.getHours() + 5);
      return d.toISOString().slice(0, 10) === selectedDay;
    });
  }, [allUserAttempts, selectedDay]);

  const currentStats = useMemo(() => {
    const dataToUse = allUserAttempts.length > 0 ? allUserAttempts : latestAttempts;
    if (dataToUse.length === 0) return { passed: 0, failed: 0, suspicious: 0 };
    let passed = 0; let failed = 0; let suspicious = 0;
    dataToUse.forEach(a => {
      if (a.is_suspicious) suspicious++;
      else if (a.is_passed) passed++;
      else failed++;
    });
    const isSuspicious = dataToUse.length > 0 && (suspicious / dataToUse.length) > 0.4;
    return { passed, failed, suspicious, isSuspicious };
  }, [allUserAttempts, latestAttempts]);

  const heatmapData = useMemo(() => {
    if (!targetUser || viewMode !== 'heatmap') return null;

    const getKZDay = (dateInput) => {
      const d = new Date(dateInput);
      d.setHours(d.getHours() + 5);
      return d.toISOString().slice(0, 10);
    };

    const today = new Date();
    const daysToShow = [];
    
    if (heatmapRange === 'last12') {
      for (let i = 364; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        daysToShow.push(getKZDay(d));
      }
    } else {
      const year = parseInt(heatmapRange);
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        daysToShow.push(getKZDay(d));
      }
    }

    const statsByDay = {};
    allUserAttempts.forEach(a => {
      const dStr = getKZDay(a.created_at);
      if (!statsByDay[dStr]) statsByDay[dStr] = { total: 0, suspicious: 0, failed: 0 };
      statsByDay[dStr].total++;
      if (a.is_suspicious) statsByDay[dStr].suspicious++;
      if (!a.is_passed) statsByDay[dStr].failed++;
    });

    const maxInDay = Math.max(...Object.values(statsByDay).map(s => s.total), 1);
    const weeks = [];
    let currentWeek = [];
    
    daysToShow.forEach((dateStr, idx) => {
      const stats = statsByDay[dateStr] || { total: 0, suspicious: 0, failed: 0 };
      let color = 'rgba(0,0,0,0.05)';
      if (stats.total > 0) {
        const intensity = 0.3 + (stats.total / maxInDay) * 0.7;
        if (stats.suspicious / stats.total >= 0.4) color = `rgba(239, 68, 68, ${intensity})`;
        else if (stats.failed / stats.total >= 0.4) color = `rgba(250, 204, 21, ${intensity})`;
        else color = `rgba(74, 222, 128, ${intensity})`;
      }
      currentWeek.push({ dateStr, stats, color });
      if (currentWeek.length === 7 || idx === daysToShow.length - 1) {
        // Detect month transitions for labels
        const [y, m, d] = currentWeek[0].dateStr.split('-').map(Number);
        const monthLabel = d <= 7 ? m : null;
        weeks.push({ days: currentWeek, monthLabel });
        currentWeek = [];
      }
    });

    return weeks;
  }, [allUserAttempts, heatmapRange, viewMode, targetUser]);
  const isPrivileged = useMemo(() => profile?.role === 'admin' || profile?.role === 'creator' || profile?.role === 'teacher' || profile?.role === 'editor', [profile]);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 70px)', overflow: 'hidden' }}>
      {isPrivileged && (
        <>
          <div 
            className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          />
          <div 
            className={`details-sidebar ${sidebarOpen ? 'open' : ''}`}
            style={{ 
              background: 'var(--card-bg)', 
              borderRight: '1px solid rgba(0,0,0,0.05)', 
              display: 'flex', flexDirection: 'column',
              width: sidebarOpen ? '320px' : '0',
              opacity: sidebarOpen ? 1 : 0,
              visibility: sidebarOpen ? 'visible' : 'hidden',
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s, visibility 0.3s',
              overflow: 'hidden',
              flexShrink: 0
            }}>
            <div style={{ padding: '20px', width: '320px', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px' }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Аналитика</h3>
                <button onClick={() => setSidebarOpen(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none', padding: '8px', borderRadius: '10px' }}><X size={20}/></button>
              </div>

              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', padding: '4px', marginBottom: '15px' }}>
                <button onClick={() => navigate('/analytics-details')} style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '0.8rem', background: 'transparent', border: 'none', boxShadow: 'none', cursor: 'pointer', color: 'var(--text-color)', opacity: 0.7 }}>По Тестам</button>
                <button style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '0.8rem', background: 'var(--card-bg)', border: 'none', boxShadow: 'var(--soft-shadow)', cursor: 'default', fontWeight: 'bold', color: 'var(--primary-color)' }}>По Ученикам</button>
              </div>

              <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.02)', padding: '10px', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Показать наблюдателей</span>
                <button 
                  onClick={() => setShowObservers(!showObservers)}
                  style={{ 
                    width: '40px', height: '20px', borderRadius: '10px', 
                    background: showObservers ? 'var(--primary-color)' : '#ccc',
                    position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.3s'
                  }}
                >
                  <div style={{ 
                    position: 'absolute', top: '2px', left: showObservers ? '22px' : '2px',
                    width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.3s'
                  }} />
                </button>
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
                    <select id="ua-city" value={filterCity} onChange={e => {setFilterCity(e.target.value); setFilterSchool('all'); setFilterClass('all');}} style={{ padding: '6px', fontSize: '0.85rem' }} disabled={profile?.role === 'teacher'}>
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

                  <SidebarUserList 
                    users={users}
                    filteredUsers={filteredUsers}
                    targetUser={targetUser}
                    handleUserSelect={handleUserSelect}
                    scrollRef={scrollRef}
                    handleScroll={handleScroll}
                    loading={loading}
                  />
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Main Content Area */}
      <div className="main-content" style={{ flex: 1, padding: '40px 60px', overflowY: 'auto', position: 'relative', height: '100%' }}>
        {isPrivileged && !sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="flex-center sidebar-toggle-btn" style={{ position: 'absolute', left: '20px', top: '40px', background: 'var(--card-bg)', color: 'inherit', padding: '10px', borderRadius: '10px', zIndex: 10 }}>
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
            <h2 style={{ fontSize: '2rem', marginBottom: '10px', color: targetUser.is_suspicious_profile ? '#ef4444' : (targetUser.is_underperforming_profile ? '#ca8a04' : 'inherit') }}>
              {targetUser.last_name} {targetUser.first_name} 
              {targetUser.is_suspicious_profile && <span style={{ marginLeft: '10px', fontSize: '0.9rem', background: '#ef4444', color: 'white', padding: '4px 12px', borderRadius: '20px', verticalAlign: 'middle' }}>Читер</span>}
              {!targetUser.is_suspicious_profile && targetUser.is_underperforming_profile && <span style={{ marginLeft: '10px', fontSize: '0.8rem', background: 'rgba(250, 204, 21, 0.1)', color: '#ca8a04', padding: '4px 10px', borderRadius: '10px' }}>Низкая успеваемость</span>}
              {targetUser.is_observer && <span style={{ marginLeft: '10px', fontSize: '0.8rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '4px 10px', borderRadius: '10px' }}>Наблюдатель</span>}
            </h2>
            <h3 style={{ opacity: 0.6, fontSize: '1.2rem', marginBottom: '30px' }}>Общая успеваемость по тестам</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', marginBottom: '30px' }}>
               <div className="card" style={{ padding: '20px' }}>
                 <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Пройдено (Уникальных)</div>
                 <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{totalUniqueQuizzes} шт.</div>
               </div>
               <div className="card" style={{ padding: '20px' }}>
                 <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Успешных / Провальных</div>
                 <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#4ade80' }}>
                   {currentStats.passed} <span style={{color: 'var(--text-color)', opacity: 0.3}}>/</span> <span style={{color: '#facc15'}}>{currentStats.failed}</span>
                 </div>
               </div>
               <div className="card" style={{ padding: '20px', border: currentStats.suspicious > 0 ? '1px solid #ef4444' : 'none' }}>
                 <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Подозрительных</div>
                 <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: currentStats.suspicious > 0 ? '#ef4444' : 'inherit' }}>{currentStats.suspicious}</div>
               </div>
            </div>

            <div className="card" style={{ marginBottom: '30px' }}>
              <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <h3 style={{ margin: 0 }}>История активности</h3>
                <div className="flex-center" style={{ gap: '10px' }}>
                  {viewMode === 'heatmap' && (
                    <select 
                      value={heatmapRange} 
                      onChange={(e) => setHeatmapRange(e.target.value)}
                      style={{ padding: '5px 10px', borderRadius: '8px', fontSize: '0.85rem' }}
                    >
                      <option value="last12">За последние 12 мес.</option>
                      <option value="2026">2026 год</option>
                      <option value="2025">2025 год</option>
                    </select>
                  )}
                  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', padding: '2px' }}>
                    <button 
                      onClick={() => setViewMode('heatmap')}
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '8px', border: 'none', background: viewMode === 'heatmap' ? 'var(--card-bg)' : 'transparent', boxShadow: viewMode === 'heatmap' ? 'var(--soft-shadow)' : 'none', color: viewMode === 'heatmap' ? 'var(--primary-color)' : 'inherit', fontWeight: viewMode === 'heatmap' ? 'bold' : 'normal', cursor: 'pointer' }}
                    >
                      HeatMap
                    </button>
                    <button 
                      onClick={() => setViewMode('histogram')}
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '8px', border: 'none', background: viewMode === 'histogram' ? 'var(--card-bg)' : 'transparent', boxShadow: viewMode === 'histogram' ? 'var(--soft-shadow)' : 'none', color: viewMode === 'histogram' ? 'var(--primary-color)' : 'inherit', fontWeight: viewMode === 'histogram' ? 'bold' : 'normal', cursor: 'pointer' }}
                    >
                      Последние 20
                    </button>
                  </div>
                </div>
              </div>



              {viewMode === 'heatmap' ? (
                <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {heatmapData && (
                    <ActivityHeatMap 
                      weeks={heatmapData} 
                      selectedDay={selectedDay} 
                      setSelectedDay={setSelectedDay} 
                    />
                  )}
                </div>
              ) : (
                <>
                  <h3 style={{ marginBottom: '20px', fontSize: '1rem', opacity: 0.7 }}>Последние 20 активностей (Лучший результат по тестам)</h3>
                  {latestAttempts.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>Ученик ещё не проходил тесты{profile?.role === 'editor' && ' (либо не проходил ВАШИ тесты)'}</div>
                  ) : (
                    <div style={{ position: 'relative', display: 'flex', height: '240px', padding: '20px 20px 20px 0', background: 'rgba(0,0,0,0.02)', borderRadius: '15px' }}>
                      
                      <div style={{ width: '50px', position: 'relative', display: 'flex', justifyContent: 'flex-end', paddingRight: '15px', height: '100%' }}>
                        <div style={{ position: 'absolute', bottom: 0, width: '6px', height: '85%', background: 'linear-gradient(to top, #ef4444 0%, #ef4444 20%, #facc15 20%, #facc15 50%, #4ade80 50%, #4ade80 100%)', borderRadius: '3px', zIndex: 5 }} />
                      </div>

                      <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                        <div style={{ position: 'absolute', left: '-40px', bottom: '85%', width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(0,0,0,0.1)', pointerEvents: 'none' }}>
                          <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', opacity: 0.5, fontWeight: 'bold' }}>100%</span>
                        </div>
                        <div style={{ position: 'absolute', left: '-40px', bottom: `${85 * 0.8}%`, width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(74, 222, 128, 0.3)', pointerEvents: 'none' }}>
                          <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', color: '#4ade80', fontWeight: 'bold' }}>80%</span>
                        </div>
                        <div style={{ position: 'absolute', left: '-40px', bottom: `${85 * 0.5}%`, width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(250, 204, 21, 0.3)', pointerEvents: 'none' }}>
                          <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', color: '#ca8a04', fontWeight: 'bold' }}>50%</span>
                        </div>
                        <div style={{ position: 'absolute', left: '-40px', bottom: `${85 * 0.2}%`, width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(239, 68, 68, 0.3)', pointerEvents: 'none' }}>
                          <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold' }}>20%</span>
                        </div>

                        <div style={{ position: 'absolute', left: '-15px', bottom: '0', width: 'calc(100% + 15px)', height: '2px', background: 'var(--text-color)', opacity: 0.1, zIndex: 0 }} />

                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '100%', position: 'relative', zIndex: 1, overflowX: 'auto' }}>
                          {latestAttempts.map((att) => {
                            const heightPercent = (att.score / (att.max_score || 1)) * 85;
                            const isZero = att.score === 0;
                            const isSelected = selectedAttempt?.id === att.id;
                            const isFirst = firstAttemptsDates[att.quiz_id] === att.created_at;
                            
                            const isQuizRed = att.isQuizRed;
                            
                            let color = '#4ade80'; 
                            if (att.is_incomplete) color = '#9ca3af'; 
                            else if (isQuizRed || att.is_suspicious) color = '#ef4444'; 
                            else if (!att.is_passed) color = '#facc15'; 
                            if (currentStats.isSuspicious && att.score === att.max_score && !isQuizRed) color = '#ef4444';
                            
                            return (
                              <div 
                                key={att.id}
                                onClick={() => setSelectedAttempt(att)}
                                style={{
                                  flex: 1, minWidth: '30px', maxWidth: '60px', height: '100%',
                                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                                  cursor: 'pointer',
                                  opacity: isSelected ? 1 : 0.6,
                                  transition: 'opacity 0.2s', position: 'relative'
                                }}
                                title={`Тест: ${quizzesMap[att.quiz_id]}\nБалл: ${att.score}/${att.max_score}\nВремя: ${att.time_spent_total}с\n${att.is_incomplete ? '(Не завершен)' : (att.is_suspicious ? '(Подозрительно)' : '')}`}
                              >
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%', position: 'relative' }}>
                                  <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '85%', background: 'rgba(0,0,0,0.03)', borderRadius: '6px 6px 0 0', zIndex: 0 }} />
                                  
                                  {att.score === att.max_score && !targetUser.is_observer && (
                                    <div style={{ textAlign: 'center', fontSize: '1.2rem', marginBottom: '-2px', zIndex: 10 }}>👑</div>
                                  )}
                                  <div style={{ textAlign: 'center', fontSize: '0.7rem', paddingBottom: '4px', fontWeight: 'bold', zIndex: 1, whiteSpace: 'nowrap' }}>{att.score}</div>
                                  <div style={{ 
                                    width: '100%', 
                                    height: isZero ? '5px' : `${heightPercent}%`, 
                                    background: isZero ? (att.is_incomplete ? '#9ca3af' : 'rgba(239, 68, 68, 0.3)') : color, 
                                    borderRadius: '6px 6px 0 0',
                                    zIndex: 1,
                                    position: 'relative'
                                  }}>
                                    {isFirst && !isZero && (heightPercent > 10) && (
                                      <div style={{ 
                                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                        background: 'white', color: color, width: '16px', height: '16px', borderRadius: '50%',
                                        fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontWeight: 'bold', pointerEvents: 'none'
                                      }}>1</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {viewMode === 'heatmap' && selectedDay && (() => {
              const dayUnique = new Set(selectedDayAttempts.map(a => a.quiz_id)).size;
              const dayPassed = selectedDayAttempts.filter(a => a.is_passed).length;
              const dayFailed = selectedDayAttempts.filter(a => !a.is_passed).length;
              const daySuspicious = selectedDayAttempts.filter(a => a.is_suspicious).length;

              return (
                <div className="card animate" style={{ padding: '30px', marginBottom: '30px' }}>
                  <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '20px', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: 0 }}>Тесты за {new Date(selectedDay).toLocaleDateString('ru-RU')}</h3>
                      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '10px' }}>
                        <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                          Всего: <span style={{ fontWeight: 'bold' }}>{selectedDayAttempts.length} шт.</span> {dayUnique !== selectedDayAttempts.length && <span style={{opacity: 0.5}}>({dayUnique} уник.)</span>}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#4ade80' }}>
                          Успешно: <span style={{ fontWeight: 'bold' }}>{dayPassed}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#facc15' }}>
                          Провалено: <span style={{ fontWeight: 'bold' }}>{dayFailed}</span>
                        </div>
                        {daySuspicious > 0 && (
                          <div style={{ fontSize: '0.85rem', color: '#ef4444' }}>
                            Подозрительно: <span style={{ fontWeight: 'bold' }}>{daySuspicious}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setSelectedDay(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none', padding: '8px 15px', borderRadius: '10px' }}>Закрыть список</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[...selectedDayAttempts]
                      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                      .map(att => (
                        <div 
                          key={att.id} 
                          className="card flex-center animate" 
                          onClick={() => navigate(`/analytics-details?quizId=${att.quiz_id}&userId=${targetUser.id}`)}
                          style={{ 
                            padding: '15px 20px', justifyContent: 'space-between', cursor: 'pointer', 
                            background: 'rgba(0,0,0,0.02)',
                            transition: 'transform 0.2s, background 0.2s'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.02)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>{quizzesMap[att.quiz_id] || 'Загрузка...'}</span>
                            <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{new Date(att.created_at).toLocaleTimeString('ru-RU', { timeZone: 'Asia/Almaty' })} (KZ)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                             <div style={{ textAlign: 'right' }}>
                               <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: att.is_passed ? '#4ade80' : '#facc15' }}>{att.score} / {att.max_score}</div>
                               <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>{att.time_spent_total} сек</div>
                             </div>
                             <div style={{ width: '40px', display: 'flex', justifyContent: 'center' }}>
                               {att.is_suspicious ? <AlertTriangle size={18} color="#ef4444" /> : <ChevronLeft size={20} style={{ transform: 'rotate(180deg)', opacity: 0.3 }} />}
                             </div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              );
            })()}

            {viewMode === 'histogram' && selectedAttempt && (
               <div className="card animate" style={{ padding: '30px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                      <h3 style={{ marginBottom: '5px' }}>{quizzesMap[selectedAttempt.quiz_id] || 'Неизвестный тест'}</h3>
                      <div style={{ opacity: 0.6, fontSize: '0.85rem' }}>Дата: {new Date(selectedAttempt.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })} (KZ)</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                       {selectedAttempt.is_incomplete && <span style={{ fontSize: '0.8rem', background: 'rgba(156, 163, 175, 0.1)', color: '#9ca3af', padding: '4px 10px', borderRadius: '10px' }}>Не завершен</span>}
                       {selectedAttempt.is_suspicious && !selectedAttempt.is_incomplete && (
                          <span style={{ fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: '10px' }}>
                            <AlertTriangle size={14} style={{ display: 'inline', marginRight: '4px' }}/> Подозрительно
                          </span>
                       )}
                    </div>
                  </div>

                  {selectedAttempt.suspicion_reason && (
                    <div style={{ background: 'rgba(0,0,0,0.03)', padding: '12px 15px', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '20px', borderLeft: `4px solid ${selectedAttempt.is_incomplete ? '#9ca3af' : '#ef4444'}` }}>
                       <span style={{ opacity: 0.6 }}>Причина подозрения: </span>
                       <strong>{
                        {
                          'blind_guessing': 'Подозрительно много быстрых ответов при низком балле',
                          'high_skip_rate': 'Пропущено более 40% вопросов',
                          'rapid_fail': 'Тест завершен аномально быстро при низком балле',
                          'instant_zero': 'Нулевой результат при быстром завершении',
                          'incomplete_exit': 'Выход из теста до его завершения'
                        }[selectedAttempt.suspicion_reason] || selectedAttempt.suspicion_reason
                       }</strong>
                    </div>
                  )}
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                    <div style={{ background: 'rgba(0,0,0,0.02)', padding: '15px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Результат</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: selectedAttempt.is_passed ? '#4ade80' : '#facc15' }}>{selectedAttempt.score} из {selectedAttempt.max_score}</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.02)', padding: '15px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Время прохождения</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{selectedAttempt.time_spent_total} сек</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                         <button onClick={() => navigate(`/analytics-details?quizId=${selectedAttempt.quiz_id}&userId=${targetUser.id}`)} style={{ width: '100%', padding: '15px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)' }}>
                           Детальный разбор
                         </button>
                    </div>
                  </div>
               </div>
            )}
            
          </div>
        )}
      </div>
    </div>
  );
};

const mobileStyles = `
@media (max-width: 768px) {
  .details-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 300px;
    max-width: 85%;
    height: 100vh !important;
    z-index: 1000;
    box-shadow: 10px 0 30px rgba(0,0,0,0.2);
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .details-sidebar.open {
    transform: translateX(0);
  }
  .sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    backdrop-filter: blur(2px);
    z-index: 999;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s;
  }
  .sidebar-overlay.active {
    opacity: 1;
    visibility: visible;
  }
  .main-content {
    padding: 20px !important;
  }
  .sidebar-toggle-btn {
    left: 10px !important;
    top: 20px !important;
  }
}

/* Performance optimizations for HeatMap and large lists */
.heatmap-day {
  transition: transform 0.1s ease-out;
}
.heatmap-day:hover {
  transform: scale(1.3);
  z-index: 10;
}
.heatmap-day.selected {
  transform: scale(1.2);
}

.user-sidebar-item {
  transition: background 0.2s, transform 0.1s !important;
}
.user-sidebar-item:hover {
  transform: translateX(4px);
  background: rgba(99, 102, 241, 0.05) !important;
}
.user-sidebar-item:active {
  transform: scale(0.98);
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = mobileStyles;
  document.head.append(style);
}

export default UserAnalytics;
