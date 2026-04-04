import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, AlertTriangle, Eye, EyeOff, Lock } from 'lucide-react';

const Auth = () => {
  // Режимы: 'login', 'register', 'forgot', 'update'
  const [authMode, setAuthMode] = useState('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [modal, setModal] = useState({ isOpen: false, type: 'success', title: '', message: '' });

  // Отлавливаем возвращение пользователя по ссылке из письма для сброса пароля
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('update');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const translateError = (msg) => {
    if (msg.includes('Email not confirmed')) return 'Почта не подтверждена. Пожалуйста, проверьте ваш ящик (включая папку "Спам") и перейдите по ссылке.';
    if (msg.includes('Token has expired')) return 'Срок действия ссылки истек. Пожалуйста, запросите письмо заново.';
    if (msg.includes('Invalid login credentials')) return 'Неверный email или пароль.';
    if (msg.includes('User already registered')) return 'Пользователь с таким email уже зарегистрирован.';
    if (msg.includes('Password should be at least')) return 'Пароль должен содержать минимум 6 символов.';
    if (msg.includes('Email rate limit exceeded')) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
    if (msg.includes('User not found')) return 'Пользователь с таким email не найден.';
    if (msg.includes('заблокирована') || msg.toLowerCase().includes('blacklist')) return 'Эта почта заблокирована администрацией. Регистрация невозможна.';
    return msg;
  };

  const handleAuth = async (e) => {
    e.preventDefault();

    // Проверка совпадения паролей для регистрации и обновления
    if ((authMode === 'register' || authMode === 'update') && password !== confirmPassword) {
      setModal({ isOpen: true, type: 'error', title: 'Ошибка', message: 'Пароли не совпадают. Пожалуйста, проверьте правильность ввода.' });
      return;
    }

    setLoading(true);
    let authError = null;
    let authData = null;

    try {
      if (authMode === 'register') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        authData = data; authError = error;
      }
      else if (authMode === 'login') {
        // Проверяем роль до входа в систему через новую RPC-функцию
        const { data: userRole, error: roleError } = await supabase.rpc('get_role_by_email', { user_email: email });
        
        if (!roleError && (userRole === 'admin' || userRole === 'creator')) {
          // Если это руководство, шлём им письмо вместо входа по паролю
          const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/` } });
          if (error) {
            authError = error;
          } else {
            setLoading(false);
            setModal({ isOpen: true, type: 'success', title: 'Вход для Администрации', message: 'В целях повышения безопасности вам на почту была отправлена одноразовая ссылка для входа в платформу. Пожалуйста, проверьте свой ящик.' });
            return;
          }
        } else {
          // Обычный вход для остальных ролей
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          authData = data; authError = error;
        }
      }
      else if (authMode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin, // Вернет пользователя обратно на сайт
        });
        authError = error;
      }
      else if (authMode === 'update') {
        // Обновление пароля после перехода по ссылке из почты
        const { error } = await supabase.auth.updateUser({ password });
        authError = error;
      }

      if (authError) {
        setModal({ isOpen: true, type: 'error', title: 'Ошибка', message: translateError(authError.message) });
      } else {
        if (authMode === 'register' && !authData?.session) {
          setModal({ isOpen: true, type: 'success', title: 'Письмо отправлено!', message: `Мы отправили ссылку для подтверждения на адрес ${email}. Пожалуйста, проверьте папку "Входящие" (и "Спам").` });
          switchMode('login');
        }
        else if (authMode === 'forgot') {
          setModal({ isOpen: true, type: 'success', title: 'Инструкция отправлена!', message: `Если аккаунт с почтой ${email} существует, мы отправили на него ссылку для сброса пароля. Проверьте почту (включая папку "Спам").` });
          switchMode('login');
        }
        else if (authMode === 'update') {
          setModal({ isOpen: true, type: 'success', title: 'Успешно!', message: 'Ваш пароль был успешно изменен! Сейчас вы будете перенаправлены.' });
          // Пользователь уже авторизован, основной App.jsx сам сменит экран
        }
      }
    } catch (err) {
      setModal({ isOpen: true, type: 'error', title: 'Системная ошибка', message: 'Произошла непредвиденная ошибка. Попробуйте позже.' });
    }

    setLoading(false);
  };

  const switchMode = (mode) => {
    setAuthMode(mode);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  return (
    <>
      <div className="container flex-center animate" style={{ minHeight: '80vh', position: 'relative' }}>
        <div className="card" style={{ width: '400px' }}>

        <h2 style={{ marginBottom: '20px', textAlign: 'center' }}>
          {authMode === 'register' && 'Регистрация'}
          {authMode === 'login' && 'Вход в платформу'}
          {authMode === 'forgot' && 'Восстановление пароля'}
          {authMode === 'update' && 'Создание нового пароля'}
        </h2>

        {authMode === 'forgot' && (
          <p style={{ opacity: 0.7, fontSize: '0.9rem', textAlign: 'center', marginBottom: '20px' }}>
            Введите вашу электронную почту, и мы отправим вам ссылку для сброса пароля.
          </p>
        )}

        <form onSubmit={handleAuth} className="flex-center" style={{ flexDirection: 'column', gap: '15px' }}>

          {/* EMAIL: Показывать везде, кроме режима обновления пароля */}
          {authMode !== 'update' && (
            <input
              id="auth-email"
              name="email"
              type="email"
              placeholder="Электронная почта"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%' }}
              autoComplete="email"
            />
          )}

          {/* ПАРОЛЬ: Показывать везде, кроме режима "забыл пароль" */}
          {authMode !== 'forgot' && (
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                id="auth-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder={authMode === 'update' ? "Новый пароль" : "Пароль"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: '100%', paddingRight: '45px' }}
                autoComplete={authMode === 'login' ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', boxShadow: 'none', color: 'inherit', padding: '8px' }}
              >
                {showPassword ? <EyeOff size={18} opacity={0.5} /> : <Eye size={18} opacity={0.5} />}
              </button>
            </div>
          )}

          {/* ПОВТОР ПАРОЛЯ: Только при регистрации или обновлении пароля */}
          {(authMode === 'register' || authMode === 'update') && (
            <div className="animate" style={{ position: 'relative', width: '100%' }}>
              <input
                id="auth-confirm-password"
                name="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Повторите пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={{ width: '100%', paddingRight: '45px', border: password && confirmPassword && password !== confirmPassword ? '2px solid #f87171' : '' }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', boxShadow: 'none', color: 'inherit', padding: '8px' }}
              >
                {showConfirmPassword ? <EyeOff size={18} opacity={0.5} /> : <Eye size={18} opacity={0.5} />}
              </button>
            </div>
          )}

          {/* ССЫЛКА ЗАБЫЛ ПАРОЛЬ */}
          {authMode === 'login' && (
            <div style={{ width: '100%', textAlign: 'right', marginTop: '-5px' }}>
              <span onClick={() => switchMode('forgot')} style={{ fontSize: '0.85rem', color: 'var(--primary-color)', cursor: 'pointer', fontWeight: '500' }}>
                Забыли пароль?
              </span>
            </div>
          )}

          {/* КНОПКА ОТПРАВКИ */}
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '15px', marginTop: '10px' }}>
            {loading ? 'Обработка...' : (
              authMode === 'register' ? 'Создать аккаунт' :
                authMode === 'login' ? 'Войти' :
                  authMode === 'forgot' ? 'Отправить ссылку' : 'Сохранить новый пароль'
            )}
          </button>
        </form>

        {/* НИЖНЯЯ ПАНЕЛЬ С ПЕРЕКЛЮЧЕНИЕМ РЕЖИМОВ */}
        {authMode !== 'update' && (
          <div style={{ marginTop: '25px', fontSize: '0.9rem', textAlign: 'center', opacity: 0.7 }}>
            {authMode === 'login' ? (
              <>Нет аккаунта? <span onClick={() => switchMode('register')} style={{ color: 'var(--primary-color)', cursor: 'pointer', fontWeight: '600' }}>Регистрация здесь</span></>
            ) : (
              <>Вспомнили пароль? <span onClick={() => switchMode('login')} style={{ color: 'var(--primary-color)', cursor: 'pointer', fontWeight: '600' }}>Вернуться ко входу</span></>
            )}
          </div>
        )}
      </div>
    </div>
      
    {/* МОДАЛЬНОЕ ОКНО */}
    {modal.isOpen && (
      <div className="modal-overlay" onClick={() => setModal({ ...modal, isOpen: false })}>
          <div className="modal-content animate" style={{ width: '400px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{
              justifyContent: 'center', width: '70px', height: '70px', borderRadius: '50%', margin: '0 auto 20px',
              background: modal.type === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
              color: modal.type === 'success' ? '#4ade80' : '#f87171'
            }}>
              {modal.type === 'success' && authMode === 'update' ? <Lock size={36} /> : modal.type === 'success' ? <Mail size={36} /> : <AlertTriangle size={36} />}
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
              {modal.type === 'success' ? 'Понятно' : 'Закрыть'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Auth;