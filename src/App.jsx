import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Link, Outlet, createRoutesFromElements, Route } from 'react-router-dom';
import { supabase } from './lib/supabase';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Profile from './pages/Profile';
import QuizCatalog from './pages/QuizCatalog';
import QuizView from './pages/QuizView';
import Editor from './pages/Editor';
import Dashboard from './pages/Dashboard';
import Statistics from './pages/Statistics';
import Logs from './pages/Logs';
import Analytics from './pages/Analytics';
import QuizRedactor from './pages/QuizRedactor';
import './index.css';

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.title = "LabTest";
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (id, currentSession = null) => {
    const { data } = await supabase
      .from('profiles')
      .select('*, classes(name)')
      .eq('id', id)
      .single();

    if (data) {
      // Sync email if missing in profile but present in session
      const userEmail = currentSession?.user?.email || session?.user?.email;
      if (userEmail && !data.email) {
        await supabase.from('profiles').update({ email: userEmail }).eq('id', id);
        data.email = userEmail;
      }
      setProfile(data);
    }
    setLoading(false);
  };

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const isAdmin = profile?.role === 'admin' || profile?.role === 'creator';
  const isEditor = profile?.role === 'editor' || profile?.role === 'teacher' || isAdmin;

  // Use useMemo to avoid re-creating the router on every state change
  const router = useMemo(() => createBrowserRouter(
    createRoutesFromElements(
      <Route element={
        <div className="app-shell">
          <nav className="navbar">
            <div className="container flex-center" style={{ justifyContent: 'space-between', padding: '15px 20px', maxWidth: '100%' }}>
              <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h2 style={{ fontWeight: '800', letterSpacing: '-1px' }}>LabTest</h2>
              </Link>
              <div className="nav-links flex-center" style={{ gap: '10px' }}>
                <ThemeToggle theme={theme} onToggle={toggleTheme} />
                <Link to="/catalog"><NavButton label="Тесты" /></Link>
                <Link to="/statistics"><NavButton label="Статистика" /></Link>
                {isEditor && <Link to="/editor"><NavButton label="Создать" variant="accent" /></Link>}
                {isAdmin && <Link to="/dashboard"><NavButton label="Панель" variant="accent" /></Link>}
                {session ? (
                  <Link to="/profile"><NavButton label="Профиль" variant="primary" /></Link>
                ) : (
                  <Link to="/auth"><NavButton label="Войти" variant="primary" /></Link>
                )}
              </div>
            </div>
          </nav>
          <Outlet />
        </div>
      }>
        <Route path="/" element={<Home session={session} profile={profile} />} />
        <Route path="/auth" element={!session ? <Auth /> : <Navigate to="/" />} />

        <Route path="/catalog" element={
          !session ? <Navigate to="/auth" /> :
            !profile?.is_profile_setup_completed ? <Navigate to="/profile" state={{ from: '/catalog', msg: 'Подтвердите данные профиля.' }} /> :
              <QuizCatalog profile={profile} />
        } />

        <Route path="/quiz/:id" element={session ? <QuizView session={session} profile={profile} /> : <Navigate to="/auth" />} />

        <Route path="/editor" element={isEditor ? <Editor session={session} profile={profile} /> : <Navigate to="/" />} />
        <Route path="/dashboard" element={isAdmin ? <Dashboard session={session} profile={profile} /> : <Navigate to="/" />} />
        <Route path="/logs" element={isAdmin ? <Logs profile={profile} /> : <Navigate to="/" />} />
        <Route path="/statistics" element={<Statistics session={session} profile={profile} />} />
        <Route path="/analytics" element={isEditor ? <Analytics profile={profile} /> : <Navigate to="/" />} />
        <Route path="/redactor" element={isEditor ? <QuizRedactor /> : <Navigate to="/" />} />

        <Route path="/profile" element={session ? <Profile session={session} profile={profile} refreshProfile={() => fetchProfile(session.user.id)} /> : <Navigate to="/auth" />} />
      </Route>
    )
  ), [session, profile, theme, isEditor, isAdmin]);

  if (loading) return <div className="flex-center" style={{ height: '100vh', flexDirection: 'column', gap: '20px' }}>
    <div className="animate" style={{ fontSize: '2rem', fontWeight: '800' }}>LabTest</div>
    <div style={{ opacity: 0.5 }}>Загрузка лаборатории...</div>
  </div>;

  return <RouterProvider router={router} />;
}

const NavButton = ({ label, variant = 'ghost' }) => (
  <button style={{
    background: variant === 'ghost' ? 'transparent' : (variant === 'accent' ? 'var(--accent-color)' : 'var(--primary-color)'),
    color: variant === 'ghost' ? 'var(--text-color)' : 'white',
    padding: '8px 16px',
    boxShadow: variant === 'ghost' ? 'none' : 'var(--soft-shadow)',
    fontSize: '0.9rem'
  }}>
    {label}
  </button>
);

const ThemeToggle = ({ theme, onToggle }) => (
  <button onClick={onToggle} style={{ background: 'rgba(128,128,128,0.1)', color: 'var(--text-color)', padding: '8px 12px', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '12px' }}>
    {theme === 'light' ? '🌙' : '☀️'}
  </button>
);

export default App;
