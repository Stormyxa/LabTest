import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, Shield, Search, Edit3, Trash2, ExternalLink } from 'lucide-react';

const Dashboard = ({ session, profile }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles, error } = await supabase
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
      await logAction(`Изменение профиля пользователя ${uId}`, uId, JSON.stringify(updates));
      fetchUsers();
      setEditingUser(null);
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
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex-center" style={{height: '60vh'}}>Загрузка панели управления...</div>;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <h2 style={{ fontSize: '2rem' }}>Панель управления</h2>
        <div style={{ position: 'relative', width: '300px' }}>
          <Search size={20} style={{ position: 'absolute', left: '15px', top: '12px', opacity: 0.5 }} />
          <input 
            type="text" 
            placeholder="Поиск по ФИО или Email..." 
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
                  <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>{user.email || 'Неизвестно'}</div>
                </td>
                <td style={{ padding: '15px 20px' }}>
                  {user.last_name} {user.first_name} {user.patronymic}
                </td>
                <td style={{ padding: '15px 20px' }}>
                  <span style={{ 
                    padding: '5px 12px', borderRadius: '100px', fontSize: '0.8rem', fontWeight: '600',
                    background: user.role === 'creator' ? 'var(--primary-color)' : 'rgba(0,0,0,0.08)',
                    color: user.role === 'creator' ? 'white' : 'inherit'
                  }}>
                    {user.role === 'creator' ? 'Создатель' : user.role.toUpperCase()}
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
                      style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none' }}
                    >
                      <Edit3 size={18} />
                    </button>
                    {(profile?.role === 'creator') && (
                      <button 
                        style={{ padding: '8px', background: 'rgba(255, 0, 0, 0.1)', color: 'red', boxShadow: 'none' }}
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
        <div className="flex-center" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}>
          <div className="card animate" style={{ width: '500px' }}>
            <h3 style={{ marginBottom: '25px' }}>Редактирование: {editingUser.email}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '8px', display: 'block' }}>Роль пользователя</label>
                <select 
                  value={editingUser.role} 
                  onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                  disabled={profile?.role !== 'creator' && editingUser.role === 'creator'}
                >
                  <option value="player">Игрок</option>
                  <option value="editor">Редактор</option>
                  <option value="admin">Админ</option>
                  {profile?.role === 'creator' && <option value="creator">Создатель</option>}
                </select>
              </div>

              {profile?.role === 'creator' && (
                <>
                  <input 
                    type="text" 
                    placeholder="Фамилия" 
                    value={editingUser.last_name || ''} 
                    onChange={(e) => setEditingUser({...editingUser, last_name: e.target.value})} 
                  />
                  <input 
                    type="text" 
                    placeholder="Имя" 
                    value={editingUser.first_name || ''} 
                    onChange={(e) => setEditingUser({...editingUser, first_name: e.target.value})} 
                  />
                </>
              )}

              <div className="flex-center" style={{ gap: '15px', marginTop: '10px' }}>
                <button 
                  onClick={() => setEditingUser(null)} 
                  style={{ width: '100%', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)' }}
                >
                  Отмена
                </button>
                <button 
                  onClick={() => handleUpdateUser(editingUser.id, { role: editingUser.role, first_name: editingUser.first_name, last_name: editingUser.last_name })}
                  style={{ width: '100%' }}
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
