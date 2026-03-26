import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Mail, Calendar, GraduationCap, CheckCircle } from 'lucide-react';

const Profile = ({ session, profile, refreshProfile }) => {
  const location = useLocation();
  const onboardingRef = useRef(null);
  
  const [classes, setClasses] = useState([]);
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [patronymic, setPatronymic] = useState(profile?.patronymic || '');
  const [birthDate, setBirthDate] = useState(profile?.birth_date || '');
  const [classId, setClassId] = useState(profile?.class_id || '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number || '');
  const [showPhone, setShowPhone] = useState(profile?.show_phone_number || false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(location.state?.msg || '');

  useEffect(() => {
    fetchClasses();
    if (location.state?.from === '/catalog' && !profile?.is_profile_setup_completed) {
      onboardingRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('name', { ascending: false });
    if (data) setClasses(data);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        patronymic: patronymic,
        birth_date: birthDate,
        class_id: classId,
        phone_number: phoneNumber,
        show_phone_number: showPhone,
        is_profile_setup_completed: true
      })
      .eq('id', session.user.id);

    if (error) setMsg(`Ошибка: ${error.message}`);
    else {
      await refreshProfile();
      setMsg('Данные успешно сохранены!');
      setTimeout(() => setMsg(''), 3000);
    }
    setLoading(false);
  };

  const handlePhoneChange = (e) => {
    let val = e.target.value.replace(/\D/g, ''); // Only digits
    if (val.length > 11) val = val.substring(0, 11);
    
    // Mask logic for +7 (XXX) XXX-XX-XX
    let masked = '+7 ';
    if (val.startsWith('7') || val.startsWith('8')) val = val.substring(1);
    
    if (val.length > 0) masked += '(' + val.substring(0, 3);
    if (val.length >= 3) masked += ') ' + val.substring(3, 6);
    if (val.length >= 6) masked += '-' + val.substring(6, 8);
    if (val.length >= 8) masked += '-' + val.substring(8, 10);
    
    setPhoneNumber(masked);
  };

  const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${session.user.id}`;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      {msg && (
        <div className="card" style={{ marginBottom: '20px', background: 'var(--primary-color)', color: 'white', padding: '15px' }}>
          {msg}
        </div>
      )}

      <div className="grid-2">
        {/* Basic Info Card */}
        <div className="card flex-center" style={{ flexDirection: 'column', textAlign: 'center' }}>
          <img src={avatarUrl} alt="Avatar" style={{ width: '120px', height: '120px', borderRadius: '50%', marginBottom: '20px', border: '4px solid var(--accent-color)' }} />
          <h2>{profile?.first_name ? `${profile.last_name} ${profile.first_name}` : 'Новый пользователь'}</h2>
          <p style={{ opacity: 0.7, marginBottom: '20px' }}>{profile?.role.toUpperCase()}</p>
          
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
                  <GraduationCap size={18} /> <span>{profile.classes?.name || 'Класс не указан'}</span>
                </div>
              </>
            )}
          </div>
          
          <button 
            onClick={() => supabase.auth.signOut()} 
            style={{ marginTop: '30px', width: '100%', background: 'rgba(255,0,0,0.1)', color: 'red' }}
          >
            Выйти из аккаунта
          </button>
        </div>

        {/* Stats Card */}
        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Личная статистика</h3>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <StatBox label="Пройдено тестов" value="0" />
            <StatBox label="Без ошибок" value="0" />
            <StatBox label="Всего баллов" value="0" />
            <StatBox label="Создано тестов" value="0" />
          </div>
          
          <div style={{ marginTop: '30px', padding: '15px', background: 'rgba(0,0,0,0.05)', borderRadius: '15px' }}>
            <label className="flex-center" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>
              <span>Скрывать профиль (анонимно)</span>
              <input 
                type="checkbox" 
                checked={profile?.is_anonymous} 
                onChange={async (e) => {
                  await supabase.from('profiles').update({ is_anonymous: e.target.checked }).eq('id', session.user.id);
                  refreshProfile();
                }}
                style={{ width: '20px', height: '20px' }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Onboarding / Edit Section */}
      <div ref={onboardingRef} className="card animate" style={{ marginTop: '40px' }}>
        <h3 style={{ marginBottom: '25px' }}>
          {profile?.is_profile_setup_completed ? 'Основные данные (только чтение)' : 'Подтверждение данных'}
        </h3>
        
        <form onSubmit={handleUpdateProfile} style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Фамилия</label>
            <input 
              type="text" 
              value={lastName} 
              onChange={(e) => setLastName(e.target.value)} 
              disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} 
              placeholder="Иванов" 
              required 
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Имя</label>
            <input 
              type="text" 
              value={firstName} 
              onChange={(e) => setFirstName(e.target.value)} 
              disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} 
              placeholder="Иван" 
              required 
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Отчество (необязательно)</label>
            <input 
              type="text" 
              value={patronymic} 
              onChange={(e) => setPatronymic(e.target.value)} 
              disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} 
              placeholder="Иванович" 
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Дата рождения</label>
            <input 
              type="date" 
              value={birthDate} 
              onChange={(e) => setBirthDate(e.target.value)} 
              disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} 
              required 
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Ваш класс</label>
            <select 
              value={classId} 
              onChange={(e) => setClassId(e.target.value)} 
              disabled={profile?.is_profile_setup_completed && profile?.role !== 'creator'} 
              required
            >
              <option value="">Выберите класс...</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {(profile?.role === 'admin' || profile?.role === 'creator') && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label>Мой номер WhatsApp</label>
                <input 
                  type="text" 
                  value={phoneNumber} 
                  onChange={handlePhoneChange} 
                  placeholder="+7 (___) ___-__-__" 
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', gridColumn: '1 / -1' }}>
                <input 
                  type="checkbox" 
                  id="showPhone" 
                  checked={showPhone} 
                  onChange={(e) => setShowPhone(e.target.checked)}
                  style={{ width: '20px', height: '20px' }}
                />
                <label htmlFor="showPhone">Показывать мой номер в разделе "Команда" на главной</label>
              </div>
            </>
          )}
          
          {(!profile?.is_profile_setup_completed || profile?.role === 'admin' || profile?.role === 'creator') && (
            <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '15px' }}>
                {loading ? 'Сохранение...' : (profile?.is_profile_setup_completed ? 'Обновить данные' : 'Подтвердить и сохранить')}
              </button>
              {!profile?.is_profile_setup_completed && (
                <p style={{ marginTop: '10px', fontSize: '0.8rem', opacity: 0.6, textAlign: 'center' }}>
                  После сохранения изменить фамилию и имя сможет только администратор.
                </p>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

const StatBox = ({ label, value }) => (
  <div style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '20px', textAlign: 'center' }}>
    <h4 style={{ fontSize: '1.5rem', marginBottom: '5px' }}>{value}</h4>
    <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>{label}</p>
  </div>
);

export default Profile;
