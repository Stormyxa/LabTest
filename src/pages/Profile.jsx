import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Mail, Calendar, GraduationCap, CheckCircle, Award, FileText, TrendingUp, Star, MapPin, Building, Shield, ShieldOff, Zap, BarChart2, Clock, XCircle, Info, AlertCircle, Check, AlertTriangle } from 'lucide-react';

const Profile = ({ session, profile, refreshProfile }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const onboardingRef = useRef(null);

  const [cities, setCities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);

  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [patronymic, setPatronymic] = useState(profile?.patronymic || '');
  const [birthDate, setBirthDate] = useState(profile?.birth_date || '');

  const [cityId, setCityId] = useState(profile?.city_id || '');
  const [schoolId, setSchoolId] = useState(profile?.school_id || '');
  const [classId, setClassId] = useState(profile?.class_id || '');

  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number || '');
  const [showPhone, setShowPhone] = useState(profile?.show_phone_number || false);
  
  // Modal states
  const [showNoClassModal, setShowNoClassModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalContent, setSuccessModalContent] = useState({ title: '', text: '', icon: 'check' });
  const [agreeObserver, setAgreeObserver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(location.state?.msg || '');
  const [stats, setStats] = useState({ passed: 0, perfect: 0, totalPoints: 0, created: 0 });
  const [autoAdvance, setAutoAdvance] = useState(localStorage.getItem('quiz_auto_advance') === 'true');
  
  const [classStudentCounts, setClassStudentCounts] = useState({});
  const [application, setApplication] = useState(null);
  const [isEmailConfirmed, setIsEmailConfirmed] = useState(true); // Default to true, will check session

  useEffect(() => {
    localStorage.setItem('quiz_auto_advance', autoAdvance);
  }, [autoAdvance]);

  useEffect(() => {
    fetchStructure();
    fetchStats();
    fetchApplication();
    if (session?.user) {
      // Simple check for confirmation (Supabase specific)
      setIsEmailConfirmed(!!session.user.email_confirmed_at || !!session.user.confirmed_at);
    }
    if (location.state?.from === '/catalog' && !profile?.is_profile_setup_completed) {
      onboardingRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Sync profile data to local state if state is empty (prevents accidental wiping on slow loads)
  useEffect(() => {
    if (profile) {
      setFirstName(prev => prev || profile.first_name || '');
      setLastName(prev => prev || profile.last_name || '');
      setPatronymic(prev => prev || profile.patronymic || '');
      setBirthDate(prev => prev || profile.birth_date || '');
      setCityId(prev => prev || profile.city_id || '');
      setSchoolId(prev => prev || profile.school_id || '');
      setClassId(prev => prev || profile.class_id || '');
      setPhoneNumber(prev => prev || profile.phone_number || '');
      setShowPhone(prev => prev || profile.show_phone_number || false);
    }
  }, [profile]);

  const fetchStructure = async () => {
    const [ { data: c }, { data: s }, { data: cl }, { data: counts } ] = await Promise.all([
      supabase.from('cities').select('*').order('name'),
      supabase.from('schools').select('*').order('name'),
      supabase.from('classes').select('*').order('order_index'),
      supabase.rpc('get_class_student_counts') // We'll need this RPC or a manual count
    ]);

    if (c) setCities(c);
    if (s) setSchools(s);
    if (cl) setClasses(cl);
    if (counts) {
      const dict = {};
      counts.forEach(row => { dict[row.class_id] = row.student_count; });
      setClassStudentCounts(dict);
    } else {
      // Fallback if RPC doesn't exist yet: fetch counts manually
      const { data: profilesData } = await supabase.from('profiles').select('class_id');
      const dict = {};
      if (profilesData) {
        profilesData.forEach(p => { if(p.class_id) dict[p.class_id] = (dict[p.class_id] || 0) + 1; });
      }
      setClassStudentCounts(dict);
    }
  };

  const fetchApplication = async () => {
    const { data } = await supabase.from('class_applications').select('*, classes(name, school_id)').eq('user_id', session.user.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle();
    setApplication(data || null);
  };

  const fetchStats = async () => {
    const [ { data: results }, { count: createdCount } ] = await Promise.all([
      supabase.from('quiz_results').select('score, total_questions, is_passed').eq('user_id', session.user.id),
      supabase.from('quizzes').select('*', { count: 'exact', head: true }).eq('author_id', session.user.id)
    ]);

    if (results) {
      setStats({
        passed: results.filter(r => r.is_passed).length,
        perfect: results.filter(r => r.score === r.total_questions && r.total_questions > 0).length,
        totalPoints: results.reduce((acc, curr) => acc + curr.score, 0),
        created: createdCount || 0
      });
    }
  };

  const isLatin = (str) => /[a-zA-Z]/.test(str);
  
  const FORBIDDEN_WORDS = ['ОТПРАВЛЕНО', 'АККАУНТ', 'АДМИН', 'АДМИНИСТРАТОР', 'ПОДДЕРЖКА', 'SYSTEM', 'ADMIN', 'ROOT', 'DEVELOPER'];
  
  const getLevenshteinDistance = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      }
    }
    return matrix[a.length][b.length];
  };

  const isNameForbidden = (name) => {
    if (!name) return false;
    const upper = name.trim().toUpperCase();
    return FORBIDDEN_WORDS.some(word => {
      if (upper === word) return true;
      if (getLevenshteinDistance(upper, word) <= 1) return true;
      return false;
    });
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    
    if (isLatin(firstName) || isLatin(lastName) || isLatin(patronymic)) {
      setMsg('Ошибка: Пожалуйста, используйте только кириллицу для ФИО.');
      return;
    }

    if (isNameForbidden(firstName) || isNameForbidden(lastName) || isNameForbidden(patronymic)) {
      setMsg('Ошибка: Данное имя или фамилия недоступны для использования.');
      return;
    }
    if (!classId && profile?.role !== 'teacher' && profile?.role !== 'admin' && profile?.role !== 'creator') {
      setShowNoClassModal(true);
      return;
    }

    setShowConfirmModal(true);
  };

  const confirmUpdate = async () => {
    setShowConfirmModal(false);
    
    if (classId && classId !== profile?.class_id) {
      // Time limit check for class application (30 seconds)
      const now = new Date();
      const lastClassChange = profile?.last_class_application_change ? new Date(profile.last_class_application_change) : null;
      const isAdminOrCreator = profile?.role === 'admin' || profile?.role === 'creator';
      
      if (!isAdminOrCreator && lastClassChange && (now - lastClassChange) < 30 * 1000) {
        const remaining = Math.ceil((30 * 1000 - (now - lastClassChange)) / 1000);
        setMsg(`Ожидайте: Повторная заявка в класс будет доступна через ${remaining} сек.`);
        return;
      }

      // User is trying to join a NEW class
      const cls = classes.find(c => c.id === classId);
      const currentCount = classStudentCounts[classId] || 0;
      if (cls && cls.max_students && currentCount >= cls.max_students) {
        setMsg('Ошибка: В выбранном классе нет свободных мест.');
        return;
      }
      
      // Send application
      setLoading(true);
      console.log("DEBUG: Sending application for user:", session.user.id, "to class:", classId);
      const { error } = await supabase.from('class_applications').upsert({ 
        user_id: session.user.id, 
        class_id: classId, 
        status: 'pending' 
      }, { onConflict: 'user_id, class_id' });
      
      if (error) {
        console.error("DEBUG: Application upsert error:", error);
        setMsg(`Ошибка при подаче заявки: ${error.message}`);
      } else {
        console.log("DEBUG: Application sent successfully!");
        await supabase.from('profiles').update({ 
          pending_class_id: classId,
          last_class_application_change: new Date().toISOString()
        }).eq('id', session.user.id);
        
        setSuccessModalContent({
          title: 'Заявка отправлена!',
          text: `Вы подали заявку в класс "${cls.name}". Теперь нужно дождаться, пока ваш учитель подтвердит её в своей панели управления. После этого вам откроется доступ ко всем функциям класса.`,
          icon: 'check'
        });
        setShowSuccessModal(true);
        
        fetchApplication();
        refreshProfile();
      }
      setLoading(false);
      return;
    }

    // Check 24h limit for City/School change
    const now = new Date();
    const lastInstChange = profile?.last_institution_change ? new Date(profile.last_institution_change) : null;
    const isAdminOrCreator = profile?.role === 'admin' || profile?.role === 'creator';
    const institutionChanged = cityId !== profile?.city_id || schoolId !== profile?.school_id;

    if (institutionChanged && !isAdminOrCreator && lastInstChange && (now - lastInstChange) < 24 * 60 * 60 * 1000) {
      const remainingMs = 24 * 60 * 60 * 1000 - (now - lastInstChange);
      const hours = Math.floor(remainingMs / (60 * 60 * 1000));
      const minutes = Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
      setMsg(`Ограничение: Сменить заведение можно будет через ${hours} ч. ${minutes} мин.`);
      return;
    }

    // Otherwise, normal save
    await executeUpdate(false, institutionChanged);
  };

  const handleCancelApplication = async () => {
    if (!application) return;
    
    // 30s cooldown for cancellation too
    const now = new Date();
    const lastChange = profile?.last_class_application_change ? new Date(profile.last_class_application_change) : null;
    if (lastChange && (now - lastChange) < 30 * 1000) {
      const remaining = Math.ceil((30 * 1000 - (now - lastChange)) / 1000);
      setMsg(`Ожидайте: Отмена заявки возможна через ${remaining} сек.`);
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('class_applications').delete().eq('id', application.id);
    if (!error) {
      await supabase.from('profiles').update({ 
        pending_class_id: null,
        last_class_application_change: new Date().toISOString()
      }).eq('id', session.user.id);
      setApplication(null);
      setClassId(''); // Reset selection
      setMsg('Заявка отменена. Теперь вы можете выбрать другой класс.');
      refreshProfile();
    }
    setLoading(false);
  };

  const executeUpdate = async (makeObserver, institutionChanged = false) => {
    setLoading(true);
    let finalObserverStatus = makeObserver;
    if (classId && profile?.role !== 'teacher') finalObserverStatus = false;
    if (profile?.role === 'teacher') finalObserverStatus = true;

    const updates = {
      first_name: firstName, last_name: lastName, patronymic: patronymic, birth_date: birthDate,
      city_id: cityId || null, school_id: schoolId || null, class_id: classId || null,
      phone_number: phoneNumber, show_phone_number: showPhone, is_profile_setup_completed: true,
      is_observer: finalObserverStatus
    };

    if (institutionChanged) {
      updates.last_institution_change = new Date().toISOString();
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', session.user.id);

    if (error) setMsg(`Ошибка: ${error.message}`);
    else {
      await refreshProfile();
      setMsg('Данные успешно сохранены!');
      setShowNoClassModal(false);
      setTimeout(() => setMsg(''), 3000);
    }
    setLoading(false);
  };

  const handlePhoneChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 11) val = val.substring(0, 11);
    let masked = '+7 ';
    if (val.startsWith('7') || val.startsWith('8')) val = val.substring(1);
    if (val.length > 0) masked += '(' + val.substring(0, 3);
    if (val.length >= 3) masked += ') ' + val.substring(3, 6);
    if (val.length >= 6) masked += '-' + val.substring(6, 8);
    if (val.length >= 8) masked += '-' + val.substring(8, 10);
    setPhoneNumber(masked);
  };

  const availableSchools = schools.filter(s => s.city_id === cityId);
  const availableClasses = classes.filter(c => c.school_id === schoolId);
  const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${session.user.id}`;

  return (
    <>
      <div className="container animate" style={{ padding: '40px 20px' }}>
        {!isEmailConfirmed && (
          <div className="card" style={{ marginBottom: '20px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', color: '#b45309', padding: '20px', display: 'flex', gap: '15px' }}>
            <AlertCircle size={24} style={{ flexShrink: 0 }} />
            <div>
              <h4 style={{ margin: '0 0 5px 0' }}>Подтвердите ваш Email</h4>
              <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.8 }}>Для полноценного использования сайта необходимо подтвердить почту. Если вы не получили письмо, проверьте папку "Спам" или обратитесь к учителю за помощью.</p>
            </div>
          </div>
        )}
        {msg && <div className="card" style={{ marginBottom: '20px', background: 'var(--primary-color)', color: 'white', padding: '15px' }}>{msg}</div>}

      <div className="grid-2">
        <div className="card flex-center" style={{ flexDirection: 'column', textAlign: 'center' }}>
          <img src={avatarUrl} alt="Avatar" style={{ width: '120px', height: '120px', borderRadius: '50%', marginBottom: '20px', border: '4px solid var(--accent-color)' }} />
          <h2>{profile?.first_name ? `${profile.last_name} ${profile.first_name}` : 'Новый пользователь'}</h2>
          <div className="flex-center" style={{ gap: '10px', marginBottom: '20px' }}>
            <span style={{ padding: '4px 12px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 'bold' }}>
              {profile?.role.toUpperCase()}
            </span>
            {profile?.is_observer && (
              <span style={{ padding: '4px 12px', background: 'rgba(250, 204, 21, 0.1)', color: '#ca8a04', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Shield size={12} /> НАБЛЮДАТЕЛЬ
              </span>
            )}
          </div>

          <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px' }}>
              <Mail size={18} /> <span>{session.user.email}</span>
            </div>
            {profile?.is_profile_setup_completed && (
              <>
                <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                  <Calendar size={18} /> <span>{profile.birth_date}</span>
                </div>
                <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                  <MapPin size={18} /> <span>{cities.find(c => c.id === profile.city_id)?.name || 'Город не указан'}</span>
                </div>
                <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                  <Building size={18} /> <span>{schools.find(s => s.id === profile.school_id)?.name || 'Школа не указана'}</span>
                </div>
                <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                  <GraduationCap size={18} /> <span>{classes.find(c => c.id === profile.class_id)?.name || 'Класс не указан'}</span>
                </div>
                {application && (
                   <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px', color: 'var(--primary-color)', background: 'rgba(99, 102, 241, 0.05)', padding: '10px', borderRadius: '10px', marginTop: '5px' }}>
                     <Clock size={16} /> 
                     <div style={{ fontSize: '0.85rem' }}>
                       Заявка в <strong>{application.classes?.name}</strong> рассматривается
                       <button onClick={handleCancelApplication} style={{ display: 'block', background: 'transparent', color: 'red', border: 'none', padding: 0, fontSize: '0.75rem', marginTop: '4px', textDecoration: 'underline', boxShadow: 'none' }}>Отменить заявку</button>
                     </div>
                   </div>
                 )}
              </>
            )}
          </div>

          <button 
            onClick={async () => {
              try {
                setLoading(true);
                await supabase.auth.signOut();
                // Forced redirect to clear any internal React state and ensure clean login screen
                window.location.href = '/'; 
              } catch (err) {
                setMsg('Ошибка при выходе: ' + err.message);
              } finally {
                setLoading(false);
              }
            }} 
            disabled={loading}
            style={{ marginTop: '30px', width: '100%', background: 'rgba(255,0,0,0.1)', color: 'red' }}
          >
            {loading ? 'Выход...' : 'Выйти из аккаунта'}
          </button>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Личная статистика</h3>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <StatBox label="Пройдено тестов" value={stats.passed} icon={<CheckCircle size={20} />} />
            <StatBox label="Без ошибок" value={stats.perfect} icon={<Star size={20} />} />
            <StatBox label="Всего баллов" value={stats.totalPoints} icon={<TrendingUp size={20} />} />
            <StatBox label="Создано тестов" value={stats.created} icon={<FileText size={20} />} />
          </div>

          <button onClick={() => navigate(`/user-analytics?userId=${session.user.id}`)} className="flex-center" style={{ marginTop: '15px', width: '100%', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', padding: '15px', borderRadius: '15px', boxShadow: 'none', fontWeight: 'bold' }}>
            <BarChart2 size={18} style={{ marginRight: '8px' }} /> Детальная аналитика
          </button>

          <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '20px', border: '1px dashed rgba(99, 102, 241, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                <div style={{ padding: '10px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', color: 'var(--primary-color)', flexShrink: 0 }}>
                  <Zap size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700' }}>Авто-прокрутка (Обучение)</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', opacity: 0.6, lineHeight: '1.4' }}>Автоматический переход к следующему вопросу (доступно после 1-го прохождения).</p>
                </div>
              </div>

              <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', flexShrink: 0 }}>
                <input 
                  id="auto-advance"
                  name="auto-advance"
                  type="checkbox" 
                  checked={autoAdvance} 
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{ 
                  position: 'absolute', cursor: 'pointer', inset: 0, 
                  background: autoAdvance ? 'var(--primary-color)' : 'rgba(0,0,0,0.2)',
                  borderRadius: '30px', transition: '0.3s'
                }}>
                  <span style={{
                    position: 'absolute', height: '20px', width: '20px', 
                    left: autoAdvance ? '25px' : '3px', top: '3px',
                    background: 'white', borderRadius: '50%', transition: '0.3s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }} />
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div ref={onboardingRef} className="card animate" style={{ marginTop: '40px' }}>
        <h3 style={{ marginBottom: '25px' }}>{profile?.is_profile_setup_completed ? 'Основные данные (только чтение)' : 'Подтверждение данных'}</h3>

        <form onSubmit={handleUpdateProfile} style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="last-name">Фамилия</label>
            <input id="last-name" name="last_name" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} pattern="^[А-Яа-яЁё\s\-]+$" title="Только кириллица, пробелы и дефисы" placeholder="Иванов" required autoComplete="family-name" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="first-name">Имя</label>
            <input id="first-name" name="first_name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} pattern="^[А-Яа-яЁё\s\-]+$" title="Только кириллица, пробелы и дефисы" placeholder="Иван" required autoComplete="given-name" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="patronymic">Отчество (необязательно)</label>
            <input id="patronymic" name="patronymic" type="text" value={patronymic} onChange={(e) => setPatronymic(e.target.value)} disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} pattern="^[А-Яа-яЁё\s\-]*$" title="Только кириллица, пробелы и дефисы" placeholder="Иванович" autoComplete="additional-name" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="birth-date">Дата рождения</label>
            <input id="birth-date" name="birth_date" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} required autoComplete="bday" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="city-select">Ваш город</label>
            <select id="city-select" name="city" value={cityId} onChange={(e) => { setCityId(e.target.value); setSchoolId(''); setClassId(''); }} disabled={(profile?.class_id || profile?.role === 'teacher') && profile?.role !== 'creator' && profile?.role !== 'admin'} required>
              <option value="">Выберите город...</option>
              {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="school-select">Ваша школа</label>
            <select id="school-select" name="school" value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setClassId(''); }} disabled={(profile?.class_id || profile?.role === 'teacher') && profile?.role !== 'creator' && profile?.role !== 'admin' || !cityId} required>
              <option value="">Выберите школу...</option>
              {availableSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="class-select">Ваш класс</label>
            <select id="class-select" name="class" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={(profile?.class_id || profile?.role === 'teacher') && profile?.role !== 'creator' && profile?.role !== 'admin' || !schoolId || application}>
              <option value="">Выберите класс...</option>
              {availableClasses.map(c => {
                const count = classStudentCounts[c.id] || 0;
                const isFull = c.max_students && count >= c.max_students;
                return (
                  <option key={c.id} value={c.id} disabled={isFull} style={{ color: isFull ? '#999' : 'inherit' }}>
                    {c.name} {isFull ? '(заполнен)' : `(${count}/${c.max_students || 50})`}
                  </option>
                );
              })}
            </select>
            {profile?.role === 'teacher' && <p style={{ fontSize: '0.75rem', color: '#666', margin: 0 }}>Ваши данные заведения управляются администратором.</p>}
            {profile?.class_id && profile?.role !== 'teacher' && <p style={{ fontSize: '0.75rem', color: '#666', margin: 0 }}>Вы уже приняты в класс. Чтобы сменить заведение, обратитесь к учителю.</p>}
            {application && !profile?.class_id && <p style={{ fontSize: '0.75rem', color: 'var(--primary-color)', margin: 0 }}>У вас есть активная заявка. Отмените её, чтобы выбрать другой класс.</p>}
          </div>

          {(profile?.role === 'admin' || profile?.role === 'creator') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label htmlFor="phone-number">Мой номер WhatsApp</label>
              <input id="phone-number" name="phone_number" type="text" value={phoneNumber} onChange={handlePhoneChange} placeholder="+7 (___) ___-__-__" autoComplete="tel" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                <input type="checkbox" id="show-phone" name="show_phone" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)} style={{ width: '20px', height: '20px' }} />
                <label htmlFor="show-phone" style={{ fontSize: '0.85rem' }}>Показывать в разделе "Команда"</label>
              </div>
            </div>
          )}

          {(!profile?.is_profile_setup_completed || !profile?.class_id || profile?.role === 'admin' || profile?.role === 'creator') && (
            <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '15px' }}>
                {loading ? 'Сохранение...' : (profile?.is_profile_setup_completed ? 'Обновить данные' : 'Подтвердить и сохранить')}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>

      {showNoClassModal && (
        <div className="modal-overlay" onClick={() => setShowNoClassModal(false)}>
          <div className="modal-content animate" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(250, 204, 21, 0.1)', color: '#ca8a04', margin: '0 auto 25px' }}>
              <Shield size={32} />
            </div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Режим наблюдателя</h2>
            <p style={{ opacity: 0.7, marginBottom: '20px', textAlign: 'center', lineHeight: '1.6' }}>
              Вы не выбрали класс. Это означает, что ваши результаты не будут учитываться в рейтингах и статистике. Вы перейдете в <strong>режим наблюдателя</strong>.
            </p>
            
            <label htmlFor="agree-observer" className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px', background: 'rgba(0,0,0,0.03)', padding: '15px', borderRadius: '12px', cursor: 'pointer', marginBottom: '20px' }}>
              <input id="agree-observer" name="agree_observer" type="checkbox" checked={agreeObserver} onChange={(e) => setAgreeObserver(e.target.checked)} style={{ width: '18px', height: '18px' }} />
              <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Я согласен стать наблюдателем</span>
            </label>

            <div className="grid-2" style={{ gap: '15px' }}>
              <button onClick={() => setShowNoClassModal(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Вернуться к выбору</button>
              <button 
                onClick={() => executeUpdate(true)} 
                disabled={!agreeObserver || loading}
                style={{ background: agreeObserver ? 'var(--primary-color)' : 'rgba(0,0,0,0.1)', color: agreeObserver ? 'white' : 'black', opacity: agreeObserver ? 1 : 0.5 }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      {/* МОДАЛКА ПОДТВЕРЖДЕНИЯ ОБНОВЛЕНИЯ */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content animate" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', margin: '0 auto 25px' }}><Shield size={32} /></div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Обновить данные?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6', textAlign: 'center' }}>
              Вы уверены, что хотите сохранить изменения?<br />
              <span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>Важно:</span> Смена города или школы будет доступна только через 24 часа.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button onClick={() => setShowConfirmModal(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={confirmUpdate}>Да, обновить</button>
            </div>
          </div>
        </div>
      )}
      {/* МОДАЛКА УСПЕХА / ОШИБКИ */}
      {showSuccessModal && (
        <div className="modal-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="modal-content animate" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ 
              justifyContent: 'center', width: '60px', height: '60px', borderRadius: '50%', 
              background: successModalContent.icon === 'check' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
              color: successModalContent.icon === 'check' ? '#22c55e' : '#ef4444', 
              margin: '0 auto 25px' 
            }}>
              {successModalContent.icon === 'check' ? <Check size={32} /> : <AlertTriangle size={32} />}
            </div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>{successModalContent.title}</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6', textAlign: 'center' }}>
              {successModalContent.text}
            </p>
            <button onClick={() => setShowSuccessModal(false)} style={{ width: '100%' }}>Понятно</button>
          </div>
        </div>
      )}
    </>
  );
};

const StatBox = ({ label, value, icon }) => (
  <div style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '20px', textAlign: 'center' }}>
    <div style={{ color: 'var(--primary-color)', marginBottom: '10px', opacity: 0.5 }} className="flex-center">{icon}</div>
    <h4 style={{ fontSize: '1.5rem', marginBottom: '5px' }}>{value}</h4>
    <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>{label}</p>
  </div>
);

export default Profile;