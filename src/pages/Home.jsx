import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Info, Users, LayoutGrid, Settings, MessageCircle, Github, ExternalLink, Youtube } from 'lucide-react';
import { useScrollRestoration } from '../lib/useScrollRestoration';

const Home = ({ session, profile }) => {
  const navigate = useNavigate();
  const [showInfo, setShowInfo] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [team, setTeam] = useState([]);
  const [creatorPhone, setCreatorPhone] = useState('');
  const [copied, setCopied] = useState(false);

  useScrollRestoration(false);

  useEffect(() => {
    if (showTeam) fetchTeam();
  }, [showTeam]);

  useEffect(() => {
    if (showInfo && !creatorPhone) {
      const getCreatorPhone = async () => {
        const { data } = await supabase.from('profiles').select('phone_number').eq('role', 'creator').single();
        if (data?.phone_number) setCreatorPhone(data.phone_number);
      };
      getCreatorPhone();
    }
  }, [showInfo, creatorPhone]);

  const fetchTeam = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, role, phone_number')
      .eq('show_phone_number', true)
      .in('role', ['admin', 'creator']);
    if (data) setTeam(data);
  };

  return (
    <>
      <div className="container animate" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div className="card" style={{ maxWidth: '800px', margin: '0 auto', background: 'var(--card-bg)', border: '1px solid rgba(0,0,0,0.05)', position: 'relative' }}>

          {/* Top Left Icons */}
          <div style={{ position: 'absolute', top: '20px', left: '20px', display: 'flex', gap: '10px' }}>
            <button
              className="flex-center"
              onClick={() => setShowInfo(true)}
              style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', width: '40px', height: '40px', borderRadius: '12px', padding: '0' }}
              title="О проекте"
            >
              <Info size={20} />
            </button>
            <button
              className="flex-center"
              onClick={() => setShowTeam(true)}
              style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', width: '40px', height: '40px', borderRadius: '12px', padding: '0' }}
              title="Стать частью команды"
            >
              <Users size={20} />
            </button>
          </div>

          <h1 style={{ fontSize: '3.5rem', margin: '40px 0 20px 0', fontWeight: '800', color: 'var(--secondary-color)' }}>LabTest</h1>
          <p style={{ fontSize: '1.2rem', opacity: 0.8, marginBottom: '40px' }}>
            Добро пожаловать в учебную лабораторию тестов.
            Проходите испытания, зарабатывайте баллы и повышайте свой уровень знаний.
          </p>

          <div className="flex-center" style={{ gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {!session ? (
              <button onClick={() => navigate('/auth')} style={{ fontSize: '1.1rem', padding: '15px 40px' }}>
                Начать обучение
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/catalog')}
                  style={{ fontSize: '1.1rem', padding: '15px 40px', background: 'var(--secondary-color)' }}
                >
                  <LayoutGrid size={20} style={{ marginRight: '10px' }} />
                  Каталог тестов
                </button>

                {(profile?.role === 'admin' || profile?.role === 'creator') && (
                  <button
                    onClick={() => navigate('/dashboard')}
                    style={{ fontSize: '1.1rem', padding: '15px 40px', background: 'var(--accent-color)' }}
                  >
                    <Settings size={20} style={{ marginRight: '10px' }} />
                    Панель управления
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <div className="modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '20px' }}>О проекте</h2>
            <p style={{ marginBottom: '15px', lineHeight: '1.6', textAlign: 'left' }}>
              Сайт создан учеником СШ№43 Афанасиади Анастасом в рамках проекта по информатике. 2026г.
            </p>
            <div style={{ marginBottom: '30px', lineHeight: '1.6', textAlign: 'left', opacity: 0.9, fontSize: '0.9rem', background: 'rgba(99, 102, 241, 0.05)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
              Проект разрабатывается на голом энтузиазме. Если у Вас есть возможность и желание поддержать автора, Вы можете скинуть любую небольшую сумму денег на Kaspi (получатель: <strong>Анастас А.</strong>).
              {creatorPhone && (
                <div style={{ marginTop: '12px' }}>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(creatorPhone);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    style={{ background: copied ? '#4ade80' : 'var(--primary-color)', color: 'white', padding: '10px 16px', borderRadius: '8px', fontSize: '0.9rem', width: '100%', transition: 'all 0.3s', boxShadow: 'none' }}
                  >
                    {copied ? 'Скопировано!' : `Копировать номер (${creatorPhone})`}
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', justifyContent: 'center' }}>
              {/* Ссылка на GitHub */}
              <a href="https://github.com/Stormyxa/LabTest" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', display: 'flex' }} title="Исходный код на GitHub">
                <Github size={28} style={{ cursor: 'pointer', transition: '0.2s' }} />
              </a>

              {/* Ссылка на YouTube */}
              <a href="https://www.youtube.com/@sl-kitten" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', display: 'flex' }} title="YouTube канал">
                <Youtube size={28} style={{ cursor: 'pointer', color: '#ff0000', transition: '0.2s' }} />
              </a>
            </div>

            <button type="button" onClick={() => setShowInfo(false)} style={{ width: '100%', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Team Modal */}
      {showTeam && (
        <div className="modal-overlay" onClick={() => setShowTeam(false)}>
          <div className="modal-content animate" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '15px' }}>Стань частью команды</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', textAlign: 'left' }}>
              Хотите создавать свои тесты или помогать в управлении платформой? Свяжитесь с нашими администраторами!
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxHeight: '40vh', overflowY: 'auto', marginBottom: '30px', paddingRight: '10px' }}>
              {team.length > 0 ? team.map((member, i) => (
                <div key={i} className="flex-center" style={{ justifyContent: 'space-between', padding: '15px', background: 'rgba(0,0,0,0.03)', borderRadius: '15px' }}>
                  <div style={{ textAlign: 'left' }}>
                    <h4 style={{ margin: 0 }}>{member.last_name} {member.first_name}</h4>
                    <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>{member.role === 'creator' ? 'Основатель' : 'Администратор'}</p>
                  </div>
                  <a
                    href={`https://wa.me/${member.phone_number?.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ background: '#25D366', color: 'white', padding: '8px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', fontSize: '0.85rem' }}
                  >
                    <MessageCircle size={18} /> WhatsApp
                  </a>
                </div>
              )) : (
                <p style={{ opacity: 0.5, textAlign: 'center' }}>Список контактов пуст. Подождите, пока администраторы укажут свои номера в профиле.</p>
              )}
            </div>

            <div style={{ padding: '15px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '15px', marginBottom: '30px', fontSize: '0.9rem', textAlign: 'left' }}>
              <strong>Ранги платформы:</strong>
              <ul style={{ paddingLeft: '20px', marginTop: '10px' }}>
                <li><strong>Ученик:</strong> Участие в тестированиях.</li>
                <li><strong>Редактор:</strong> Создание тестов через JSON.</li>
                <li><strong>Учитель:</strong> Права редактора и управление учениками своей школы.</li>
                <li><strong>Админ:</strong> Верификация тестов и управление игроками.</li>
                <li><strong>Создатель:</strong> Полный технический доступ.</li>
              </ul>
            </div>

            <button onClick={() => setShowTeam(false)} style={{ width: '100%', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)' }}>Закрыть</button>
          </div>
        </div>
      )}
    </>
  );
};

export default Home;
