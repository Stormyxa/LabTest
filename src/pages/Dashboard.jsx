import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchWithCache, useCacheSync } from '../lib/cache';
import { User, Shield, Search, Edit3, Trash2, Mail, X, AlertTriangle, MapPin, Building, GraduationCap, Plus, History, Ban, ShieldAlert, Unlock, Eye, EyeOff, Zap, ChevronDown, ChevronRight } from 'lucide-react';
import { useScrollRestoration } from '../lib/useScrollRestoration';

const DashboardSkeleton = () => (
  <div className="animate">
    <div className="flex-center" style={{ gap: '15px', marginBottom: '30px', justifyContent: 'flex-start' }}>
      <div className="skeleton" style={{ height: '50px', width: '300px', borderRadius: '12px' }}></div>
      <div className="skeleton" style={{ height: '50px', width: '120px', borderRadius: '12px' }}></div>
      <div className="skeleton" style={{ height: '50px', width: '120px', borderRadius: '12px' }}></div>
      <div className="skeleton" style={{ height: '50px', width: '120px', borderRadius: '12px' }}></div>
    </div>
    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
      <div className="skeleton" style={{ height: '60px', width: '100%' }}></div>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ padding: '20px', borderBottom: '1px solid rgba(0,0,0,0.02)', display: 'flex', gap: '20px' }}>
          <div className="skeleton" style={{ height: '40px', flex: 1, borderRadius: '8px' }}></div>
          <div className="skeleton" style={{ height: '40px', flex: 1, borderRadius: '8px' }}></div>
          <div className="skeleton" style={{ height: '40px', flex: 1, borderRadius: '8px' }}></div>
          <div className="skeleton" style={{ height: '40px', width: '100px', borderRadius: '8px' }}></div>
        </div>
      ))}
    </div>
  </div>
);

