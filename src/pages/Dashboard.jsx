import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Shield, Search, Edit3, Trash2, ExternalLink, Mail, X, AlertTriangle, MapPin, Building, GraduationCap, Plus, History } from 'lucide-react';

const Dashboard = ({ session, profile }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);

  // Новое состояние для красивого удаления городов, школ и классов
  const [deletingStructure, setDeletingStructure] = useState(null); // { table, id, name, typeLabel }

  const [cities, setCities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classesList, setClassesList] = useState([]);

  const [newCity, setNewCity] = useState('');
  const [newSchool, setNewSchool] = useState('');
  const [newSchoolCityId, setNewSchoolCityId] = useState('');
  const [newClass, setNewClass] = useState('');
  const [newClassSchoolId, setNewClassSchoolId] = useState('');

  useEffect(() => {
    fetchStructure();
    fetchUsers();
  }, []);

  const fetchStructure = async () => {
    const { data: c } = await supabase.from('cities').select('*').order('name');
    const { data: s } = await supabase.from('schools').select('*').order('name');
    const { data: cl } = await supabase.from('classes').select('*').order('name');
    if (c) setCities(c); if (s) setSchools(s); if (cl) setClassesList(cl);
  };

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (profiles) setUsers(profiles);
    setLoading(false);
  };

  const handleUpdateUser = async (uId, updates) => {
    const { error } = await supabase.from('profiles').update(updates).eq('id', uId);
    if (error) alert(error.message);
    else {
      await logAction(`Изменение профиля`, uId, `Изменены данные пользователя ${updates.first_name || ''} ${updates.last_name || ''}`);
      fetchUsers();
      setEditingUser(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    const { error } = await supabase.from('profiles').delete().eq('id', deletingUser.id);
    if (error) alert(error.message);
    else {
      await logAction(`Удаление пользователя`, deletingUser.id, `Удален профиль ${deletingUser.email}`);
      fetchUsers();
      setDeletingUser(null);
    }
  };

  const logAction = async (action, targetId, reason) => {
    await supabase.from('audit_logs').insert({ admin_id: session.user.id, action, target_id: targetId, reason });
  };

  // Создание структуры
  const handleCreateCity = async () => {
    if (!newCity) return;
    await supabase.from('cities').insert({ name: newCity });
    setNewCity(''); fetchStructure();
  };
  const handleCreateSchool = async () => {
    if (!newSchool || !newSchoolCityId) return;
    await supabase.from('schools').insert({ name: newSchool, city_id: newSchoolCityId });
    setNewSchool(''); fetchStructure();
  };
  const handleCreateClass = async () => {
    if (!newClass || !newClassSchoolId) return;
    await supabase.from('classes').insert({ name: newClass, school_id: newClassSchoolId });
    setNewClass(''); fetchStructure();
  };

  // Подтверждение и удаление структуры (без window.confirm)
  const confirmDeleteStructure = async () => {
    if (!deletingStructure) return;
    await supabase.from(deletingStructure.table).delete().eq('id', deletingStructure.id);
    fetchStructure();
    fetchUsers(); // Обновляем юзеров
    setDeletingStructure(null);
  };

  const filteredUsers = users.filter(u => `${u.first_name} ${u.last_name} ${u.patronymic} ${u.email} ${u.id}`.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex-center" style={{ height: '60vh' }}>Загрузка панели...</div>;

  return (
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
            </div>
          )}

          {activeTab === 'users' && (
            <div style={{ position: 'relative', width: '300px' }}>
              <Search size={20} style={{ position: 'absolute', left: '15px', top: '12px', opacity: 0.5 }} />
              <input type="text" placeholder="Поиск по ФИО, Email..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: '45px' }} />
            </div>
          )}
        </div>
      </div>

      {/* ВКЛАДКА ПОЛЬЗОВАТЕЛИ */}
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
                      <div style={{ fontSize: '0.9rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '5px' }}><Mail size={14} style={{ opacity: 0.3 }} /> {user.email || 'Неизвестно'}</div>
                    </td>
                    <td style={{ padding: '15px 20px' }}>
                      <div style={{ fontWeight: '500' }}>{user.last_name} {user.first_name}</div>
                      <span style={{ fontSize: '0.85rem', opacity: 0.5 }}>{user.patronymic || '—'}</span>
                    </td>
                    <td style={{ padding: '15px 20px' }}>
                      <span style={{ padding: '5px 12px', borderRadius: '100px', fontSize: '0.8rem', fontWeight: '600', background: user.role === 'creator' ? 'var(--primary-color)' : (user.role === 'admin' ? 'var(--accent-color)' : 'rgba(0,0,0,0.08)'), color: user.role === 'creator' || user.role === 'admin' ? 'white' : 'inherit' }}>
                        {user.role === 'creator' ? 'Создатель' : (user.role === 'admin' ? 'Админ' : (user.role === 'teacher' ? 'Учитель' : (user.role === 'editor' ? 'Редактор' : 'Ученик')))}
                      </span>
                    </td>
                    <td style={{ padding: '15px 20px', fontSize: '0.85rem' }}>
                      {userCity && <div style={{ opacity: 0.6 }}>г. {userCity}</div>}
                      {userSchool && <div style={{ opacity: 0.8 }}>{userSchool}</div>}
                      {userClass ? <div style={{ fontWeight: 'bold' }}>{userClass}</div> : <div style={{ opacity: 0.3 }}>Не указано</div>}
                    </td>
                    <td style={{ padding: '15px 20px' }}>
                      <div className="flex-center" style={{ gap: '10px', justifyContent: 'flex-start' }}>
                        <button onClick={() => setEditingUser(user)} className="flex-center" style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '10px', boxShadow: 'none' }} title="Редактировать"><Edit3 size={18} /></button>
                        {(profile?.role === 'creator') && user.id !== session.user.id && (
                          <button onClick={() => setDeletingUser(user)} className="flex-center" style={{ padding: '8px', background: 'rgba(255, 0, 0, 0.1)', color: 'red', borderRadius: '10px', boxShadow: 'none' }} title="Удалить"><Trash2 size={18} /></button>
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

      {/* ВКЛАДКА СТРУКТУРА */}
      {activeTab === 'structure' && profile?.role === 'creator' && (
        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

          <div className="card">
            <h3 className="flex-center" style={{ gap: '10px', marginBottom: '20px', justifyContent: 'flex-start' }}><MapPin size={20} color="var(--primary-color)" /> Города</h3>
            <div className="flex-center" style={{ gap: '10px', marginBottom: '20px' }}>
              <input type="text" placeholder="Новый город" value={newCity} onChange={e => setNewCity(e.target.value)} style={{ flex: 1, padding: '10px' }} />
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
              <select value={newSchoolCityId} onChange={e => setNewSchoolCityId(e.target.value)} style={{ padding: '10px' }}>
                <option value="">Выберите город...</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex-center" style={{ gap: '10px' }}>
                <input type="text" placeholder="Название школы" value={newSchool} onChange={e => setNewSchool(e.target.value)} style={{ flex: 1, padding: '10px' }} />
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
                <button onClick={handleCreateClass} style={{ padding: '10px' }} disabled={!newClassSchoolId}><Plus size={20} /></button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {classesList.map(cls => (
                <div key={cls.id} className="flex-center" style={{ justifyContent: 'space-between', padding: '12px 15px', background: 'rgba(0,0,0,0.02)', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5, display: 'block' }}>{schools.find(s => s.id === cls.school_id)?.name}</span>
                    <span style={{ fontWeight: 'bold' }}>{cls.name}</span>
                  </div>
                  <button onClick={() => setDeletingStructure({ table: 'classes', id: cls.id, name: cls.name, typeLabel: 'класс' })} style={{ background: 'transparent', color: 'red', padding: '5px', boxShadow: 'none' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКИ (Редактирование пользователя, Удаление пользователя, Удаление структуры) */}

      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-content animate" style={{ width: '500px', textAlign: 'left', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '25px' }}>
              <h3 style={{ margin: 0 }}>Редактирование {editingUser.first_name}</h3>
              <button onClick={() => setEditingUser(null)} style={{ background: 'transparent', color: 'inherit', padding: 0 }}><X size={24} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '5px', display: 'block' }}>Email пользователя</label>
                <input type="email" value={editingUser.email || ''} onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })} />
              </div>
              <div className="grid-2" style={{ gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '5px', display: 'block' }}>Фамилия</label>
                  <input type="text" value={editingUser.last_name || ''} onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '5px', display: 'block' }}>Имя</label>
                  <input type="text" value={editingUser.first_name || ''} onChange={(e) => setEditingUser({ ...editingUser, first_name: e.target.value })} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '5px', display: 'block' }}>Роль доступа</label>
                <select value={editingUser.role} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })} disabled={profile?.role !== 'creator' && (editingUser.role === 'creator' || editingUser.role === 'admin')}>
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
                  <select value={editingUser.city_id || ''} onChange={(e) => setEditingUser({ ...editingUser, city_id: e.target.value || null, school_id: null, class_id: null })}>
                    <option value="">Без города</option>
                    {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select value={editingUser.school_id || ''} onChange={(e) => setEditingUser({ ...editingUser, school_id: e.target.value || null, class_id: null })} disabled={!editingUser.city_id}>
                    <option value="">Без школы</option>
                    {schools.filter(s => s.city_id === editingUser.city_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select value={editingUser.class_id || ''} onChange={(e) => setEditingUser({ ...editingUser, class_id: e.target.value || null })} disabled={!editingUser.school_id}>
                    <option value="">Без класса</option>
                    {classesList.filter(c => c.school_id === editingUser.school_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex-center" style={{ gap: '15px', marginTop: '10px' }}>
                <button onClick={() => setEditingUser(null)} style={{ width: '100%', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
                <button onClick={() => handleUpdateUser(editingUser.id, editingUser)} style={{ width: '100%' }}>Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deletingUser && (
        <div className="modal-overlay" onClick={() => setDeletingUser(null)}>
          <div className="modal-content animate modal-content-danger" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}><AlertTriangle size={32} /></div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Удалить пользователя?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6', textAlign: 'center' }}>
              Вы уверены, что хотите удалить <strong>{deletingUser.last_name} {deletingUser.first_name}</strong>?<br />
              Это действие удалит весь его профиль и все результаты тестов.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button onClick={() => setDeletingUser(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={handleDeleteUser} style={{ background: '#f87171', color: 'white' }}>Да, удалить</button>
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
    </div>
  );
};

export default Dashboard;