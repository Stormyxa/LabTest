import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, Shield, Search, Edit3, Trash2, ExternalLink, Mail, UserPlus, X, AlertTriangle } from 'lucide-react';

const Dashboard = ({ session, profile }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [classesList, setClassesList] = useState([]);

  useEffect(() => {
    fetchUsers();
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('name', { ascending: true });
    if (data) setClassesList(data);
  };

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*, classes(name)')
      .order('created_at', { ascending: false });
    
    if (profiles) setUsers(profiles);
    setLoading(false);
  };

  const handleUpdateUser = async (uId, updates) => {
    const { error } = await supabase.from('profiles').update(updates).eq('id', uId);
    if (error) alert(error.message);
    else {
      await logAction(`Изменение данных пользователя ${uId}`, uId, JSON.stringify(updates));
      fetchUsers();
      setEditingUser(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    const { error } = await supabase.from('profiles').delete().eq('id', deletingUser.id);
    if (error) alert(error.message);
    else {
      await logAction(`Удаление пользователя ${deletingUser.id}`, deletingUser.id, 'Удален администратором');
      fetchUsers();
      setDeletingUser(null);
    }
  };

  const logAction = async (action, targetId, reason) => {
    await supabase.from('audit_logs').insert({
      admin_id: session.user.id,
      action,
      target_id: targetId,
      reason
    });
  };

  const filteredUsers = users.filter(u => 
    `${u.first_name} ${u.last_name} ${u.patronymic} ${u.email} ${u.id}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex-center" style={{height: '60vh'}}>Загрузка панели управления...</div>;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', marginBottom: '10px' }}>Панель управления</h2>
          <p style={{ opacity: 0.5 }}>Управление доступом и данными пользователей</p>
        </div>
        <div style={{ position: 'relative', width: '350px' }}>
          <Search size={20} style={{ position: 'absolute', left: '15px', top: '12px', opacity: 0.5 }} />
          <input 
            type="text" 
            placeholder="Поиск по ФИО, Email или ID..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '45px' }}
          />
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <tr>
              <th style={{ padding: '20px' }}>ID / Почта</th>
              <th style={{ padding: '20px' }}>ФИО</th>
              <th style={{ padding: '20px' }}>Роль</th>
              <th style={{ padding: '20px' }}>Класс</th>
              <th style={{ padding: '20px' }}>Дата рег.</th>
              <th style={{ padding: '20px' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.02)' }}>
                <td style={{ padding: '15px 20px' }}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>{user.id.slice(0, 8)}...</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Mail size={14} style={{opacity: 0.3}} /> {user.email || 'Неизвестно'}
                  </div>
                </td>
                <td style={{ padding: '15px 20px' }}>
                  {user.last_name} {user.first_name} <br/>
                  <span style={{ fontSize: '0.85rem', opacity: 0.5 }}>{user.patronymic || '—'}</span>
                </td>
                <td style={{ padding: '15px 20px' }}>
                  <span style={{ 
                    padding: '5px 12px', borderRadius: '100px', fontSize: '0.8rem', fontWeight: '600',
                    background: user.role === 'creator' ? 'var(--primary-color)' : (user.role === 'admin' ? 'var(--accent-color)' : 'rgba(0,0,0,0.08)'),
                    color: user.role === 'creator' || user.role === 'admin' ? 'white' : 'inherit'
                  }}>
                    {user.role === 'creator' ? 'Создатель' : (user.role === 'admin' ? 'Админ' : user.role.toUpperCase())}
                  </span>
                </td>
                <td style={{ padding: '15px 20px' }}>
                  {user.classes?.name || '—'}
                </td>
                <td style={{ padding: '15px 20px', opacity: 0.5, fontSize: '0.8rem' }}>
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '15px 20px' }}>
                  <div className="flex-center" style={{ gap: '10px', justifyContent: 'flex-start' }}>
                    <button 
                      onClick={() => setEditingUser(user)}
                      className="flex-center"
                      style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '10px', boxShadow: 'none' }}
                      title="Редактировать"
                    >
                      <Edit3 size={18} />
                    </button>
                    {(profile?.role === 'creator') && user.id !== session.user.id && (
                      <button 
                        onClick={() => setDeletingUser(user)}
                        className="flex-center"
                        style={{ padding: '8px', background: 'rgba(255, 0, 0, 0.1)', color: 'red', borderRadius: '10px', boxShadow: 'none' }}
                        title="Удалить"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-content animate" style={{ width: '500px', textAlign: 'left' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '25px' }}>
              <h3 style={{ margin: 0 }}>Редактирование данных</h3>
              <button onClick={() => setEditingUser(null)} style={{ background: 'transparent', color: 'inherit', padding: 0 }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '5px', display: 'block' }}>Email пользователя</label>
                <input 
                  type="email" 
                  value={editingUser.email || ''} 
                  onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                  placeholder="name@example.com"
                />
              </div>

              <div className="grid-2" style={{ gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '5px', display: 'block' }}>Фамилия</label>
                  <input 
                    type="text" 
                    value={editingUser.last_name || ''} 
                    onChange={(e) => setEditingUser({...editingUser, last_name: e.target.value})} 
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '5px', display: 'block' }}>Имя</label>
                  <input 
                    type="text" 
                    value={editingUser.first_name || ''} 
                    onChange={(e) => setEditingUser({...editingUser, first_name: e.target.value})} 
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '5px', display: 'block' }}>Отчество</label>
                <input 
                  type="text" 
                  value={editingUser.patronymic || ''} 
                  onChange={(e) => setEditingUser({...editingUser, patronymic: e.target.value})} 
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '5px', display: 'block' }}>Роль доступа</label>
                <select 
                  value={editingUser.role} 
                  onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                  disabled={profile?.role !== 'creator' && (editingUser.role === 'creator' || editingUser.role === 'admin')}
                >
                  <option value="player">Игрок (ученик)</option>
                  <option value="editor">Редактор (учитель)</option>
                  <option value="admin">Админ</option>
                  {profile?.role === 'creator' && <option value="creator">Создатель</option>}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '5px', display: 'block' }}>Школьный Класс</label>
                <select 
                  value={editingUser.class_id || ''} 
                  onChange={(e) => setEditingUser({...editingUser, class_id: e.target.value})}
                >
                  <option value="">Без класса</option>
                  {classesList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex-center" style={{ gap: '15px', marginTop: '20px' }}>
                <button 
                  onClick={() => setEditingUser(null)} 
                  style={{ width: '100%', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}
                >
                  Отмена
                </button>
                <button 
                  onClick={() => handleUpdateUser(editingUser.id, { 
                    role: editingUser.role, 
                    first_name: editingUser.first_name, 
                    last_name: editingUser.last_name,
                    patronymic: editingUser.patronymic,
                    email: editingUser.email,
                    class_id: editingUser.class_id
                  })}
                  style={{ width: '100%' }}
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deletingUser && (
        <div className="modal-overlay" onClick={() => setDeletingUser(null)}>
          <div className="modal-content animate modal-content-danger" style={{ width: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}>
              <AlertTriangle size={32} />
            </div>
            <h2 style={{ marginBottom: '15px' }}>Удалить пользователя?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
              Вы уверены, что хотите удалить <strong>{deletingUser.last_name} {deletingUser.first_name}</strong>?<br/>
              Это действие удалит весь его профиль и все результаты тестов.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button 
                onClick={() => setDeletingUser(null)}
                style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}
              >
                Отмена
              </button>
              <button onClick={handleDeleteUser} style={{ background: '#f87171', color: 'white' }}>
                Да, удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
