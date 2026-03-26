import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Trophy, Download, Users, School, Filter } from 'lucide-react';

const Statistics = ({ session, profile }) => {
  const [stats, setStats] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterClass, setFilterClass] = useState('all');
  const [sortBy, setSortBy] = useState('points'); // 'quizzes' or 'points'

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // Fetch all classes for filter
    const { data: cData } = await supabase.from('classes').select('*');
    if (cData) setClasses(cData);

    // Fetch all profiles and their quiz results
    const { data: pData } = await supabase
      .from('profiles')
      .select('*, classes(name), quiz_results(score, total_questions, is_passed)');
    
    if (pData) {
      const processed = pData.map(u => {
        const results = u.quiz_results || [];
        return {
          ...u,
          passedQuizzes: results.filter(r => r.is_passed).length,
          totalPoints: results.reduce((acc, curr) => acc + curr.score, 0),
          avgScore: results.length > 0 ? Math.round((results.reduce((acc, curr) => acc + curr.score, 0) / results.reduce((acc, curr) => acc + curr.total_questions, 0)) * 100) : 0
        };
      });
      setStats(processed);
    }
    setLoading(false);
  };

  const filteredStats = stats
    .filter(u => filterClass === 'all' || u.class_id === filterClass)
    .sort((a, b) => sortBy === 'points' ? b.totalPoints - a.totalPoints : b.passedQuizzes - a.passedQuizzes);

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.text(`Отчет по успеваемости: ${filterClass === 'all' ? 'Все классы' : classes.find(c => c.id === filterClass)?.name}`, 20, 20);
    
    const tableData = filteredStats.map(u => [
      `${u.last_name} ${u.first_name}`,
      u.classes?.name || '—',
      u.passedQuizzes,
      u.totalPoints,
      `${u.avgScore}%`
    ]);

    doc.autoTable({
      head: [['ФИО', 'Класс', 'Пройдено тестов', 'Суммарно баллов', 'Ср. успеваемость']],
      body: tableData,
      startY: 30
    });

    doc.save(`LabTest_Report_${new Date().toLocaleDateString()}.pdf`);
  };

  if (loading) return <div className="flex-center" style={{height: '60vh'}}>Загрузка статистики...</div>;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <h2 style={{ fontSize: '2rem' }}>Статистика и Рейтинг</h2>
        <div className="flex-center" style={{ gap: '15px' }}>
          {(profile?.role === 'admin' || profile?.role === 'creator' || profile?.role === 'editor') && (
            <button onClick={generatePDF} style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none' }}>
              <Download size={18} style={{marginRight: '8px'}} /> Скачать PDF
            </button>
          )}
          <select 
            value={filterClass} 
            onChange={(e) => setFilterClass(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="all">Все классы</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '40px' }}>
        <StatSummaryCard icon={<Users size={24} />} label="Всего учеников" value={stats.length} />
        <StatSummaryCard icon={<School size={24} />} label="Классов" value={classes.length} />
        <StatSummaryCard icon={<Trophy size={24} />} label="Лидер" value={filteredStats[0]?.last_name || '—'} />
      </div>

      <div className="card" style={{ padding: '0' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: '20px' }}>
          <button onClick={() => setSortBy('points')} style={{ padding: '8px 20px', background: sortBy === 'points' ? 'var(--primary-color)' : 'transparent', color: sortBy === 'points' ? 'white' : 'inherit', boxShadow: 'none' }}>
            По баллам
          </button>
          <button onClick={() => setSortBy('quizzes')} style={{ padding: '8px 20px', background: sortBy === 'quizzes' ? 'var(--primary-color)' : 'transparent', color: sortBy === 'quizzes' ? 'white' : 'inherit', boxShadow: 'none' }}>
            По кол-ву тестов
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'rgba(0,0,0,0.02)' }}>
              <tr>
                <th style={{ padding: '20px' }}>Место</th>
                <th style={{ padding: '20px' }}>Ученик</th>
                <th style={{ padding: '20px' }}>Класс</th>
                <th style={{ padding: '20px' }}>Пройдено</th>
                <th style={{ padding: '20px' }}>Всего баллов</th>
                <th style={{ padding: '20px' }}>Средний %</th>
              </tr>
            </thead>
            <tbody>
              {filteredStats.map((u, idx) => {
                const isMe = u.id === session.user.id;
                const isAdmin = profile?.role === 'admin' || profile?.role === 'creator';
                const showName = !u.is_anonymous || isAdmin || isMe;

                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.01)', background: isMe ? 'rgba(99, 102, 241, 0.05)' : 'none' }}>
                    <td style={{ padding: '20px' }}>
                      <div className="flex-center" style={{ width: '30px', height: '30px', borderRadius: '50%', background: idx < 3 ? 'var(--accent-color)' : 'rgba(0,0,0,0.05)', color: idx < 3 ? 'white' : 'inherit', fontSize: '0.8rem', fontWeight: '800' }}>
                        {idx + 1}
                      </div>
                    </td>
                    <td style={{ padding: '20px', fontWeight: isMe ? '700' : '400' }}>
                      {showName ? `${u.last_name} ${u.first_name}` : 'Анонимный пользователь'}
                    </td>
                    <td style={{ padding: '20px', opacity: 0.6 }}>{u.classes?.name || '—'}</td>
                    <td style={{ padding: '20px' }}>{u.passedQuizzes}</td>
                    <td style={{ padding: '20px', fontWeight: '700', color: 'var(--primary-color)' }}>{u.totalPoints}</td>
                    <td style={{ padding: '20px' }}>
                      <div style={{ width: '100px', height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${u.avgScore}%`, height: '100%', background: u.avgScore >= 50 ? '#4ade80' : '#f87171' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatSummaryCard = ({ icon, label, value }) => (
  <div className="card flex-center" style={{ gap: '20px', justifyContent: 'flex-start' }}>
    <div style={{ padding: '15px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '15px' }}>{icon}</div>
    <div>
      <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>{label}</p>
      <h3 style={{ fontSize: '1.5rem', margin: 0 }}>{value}</h3>
    </div>
  </div>
);

export default Statistics;
