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

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/home'
        }
      });
      if (error) throw error;
    } catch (err) {
      setModal({ isOpen: true, type: 'error', title: 'Ошибка Google Входа', message: translateError(err.message) });
      setLoading(false);
    }
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

          {/* DIVIDER */}
          {authMode === 'login' && (
            <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', gap: '15px', opacity: 0.3 }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--text-color)' }} />
              <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>или</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--text-color)' }} />
            </div>
          )}

          {/* GOOGLE BUTTON */}
          {authMode === 'login' && (
            <button 
              type="button" 
              onClick={handleGoogleLogin} 
              disabled={loading}
              className="flex-center"
              style={{ 
                width: '100%', 
                padding: '14px', 
                background: 'var(--card-bg)', 
                color: 'var(--text-color)', 
                border: '1px solid rgba(0,0,0,0.1)', 
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                fontWeight: '600',
                gap: '12px',
                justifyContent: 'center',
                borderRadius: '12px'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Вход через Google
            </button>
          )}
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