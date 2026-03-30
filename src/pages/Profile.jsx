import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Mail, Calendar, GraduationCap, CheckCircle, Award, FileText, TrendingUp, Star, MapPin, Building, Shield, ShieldOff, Zap } from 'lucide-react';

const Profile = ({ session, profile, refreshProfile }) => {
  const location = useLocation();
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
  const [agreeObserver, setAgreeObserver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(location.state?.msg || '');
  const [stats, setStats] = useState({ passed: 0, perfect: 0, totalPoints: 0, created: 0 });

  useEffect(() => {
    fetchStructure();
    fetchStats();
    if (location.state?.from === '/catalog' && !profile?.is_profile_setup_completed) {
      onboardingRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const fetchStructure = async () => {
    const { data: c } = await supabase.from('cities').select('*').order('name');
    const { data: s } = await supabase.from('schools').select('*').order('name');
    const { data: cl } = await supabase.from('classes').select('*').order('name');

    if (c) setCities(c);
    if (s) setSchools(s);
    if (cl) setClasses(cl);
  };

  const fetchStats = async () => {
    const { data: results } = await supabase.from('quiz_results').select('score, total_questions, is_passed').eq('user_id', session.user.id);
    const { count: createdCount } = await supabase.from('quizzes').select('*', { count: 'exact', head: true }).eq('author_id', session.user.id);

    if (results) {
      setStats({
        passed: results.filter(r => r.is_passed).length,
        perfect: results.filter(r => r.score === r.total_questions && r.total_questions > 0).length,
        totalPoints: results.reduce((acc, curr) => acc + curr.score, 0),
        created: createdCount || 0
      });
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();

    // If student didn't pick a class, enforce observer modal
    if (!classId && profile?.role !== 'teacher' && profile?.role !== 'admin' && profile?.role !== 'creator') {
      setShowNoClassModal(true);
      return;
    }

    // Otherwise, normal save (if they picked a class, observer is false)
    await executeUpdate(false);
  };

  const executeUpdate = async (makeObserver) => {
    setLoading(true);
    let finalObserverStatus = makeObserver;
    if (classId && profile?.role !== 'teacher') finalObserverStatus = false;
    if (profile?.role === 'teacher') finalObserverStatus = true;

    const { error } = await supabase.from('profiles').update({
      first_name: firstName, last_name: lastName, patronymic: patronymic, birth_date: birthDate,
      city_id: cityId || null, school_id: schoolId || null, class_id: classId || null,
      phone_number: phoneNumber, show_phone_number: showPhone, is_profile_setup_completed: true,
      is_observer: finalObserverStatus
    }).eq('id', session.user.id);

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
    <div className="container animate" style={{ padding: '40px 20px' }}>
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
              </>
            )}
          </div>

          <button onClick={() => supabase.auth.signOut()} style={{ marginTop: '30px', width: '100%', background: 'rgba(255,0,0,0.1)', color: 'red' }}>
            Выйти из аккаунта
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
        </div>
      </div>

      <div ref={onboardingRef} className="card animate" style={{ marginTop: '40px' }}>
        <h3 style={{ marginBottom: '25px' }}>{profile?.is_profile_setup_completed ? 'Основные данные (только чтение)' : 'Подтверждение данных'}</h3>

        <form onSubmit={handleUpdateProfile} style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Фамилия</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} pattern="^[А-Яа-яЁё\s\-]+$" title="Только кириллица, пробелы и дефисы" placeholder="Иванов" required />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Имя</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} pattern="^[А-Яа-яЁё\s\-]+$" title="Только кириллица, пробелы и дефисы" placeholder="Иван" required />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Отчество (необязательно)</label>
            <input type="text" value={patronymic} onChange={(e) => setPatronymic(e.target.value)} disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} pattern="^[А-Яа-яЁё\s\-]*$" title="Только кириллица, пробелы и дефисы" placeholder="Иванович" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Дата рождения</label>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} required />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Ваш город</label>
            <select value={cityId} onChange={(e) => { setCityId(e.target.value); setSchoolId(''); setClassId(''); }} disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} required>
              <option value="">Выберите город...</option>
              {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Ваша школа</label>
            <select value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setClassId(''); }} disabled={(profile?.is_profile_setup_completed && profile?.role !== 'creator') || (profile?.role === 'teacher' && profile?.school_id) || !cityId} required>
              <option value="">Выберите школу...</option>
              {availableSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Ваш класс</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={(profile?.is_profile_setup_completed && profile?.role !== 'creator') || !schoolId}>
              <option value="">Выберите класс...</option>
              {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {(profile?.role === 'admin' || profile?.role === 'creator') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label>Мой номер WhatsApp</label>
              <input type="text" value={phoneNumber} onChange={handlePhoneChange} placeholder="+7 (___) ___-__-__" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                <input type="checkbox" id="showPhone" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)} style={{ width: '20px', height: '20px' }} />
                <label htmlFor="showPhone" style={{ fontSize: '0.85rem' }}>Показывать в разделе "Команда"</label>
              </div>
            </div>
          )}

          {(!profile?.is_profile_setup_completed || profile?.role === 'admin' || profile?.role === 'creator') && (
            <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '15px' }}>
                {loading ? 'Сохранение...' : (profile?.is_profile_setup_completed ? 'Обновить данные' : 'Подтвердить и сохранить')}
              </button>
            </div>
          )}
        </form>
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
            
            <label className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px', background: 'rgba(0,0,0,0.03)', padding: '15px', borderRadius: '12px', cursor: 'pointer', marginBottom: '20px' }}>
              <input type="checkbox" checked={agreeObserver} onChange={(e) => setAgreeObserver(e.target.checked)} style={{ width: '18px', height: '18px' }} />
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

    </div>
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