const Dashboard = ({ session, profile }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useScrollRestoration(loading);

  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterCity, setFilterCity] = useState(sessionStorage.getItem('f_city') || 'all');
  const [filterSchool, setFilterSchool] = useState(sessionStorage.getItem('f_school') || 'all');
  const [filterClass, setFilterClass] = useState(sessionStorage.getItem('f_class') || 'all');

  useEffect(() => { sessionStorage.setItem('f_city', filterCity); }, [filterCity]);
  useEffect(() => { sessionStorage.setItem('f_school', filterSchool); }, [filterSchool]);
  useEffect(() => { sessionStorage.setItem('f_class', filterClass); }, [filterClass]);
  const [errorMessage, setErrorMessage] = useState(null);

  const [expandedClassId, setExpandedClassId] = useState(null);
  const [classStudents, setClassStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [removingStudent, setRemovingStudent] = useState(null);
  const [editingClassLimit, setEditingClassLimit] = useState(null);
  const [newLimit, setNewLimit] = useState(0);

  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [blockingUser, setBlockingUser] = useState(null);
  const [unblockingEmail, setUnblockingEmail] = useState(null); // Стейт для разблокировки

  const [newPassword, setNewPassword] = useState(''); // Стейт нового пароля
  const [showNewPassword, setShowNewPassword] = useState(false); // Глазик для пароля

  const [deletingStructure, setDeletingStructure] = useState(null);

  const [cities, setCities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classesList, setClassesList] = useState([]);

  const [newCity, setNewCity] = useState('');
  const [newSchool, setNewSchool] = useState('');
  const [newSchoolCityId, setNewSchoolCityId] = useState('');
  const [newClass, setNewClass] = useState('');
  const [newClassSchoolId, setNewClassSchoolId] = useState('');

  const [blacklist, setBlacklist] = useState([]);
  const [newBlacklistEmail, setNewBlacklistEmail] = useState('');

  useEffect(() => {
    fetchStructure();
    fetchUsers();
    if (profile?.role === 'creator') {
      fetchBlacklist();
    }
  }, [profile]);

  const fetchStructure = async () => {
    const [c, s, cl] = await Promise.all([
      fetchWithCache('cities', () => supabase.from('cities').select('*').order('name').then(r => r.data)),
      fetchWithCache('schools', () => supabase.from('schools').select('*').order('name').then(r => r.data)),
      fetchWithCache('classes', () => supabase.from('classes').select('*').order('name').then(r => r.data))
    ]);
    if (c) setCities(c); if (s) setSchools(s); if (cl) setClassesList(cl);
  };

  const fetchUsers = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchWithCache('dashboard_all_users', async () => {
        const { data: profiles, error } = await supabase.rpc('get_all_users');
        if (error) throw error;
        return profiles;
      });
      if (data) setUsers(data);
    } catch (error) {
      console.error(error);
      setErrorMessage("Ошибка получения списка пользователей. Убедитесь, что миграция SQL (get_all_users) была выполнена успешно.");
    }
    setLoading(false);
  };

  useCacheSync('cities', (data) => { if (data) setCities(data); });
  useCacheSync('schools', (data) => { if (data) setSchools(data); });
  useCacheSync('classes', (data) => { if (data) setClassesList(data); });
  useCacheSync('dashboard_all_users', (data) => { if (data) setUsers(data); });

  const fetchBlacklist = async () => {
    const { data } = await supabase.from('blacklisted_emails').select('*').order('created_at', { ascending: false });
    if (data) setBlacklist(data);
  };

  const handleUpdateUser = async (uId, updates) => {
    // Если вписали новый пароль
    if (newPassword.trim().length > 0) {
      if (newPassword.trim().length < 6) return alert("Пароль должен быть минимум 6 символов");

      const { error: pwError } = await supabase.rpc('admin_update_user_password', {
        target_user_id: uId,
        new_password: newPassword.trim()
      });

      if (pwError) return alert("Ошибка при смене пароля: " + pwError.message);
      await logAction(`Смена пароля`, uId, `Администратор принудительно сменил пароль пользователю`);
    }

    // Обновляем остальные данные профиля
    const { error } = await supabase.from('profiles').update(updates).eq('id', uId);
    if (error) alert(error.message);
    else {
      await logAction(`Изменение профиля`, uId, `Изменены данные пользователя ${updates.first_name || ''} ${updates.last_name || ''}`);
      fetchUsers();
      setEditingUser(null);
    }
  };

  // Открытие модалки редактирования (сбрасываем поля пароля)
  const openEditModal = (user) => {
    setEditingUser(user);
    setNewPassword('');
    setShowNewPassword(false);
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    const { error } = await supabase.rpc('delete_user_full', { target_user_id: deletingUser.id });
    if (error) alert(error.message);
    else {
      await logAction(`Полное удаление пользователя`, deletingUser.id, `Удален аккаунт ${deletingUser.email}`);
      fetchUsers();
      setDeletingUser(null);
    }
  };

  const handleBlockUser = async () => {
    if (!blockingUser || !blockingUser.email) return alert("Ошибка: Не удалось определить почту пользователя.");
    try {
      const { error: blockError } = await supabase.from('blacklisted_emails').insert({ email: blockingUser.email, added_by: session.user.id });
      if (blockError && blockError.code !== '23505') throw blockError;
      const { error: delError } = await supabase.rpc('delete_user_full', { target_user_id: blockingUser.id });
      if (delError) throw delError;

      await logAction(`Блокировка аккаунта`, blockingUser.id, `Пользователь ${blockingUser.email} заблокирован и удален.`);
      fetchBlacklist(); fetchUsers(); setBlockingUser(null);
    } catch (err) {
      alert('Ошибка при блокировке: ' + err.message);
    }
  };

  const handleAddBlacklist = async (e) => {
    e.preventDefault();
    if (!newBlacklistEmail.trim()) return;
    const { error } = await supabase.from('blacklisted_emails').insert({ email: newBlacklistEmail.trim(), added_by: session.user.id });
    if (error) alert('Ошибка: ' + error.message);
    else {
      setNewBlacklistEmail(''); fetchBlacklist();
      await logAction(`Пополнение ЧС`, null, `Почта ${newBlacklistEmail} добавлена в черный список.`);
    }
  };

  // Новая функция подтверждения разблокировки
  const confirmUnblockEmail = async () => {
    if (!unblockingEmail) return;
    const { error } = await supabase.from('blacklisted_emails').delete().eq('id', unblockingEmail.id);
    if (!error) {
      fetchBlacklist();
      await logAction(`Удаление из ЧС`, null, `Почта ${unblockingEmail.email} разблокирована.`);
      setUnblockingEmail(null);
    } else {
      alert("Ошибка при разблокировке: " + error.message);
    }
  };

  const logAction = async (action, targetId, reason) => {
    await supabase.from('audit_logs').insert({ admin_id: session.user.id, action, target_id: targetId, reason });
  };

  const handleCreateCity = async () => { if (!newCity) return; await supabase.from('cities').insert({ name: newCity }); setNewCity(''); fetchStructure(); };
  const handleCreateSchool = async () => { if (!newSchool || !newSchoolCityId) return; await supabase.from('schools').insert({ name: newSchool, city_id: newSchoolCityId }); setNewSchool(''); fetchStructure(); };
  const handleCreateClass = async (maxStudents) => {
    if (!newClass || !newClassSchoolId) return;
    await supabase.from('classes').insert({
      name: newClass,
      school_id: newClassSchoolId,
      max_students: parseInt(maxStudents) || 50
    });
    setNewClass('');
    fetchStructure();
  };

  const confirmDeleteStructure = async () => {
    if (!deletingStructure) return;
    await supabase.from(deletingStructure.table).delete().eq('id', deletingStructure.id);
    fetchStructure(); fetchUsers(); setDeletingStructure(null);
  };

  const fetchClassStudents = async (cid) => {
    setLoadingStudents(true);
    // Получаем всех пользователей и фильтруем по классу
    const { data, error } = await supabase.rpc('get_all_users');
    if (data) {
      setClassStudents(data.filter(u => u.class_id === cid));
    }
    if (error) console.error(error);
    setLoadingStudents(false);
  };

  const removeStudentFromClass = async () => {
    if (!removingStudent) return;
    const { error } = await supabase.from('profiles').update({ class_id: null }).eq('id', removingStudent.id);
    if (!error) {
      await logAction(`Удаление из класса`, removingStudent.id, `Удален из состава ${classesList.find(c => c.id === expandedClassId)?.name}`);
      setClassStudents(prev => prev.filter(s => s.id !== removingStudent.id));
      setRemovingStudent(null);
      fetchUsers();
    } else {
      alert("Ошибка при удалении ученика: " + error.message);
    }
  };

  const updateClassLimit = async () => {
    if (!editingClassLimit) return;
    const { error } = await supabase.rpc('update_class_limit', { 
      p_class_id: editingClassLimit.id, 
      p_new_limit: newLimit 
    });
    
    if (!error) {
      fetchStructure();
      setEditingClassLimit(null);
    } else {
      alert("Ошибка обновления лимита: " + error.message);
    }
  };

  const filteredUsers = (users || []).filter(u => {
    const searchStr = `${u.last_name || ''} ${u.first_name || ''} ${u.patronymic || ''} ${u.email || ''}`.toLowerCase();
    const searchMatch = search === '' || searchStr.includes(search.toLowerCase());

    const roleMatch = filterRole === 'all' || u.role === filterRole;
    const cityMatch = filterCity === 'all' || u.city_id === filterCity;
    const schoolMatch = filterSchool === 'all' || u.school_id === filterSchool;
    const classMatch = filterClass === 'all' || u.class_id === filterClass;

    return searchMatch && roleMatch && cityMatch && schoolMatch && classMatch;
  });

  const availableSchools = (schools || []).filter(s => filterCity === 'all' || s.city_id === filterCity);
  const availableClassFilters = (classesList || []).filter(c => filterSchool === 'all' || c.school_id === filterSchool);


  return (
    <>
      <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div className="flex-center" style={{ gap: '20px' }}>
          <div>
            <h2 style={{ fontSize: '2rem', marginBottom: '5px' }}>Панель управления</h2>
            <p style={{ opacity: 0.5, margin: 0 }}>Управление доступом, пользователями и структурой</p>
          </div>
          <button onClick={() => navigate('/logs')} className="flex-center" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', padding: '10px 20px', boxShadow: 'none' }}>
            <History size={18} style={{ marginRight: '8px' }} /> Журнал логов
          </button>
        </div>

        <div className="flex-center" style={{ gap: '20px' }}>
          {profile?.role === 'creator' && (
            <div style={{ background: 'rgba(0,0,0,0.05)', padding: '5px', borderRadius: '15px', display: 'flex' }}>
              <button onClick={() => setActiveTab('users')} style={{ background: activeTab === 'users' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'users' ? 'white' : 'inherit', boxShadow: 'none' }}>Ученики</button>
              <button onClick={() => setActiveTab('structure')} style={{ background: activeTab === 'structure' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'structure' ? 'white' : 'inherit', boxShadow: 'none' }}>Структура</button>
              <button onClick={() => setActiveTab('blacklist')} style={{ background: activeTab === 'blacklist' ? 'red' : 'transparent', color: activeTab === 'blacklist' ? 'white' : 'red', boxShadow: 'none', fontWeight: 'bold' }}>Черный список</button>
            </div>
          )}
        </div>
      </div>

      {loading ? <DashboardSkeleton /> : (
        <>
          <div className="flex-center" style={{ gap: '15px', width: '100%', justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: '30px' }}>
            {activeTab === 'users' && (
              <>
                <div style={{ position: 'relative', minWidth: '300px', flex: 1 }}>
                  <Search size={20} style={{ position: 'absolute', left: '15px', top: '12px', opacity: 0.5 }} />
                  <input 
                    id="dashboard-user-search"
                    name="search"
                    type="text" 
                    placeholder="Поиск по ФИО, Email..." 
                    value={search} 
                    onChange={(e) => setSearch(e.target.value)} 
                    style={{ paddingLeft: '45px' }} 
                  />
                </div>
                <select id="filter-role" name="role" value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ width: 'auto' }}>
                  <option value="all">Все роли</option>
                  {['player', 'teacher', 'editor', 'admin', 'creator'].map(r => (
                    <option key={r} value={r}>{r === 'player' ? 'Ученик' : r === 'teacher' ? 'Учитель' : r === 'editor' ? 'Редактор' : r === 'admin' ? 'Админ' : 'Создатель'}</option>
                  ))}
                </select>
                <select id="filter-city" name="city" value={filterCity} onChange={e => { setFilterCity(e.target.value); setFilterSchool('all'); setFilterClass('all'); }} style={{ width: 'auto' }}>
                  <option value="all">Все города</option>
                  {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select id="filter-school" name="school" value={filterSchool} onChange={e => { setFilterSchool(e.target.value); setFilterClass('all'); }} style={{ width: 'auto' }}>
                  <option value="all">Все школы</option>
                  {availableSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select id="filter-class" name="class" value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ width: 'auto' }}>
                  <option value="all">Все классы</option>
                  {availableClassFilters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
            )}
          </div>

          {errorMessage && (
            <div className="card" style={{ background: 'rgba(239, 68, 68, 0.05)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '30px' }}>
              <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                <AlertTriangle size={18} />
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

      {activeTab === 'users' && (
        <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <tr>
                <th style={{ padding: '20px' }}>ID / Почта</th>
                <th style={{ padding: '20px' }}>ФИО</th>
                <th style={{ padding: '20px' }}>Роль</th>
                <th style={{ padding: '20px' }}>Заведение</th>
                <th style={{ padding: '20px' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => {
                const userCity = cities.find(c => c.id === user.city_id)?.name;
                const userSchool = schools.find(s => s.id === user.school_id)?.name;
                const userClass = classesList.find(c => c.id === user.class_id)?.name;

                return (
                  <tr key={user.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.02)' }}>
                    <td style={{ padding: '15px 20px' }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>{user.id.slice(0, 8)}...</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Mail size={14} style={{ opacity: 0.3 }} /> {user.email || 'Нет почты'}
                      </div>
                    </td>
                    <td style={{ padding: '15px 20px' }}>
                      <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}>
                        <div style={{ fontWeight: '500' }}>{user.last_name || user.first_name ? `${user.last_name || ''} ${user.first_name || ''}` : 'Без имени'}</div>
                        {user.is_observer && <span style={{ padding: '2px 8px', background: 'rgba(250, 204, 21, 0.1)', color: '#ca8a04', borderRadius: '50px', fontSize: '0.65rem', fontWeight: 'bold' }}>НАБЛЮДАТЕЛЬ</span>}
                        {user.is_hidden && <span style={{ background: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '50px', fontSize: '0.65rem' }} title="Скрытый пользователь"><EyeOff size={10} /></span>}
                      </div>
                      <span style={{ fontSize: '0.85rem', opacity: 0.5 }}>{user.patronymic || '—'}</span>
                    </td>
                    <td style={{ padding: '15px 20px' }}>
                      <span style={{ padding: '5px 12px', borderRadius: '100px', fontSize: '0.8rem', fontWeight: '600', background: user.role === 'creator' ? 'var(--primary-color)' : (user.role === 'admin' ? 'var(--accent-color)' : 'rgba(0,0,0,0.08)'), color: user.role === 'creator' || user.role === 'admin' ? 'white' : 'inherit' }}>
                        {user.role === 'creator' ? 'Создатель' : (user.role === 'admin' ? 'Админ' : (user.role === 'teacher' ? 'Учитель' : (user.role === 'editor' ? 'Редактор' : 'Ученик')))}
                      </span>
                    </td>
                    <td style={{ padding: '15px 20px', fontSize: '0.85rem' }}>
                      <div className="flex-center" style={{ gap: '10px', justifyContent: 'flex-start' }}>
                        {user.is_observer && <span style={{ padding: '2px 8px', background: 'rgba(250, 204, 21, 0.1)', color: '#ca8a04', borderRadius: '50px', fontSize: '0.7rem', fontWeight: 'bold' }}>НАБЛЮДАТЕЛЬ</span>}
                        {user.is_hidden && <span style={{ background: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '50px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px' }}><EyeOff size={10} /> СКРЫТ</span>}
                      </div>
                      {userCity && <div style={{ opacity: 0.6 }}>г. {userCity}</div>}
                      {userSchool && <div style={{ opacity: 0.8 }}>{userSchool}</div>}
                      {userClass ? <div style={{ fontWeight: 'bold' }}>{userClass}</div> : <div style={{ opacity: 0.3 }}>Не указано</div>}
                    </td>
                    <td style={{ padding: '15px 20px' }}>
                      <div className="flex-center" style={{ gap: '10px', justifyContent: 'flex-start' }}>
                        <button onClick={() => openEditModal(user)} className="flex-center" style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '10px', boxShadow: 'none' }} title="Редактировать"><Edit3 size={18} /></button>

                        {(profile?.role === 'creator') && user.id !== session.user.id && (
                          <>
                            <button onClick={() => setDeletingUser(user)} className="flex-center" style={{ padding: '8px', background: 'rgba(255, 0, 0, 0.1)', color: 'red', borderRadius: '10px', boxShadow: 'none' }} title="Удалить аккаунт"><Trash2 size={18} /></button>
                            <button onClick={() => setBlockingUser(user)} className="flex-center" style={{ padding: '8px', background: '#f87171', color: 'white', borderRadius: '10px', boxShadow: 'none' }} title="Удалить и заблокировать почту"><Ban size={18} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'blacklist' && profile?.role === 'creator' && (
        <div className="card">
          <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '15px', color: 'red', marginBottom: '25px' }}>
            <ShieldAlert size={28} />
            <h3 style={{ margin: 0 }}>Заблокированные адреса</h3>
          </div>

          <form onSubmit={handleAddBlacklist} className="flex-center" style={{ gap: '15px', marginBottom: '30px', padding: '20px', background: 'rgba(255,0,0,0.02)', borderRadius: '15px', border: '1px dashed red' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="blacklist-email" style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: '5px', display: 'block' }}>Заблокировать новую почту вручную</label>
              <input id="blacklist-email" name="email" type="email" placeholder="example@mail.ru" value={newBlacklistEmail} onChange={(e) => setNewBlacklistEmail(e.target.value)} required style={{ width: '100%' }} />
            </div>
            <button type="submit" style={{ background: 'red', marginTop: '22px' }}>Заблокировать</button>
          </form>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'rgba(0,0,0,0.03)' }}>
              <tr>
                <th style={{ padding: '15px' }}>Заблокированная Почта</th>
                <th style={{ padding: '15px' }}>Дата блокировки</th>
                <th style={{ padding: '15px' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {blacklist.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '15px', fontWeight: 'bold' }}>{item.email}</td>
                  <td style={{ padding: '15px', opacity: 0.6 }}>{new Date(item.created_at).toLocaleString()}</td>
                  <td style={{ padding: '15px' }}>
                    <button onClick={() => setUnblockingEmail(item)} style={{ padding: '6px 15px', background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', boxShadow: 'none' }}>
                      Разблокировать
                    </button>
                  </td>
                </tr>
              ))}
              {blacklist.length === 0 && <tr><td colSpan="3" style={{ padding: '30px', textAlign: 'center', opacity: 0.5 }}>Черный список пуст.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ВКЛАДКА СТРУКТУРА */}
      {activeTab === 'structure' && profile?.role === 'creator' && (
        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div className="card">
            <h3 className="flex-center" style={{ gap: '10px', marginBottom: '20px', justifyContent: 'flex-start' }}><MapPin size={20} color="var(--primary-color)" /> Города</h3>
            <div className="flex-center" style={{ gap: '10px', marginBottom: '20px' }}>
              <input id="new-city-name" name="city-name" type="text" placeholder="Новый город" value={newCity} onChange={e => setNewCity(e.target.value)} style={{ flex: 1, padding: '10px' }} />
              <button onClick={handleCreateCity} style={{ padding: '10px' }}><Plus size={20} /></button>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {cities.map(city => (
                <div key={city.id} className="flex-center" style={{ justifyContent: 'space-between', padding: '12px 15px', background: 'rgba(0,0,0,0.02)', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <span style={{ fontWeight: '500' }}>{city.name}</span>
                  <button onClick={() => setDeletingStructure({ table: 'cities', id: city.id, name: city.name, typeLabel: 'город' })} style={{ background: 'transparent', color: 'red', padding: '5px', boxShadow: 'none' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="flex-center" style={{ gap: '10px', marginBottom: '20px', justifyContent: 'flex-start' }}><Building size={20} color="var(--primary-color)" /> Школы</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <select id="new-school-city" name="city-id" value={newSchoolCityId} onChange={e => setNewSchoolCityId(e.target.value)} style={{ padding: '10px' }}>
                <option value="">Выберите город...</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex-center" style={{ gap: '10px' }}>
                <input id="new-school-name" name="school-name" type="text" placeholder="Название школы" value={newSchool} onChange={e => setNewSchool(e.target.value)} style={{ flex: 1, padding: '10px' }} />
                <button onClick={handleCreateSchool} style={{ padding: '10px' }} disabled={!newSchoolCityId}><Plus size={20} /></button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {schools.map(school => (
                <div key={school.id} className="flex-center" style={{ justifyContent: 'space-between', padding: '12px 15px', background: 'rgba(0,0,0,0.02)', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5, display: 'block' }}>г. {cities.find(c => c.id === school.city_id)?.name}</span>
                    <span style={{ fontWeight: '500' }}>{school.name}</span>
                  </div>
                  <button onClick={() => setDeletingStructure({ table: 'schools', id: school.id, name: school.name, typeLabel: 'школу' })} style={{ background: 'transparent', color: 'red', padding: '5px', boxShadow: 'none' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="flex-center" style={{ gap: '10px', marginBottom: '20px', justifyContent: 'flex-start' }}><GraduationCap size={20} color="var(--primary-color)" /> Классы</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <select value={newClassSchoolId} onChange={e => setNewClassSchoolId(e.target.value)} style={{ padding: '10px' }}>
                <option value="">Выберите школу...</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name} ({cities.find(c => c.id === s.city_id)?.name})</option>)}
              </select>
              <div className="flex-center" style={{ gap: '10px' }}>
                <input type="text" placeholder="Название класса" value={newClass} onChange={e => setNewClass(e.target.value)} style={{ flex: 1, padding: '10px' }} />
                <input type="number" placeholder="Лимит (50)" title="Макс. кол-во учеников" style={{ width: '80px', padding: '10px' }} defaultValue={50} id="max_students_input" />
                <button onClick={() => {
                  const maxVal = document.getElementById('max_students_input').value;
                  handleCreateClass(maxVal);
                }} style={{ padding: '10px' }} disabled={!newClassSchoolId}><Plus size={20} /></button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {classesList.map(cls => {
                const isExpanded = expandedClassId === cls.id;
                return (
                  <div key={cls.id} style={{ background: 'rgba(0,0,0,0.02)', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    <div className="flex-center" style={{ justifyContent: 'space-between', padding: '12px 15px' }}>
                      <div onClick={() => {
                        if (isExpanded) setExpandedClassId(null);
                        else {
                          setExpandedClassId(cls.id);
                          fetchClassStudents(cls.id);
                        }
                      }} style={{ cursor: 'pointer', flex: 1 }}>
                        <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}>
                          {isExpanded ? <ChevronDown size={14} opacity={0.5} /> : <ChevronRight size={14} opacity={0.5} />}
                          <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{schools.find(s => s.id === cls.school_id)?.name}</span>
                        </div>
                        <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                          <span style={{ fontWeight: 'bold' }}>{cls.name}</span>
                          <span 
                            onClick={(e) => { e.stopPropagation(); setNewLimit(cls.max_students || 50); setEditingClassLimit(cls); }}
                            className="flex-center" 
                            style={{ fontSize: '0.7rem', background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', gap: '4px' }}
                            title="Изменить лимит учеников"
                          >
                            <User size={10} /> {cls.max_students || 50}
                            {cls.max_students && users.filter(u => u.class_id === cls.id).length > cls.max_students && (
                              <AlertTriangle size={12} color="red" title="Лимит превышен!" />
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex-center" style={{ gap: '5px' }}>
                        <button onClick={(e) => { e.stopPropagation(); setNewLimit(cls.max_students || 50); setEditingClassLimit(cls); }} style={{ background: 'transparent', color: 'var(--primary-color)', padding: '5px', boxShadow: 'none' }} title="Изменить лимит"><Edit3 size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); setDeletingStructure({ table: 'classes', id: cls.id, name: cls.name, typeLabel: 'класс' }); }} style={{ background: 'transparent', color: 'red', padding: '5px', boxShadow: 'none' }} title="Удалить класс"><Trash2 size={16} /></button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="animate" style={{ padding: '0 15px 15px 15px', borderTop: '1px solid rgba(0,0,0,0.03)' }}>
                        <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '10px', marginTop: '10px' }}>Ученики в классе:</div>
                        {loadingStudents ? (
                          <div style={{ fontSize: '0.85rem', opacity: 0.5 }}>Загрузка списка...</div>
                        ) : classStudents.length > 0 ? (
                          <div style={{ display: 'grid', gap: '8px' }}>
                            {classStudents.map(s => (
                              <div key={s.id} className="flex-center" style={{ justifyContent: 'space-between', background: 'var(--card-bg)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: '500' }}>{s.last_name} {s.first_name}</span>
                                  <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{s.email}</span>
                                </div>
                                <button
                                  onClick={() => setRemovingStudent(s)}
                                  style={{ background: 'rgba(255,0,0,0.05)', color: 'red', padding: '5px', boxShadow: 'none' }}
                                  title="Исключить из класса"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.85rem', opacity: 0.5 }}>В классе пока нет учеников.</div>
                        )}
                      </div>
                    )}
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

      {/* МОДАЛКИ */}

      {/* МОДАЛКА ИСКЛЮЧЕНИЯ УЧЕНИКА ИЗ КЛАССА */}
      {removingStudent && (
        <div className="modal-overlay" onClick={() => setRemovingStudent(null)}>
          <div className="modal-content animate" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255, 0, 0, 0.1)', color: 'red', margin: '0 auto 25px' }}><X size={32} /></div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Исключить из класса?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6', textAlign: 'center' }}>
              Вы собираетесь исключить <strong>{removingStudent.last_name} {removingStudent.first_name}</strong> из этого класса.<br />
              Аккаунт пользователя сохранится, но он перестанет числиться в данном классе.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button onClick={() => setRemovingStudent(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={removeStudentFromClass} style={{ background: 'red', color: 'white' }}>Исключить</button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА ИЗМЕНЕНИЯ ЛИМИТА КЛАССА */}
      {editingClassLimit && (
        <div className="modal-overlay" onClick={() => setEditingClassLimit(null)}>
          <div className="modal-content animate" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', margin: '0 auto 25px' }}><Edit3 size={32} /></div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Лимит учеников</h2>
            <p style={{ opacity: 0.7, marginBottom: '20px', textAlign: 'center' }}>
              Класс: <strong>{editingClassLimit.name}</strong><br/>
              Тип: {availableSchools.find(s => s.id === editingClassLimit.school_id)?.name}
            </p>
            <div style={{ marginBottom: '25px' }}>
              <label htmlFor="class-limit-input" style={{ fontSize: '0.85rem', opacity: 0.5, display: 'block', marginBottom: '8px' }}>Новый лимит (учеников)</label>
              <input 
                id="class-limit-input"
                name="max_students"
                type="number" 
                value={newLimit} 
                onChange={(e) => setNewLimit(parseInt(e.target.value) || 0)} 
                min="1"
                style={{ width: '100%', fontSize: '1.2rem', textAlign: 'center' }} 
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button onClick={() => setEditingClassLimit(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={updateClassLimit} style={{ background: 'var(--primary-color)', color: 'white' }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА РАЗБЛОКИРОВКИ */}
      {unblockingEmail && (
        <div className="modal-overlay" onClick={() => setUnblockingEmail(null)}>
          <div className="modal-content animate" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', margin: '0 auto 25px' }}><Unlock size={32} /></div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Разблокировать почту?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6', textAlign: 'center' }}>
              Вы собираетесь убрать из черного списка <strong>{unblockingEmail.email}</strong>.<br />
              Пользователь снова сможет зарегистрировать аккаунт на этот адрес.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button onClick={() => setUnblockingEmail(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={confirmUnblockEmail} style={{ background: 'var(--primary-color)', color: 'white' }}>Да, разблокировать</button>
            </div>
          </div>
        </div>
      )}

      {/* РЕДАКТИРОВАНИЕ ПОЛЬЗОВАТЕЛЯ */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-content animate" style={{ width: '500px', textAlign: 'left', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '25px' }}>
              <h3 style={{ margin: 0 }}>Редактирование {editingUser.first_name}</h3>
              <button onClick={() => setEditingUser(null)} style={{ background: 'transparent', color: 'inherit', padding: 0 }}><X size={24} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="grid-2" style={{ gap: '15px' }}>
                <div>
                  <label htmlFor="edit-user-email" style={{ fontSize: '0.85rem', opacity: 0.5, display: 'block' }}>Email (Только чтение)</label>
                  <input id="edit-user-email" name="email" type="email" value={editingUser.email || ''} disabled style={{ opacity: 0.7 }} />
                </div>
                {/* ПОЛЕ ДЛЯ СМЕНЫ ПАРОЛЯ */}
                {profile?.role === 'creator' && (
                  <div>
                    <label htmlFor="edit-user-password" style={{ fontSize: '0.85rem', opacity: 0.5, display: 'block' }}>Сбросить пароль (скрыто)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="edit-user-password"
                        name="new-password"
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder="Оставьте пустым..."
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        style={{ paddingRight: '40px', width: '100%' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', boxShadow: 'none', color: 'inherit', padding: '5px' }}
                      >
                        {showNewPassword ? <EyeOff size={18} opacity={0.5} /> : <Eye size={18} opacity={0.5} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid-2" style={{ gap: '15px' }}>
                <div><label htmlFor="edit-user-last-name" style={{ fontSize: '0.85rem', opacity: 0.5, display: 'block' }}>Фамилия</label><input id="edit-user-last-name" name="last_name" type="text" value={editingUser.last_name || ''} onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })} /></div>
                <div><label htmlFor="edit-user-first-name" style={{ fontSize: '0.85rem', opacity: 0.5, display: 'block' }}>Имя</label><input id="edit-user-first-name" name="first_name" type="text" value={editingUser.first_name || ''} onChange={(e) => setEditingUser({ ...editingUser, first_name: e.target.value })} /></div>
              </div>
              <div><label htmlFor="edit-user-patronymic" style={{ fontSize: '0.85rem', opacity: 0.5, display: 'block' }}>Отчество</label><input id="edit-user-patronymic" name="patronymic" type="text" value={editingUser.patronymic || ''} onChange={(e) => setEditingUser({ ...editingUser, patronymic: e.target.value })} /></div>

              <div>
                <label htmlFor="edit-user-role" style={{ fontSize: '0.85rem', opacity: 0.5, display: 'block' }}>Роль доступа</label>
                <select id="edit-user-role" name="role" value={editingUser.role} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })} disabled={profile?.role !== 'creator' && (editingUser.role === 'creator' || editingUser.role === 'admin')}>
                  <option value="player">Ученик (Игрок)</option>
                  <option value="editor">Редактор</option>
                  <option value="teacher">Учитель</option>
                  {profile?.role === 'creator' && <option value="admin">Администратор</option>}
                  {profile?.role === 'creator' && <option value="creator">Создатель</option>}
                </select>
              </div>

              <div style={{ padding: '15px', background: 'rgba(0,0,0,0.02)', borderRadius: '15px', border: '1px solid rgba(0,0,0,0.05)' }}>
                <h4 style={{ marginBottom: '15px', fontSize: '0.95rem' }}>Заведение</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <select id="edit-user-city" name="city-id" value={editingUser.city_id || ''} onChange={(e) => setEditingUser({ ...editingUser, city_id: e.target.value || null, school_id: null, class_id: null })}><option value="">Без города</option>{cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  <select id="edit-user-school" name="school-id" value={editingUser.school_id || ''} onChange={(e) => setEditingUser({ ...editingUser, school_id: e.target.value || null, class_id: null })} disabled={!editingUser.city_id}><option value="">Без школы</option>{schools.filter(s => s.city_id === editingUser.city_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  <select id="edit-user-class" name="class-id" value={editingUser.class_id || ''} onChange={(e) => setEditingUser({ ...editingUser, class_id: e.target.value || null })} disabled={!editingUser.school_id}><option value="">Без класса</option>{classesList.filter(c => c.school_id === editingUser.school_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', padding: '15px', background: 'rgba(0,0,0,0.02)', borderRadius: '15px', border: '1px solid rgba(0,0,0,0.05)' }}>
                <label htmlFor="edit-user-observer" className="flex-center" style={{ gap: '10px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input id="edit-user-observer" name="is_observer" type="checkbox" checked={editingUser.is_observer} onChange={(e) => setEditingUser({ ...editingUser, is_observer: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                  <span>Наблюдатель</span>
                </label>
                <label htmlFor="edit-user-hidden" className="flex-center" style={{ gap: '10px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input id="edit-user-hidden" name="is_hidden" type="checkbox" checked={editingUser.is_hidden} onChange={(e) => setEditingUser({ ...editingUser, is_hidden: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                  <span>Скрыть из списков</span>
                </label>
              </div>

              <div className="flex-center" style={{ gap: '15px', marginTop: '10px' }}>
                <button onClick={() => setEditingUser(null)} style={{ width: '100%', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
                <button onClick={() => handleUpdateUser(editingUser.id, {
                  role: editingUser.role,
                  first_name: editingUser.first_name,
                  last_name: editingUser.last_name,
                  patronymic: editingUser.patronymic,
                  city_id: editingUser.city_id,
                  school_id: editingUser.school_id,
                  class_id: editingUser.class_id,
                  is_observer: editingUser.is_observer,
                  is_hidden: editingUser.is_hidden
                })} style={{ width: '100%' }}>Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deletingUser && (
        <div className="modal-overlay" onClick={() => setDeletingUser(null)}>
          <div className="modal-content animate modal-content-danger" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}><Trash2 size={32} /></div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Удалить пользователя?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6', textAlign: 'center' }}>
              Вы уверены, что хотите ПОЛНОСТЬЮ удалить <strong>{deletingUser.email}</strong>?<br />
              Пользователь сможет зарегистрироваться заново.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button onClick={() => setDeletingUser(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={handleDeleteUser} style={{ background: '#f87171', color: 'white' }}>Да, удалить</button>
            </div>
          </div>
        </div>
      )}

      {blockingUser && (
        <div className="modal-overlay" onClick={() => setBlockingUser(null)}>
          <div className="modal-content animate modal-content-danger" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255, 0, 0, 0.1)', color: 'red', margin: '0 auto 25px' }}><Ban size={32} /></div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Заблокировать пользователя?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6', textAlign: 'center' }}>
              Почта <strong>{blockingUser.email}</strong> будет добавлена в Черный список, а сам аккаунт будет полностью удален.<br />
              Пользователь больше не сможет создать аккаунт.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button onClick={() => setBlockingUser(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={handleBlockUser} style={{ background: 'red', color: 'white' }}>Заблокировать</button>
            </div>
          </div>
        </div>
      )}

      {deletingStructure && (
        <div className="modal-overlay" onClick={() => setDeletingStructure(null)}>
          <div className="modal-content animate modal-content-danger" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}><AlertTriangle size={32} /></div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Удалить {deletingStructure.typeLabel}?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6', textAlign: 'center' }}>
              Вы собираетесь безвозвратно удалить <strong>"{deletingStructure.name}"</strong>.<br />
              Связь учеников с этим элементом будет сброшена. Продолжить?
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button onClick={() => setDeletingStructure(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={confirmDeleteStructure} style={{ background: '#f87171', color: 'white' }}>Да, удалить</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Dashboard;