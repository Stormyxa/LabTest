import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchWithCache, useCacheSync } from '../lib/cache';
import { User, Shield, Search, Edit3, Trash2, Mail, X, AlertTriangle, MapPin, Building, GraduationCap, Plus, History, Ban, ShieldAlert, Unlock, Eye, EyeOff, Zap, ChevronDown, ChevronRight, Settings, Users, UserPlus, UserMinus, ArrowUp, ArrowDown, UserCheck } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState(() => {
    const saved = sessionStorage.getItem('dash_active_tab');
    if (saved) return saved;
    return profile?.role === 'teacher' ? 'structure' : 'users';
  });
  useEffect(() => { sessionStorage.setItem('dash_active_tab', activeTab); }, [activeTab]);

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

  const [expandedClasses, setExpandedClasses] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dash_expanded_classes')) || {};
    } catch (e) { return {}; }
  });
  useEffect(() => { localStorage.setItem('dash_expanded_classes', JSON.stringify(expandedClasses)); }, [expandedClasses]);
  const [classStudents, setClassStudents] = useState({}); // { classId: students[] }
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

  // New states for advanced class management
  const [teacherClasses, setTeacherClasses] = useState([]); // Classes assigned to the current teacher
  const [classTeachers, setClassTeachers] = useState([]); // Teachers for the selected class
  const [showTeachersModal, setShowTeachersModal] = useState(null); // class object
  const [classApplications, setClassApplications] = useState({}); // { classId: apps[] }
  const [showListsModal, setShowListsModal] = useState(null); // { class, type: 'white' | 'black' }
  const [classListItems, setClassListItems] = useState([]);
  const [expandedSchools, setExpandedSchools] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dash_expanded_schools')) || {};
    } catch (e) { return {}; }
  });
  useEffect(() => { localStorage.setItem('dash_expanded_schools', JSON.stringify(expandedSchools)); }, [expandedSchools]);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [newTeacherEmail, setNewTeacherEmail] = useState('');

  useEffect(() => {
    fetchStructure();
    fetchUsers();
    if (profile?.role === 'creator') {
      fetchBlacklist();
    }
    // Auto-fetch students for already expanded classes (from localStorage)
    const expandedKeys = Object.keys(expandedClasses);
    if (expandedKeys.length > 0) {
      expandedKeys.forEach(cid => {
        if (expandedClasses[cid]) {
          fetchClassStudents(cid);
          fetchClassApplications(cid);
        }
      });
    }
  }, [profile]);

  const fetchStructure = async () => {
    const cacheSuffix = profile?.role || 'anon';
    // 1. Fetch class_teachers for the current user if they are a teacher/admin/creator
    let assignedClasses = [];
    if (profile?.role === 'teacher') {
      const { data: tc } = await supabase.from('class_teachers').select('class_id').eq('email', session.user.email);
      if (tc) assignedClasses = tc.map(x => x.class_id);
      setTeacherClasses(assignedClasses);
    }

    const [c, s, cl] = await Promise.all([
      fetchWithCache(`cities_${cacheSuffix}`, () => supabase.from('cities').select('*').order('name').then(r => r.data)),
      fetchWithCache(`schools_${cacheSuffix}`, () => supabase.from('schools').select('*').order('order_index').then(r => r.data)),
      fetchWithCache(`classes_${cacheSuffix}`, () => supabase.from('classes').select('*').order('order_index').then(r => r.data))
    ]);

    if (c) {
      if (profile?.role === 'teacher') {
        // Filter cities that have schools that have assigned classes
        const filteredCities = c.filter(city => 
          s.some(school => school.city_id === city.id && cl.some(cls => cls.school_id === school.id && assignedClasses.includes(cls.id)))
        );
        setCities(filteredCities);
      } else {
        setCities(c);
      }
    }
    
    if (s) {
      if (profile?.role === 'teacher') {
        const filteredSchools = s.filter(school => cl.some(cls => cls.school_id === school.id && assignedClasses.includes(cls.id)));
        setSchools(filteredSchools);
      } else {
        setSchools(s);
      }
    }

    if (cl) {
      if (profile?.role === 'teacher') {
        const filteredClasses = cl.filter(cls => assignedClasses.includes(cls.id));
        setClassesList(filteredClasses);
      } else {
        setClassesList(cl);
      }
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const cacheSuffix = profile?.role || 'anon';
      const data = await fetchWithCache(`dashboard_users_${cacheSuffix}`, async () => {
        if (profile?.role === 'teacher') {
          // Teachers fetch students they have access to directly
          const { data: profiles, error } = await supabase.from('profiles').select('*');
          if (error) throw error;
          return profiles;
        } else {
          // Admins use the RPC to get more details if needed
          const { data: profiles, error } = await supabase.rpc('get_all_users');
          if (error) throw error;
          return profiles;
        }
      });
      if (data) setUsers(data);
    } catch (error) {
      console.error(error);
      setErrorMessage("Ошибка получения списка пользователей.");
    }
    setLoading(false);
  };

  const cacheSuffix = profile?.role || 'anon';
  useCacheSync(`cities_${cacheSuffix}`, (data) => { if (data) setCities(data); });
  useCacheSync(`schools_${cacheSuffix}`, (data) => { if (data) setSchools(data); });
  useCacheSync(`classes_${cacheSuffix}`, (data) => { 
    if (data) {
      if (profile?.role === 'teacher') {
        // We need teacherClasses state to filter correctly in sync
        setClassesList(data.filter(cls => teacherClasses.includes(cls.id)));
      } else {
        setClassesList(data);
      }
    }
  });
  useCacheSync(`dashboard_users_${cacheSuffix}`, (data) => { if (data) setUsers(data); });

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
    const { data, error } = await supabase.from('profiles').select('*').eq('class_id', cid);
    if (data) {
      setClassStudents(prev => ({ ...prev, [cid]: data }));
    }
    if (error) console.error("DEBUG Error fetching students:", error);
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

  const handleMoveStructure = async (table, id, direction, items) => {
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === items.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const target = items[swapIdx];

    const currentOrder = items[idx].order_index || 0;
    const targetOrder = target.order_index || 0;

    await Promise.all([
      supabase.from(table).update({ order_index: targetOrder }).eq('id', id),
      supabase.from(table).update({ order_index: currentOrder }).eq('id', target.id)
    ]);
    fetchStructure();
  };

  const handleRenameStructure = async (table, id, newName) => {
    if (!newName.trim()) return;
    const { error } = await supabase.from(table).update({ name: newName.trim() }).eq('id', id);
    if (error) alert(error.message);
    else fetchStructure();
  };

  const fetchClassTeachers = async (cid) => {
    const { data } = await supabase.from('class_teachers').select('*').eq('class_id', cid);
    if (data) setClassTeachers(data);
  };

  const handleAddTeacher = async (cid, email) => {
    const { error } = await supabase.from('class_teachers').insert({ class_id: cid, email: email.toLowerCase().trim() });
    if (error) alert(error.message);
    else {
      setNewTeacherEmail('');
      fetchClassTeachers(cid);
    }
  };

  const handleRemoveTeacher = async (cid, tid) => {
    if (!confirm("Удалить этого учителя из управления классом?")) return;
    const { error } = await supabase.from('class_teachers').delete().eq('id', tid);
    if (error) alert(error.message);
    else fetchClassTeachers(cid);
  };

  const handleToggleTeacherPermission = async (cid, tid, current) => {
    const { error } = await supabase.from('class_teachers').update({ can_manage_students: !current }).eq('id', tid);
    if (error) alert(error.message);
    else fetchClassTeachers(cid);
  };

  const fetchClassApplications = async (cid) => {
    const { data } = await supabase.from('class_applications')
      .select('*, profiles(id, first_name, last_name, patronymic, email)')
      .eq('class_id', cid)
      .eq('status', 'pending');
    if (data) setClassApplications(prev => ({ ...prev, [cid]: data }));
  };

  const handleApplication = async (app, status) => {
    const { error } = await supabase.from('class_applications').update({ status }).eq('id', app.id);
    if (!error) {
      if (status === 'accepted') {
        await supabase.from('profiles').update({ class_id: app.class_id, pending_class_id: null, is_observer: false }).eq('id', app.user_id);
      } else {
        await supabase.from('profiles').update({ pending_class_id: null }).eq('id', app.user_id);
      }
      fetchClassApplications(app.class_id);
      fetchUsers();
    } else {
      alert(error.message);
    }
  };

  const fetchClassLists = async (cid, type) => {
    const table = type === 'white' ? 'class_white_list' : 'class_black_list';
    const { data } = await supabase.from(table).select('*').eq('class_id', cid);
    if (data) setClassListItems(data);
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
          {(profile?.role === 'creator' || profile?.role === 'admin' || profile?.role === 'teacher') && (
            <div style={{ background: 'rgba(0,0,0,0.05)', padding: '5px', borderRadius: '15px', display: 'flex' }}>
              {(profile?.role === 'creator' || profile?.role === 'admin') && <button onClick={() => setActiveTab('users')} style={{ background: activeTab === 'users' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'users' ? 'white' : 'inherit', boxShadow: 'none' }}>Ученики</button>}
              <button onClick={() => setActiveTab('structure')} style={{ background: activeTab === 'structure' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'structure' ? 'white' : 'inherit', boxShadow: 'none' }}>Структура</button>
              {(profile?.role === 'creator' || profile?.role === 'admin') && <button onClick={() => setActiveTab('blacklist')} style={{ background: activeTab === 'blacklist' ? 'red' : 'transparent', color: activeTab === 'blacklist' ? 'white' : 'red', boxShadow: 'none', fontWeight: 'bold' }}>Черный список</button>}
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
      {activeTab === 'structure' && (
        <div className="animate">
          <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '30px' }}>
            <h3 style={{ margin: 0 }}>Список школ</h3>
            {profile?.role === 'creator' && (
              <button onClick={() => {
                const name = prompt("Введите название новой школы:");
                const cityId = prompt("Введите ID города (или выберите из списка):", cities[0]?.id);
                if (name && cityId) supabase.from('schools').insert({ name, city_id: cityId, order_index: schools.length }).then(() => fetchStructure());
              }} className="flex-center" style={{ gap: '8px' }}>
                <Plus size={18} /> Добавить школу
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gap: '20px' }}>
            {schools.map(school => {
              const isSchoolExpanded = expandedSchools[school.id];
              const schoolClasses = classesList.filter(c => c.school_id === school.id);
              const city = cities.find(c => c.id === school.city_id);

              return (
                <div key={school.id} style={{ background: 'rgba(0,0,0,0.02)', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.05)', marginBottom: '15px', overflow: 'hidden' }}>
                  <div className="flex-center" style={{ padding: '15px 25px', justifyContent: 'space-between' }}>
                    <div onClick={() => setExpandedSchools(prev => ({ ...prev, [school.id]: !prev[school.id] }))} style={{ cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
                      {isSchoolExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      <div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>г. {city?.name}</div>
                        <h4 style={{ margin: 0 }}>{school.name}</h4>
                      </div>
                      <span style={{ padding: '2px 10px', background: 'rgba(0,0,0,0.05)', borderRadius: '50px', fontSize: '0.75rem', opacity: 0.6 }}>{schoolClasses.length} классов</span>
                    </div>
                    
                    {profile?.role === 'creator' && (
                      <div className="flex-center" style={{ gap: '10px' }}>
                        <button onClick={() => {
                          const newName = prompt("Переименовать школу:", school.name);
                          if (newName) handleRenameStructure('schools', school.id, newName);
                        }} style={{ background: 'transparent', padding: '5px', color: 'var(--primary-color)', boxShadow: 'none' }}><Edit3 size={18} /></button>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <button onClick={() => handleMoveStructure('schools', school.id, 'up', schools)} style={{ background: 'transparent', padding: '2px', color: 'inherit', boxShadow: 'none' }}><ArrowUp size={14} /></button>
                          <button onClick={() => handleMoveStructure('schools', school.id, 'down', schools)} style={{ background: 'transparent', padding: '2px', color: 'inherit', boxShadow: 'none' }}><ArrowDown size={14} /></button>
                        </div>
                        <button onClick={() => {
                          if (schoolClasses.length > 0) return alert("Нельзя удалить школу, в которой есть классы!");
                          if (confirm(`Удалить школу "${school.name}"?`)) {
                            supabase.from('schools').delete().eq('id', school.id).then(() => fetchStructure());
                          }
                        }} style={{ background: 'transparent', padding: '5px', color: 'red', boxShadow: 'none' }}><Trash2 size={18} /></button>
                      </div>
                    )}
                    {profile?.role === 'creator' && (
                      <button onClick={() => {
                        const name = prompt(`Добавить класс в школу "${school.name}":`);
                        if (name) supabase.from('classes').insert({ name, school_id: school.id, order_index: schoolClasses.length }).then(() => fetchStructure());
                      }} style={{ marginLeft: '15px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', padding: '8px 15px', boxShadow: 'none' }}>
                        <Plus size={16} />
                      </button>
                    )}
                  </div>

                  {isSchoolExpanded && (
                    <div style={{ padding: '15px', background: 'rgba(0,0,0,0.005)' }}>
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {schoolClasses.map(cls => {
                          const isClassExpanded = expandedClasses[cls.id];
                          const studentsCount = users.filter(u => u.class_id === cls.id).length;
                          const isTeacherRole = profile?.role === 'teacher';
                          const canManage = isTeacherRole ? teacherClasses.includes(cls.id) : true;

                          return (
                            <div key={cls.id} style={{ background: 'white', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '12px', overflow: 'hidden' }}>
                              <div className="flex-center" style={{ justifyContent: 'space-between', padding: '12px 20px' }}>
                                <div onClick={() => {
                                  if (isClassExpanded) {
                                    setExpandedClasses(prev => {
                                      const next = { ...prev };
                                      delete next[cls.id];
                                      return next;
                                    });
                                  } else {
                                    setExpandedClasses(prev => ({ ...prev, [cls.id]: true }));
                                    fetchClassStudents(cls.id);
                                    fetchClassApplications(cls.id);
                                  }
                                }} style={{ cursor: 'pointer', flex: 1 }}>
                                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                                    {isClassExpanded ? <ChevronDown size={16} opacity={0.5} /> : <ChevronRight size={16} opacity={0.5} />}
                                    <span style={{ fontWeight: '600' }}>{cls.name}</span>
                                    <div className="flex-center" style={{ gap: '5px', opacity: 0.5, fontSize: '0.8rem' }}>
                                      <Users size={14} /> {studentsCount} / {cls.max_students || 50}
                                      {cls.max_students && studentsCount > cls.max_students && <AlertTriangle size={14} color="red" />}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex-center" style={{ gap: '10px' }}>
                                  {/* Orange Shield for Teacher Management */}
                                  {profile?.role === 'creator' && (
                                    <button 
                                      onClick={() => { setShowTeachersModal(cls); fetchClassTeachers(cls.id); }} 
                                      style={{ background: '#f59e0b', color: 'white', padding: '6px 12px', borderRadius: '8px', boxShadow: 'none', display: 'flex', gap: '5px', alignItems: 'center', fontSize: '0.85rem' }}
                                    >
                                      <Shield size={16} /> Учителя
                                    </button>
                                  )}

                                  {canManage && (
                                    <>
                                      <button onClick={() => { setShowApplicationsModal(cls); fetchClassApplications(cls.id); }} style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary-color)', padding: '6px 12px', borderRadius: '8px', boxShadow: 'none', display: 'flex', gap: '5px', alignItems: 'center', fontSize: '0.85rem' }}>
                                        <UserPlus size={16} /> Заявки
                                      </button>
                                      <button onClick={() => { setShowListsModal({ class: cls, type: 'white' }); fetchClassLists(cls.id, 'white'); }} style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', padding: '6px', borderRadius: '8px', boxShadow: 'none' }} title="Белый список"><UserCheck size={18} /></button>
                                      <button onClick={() => { setShowListsModal({ class: cls, type: 'black' }); fetchClassLists(cls.id, 'black'); }} style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', padding: '6px', borderRadius: '8px', boxShadow: 'none' }} title="Черный список"><Ban size={18} /></button>
                                    </>
                                  )}

                                  {profile?.role === 'creator' && (
                                    <>
                                      <button onClick={() => {
                                        const newName = prompt("Переименовать класс:", cls.name);
                                        if (newName) handleRenameStructure('classes', cls.id, newName);
                                      }} style={{ background: 'transparent', padding: '5px', color: 'var(--primary-color)', boxShadow: 'none' }}><Edit3 size={18} /></button>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <button onClick={() => handleMoveStructure('classes', cls.id, 'up', schoolClasses)} style={{ background: 'transparent', padding: '2px', color: 'inherit', boxShadow: 'none' }}><ArrowUp size={14} /></button>
                                        <button onClick={() => handleMoveStructure('classes', cls.id, 'down', schoolClasses)} style={{ background: 'transparent', padding: '2px', color: 'inherit', boxShadow: 'none' }}><ArrowDown size={14} /></button>
                                      </div>
                                      <button onClick={() => {
                                        if (studentsCount > 0) return alert("Нельзя удалить класс, в котором есть ученики!");
                                        if (confirm(`Удалить класс "${cls.name}"?`)) {
                                          supabase.from('classes').delete().eq('id', cls.id).then(() => fetchStructure());
                                        }
                                      }} style={{ background: 'transparent', padding: '5px', color: 'red', boxShadow: 'none' }}><Trash2 size={18} /></button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {isClassExpanded && (
                                <div className="animate" style={{ borderTop: '1px solid rgba(0,0,0,0.03)', background: 'rgba(0,0,0,0.005)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', marginBottom: '15px', padding: '0 25px' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', opacity: 0.6 }}>Список учеников</div>
                                    <button 
                                      onClick={() => { setNewLimit(cls.max_students || 50); setEditingClassLimit(cls); }}
                                      style={{ background: 'transparent', color: 'var(--primary-color)', fontSize: '0.85rem', padding: '5px 10px', border: '1px solid var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}
                                    >
                                      Лимит: {cls.max_students || 50}
                                    </button>
                                  </div>

                                  {/* APPLICATIONS SECTION */}
                                  {classApplications[cls.id]?.length > 0 && (
                                    <div style={{ margin: '0 25px 20px', padding: '15px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '15px', border: '1px dashed var(--primary-color)' }}>
                                      <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary-color)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <UserPlus size={14} /> НОВЫЕ ЗАЯВКИ ({classApplications[cls.id].length})
                                      </div>
                                      <div style={{ display: 'grid', gap: '10px' }}>
                                        {classApplications[cls.id].map(app => (
                                          <div key={app.id} className="flex-center" style={{ justifyContent: 'space-between', background: 'white', padding: '10px 15px', borderRadius: '10px' }}>
                                            <div style={{ fontSize: '0.85rem' }}>
                                              <strong>{app.profiles?.last_name} {app.profiles?.first_name}</strong>
                                              <div style={{ opacity: 0.5, fontSize: '0.75rem' }}>{app.profiles?.email}</div>
                                            </div>
                                            <div className="flex-center" style={{ gap: '10px' }}>
                                              <button onClick={() => handleApplication(app, 'accepted')} style={{ padding: '5px 12px', fontSize: '0.75rem', background: '#22c55e', color: 'white' }}>Принять</button>
                                              <button onClick={() => handleApplication(app, 'rejected')} style={{ padding: '5px 12px', fontSize: '0.75rem', background: 'rgba(0,0,0,0.05)', color: 'red', boxShadow: 'none' }}>Отклонить</button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  <div style={{ padding: '0 25px 20px' }}>
                                    {loadingStudents && !classStudents[cls.id] ? (
                                      <div style={{ textAlign: 'center', padding: '20px', opacity: 0.5 }}>Загрузка...</div>
                                    ) : classStudents[cls.id]?.length > 0 ? (
                                      <div style={{ display: 'grid', gap: '8px' }}>
                                        {classStudents[cls.id].sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '')).map(s => (
                                          <div key={s.id} className="flex-center" style={{ justifyContent: 'space-between', background: 'white', padding: '10px 15px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.03)' }}>
                                            <div>
                                              <div style={{ fontWeight: '500' }}>{s.last_name} {s.first_name} {s.patronymic}</div>
                                              <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{s.email}</div>
                                            </div>
                                            <div className="flex-center" style={{ gap: '8px' }}>
                                              <button 
                                                onClick={() => navigate(`/user-analytics?userId=${s.id}`)}
                                                style={{ background: 'transparent', color: 'var(--primary-color)', padding: '5px', boxShadow: 'none' }} 
                                                title="Аналитика ученика"
                                              >
                                                <Eye size={16} />
                                              </button>
                                              
                                              {/* Restricted actions for teachers on admins/creators */}
                                              {!(profile?.role === 'teacher' && (s.role === 'admin' || s.role === 'creator')) ? (
                                                <>
                                                  <button onClick={() => openEditModal(s)} style={{ background: 'transparent', color: 'var(--primary-color)', padding: '5px', boxShadow: 'none' }} title="Изменить ФИО"><Edit3 size={16} /></button>
                                                  <button onClick={() => setRemovingStudent(s)} style={{ background: 'transparent', color: 'red', padding: '5px', boxShadow: 'none' }} title="Удалить из класса"><UserMinus size={16} /></button>
                                                  <button onClick={() => setBlockingUser(s)} style={{ background: 'transparent', color: '#dc2626', padding: '5px', boxShadow: 'none' }} title="Исключить и заблокировать"><Ban size={16} /></button>
                                                </>
                                              ) : (
                                                <div title="Защищенный профиль" style={{ opacity: 0.3, padding: '5px' }}><Shield size={16} /></div>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div style={{ textAlign: 'center', padding: '20px', opacity: 0.4, fontSize: '0.9rem' }}>В классе пока нет учеников</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {schoolClasses.length === 0 && <div style={{ textAlign: 'center', padding: '20px', opacity: 0.4 }}>Нет добавленных классов</div>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {schools.length === 0 && (
              <div className="card flex-center" style={{ height: '200px', flexDirection: 'column', gap: '15px' }}>
                <Building size={48} opacity={0.2} />
                <div style={{ opacity: 0.5 }}>Список школ пуст</div>
              </div>
            )}
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
                  <select id="edit-user-city" name="city-id" value={editingUser.city_id || ''} onChange={(e) => setEditingUser({ ...editingUser, city_id: e.target.value || null, school_id: null, class_id: null })} disabled={profile?.role === 'teacher'}><option value="">Без города</option>{cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  <select id="edit-user-school" name="school-id" value={editingUser.school_id || ''} onChange={(e) => setEditingUser({ ...editingUser, school_id: e.target.value || null, class_id: null })} disabled={profile?.role === 'teacher' || !editingUser.city_id}><option value="">Без школы</option>{schools.filter(s => s.city_id === editingUser.city_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  <select id="edit-user-class" name="class-id" value={editingUser.class_id || ''} onChange={(e) => setEditingUser({ ...editingUser, class_id: e.target.value || null })} disabled={profile?.role === 'teacher' || !editingUser.school_id}><option value="">Без класса</option>{classesList.filter(c => c.school_id === editingUser.school_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
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

      {/* МОДАЛКА УПРАВЛЕНИЯ УЧИТЕЛЯМИ КЛАССА */}
      {showTeachersModal && (
        <div className="modal-overlay" onClick={() => setShowTeachersModal(null)}>
          <div className="modal-content animate" style={{ width: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '25px' }}>
              <div>
                <h3 style={{ margin: 0 }}>Учителя класса</h3>
                <div style={{ fontSize: '0.85rem', opacity: 0.5 }}>{showTeachersModal.name}</div>
              </div>
              <button onClick={() => setShowTeachersModal(null)} style={{ background: 'transparent', color: 'inherit', padding: 0 }}><X size={24} /></button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleAddTeacher(showTeachersModal.id, newTeacherEmail); }} className="flex-center" style={{ gap: '10px', marginBottom: '25px' }}>
              <input 
                type="email" 
                placeholder="Email учителя..." 
                value={newTeacherEmail} 
                onChange={e => setNewTeacherEmail(e.target.value)} 
                required 
                style={{ flex: 1 }}
              />
              <button type="submit" style={{ background: 'var(--primary-color)', color: 'white' }}><Plus size={20} /></button>
            </form>

            <div style={{ display: 'grid', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
              {classTeachers.map(t => (
                <div key={t.id} className="flex-center" style={{ justifyContent: 'space-between', padding: '12px 15px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.03)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500' }}>{t.email}</div>
                    <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px', marginTop: '5px' }}>
                      <label className="flex-center" style={{ gap: '5px', cursor: 'pointer', fontSize: '0.75rem', opacity: t.can_manage_students ? 1 : 0.5 }}>
                        <input type="checkbox" checked={t.can_manage_students} onChange={() => handleToggleTeacherPermission(showTeachersModal.id, t.id, t.can_manage_students)} />
                        Управление учениками
                      </label>
                    </div>
                  </div>
                  <button onClick={() => handleRemoveTeacher(showTeachersModal.id, t.id)} style={{ background: 'transparent', color: 'red', padding: '5px', boxShadow: 'none' }}><Trash2 size={16} /></button>
                </div>
              ))}
              {classTeachers.length === 0 && <div style={{ textAlign: 'center', padding: '20px', opacity: 0.4 }}>Учителя не назначены</div>}
            </div>
          </div>
        </div>
      )}


      {/* МОДАЛКА БЕЛОГО/ЧЕРНОГО СПИСКА */}
      {showListsModal && (
        <div className="modal-overlay" onClick={() => setShowListsModal(null)}>
          <div className="modal-content animate" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '25px' }}>
              <div>
                <h3 style={{ margin: 0 }}>{showListsModal.type === 'white' ? 'Белый список' : 'Черный список'}</h3>
                <div style={{ fontSize: '0.85rem', opacity: 0.5 }}>{showListsModal.class.name}</div>
              </div>
              <button onClick={() => setShowListsModal(null)} style={{ background: 'transparent', color: 'inherit', padding: 0 }}><X size={24} /></button>
            </div>

            <form onSubmit={(e) => { 
              e.preventDefault(); 
              const email = e.target.email.value;
              const table = showListsModal.type === 'white' ? 'class_white_list' : 'class_black_list';
              supabase.from(table).insert({ class_id: showListsModal.class.id, email }).then(() => {
                e.target.reset();
                fetchClassLists(showListsModal.class.id, showListsModal.type);
              });
            }} className="flex-center" style={{ gap: '10px', marginBottom: '25px' }}>
              <input name="email" type="email" placeholder="Email для добавления..." required style={{ flex: 1 }} />
              <button type="submit" style={{ background: showListsModal.type === 'white' ? '#16a34a' : '#dc2626', color: 'white' }}><Plus size={20} /></button>
            </form>

            <div style={{ display: 'grid', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
              {classListItems.map(item => (
                <div key={item.id} className="flex-center" style={{ justifyContent: 'space-between', padding: '10px 15px', background: 'rgba(0,0,0,0.02)', borderRadius: '10px' }}>
                  <div style={{ fontWeight: '500' }}>{item.email}</div>
                  <button onClick={() => {
                    const table = showListsModal.type === 'white' ? 'class_white_list' : 'class_black_list';
                    supabase.from(table).delete().eq('id', item.id).then(() => fetchClassLists(showListsModal.class.id, showListsModal.type));
                  }} style={{ background: 'transparent', color: 'red', padding: '5px', boxShadow: 'none' }}><X size={16} /></button>
                </div>
              ))}
              {classListItems.length === 0 && <div style={{ textAlign: 'center', padding: '20px', opacity: 0.4 }}>Список пуст</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Dashboard;