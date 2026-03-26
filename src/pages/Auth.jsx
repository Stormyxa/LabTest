import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    let { error } = isRegistering 
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) alert(error.message);
    setLoading(false);
  };

  return (
    <div className="container flex-center animate" style={{minHeight: '80vh'}}>
      <div className="card" style={{width: '400px'}}>
        <h2 style={{marginBottom: '20px'}}>{isRegistering ? 'Регистрация' : 'Вход в LabTest'}</h2>
        <form onSubmit={handleAuth} className="flex-center" style={{flexDirection: 'column', gap: '15px'}}>
          <input 
            type="email" 
            placeholder="Электронная почта" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
          />
          <input 
            type="password" 
            placeholder="Пароль" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
          />
          <button type="submit" disabled={loading} style={{width: '100%'}}>
            {loading ? 'Загрузка...' : (isRegistering ? 'Создать аккаунт' : 'Войти')}
          </button>
        </form>
        <p style={{marginTop: '20px', fontSize: '0.9rem', textAlign: 'center', opacity: 0.7}}>
          {isRegistering ? 'Уже есть аккаунт?' : 'Нет аккаунта?'} 
          <span 
            onClick={() => setIsRegistering(!isRegistering)} 
            style={{color: 'var(--primary-color)', cursor: 'pointer', marginLeft: '5px', fontWeight: '600'}}
          >
            {isRegistering ? 'Войти здесь' : 'Регистрация здесь'}
          </span>
        </p>
      </div>
    </div>
  );
};

export default Auth;
