import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, AlertTriangle, CheckCircle, X } from 'lucide-react';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // Стейт для модального окна
  const [modal, setModal] = useState({ isOpen: false, type: 'success', title: '', message: '' });

  // Функция для перевода частых ошибок Supabase на русский
  const translateError = (msg) => {
    if (msg.includes('Invalid login credentials')) return 'Неверный email или пароль.';
    if (msg.includes('User already registered')) return 'Пользователь с таким email уже зарегистрирован.';
    if (msg.includes('Password should be at least')) return 'Пароль должен содержать минимум 6 символов.';
    if (msg.includes('Email rate limit exceeded')) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
    return msg;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = isRegistering
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Показываем ошибку
      setModal({
        isOpen: true,
        type: 'error',
        title: isRegistering ? 'Ошибка регистрации' : 'Ошибка входа',
        message: translateError(error.message)
      });
    } else if (isRegistering && !data.session) {
      // Если регистрация успешна, но сессии еще нет (нужно подтвердить почту)
      setModal({
        isOpen: true,
        type: 'success',
        title: 'Письмо отправлено!',
        message: `Мы отправили ссылку для подтверждения на адрес ${email}. Пожалуйста, проверьте папку "Входящие" (и "Спам"), чтобы завершить регистрацию.`
      });
    }

    setLoading(false);
  };

  return (
    <div className="container flex-center animate" style={{ minHeight: '80vh', position: 'relative' }}>
      <div className="card" style={{ width: '400px' }}>
        <h2 style={{ marginBottom: '20px', textAlign: 'center' }}>{isRegistering ? 'Регистрация' : 'Вход в платформу'}</h2>

        <form onSubmit={handleAuth} className="flex-center" style={{ flexDirection: 'column', gap: '15px' }}>
          <input
            type="email"
            placeholder="Электронная почта"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%' }}
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%' }}
          />
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '15px', marginTop: '10px' }}>
            {loading ? 'Обработка...' : (isRegistering ? 'Создать аккаунт' : 'Войти')}
          </button>
        </form>

        <p style={{ marginTop: '25px', fontSize: '0.9rem', textAlign: 'center', opacity: 0.7 }}>
          {isRegistering ? 'Уже есть аккаунт?' : 'Нет аккаунта?'}
          <span
            onClick={() => setIsRegistering(!isRegistering)}
            style={{ color: 'var(--primary-color)', cursor: 'pointer', marginLeft: '5px', fontWeight: '600' }}
          >
            {isRegistering ? 'Войти здесь' : 'Регистрация здесь'}
          </span>
        </p>
      </div>

      {/* Красивое модальное окно для оповещений */}
      {modal.isOpen && (
        <div className="modal-overlay" onClick={() => setModal({ ...modal, isOpen: false })}>
          <div className="modal-content animate" style={{ width: '400px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{
              justifyContent: 'center', width: '70px', height: '70px', borderRadius: '50%', margin: '0 auto 20px',
              background: modal.type === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
              color: modal.type === 'success' ? '#4ade80' : '#f87171'
            }}>
              {modal.type === 'success' ? <Mail size={36} /> : <AlertTriangle size={36} />}
            </div>

            <h2 style={{ marginBottom: '15px' }}>{modal.title}</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
              {modal.message}
            </p>

            <button
              onClick={() => setModal({ ...modal, isOpen: false })}
              style={{
                width: '100%', padding: '15px',
                background: modal.type === 'success' ? 'var(--primary-color)' : 'rgba(0,0,0,0.05)',
                color: modal.type === 'success' ? 'white' : 'var(--text-color)',
                boxShadow: 'none'
              }}
            >
              {modal.type === 'success' ? 'Понятно, иду проверять' : 'Закрыть'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Auth;