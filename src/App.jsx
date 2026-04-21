import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Link, Outlet, createRoutesFromElements, Route, useLocation } from 'react-router-dom';
import { Clock, ExternalLink, X, ChevronRight, AlertCircle } from 'lucide-react';
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
import AnalyticsDetails from './pages/AnalyticsDetails';
import UserAnalytics from './pages/UserAnalytics';
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

    // --- Cache Busting for Images/Catalog Optimization ---
    const CACHE_VERSION = 'v2.1'; // Increment this to force-clear stale quiz data for everyone
    if (localStorage.getItem('labtest_cache_version') !== CACHE_VERSION) {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('labtest_cache_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      localStorage.setItem('labtest_cache_version', CACHE_VERSION);
      console.log('Stale cache cleared (New version: ' + CACHE_VERSION + ')');
    }

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
                {isEditor && <Link to="/analytics-details"><NavButton label="Аналитика" variant="accent" /></Link>}
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
          <ActiveAttemptsMonitor session={session} />
          <Outlet />
        </div>
      }>
        <Route path="/" element={<Home session={session} profile={profile} />} />
        <Route path="/auth" element={<AuthWrapper session={session} />} />
        <Route path="/catalog" element={<ProtectedRoute session={session} profile={profile}><QuizCatalog profile={profile} /></ProtectedRoute>} />
        <Route path="/quiz/:id" element={<ProtectedRoute session={session} profile={profile}><QuizView session={session} profile={profile} /></ProtectedRoute>} />

        <Route path="/editor" element={isEditor ? <Editor session={session} profile={profile} /> : <Navigate to="/" />} />
        <Route path="/dashboard" element={isAdmin ? <Dashboard session={session} profile={profile} /> : <Navigate to="/" />} />
        <Route path="/logs" element={isAdmin ? <Logs profile={profile} /> : <Navigate to="/" />} />
        <Route path="/statistics" element={<Statistics session={session} profile={profile} />} />
        <Route path="/analytics" element={isEditor ? <Analytics profile={profile} /> : <Navigate to="/" />} />
        <Route path="/analytics-details" element={<ProtectedRoute session={session} profile={profile}><AnalyticsDetails session={session} profile={profile} /></ProtectedRoute>} />
        <Route path="/user-analytics" element={<ProtectedRoute session={session} profile={profile}><UserAnalytics session={session} profile={profile} /></ProtectedRoute>} />
        <Route path="/redactor" element={isEditor ? <QuizRedactor /> : <Navigate to="/" />} />

        <Route path="/profile" element={<ProtectedRoute session={session} profile={profile}><Profile session={session} profile={profile} refreshProfile={() => fetchProfile(session.user.id)} /></ProtectedRoute>} />
      </Route>
    )
  ), [session, profile, theme, isEditor, isAdmin]);

  if (loading) return <div className="flex-center" style={{ height: '100vh', flexDirection: 'column', gap: '20px' }}>
    <div className="animate" style={{ fontSize: '2rem', fontWeight: '800' }}>LabTest</div>
    <div style={{ opacity: 0.5 }}>Загрузка лаборатории...</div>
  </div>;

  return <RouterProvider router={router} />;
}

