import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { History, AlertCircle, Clock, Trash2, ShieldAlert } from 'lucide-react';

const Logs = ({ profile }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, profiles(first_name, last_name, email, role)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (data) setLogs(data);
    setLoading(false);
  };

  const deleteLog = async (id) => {
    if (!window.confirm("Удалить этот лог?")) return;
    await supabase.from('audit_logs').delete().eq('id', id);
    setLogs(logs.filter(l => l.id !== id));
  };

  const clearAllLogs = async () => {
    if (!window.confirm("Вы уверены, что хотите очистить ВСЮ историю действий?")) return;
    await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // hack to delete all
    fetchLogs();
  };

  if (loading) return <div className="flex-center" style={{ height: '60vh' }}>Загрузка логов...</div>;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px' }}>
        <div className="flex-center" style={{ gap: '15px' }}>
          <History size={32} opacity={0.3} />
          <h2 style={{ fontSize: '2rem', margin: 0 }}>История действий</h2>
        </div>
        {profile?.role === 'creator' && logs.length > 0 && (
          <button onClick={clearAllLogs} className="flex-center" style={{ background: 'rgba(255,0,0,0.05)', color: 'red', boxShadow: 'none' }}>
            <ShieldAlert size={18} style={{ marginRight: '8px' }} /> Очистить логи
          </button>
        )}
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1fr', gap: '15px' }}>
        {logs.map(log => (
          <div key={log.id} className="card" style={{ padding: '20px 30px', display: 'flex', alignItems: 'flex-start', gap: '20px', background: 'var(--card-bg)' }}>
            <div style={{ padding: '12px', background: 'rgba(0,0,0,0.03)', borderRadius: '12px', color: 'var(--primary-color)', marginTop: '5px' }}>
              <Clock size={24} />
            </div>

            <div style={{ flex: 1 }}>
              <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: log.action.includes('Удаление') || log.action.includes('Удален') ? '#f87171' : 'inherit' }}>
                  {log.action}
                </h4>
                <div className="flex-center" style={{ gap: '15px' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>{new Date(log.created_at).toLocaleString()}</span>
                  {profile?.role === 'creator' && (
                    <button onClick={() => deleteLog(log.id)} style={{ background: 'transparent', padding: '5px', color: 'red', boxShadow: 'none' }} title="Удалить запись">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '5px' }}>
                Исполнитель: <strong>{log.profiles?.last_name} {log.profiles?.first_name}</strong> ({log.profiles?.email})
                <span style={{ marginLeft: '10px', padding: '2px 8px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', fontSize: '0.7rem' }}>{log.profiles?.role}</span>
              </p>
              {log.reason && (
                <div style={{ marginTop: '10px', fontSize: '0.85rem', padding: '12px 15px', background: 'rgba(99, 102, 241, 0.05)', borderLeft: '3px solid var(--primary-color)', borderRadius: '0 8px 8px 0' }}>
                  <strong style={{ opacity: 0.7 }}>Детали:</strong> <br />{log.reason}
                </div>
              )}
            </div>
          </div>
        ))}

        {logs.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
            <AlertCircle size={48} style={{ opacity: 0.1, marginBottom: '20px' }} />
            <p style={{ opacity: 0.5 }}>Логов пока нет. Здесь фиксируются удаления тестов, результатов и пользователей.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Logs;