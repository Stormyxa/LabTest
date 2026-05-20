import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Link, Outlet, createRoutesFromElements, Route } from 'react-router-dom';
import { Sparkles, CheckCircle } from 'lucide-react';
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
import AiHub from './components/AiHub';
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
      // console.log('Stale cache cleared (New version: ' + CACHE_VERSION + ')');
    }

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Pre-warm embedding model early if user is logged in and has access
    // Use global flag to ensure it only runs ONCE per session
    if (session && profile && (profile.role !== 'player' || profile.class_id)) {
      if (!window.__embedding_preloaded) {
        window.__embedding_preloaded = true;
        // console.log('🚀 Proactively preloading embedding model...');
        import('./lib/embeddingService').then(m => m.preloadEmbeddingModel());
      }
    }
  }, [session, profile]);

  useEffect(() => {
    if (session && profile) {
      const timer = setTimeout(async () => {
        try {
          const queueData = localStorage.getItem('pending_vector_facts');
          if (!queueData) return;

          let queue = JSON.parse(queueData);
          const myPending = queue.filter(item => item.userId === session.user.id);
          if (myPending.length === 0) return;

          console.log(`🔄 RAG: Found ${myPending.length} pending vector facts for this user. Processing sequentially...`);

          const { processAndStoreAttemptFacts } = await import('./lib/ragService');

          for (const item of myPending) {
            try {
              console.log(`🔄 RAG: Sequential processing of cached attempt ${item.attemptId}`);
              const result = await processAndStoreAttemptFacts(
                item.attemptId,
                item.quizId,
                item.userId,
                item.sectionName,
                item.quizClass
              );
              if (result?.success) {
                const currentQueue = JSON.parse(localStorage.getItem('pending_vector_facts') || '[]');
                const filteredQueue = currentQueue.filter(qItem => qItem.attemptId !== item.attemptId);
                localStorage.setItem('pending_vector_facts', JSON.stringify(filteredQueue));
                console.log(`✅ RAG: Successfully processed cached attempt ${item.attemptId}`);
              }
            } catch (err) {
              console.warn(`❌ RAG: Failed to process cached attempt ${item.attemptId}. Will retry next time.`, err);
            }
          }
        } catch (queueErr) {
          console.error('Error processing pending vector facts queue:', queueErr);
        }
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [session, profile]);

  const fetchProfile = async (id, currentSession = null) => {
    // console.log("DEBUG: Fetching profile for ID:", id);
    const { data, error } = await supabase
      .from('profiles')
      .select('*, classes!class_id(name)')
      .eq('id', id)
      .single();

    // console.log("DEBUG: Data:", data);
    if (error) console.error("DEBUG: Error:", error);

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
  const isTeacher = profile?.role === 'teacher';
  const isEditor = isAdmin || profile?.role === 'editor' || isTeacher || profile?.role === 'player';

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
                <button 
                  onClick={() => window.dispatchEvent(new CustomEvent('open-ai-hub', { detail: { title: 'ИИ-Помощник' } }))}
                  className="flex-center"
                  style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', padding: '8px 12px', border: '1px solid rgba(124, 58, 237, 0.2)', borderRadius: '12px' }}
                  title="Открыть ИИ-Чат"
                >
                  <Sparkles size={18} />
                </button>
                <Link to="/catalog"><NavButton label="Тесты" /></Link>
                <Link to="/statistics"><NavButton label="Статистика" /></Link>
                {isEditor && <Link to="/analytics-details"><NavButton label="Аналитика" variant="accent" /></Link>}
                {isEditor && <Link to="/editor"><NavButton label="Создать" variant="accent" /></Link>}
                {(isAdmin || isTeacher) && <Link to="/dashboard"><NavButton label="Панель" variant="accent" /></Link>}
                {session ? (
                  <Link to="/profile"><NavButton label="Профиль" variant="primary" /></Link>
                ) : (
                  <Link to="/auth"><NavButton label="Войти" variant="primary" /></Link>
                )}
              </div>
            </div>
          </nav>
          <AiHub session={session} profile={profile} />
          <StatusToast />
          <Outlet />
        </div>
      }>
        <Route path="/" element={<Home session={session} profile={profile} />} />
        <Route path="/auth" element={!session ? <Auth /> : <Navigate to="/" />} />

        <Route path="/catalog" element={
          (!session || profile?.is_profile_setup_completed) ? <QuizCatalog profile={profile} /> :
            <Navigate to="/profile" state={{ from: '/catalog', msg: 'Подтвердите данные профиля.' }} />
        } />

        <Route path="/quiz/:id" element={<QuizView session={session} profile={profile} />} />

        <Route path="/editor" element={isEditor ? <Editor session={session} profile={profile} /> : <Navigate to="/" />} />
        <Route path="/dashboard" element={(isAdmin || isTeacher) ? <Dashboard session={session} profile={profile} /> : <Navigate to="/" />} />
        <Route path="/logs" element={isAdmin ? <Logs profile={profile} /> : <Navigate to="/" />} />
        <Route path="/statistics" element={<Statistics session={session} profile={profile} />} />
        <Route path="/analytics" element={isEditor ? <Analytics profile={profile} /> : <Navigate to="/" />} />
        <Route path="/analytics-details" element={session ? <AnalyticsDetails session={session} profile={profile} /> : <Navigate to="/auth" />} />
        <Route path="/user-analytics" element={session ? <UserAnalytics session={session} profile={profile} /> : <Navigate to="/auth" />} />
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

const StatusToast = () => {
  const [status, setStatus] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    const handleStatus = (e) => {
      setStatus(e.detail);
      if (e.detail.status === 'done') {
        setTimeout(() => setStatus(null), 3000);
      }
    };
    window.addEventListener('rag-status', handleStatus);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('rag-status', handleStatus);
    };
  }, []);

  if (!status) return null;

  return (
    <div style={{
      position: 'fixed', 
      top: isMobile ? '20px' : 'auto',
      bottom: isMobile ? 'auto' : '20px', 
      right: '20px', 
      zIndex: 11000,
      background: 'var(--card-bg)', color: 'var(--text-color)',
      padding: '12px 18px', borderRadius: '16px',
      boxShadow: '0 15px 35px rgba(0,0,0,0.25)',
      border: '1px solid rgba(124, 58, 237, 0.3)',
      display: 'flex', flexDirection: 'column', gap: '8px',
      minWidth: isMobile ? '200px' : '250px', 
      maxWidth: '350px',
      animation: isMobile ? 'slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {status.status === 'done' ? (
            <div style={{ background: '#4ade80', borderRadius: '50%', padding: '2px', display: 'flex' }}><CheckCircle size={14} color="white" /></div>
          ) : (
            <div className="rag-spinner" style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid var(--primary-color)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
          )}
          <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>{status.message}</span>
        </div>
        {status.progress !== undefined && <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{status.progress}%</span>}
      </div>
      
      {status.progress !== undefined && (
        <div style={{ height: '3px', background: 'rgba(0,0,0,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ 
            height: '100%', background: 'var(--primary-color)', 
            width: `${status.progress}%`, transition: 'width 0.3s' 
          }} />
        </div>
      )}
      
      <style>{`
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