// Ongoing test monitor component
const ActiveAttemptsMonitor = ({ session }) => {
  const [activeAttempts, setActiveAttempts] = useState([]);
  const [isMinimized, setIsMinimized] = useState(() => sessionStorage.getItem('labtest_attempts_minimized') === 'true');
  const [tick, setTick] = useState(0); // Used to force re-render every second for smooth timer
  const location = useLocation();

  // 1. Fetch data logic (standard 30s sync)
  useEffect(() => {
    if (!session) return;
    fetchActiveAttempts();
    const interval = setInterval(fetchActiveAttempts, 30000);
    return () => clearInterval(interval);
  }, [session, location.pathname]);

  // 2. Local timer logic (1s tick)
  useEffect(() => {
    if (activeAttempts.length === 0) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeAttempts.length]);

  const fetchActiveAttempts = async () => {
    if (!session) return;
    
    const { data: attempts, error } = await supabase
      .from('quiz_attempts')
      .select('*, quizzes(title, content)')
      .eq('user_id', session.user.id)
      .eq('is_incomplete', true)
      .order('created_at', { ascending: false });

    if (error || !attempts) return;

    const SECONDS_PER_QUESTION = 25;
    const now = Date.now();
    
    // Deduplicate by quiz_id (keeping the most recent)
    const uniqueMap = new Map();
    const processed = [];

    for (const att of attempts) {
      if (!att.quizzes || uniqueMap.has(att.quiz_id)) continue;
      uniqueMap.set(att.quiz_id, true);
      
      const qCount = att.quizzes.content?.questions?.length || 0;
      const totalSeconds = qCount * SECONDS_PER_QUESTION;
      const startMs = new Date(att.created_at).getTime();
      const endTime = startMs + (totalSeconds * 1000);
      const remainingAtFetch = Math.floor((endTime - now) / 1000);

      if (remainingAtFetch <= 0) {
        await supabase.from('quiz_attempts').update({ is_incomplete: false, finish_reason: 'timer_expired' }).eq('id', att.id);
        continue;
      }

      processed.push({
        ...att,
        endTime,
        totalSeconds,
        title: att.quizzes.title
      });
    }

    setActiveAttempts(processed);
  };

  const toggleMinimized = () => {
    const next = !isMinimized;
    setIsMinimized(next);
    sessionStorage.setItem('labtest_attempts_minimized', next);
  };

  // Don't show if we are in the quiz view or no attempts
  if (location.pathname.startsWith('/quiz/') || activeAttempts.length === 0) return null;

  return (
    <div 
      className={`attempts-monitor-container ${isMinimized ? 'minimized' : ''}`}
      style={{
        position: 'fixed',
        bottom: '25px',
        right: '25px',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column-reverse',
        alignItems: 'flex-end',
        gap: '12px',
        pointerEvents: 'none',
        transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}
    >
      {/* Minimized Bubble - Now at the bottom due to column-reverse */}
      <button 
        onClick={toggleMinimized}
        style={{
          pointerEvents: 'auto',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: isMinimized ? 'var(--primary-color)' : 'rgba(0,0,0,0.1)',
          color: isMinimized ? 'white' : 'var(--text-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isMinimized ? '0 10px 30px rgba(99, 102, 241, 0.5)' : '0 4px 15px rgba(0,0,0,0.1)',
          cursor: 'pointer',
          border: 'none',
          padding: 0,
          transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          position: 'relative',
          transform: isMinimized ? 'scale(1)' : 'scale(0.9) rotate(0deg)',
          flexShrink: 0
        }}
        title={isMinimized ? "Развернуть список тестов" : "Свернуть список тестов"}
      >
        {isMinimized ? <Clock size={26} /> : <X size={24} />}
        {isMinimized && activeAttempts.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            background: '#f87171',
            color: 'white',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            fontSize: '0.8rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--card-bg)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}>
            {activeAttempts.length}
          </div>
        )}
      </button>

      {/* Expanded List Container - Appears above the bubble */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column-reverse', 
        gap: '12px', 
        width: '340px', 
        pointerEvents: isMinimized ? 'none' : 'auto',
        maxHeight: '75vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        opacity: isMinimized ? 0 : 1,
        transform: isMinimized ? 'translateY(50px) scale(0.8)' : 'translateY(0) scale(1)',
        transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        padding: '10px'
      }}>
        {activeAttempts.map((att, i) => {
          const now = Date.now();
          const remaining = Math.max(0, Math.floor((att.endTime - now) / 1000));
          const timerPercent = remaining / att.totalSeconds;
          const timerColor = timerPercent > 0.5 ? '#4ade80' : timerPercent > 0.2 ? '#facc15' : '#f87171';
          const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

          return (
            <div key={att.id} style={{
              background: 'var(--card-bg)',
              borderLeft: `5px solid ${timerColor}`,
              padding: '16px',
              borderRadius: '18px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.1)',
              transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              transitionDelay: isMinimized ? '0s' : `${i * 0.1}s`,
              opacity: isMinimized ? 0 : 1,
              transform: isMinimized ? 'translateY(20px)' : 'translateY(0)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `${timerColor}15`, color: timerColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Clock size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.75rem', opacity: 0.5, fontWeight: '600' }}>В процессе:</div>
                  <div style={{ fontWeight: '700', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{att.title}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '900', color: timerColor, fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(remaining)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Link to={`/quiz/${att.quiz_id}`} style={{ flex: 1, textDecoration: 'none' }}>
                  <button style={{ width: '100%', padding: '10px', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    Вернуться <ChevronRight size={16} />
                  </button>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

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

// Helper components for smart redirection
const AuthWrapper = ({ session }) => {
  const location = useLocation();
  const from = location.state?.from || "/";
  if (session) return <Navigate to={from} replace />;
  return <Auth />;
};

const ProtectedRoute = ({ session, profile, children }) => {
  const location = useLocation();
  if (!session) {
    return <Navigate to="/auth" state={{ from: location.pathname + location.search }} replace />;
  }
  if (location.pathname !== '/profile' && !profile?.is_profile_setup_completed) {
    return <Navigate to="/profile" state={{ from: location.pathname + location.search, msg: 'Подтвердите данные профиля.' }} replace />;
  }
  return children;
};

export default App;
