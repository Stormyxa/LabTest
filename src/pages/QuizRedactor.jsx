import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useScrollRestoration } from '../lib/useScrollRestoration';
import {
  ChevronLeft, Pencil, Check, X, Plus, Trash2, RotateCcw,
  AlertTriangle, Download, AlertCircle, Lock, BarChart2,
  GripVertical, Eye, EyeOff, Image as ImageIcon, Link,
  Upload, ChevronRight
} from 'lucide-react';
import { transliterate } from '../lib/transliterate';
import { syncGithubRenames, updateQuizzesWithNewUrls } from '../lib/githubSync';

const MAX_QUESTIONS = 30;
const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

const QuizRedactor = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quizId = searchParams.get('id');

  const [quiz, setQuiz] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [blocked, setBlocked] = useState(null); // null | 'no_permission' | 'has_results'
  const [resultCount, setResultCount] = useState(0);
  const [hasForeignResults, setHasForeignResults] = useState(false);

  useScrollRestoration(loading);

  // Editing state
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState([]);
  const [isHidden, setIsHidden] = useState(false);
  const [savedTitle, setSavedTitle] = useState('');
  const [savedQuestions, setSavedQuestions] = useState([]);
  const [savedIsHidden, setSavedIsHidden] = useState(false);

  // Undo history (snapshots), max 20
  const historyRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);

  // Inline editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [editQIdx, setEditQIdx] = useState(null);
  const [editOptKey, setEditOptKey] = useState(null); // "qIdx-oIdx"

  // Modals
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showFormattingWarning, setShowFormattingWarning] = useState(false);
  const [showSuccessUpdateModal, setShowSuccessUpdateModal] = useState(false);
  const [deleteQModal, setDeleteQModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [validErrors, setValidErrors] = useState([]);
  const [showValidErrors, setShowValidErrors] = useState(false);
  const [showDeleteResultsModal, setShowDeleteResultsModal] = useState(false);
  const [deleteResultsLock, setDeleteResultsLock] = useState(3);

  // Images
  const [imageInputModal, setImageInputModal] = useState({ isOpen: false, qIdx: null, mode: 'upload', url: '', file: null, uploading: false });
  const [imagePreviewModal, setImagePreviewModal] = useState({ isOpen: false, url: '', qIdx: null, imgIdx: null });

  useEffect(() => { if (quizId) fetchAll(); }, [quizId]);

  useEffect(() => {
    let timer;
    if (showDeleteResultsModal && deleteResultsLock > 0) {
      timer = setInterval(() => {
        setDeleteResultsLock(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showDeleteResultsModal, deleteResultsLock]);

  const fetchAll = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/auth'); return; }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setProfile(p);

    const { data: q } = await supabase
      .from('quizzes')
      .select('*, quiz_sections(name, class_id), profiles!quizzes_author_id_fkey(role)')
      .eq('id', quizId)
      .single();

    if (!q) { setNotFound(true); setLoading(false); return; }
    setQuiz(q);

    const authorRole = q.profiles?.role;
    const canEdit =
      p?.role === 'creator' ||
      (p?.role === 'admin' && authorRole !== 'creator') ||
      ((p?.role === 'teacher' || p?.role === 'editor') && q.author_id === user.id);

    if (!canEdit) { setBlocked('no_permission'); setLoading(false); return; }

    const { data: res } = await supabase
      .from('quiz_results')
      .select('user_id')
      .eq('quiz_id', quizId);

    const count = res?.length || 0;
    const foreign = res?.some(r => r.user_id !== user.id);

    if (count > 0) {
      setBlocked('has_results');
      setResultCount(count);
      setHasForeignResults(foreign);
      setLoading(false);
      // При блокировке по результатам мы всё равно подгружаем заголовок для редактирования
      setTitle(q.title);
      setSavedTitle(q.title);
      return;
    }

    const qs = deepClone(q.content?.questions || []);
    setTitle(q.title);
    setIsHidden(q.is_hidden || false);
    setQuestions(qs);
    setSavedTitle(q.title);
    setSavedIsHidden(q.is_hidden || false);
    setSavedQuestions(deepClone(qs));
    historyRef.current = [];
    setCanUndo(false);
    setLoading(false);
  };

  const hasChanges = () =>
    title !== savedTitle || JSON.stringify(questions) !== JSON.stringify(savedQuestions) || isHidden !== savedIsHidden;

  const pushHistory = (prevTitle, prevQuestions) => {
    historyRef.current = [...historyRef.current.slice(-19), { title: prevTitle, questions: deepClone(prevQuestions) }];
    setCanUndo(true);
  };

  const undo = () => {
    if (!historyRef.current.length) return;
    const last = historyRef.current.at(-1);
    historyRef.current = historyRef.current.slice(0, -1);
    setTitle(last.title);
    setQuestions(last.questions);
    setCanUndo(historyRef.current.length > 0);
    setEditQIdx(null); setEditOptKey(null); setEditingTitle(false);
  };

  const validate = () => {
    const errs = [];
    if (!title.trim()) errs.push('Заголовок теста пуст');
    if (!questions.length) errs.push('Тест должен содержать хотя бы один вопрос');
    questions.forEach((q, i) => {
      if (!q.question.trim()) errs.push(`Вопрос ${i + 1}: текст вопроса пуст`);
      if ((q.options || []).length < MIN_OPTIONS) errs.push(`Вопрос ${i + 1}: минимум ${MIN_OPTIONS} варианта`);
      if (q.correctIndex === null || q.correctIndex === undefined) errs.push(`Вопрос ${i + 1}: не выбран верный ответ`);
      (q.options || []).forEach((o, oi) => { if (!o.trim()) errs.push(`Вопрос ${i + 1}, вариант ${oi + 1}: текст пуст`); });
    });
    setValidErrors(errs);
    return errs.length === 0;
  };

  const normalizeTitle = (t) => {
    if (!t) return t;
    let res = t.trim();
    // Long dashes and math minuses to standard hyphen
    res = res.replace(/[—–−]/g, '-');
    // Quotes to Guillemets: "word" -> «word»
    res = res.replace(/"([^"]+)"/g, '«$1»');
    // Para pattern: § 10. Title
    const paraMatch = res.match(/^§?\s*(\d+)\.?\s*(.*)/);
    if (paraMatch) {
      res = `§ ${paraMatch[1]}. ${paraMatch[2].trim()}`;
    }
    return res;
  };

  const handleSave = async (force = false) => {
    // Normalization only on FIRST publication (Hidden -> Visible)
    const isFirstPublication = savedIsHidden === true && isHidden === false;
    let finalTitle = title;
    if (isFirstPublication) {
      finalTitle = normalizeTitle(title);
      setTitle(finalTitle);
    }

    if (!validate()) { setShowValidErrors(true); setShowSaveModal(false); return; }

    // Check for ALL CAPS or poor formatting (warn on all saves)
    const isAllCaps = finalTitle === finalTitle.toUpperCase() && finalTitle.length > 5;
    const hasDashes = finalTitle.includes(' - ') || finalTitle.includes(' — ');

    if (!force && (isAllCaps || hasDashes)) {
      setShowFormattingWarning(true);
      setShowSaveModal(false);
      return;
    }

    setShowFormattingWarning(false);
    setSaving(true);
    try {
      const trimmedTitle = finalTitle.trim();
      const { error } = await supabase.from('quizzes').update({
        title: trimmedTitle,
        content: { questions },
        is_hidden: isHidden
      }).eq('id', quizId);
      if (error) throw error;
      const oldTitle = savedTitle;
      const isTitleChanged = oldTitle && oldTitle !== trimmedTitle;

      setSavedTitle(trimmedTitle);
      setTitle(trimmedTitle);
      setSavedIsHidden(isHidden);
      setSavedQuestions(deepClone(questions));
      historyRef.current = [];
      setCanUndo(false);
      setShowSaveModal(false);
      setShowValidErrors(false);
      setValidErrors([]);

      // Trigger background GitHub rename sync if title changed
      if (isTitleChanged) {
        const sName = quiz?.quiz_sections?.name;
        const cId = quiz?.quiz_sections?.class_id;
        if (sName && cId) {
          syncGithubRenames(cId, sName, sName, oldTitle, trimmedTitle)
            .then(renamedMap => {
              if (renamedMap && Object.keys(renamedMap).length > 0) {
                 // The quiz logic fetched earlier has the questions, but we need the latest.
                 // We can just fetch it again or rely on the function which fetches it internally (wait, the function takes a list of quizzes).
                 updateQuizzesWithNewUrls([{ id: quizId, content: { questions } }], renamedMap)
                   .then(() => fetchAll()); // Re-fetch to get updated images in UI
              }
            })
            .catch(e => console.error('Failed to sync github assets:', e));
        }
      }

    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateOnlyTitle = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const trimmedTitle = title.trim();
      const oldTitle = savedTitle;
      const isTitleChanged = oldTitle && oldTitle !== trimmedTitle;

      const { error } = await supabase.from('quizzes').update({
        title: trimmedTitle
      }).eq('id', quizId);
      if (error) throw error;
      setSavedTitle(trimmedTitle);
      setQuiz(p => ({ ...p, title: trimmedTitle }));
      setEditingTitle(false);
      setShowSuccessUpdateModal(true);

      // Trigger background GitHub rename sync if title changed
      if (isTitleChanged) {
        const sName = quiz?.quiz_sections?.name;
        const cId = quiz?.quiz_sections?.class_id;
        if (sName && cId) {
          syncGithubRenames(cId, sName, sName, oldTitle, trimmedTitle)
            .then(renamedMap => {
              if (renamedMap && Object.keys(renamedMap).length > 0) {
                 updateQuizzesWithNewUrls([{ id: quizId, content: { questions: savedQuestions } }], renamedMap)
                   .then(() => fetchAll()); // Re-fetch to get updated images in UI
              }
            })
            .catch(e => console.error('Failed to sync github assets on title update:', e));
        }
      }

    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuiz = async () => {
    try {
      setSaving(true);
      const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
      if (error) throw error;
      navigate('/catalog');
    } catch (err) {
      alert(`Ошибка удаления: ${err.message}`);
      setSaving(false);
    }
  };

  const handleDeleteResultsAndEdit = async () => {
    if (deleteResultsLock > 0) return;
    try {
      setSaving(true);
      // Delete attempts and results
      await supabase.from('quiz_attempts').delete().eq('quiz_id', quizId);
      await supabase.from('quiz_results').delete().eq('quiz_id', quizId);

      // Re-fetch data to unlock editor
      setShowDeleteResultsModal(false);
      await fetchAll();
      setBlocked(null);
    } catch (err) {
      alert(`Ошибка при сбросе: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelChanges = () => {
    setTitle(savedTitle);
    setQuestions(deepClone(savedQuestions));
    historyRef.current = [];
    setCanUndo(false);
    setShowCancelModal(false);
    setValidErrors([]);
    setShowValidErrors(false);
    setEditQIdx(null); setEditOptKey(null); setEditingTitle(false);
  };

  const downloadJson = () => {
    const data = { title: savedTitle, questions: savedQuestions };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${savedTitle.replace(/[/\\?%*:|"<>]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Question operations
  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return;
    pushHistory(title, questions);
    setQuestions(p => [...p, { question: 'Новый вопрос', options: ['Вариант 1', 'Вариант 2'], correctIndex: null, images: [] }]);
  };

  const deleteQuestion = (idx) => {
    pushHistory(title, questions);
    setQuestions(p => p.filter((_, i) => i !== idx));
    setDeleteQModal(null);
  };

  const updateQText = (idx, text) =>
    setQuestions(p => p.map((q, i) => i === idx ? { ...q, question: text } : q));

  // Option operations
  const addOption = (qIdx) => {
    if (questions[qIdx].options.length >= MAX_OPTIONS) return;
    pushHistory(title, questions);
    setQuestions(p => p.map((q, i) => i === qIdx ? { ...q, options: [...q.options, 'Новый вариант'] } : q));
  };

  const deleteOption = (qIdx, oIdx) => {
    if (questions[qIdx].options.length <= MIN_OPTIONS) return;
    pushHistory(title, questions);
    setQuestions(p => p.map((q, i) => {
      if (i !== qIdx) return q;
      const opts = q.options.filter((_, oi) => oi !== oIdx);
      let ci = q.correctIndex;
      if (ci === oIdx) ci = null;
      else if (ci > oIdx) ci = ci - 1;
      return { ...q, options: opts, correctIndex: ci };
    }));
  };

  const updateOpt = (qIdx, oIdx, text) =>
    setQuestions(p => p.map((q, i) => {
      if (i !== qIdx) return q;
      const opts = [...q.options];
      opts[oIdx] = text;
      return { ...q, options: opts };
    }));

  const setCorrect = (qIdx, oIdx) => {
    pushHistory(title, questions);
    setQuestions(p => p.map((q, i) => i === qIdx ? { ...q, correctIndex: oIdx } : q));
  };

  const addImageUrl = (qIdx, rawUrl) => {
    let url = rawUrl;
    // Auto-convert Google Drive viewing links to direct image links
    if (url.includes('drive.google.com/file/d/')) {
      const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        url = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
      }
    }
    
    pushHistory(title, questions);
    setQuestions(p => p.map((q, i) => {
      if (i !== qIdx) return q;
      const imgs = q.images || [];
      if (imgs.length >= 4) return q;
      return { ...q, images: [...imgs, url] };
    }));
  };

  const removeImage = (qIdx, imgIdx) => {
    pushHistory(title, questions);
    setQuestions(p => p.map((q, i) => {
      if (i !== qIdx) return q;
      const imgs = q.images || [];
      return { ...q, images: imgs.filter((_, idx) => idx !== imgIdx) };
    }));
  };

  const moveImageLeft = (qIdx, imgIdx) => {
    if (imgIdx === 0) return;
    pushHistory(title, questions);
    setQuestions(p => p.map((q, i) => {
      if (i !== qIdx) return q;
      const imgs = [...(q.images || [])];
      [imgs[imgIdx - 1], imgs[imgIdx]] = [imgs[imgIdx], imgs[imgIdx - 1]];
      return { ...q, images: imgs };
    }));
  };

  const moveImageRight = (qIdx, imgIdx) => {
    pushHistory(title, questions);
    setQuestions(p => p.map((q, i) => {
      if (i !== qIdx) return q;
      const imgs = [...(q.images || [])];
      if (imgIdx >= imgs.length - 1) return q;
      [imgs[imgIdx], imgs[imgIdx + 1]] = [imgs[imgIdx + 1], imgs[imgIdx]];
      return { ...q, images: imgs };
    }));
  };

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const max = 1500;
          if (width > height && width > max) { height = Math.round(height *= max / width); width = max; }
          else if (height > width && height > max) { width = Math.round(width *= max / height); height = max; }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');

          const isPng = file.type === 'image/png';
          if (isPng) {
            // Preserve transparency — export as PNG
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/png'));
          } else {
            // For JPEG fill white background (JPEG has no alpha channel)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          }
        };
        img.onerror = (e) => reject(e);
      };
      reader.onerror = (e) => reject(e);
    });
  };

  const handleFileUpload = async () => {
    if (!imageInputModal.file) return;
    setImageInputModal(p => ({ ...p, uploading: true }));
    try {
      const base64Data = await compressImage(imageInputModal.file);
      const uuid = crypto.randomUUID().split('-')[0];
      const classNum = quiz.quiz_sections?.class_id || 'unknown';
      const sectionName = quiz.quiz_sections?.name || 'unknown';
      const quizName = title || 'unknown';
      
      const safeSection = transliterate(sectionName);
      const safeQuiz = transliterate(quizName);
      const isPng = imageInputModal.file.type === 'image/png';
      const ext = isPng ? 'png' : 'jpg';
      const fileName = `${safeSection}-${safeQuiz}-${uuid}.${ext}`;
      const path = `images/${classNum}-class`;

      const res = await fetch('/api/github-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, fileName, path })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');

      addImageUrl(imageInputModal.qIdx, data.url);
      setImageInputModal({ isOpen: false, qIdx: null, mode: 'upload', url: '', file: null, uploading: false });
    } catch (e) {
      alert('Ошибка при загрузке: ' + e.message);
      setImageInputModal(p => ({ ...p, uploading: false }));
    }
  };

  // ─── BLOCKED STATES ───────────────────────────────────────────
  const RedactorSkeleton = () => (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '30px' }}>
        <div className="skeleton" style={{ height: '40px', width: '120px' }} />
        <div className="flex-center" style={{ gap: '10px' }}>
          <div className="skeleton" style={{ height: '40px', width: '150px' }} />
          <div className="skeleton" style={{ height: '40px', width: '150px' }} />
        </div>
      </div>
      <div className="card" style={{ marginBottom: '30px', height: '100px' }}>
        <div className="skeleton" style={{ height: '100%', width: '100%' }} />
      </div>
      <div style={{ display: 'grid', gap: '20px' }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="card" style={{ height: '200px' }}>
            <div className="skeleton" style={{ height: '100%', width: '100%' }} />
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) return <RedactorSkeleton />;
  if (notFound) return <div className="container" style={{ textAlign: 'center', padding: '100px' }}>Тест не найден.</div>;

  if (blocked === 'no_permission') return (
    <div className="container flex-center animate" style={{ flexDirection: 'column', height: '60vh', gap: '20px' }}>
      <div style={iconBoxStyle('#f87171')}><Lock size={36} /></div>
      <h2>Нет доступа</h2>
      <p style={{ opacity: 0.6, textAlign: 'center', maxWidth: '400px' }}>У вас недостаточно прав для редактирования этого теста.</p>
      <button onClick={() => navigate(-1)} className="flex-center" style={ghostBtnStyle}><ChevronLeft size={18} style={{ marginRight: '6px' }} /> Назад</button>
    </div>
  );

  if (blocked === 'has_results') {
    const downloadBlocked = () => {
      const data = { title: quiz?.title, questions: quiz?.content?.questions || [] };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(quiz?.title || 'quiz').replace(/[/\\?%*:|"<>]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const isPrivileged = profile?.role === 'creator' || profile?.role === 'admin';
    const isAuthor = quiz?.author_id === profile?.id;
    const canDelete = isPrivileged || (isAuthor && !hasForeignResults);
    const canEditOnlyTitle = isPrivileged || isAuthor;

    return (
      <>
        <div className="container flex-center animate" style={{ flexDirection: 'column', minHeight: '70vh', gap: '20px', padding: '40px 20px' }}>
          <div style={iconBoxStyle('#f87171')}><AlertTriangle size={36} /></div>
          <h2 style={{ textAlign: 'center' }}>Редактирование ограничено</h2>

          {canEditOnlyTitle && (
            <div className="card" style={{ width: '100%', maxWidth: '600px', padding: '25px', marginBottom: '10px' }}>
              <div style={{ fontSize: '0.75rem', opacity: 0.4, marginBottom: '10px', letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'left' }}>Изменить только заголовок</div>
              <div className="flex-center" style={{ gap: '10px' }}>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Новое название теста..."
                  style={{ fontSize: '1.2rem', fontWeight: '600', flex: 1, padding: '12px 15px' }}
                />
                <button
                  onClick={handleUpdateOnlyTitle}
                  disabled={saving || title === savedTitle}
                  style={{ padding: '12px 20px', background: 'var(--primary-color)', color: 'white', opacity: title === savedTitle ? 0.5 : 1 }}
                >
                  {saving ? '...' : <Check size={20} />}
                </button>
              </div>
              <p style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '10px', textAlign: 'left' }}>
                Вы можете изменить название теста без удаления результатов. Изменение вопросов в этом режиме недоступно.
              </p>
            </div>
          )}

          <p style={{ opacity: 0.6, textAlign: 'center', maxWidth: '520px', lineHeight: '1.7' }}>
            Этот тест был пройден <strong>{resultCount}</strong> раз(а). Чтобы менять структуру вопросов, необходимо
            сначала удалить все результаты через страницу аналитики.<br />
            <span style={{ fontSize: '0.85rem', color: '#f87171' }}>Внимание: удаление результатов очистит историю прохождений.</span>
          </p>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => navigate(-1)} className="flex-center" style={ghostBtnStyle}><ChevronLeft size={18} style={{ marginRight: '6px' }} /> Назад</button>
            <button onClick={downloadBlocked} className="flex-center" style={{ padding: '12px 24px', background: 'rgba(74,222,128,0.1)', color: '#4ade80', boxShadow: 'none' }}>
              <Download size={18} style={{ marginRight: '8px' }} /> Скачать JSON
            </button>
            <button onClick={() => navigate(`/analytics?id=${quizId}`)} className="flex-center" style={{ padding: '12px 24px' }}>
              <BarChart2 size={18} style={{ marginRight: '8px' }} /> Аналитика
            </button>
            {canDelete && (
              <button onClick={() => setShowDeleteModal(true)} className="flex-center" style={{ padding: '12px 24px', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', boxShadow: 'none' }}>
                <Trash2 size={18} style={{ marginRight: '8px' }} /> Удалить тест
              </button>
            )}
            {isPrivileged && (
              <button
                onClick={() => { setDeleteResultsLock(3); setShowDeleteResultsModal(true); }}
                className="flex-center"
                style={{ padding: '12px 24px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px dashed #ef4444' }}
              >
                <RotateCcw size={18} style={{ marginRight: '8px' }} /> Сбросить результаты и редактировать
              </button>
            )}
          </div>
          {!canDelete && isAuthor && (
            <p style={{ fontSize: '0.85rem', color: '#f87171', background: 'rgba(248,113,113,0.05)', padding: '10px 20px', borderRadius: '12px', marginTop: '10px' }}>
              Для удаления теста обратитесь к администратору или создателю платформы (обнаружены результаты учеников).
            </p>
          )}
        </div>
        {renderModals()}
      </>
    );
  }

  const isPrivileged = profile?.role === 'creator' || profile?.role === 'admin';
  const isAuthor = quiz?.author_id === profile?.id;
  const canDelete = isPrivileged || isAuthor;
  const changed = hasChanges();

  function renderModals() {
    return (
      <>
        {/* Delete question modal */}
        {deleteQModal !== null && (
          <div className="modal-overlay" onClick={() => setDeleteQModal(null)}>
            <div className="modal-content animate" style={{ width: '420px' }} onClick={e => e.stopPropagation()}>
              <div className="flex-center" style={{ justifyContent: 'center', width: '55px', height: '55px', background: 'rgba(248,113,113,0.1)', color: '#f87171', borderRadius: '15px', margin: '0 auto 20px' }}><AlertTriangle size={26} /></div>
              <h3 style={{ marginBottom: '10px', textAlign: 'center' }}>Удалить вопрос {deleteQModal + 1}?</h3>
              <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '25px', textAlign: 'center' }}>
                Вопрос содержит {questions[deleteQModal]?.options?.length || 0} вариантов ответа. Они будут удалены вместе с ним.
              </p>
              <div className="grid-2" style={{ gap: '10px' }}>
                <button onClick={() => setDeleteQModal(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
                <button onClick={() => deleteQuestion(deleteQModal)} style={{ background: '#f87171', color: 'white' }}>Удалить</button>
              </div>
            </div>
          </div>
        )}

        {/* Save confirmation modal */}
        {showSaveModal && (
          <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
            <div className="modal-content animate" style={{ width: '420px' }} onClick={e => e.stopPropagation()}>
              <div className="flex-center" style={{ justifyContent: 'center', width: '55px', height: '55px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary-color)', borderRadius: '15px', margin: '0 auto 20px' }}><Check size={26} /></div>
              <h3 style={{ marginBottom: '10px', textAlign: 'center' }}>Сохранить изменения?</h3>
              <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '25px', textAlign: 'center' }}>
                Тест будет обновлён в базе данных и доступен для прохождения в новом виде.
              </p>
              <div className="grid-2" style={{ gap: '10px' }}>
                <button onClick={() => setShowSaveModal(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
                <button onClick={() => handleSave(false)} disabled={saving}>{saving ? 'Сохранение...' : 'Да, сохранить'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Formatting Warning modal */}
        {showFormattingWarning && (
          <div className="modal-overlay" onClick={() => setShowFormattingWarning(false)}>
            <div className="modal-content animate" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
              <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', background: 'rgba(250, 204, 21, 0.1)', color: '#ca8a04', borderRadius: '20px', margin: '0 auto 20px' }}><AlertTriangle size={30} /></div>
              <h3 style={{ marginBottom: '15px', textAlign: 'center' }}>Внимание к форматированию</h3>
              <p style={{ opacity: 0.7, fontSize: '0.95rem', marginBottom: '25px', textAlign: 'center', lineHeight: '1.6' }}>
                Возможно, заголовок введён полностью <strong>БОЛЬШИМИ БУКВАМИ</strong> или содержит тире. <br />
                Напоминаем: при первом выкладывании система попытается нормализовать кавычки и пробелы после параграфа (например, <em>«§ 10.»</em>). Убедитесь, что всё выглядит корректно.
              </p>
              <div className="grid-2" style={{ gap: '12px' }}>
                <button onClick={() => setShowFormattingWarning(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Вернуться к редактуре</button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  style={{ background: 'var(--primary-color)', color: 'white' }}
                >
                  {saving ? 'Сохранение...' : 'Всё равно сохранить'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel confirmation modal */}
        {showCancelModal && (
          <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
            <div className="modal-content animate" style={{ width: '420px' }} onClick={e => e.stopPropagation()}>
              <div className="flex-center" style={{ justifyContent: 'center', width: '55px', height: '55px', background: 'rgba(255,200,0,0.1)', color: '#facc15', borderRadius: '15px', margin: '0 auto 20px' }}><AlertTriangle size={26} /></div>
              <h3 style={{ marginBottom: '10px', textAlign: 'center' }}>Отменить изменения?</h3>
              <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '25px', textAlign: 'center' }}>
                Все несохранённые правки будут потеряны и тест вернётся к последнему сохранённому состоянию.
              </p>
              <div className="grid-2" style={{ gap: '10px' }}>
                <button onClick={() => setShowCancelModal(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Продолжить правку</button>
                <button onClick={handleCancelChanges} style={{ background: '#facc15', color: '#000' }}>Да, отменить</button>
              </div>
            </div>
          </div>
        )}

        {/* DELETE MODAL */}
        {showDeleteModal && (
          <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="modal-content animate" style={{ width: '450px' }} onClick={e => e.stopPropagation()}>
              <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', margin: '0 auto 25px' }}>
                <Trash2 size={32} />
              </div>
              <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Удалить этот тест?</h2>
              <p style={{ opacity: 0.7, marginBottom: '25px', lineHeight: '1.6', textAlign: 'center' }}>
                Вы собираетесь полностью удалить тест <strong>«{title || quiz?.title}»</strong>.<br />
                Это действие необратимо и уничтожит всю статистику.
              </p>
              <div className="grid-2" style={{ gap: '15px' }}>
                <button onClick={() => setShowDeleteModal(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
                <button
                  onClick={handleDeleteQuiz}
                  disabled={saving}
                  style={{ background: '#ef4444', color: 'white' }}
                >
                  {saving ? '...' : 'Да, удалить'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showSuccessUpdateModal && (
          <div className="modal-overlay" onClick={() => setShowSuccessUpdateModal(false)}>
            <div className="modal-content animate" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
              <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', margin: '0 auto 20px' }}>
                <Check size={32} />
              </div>
              <h2 style={{ marginBottom: '10px', textAlign: 'center' }}>Готово!</h2>
              <p style={{ opacity: 0.7, marginBottom: '25px', textAlign: 'center' }}>Название теста успешно обновлено.</p>
              <button onClick={() => setShowSuccessUpdateModal(false)} style={{ width: '100%', background: 'var(--primary-color)', color: 'white' }}>Отлично</button>
            </div>
          </div>
        )}
        {showDeleteResultsModal && (
          <div className="modal-overlay" onClick={() => setShowDeleteResultsModal(false)}>
            <div className="modal-content animate modal-content-danger" onClick={e => e.stopPropagation()} style={{ width: '450px' }}>
              <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', margin: '0 auto 25px' }}>
                <AlertTriangle size={32} />
              </div>
              <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Сбросить всю статистику?</h2>
              <p style={{ opacity: 0.7, marginBottom: '25px', lineHeight: '1.6', textAlign: 'center' }}>
                Это действие <strong>полностью удалит</strong> все результаты и попытки всех учеников по данному тесту.<br />
                Это необходимо для внесения изменений в структуру вопросов.
              </p>
              <div className="grid-2" style={{ gap: '15px' }}>
                <button onClick={() => setShowDeleteResultsModal(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
                <button
                  onClick={handleDeleteResultsAndEdit}
                  disabled={deleteResultsLock > 0 || saving}
                  style={{ background: '#ef4444', color: 'white', opacity: deleteResultsLock > 0 ? 0.5 : 1 }}
                >
                  {deleteResultsLock > 0 ? `Подождите (${deleteResultsLock})` : 'Подтвердить и очистить'}
                </button>
              </div>
            </div>
          </div>
        )}
        {imageInputModal.isOpen && (
          <div className="modal-overlay" onClick={() => setImageInputModal({ isOpen: false, qIdx: null, mode: 'upload', url: '', file: null, uploading: false })}>
            <div className="modal-content animate" style={{ width: '500px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.1)', marginBottom: '20px' }}>
                <button 
                  onClick={() => setImageInputModal(p => ({ ...p, mode: 'upload' }))}
                  style={{ flex: 1, padding: '15px', background: 'transparent', color: imageInputModal.mode === 'upload' ? 'var(--primary-color)' : 'inherit', borderBottom: imageInputModal.mode === 'upload' ? '2px solid var(--primary-color)' : '2px solid transparent', borderRadius: 0, opacity: imageInputModal.mode === 'upload' ? 1 : 0.5 }}
                >
                  <Upload size={18} style={{ marginRight: '8px' }}/> Загрузить файл
                </button>
                <button 
                  onClick={() => setImageInputModal(p => ({ ...p, mode: 'url' }))}
                  style={{ flex: 1, padding: '15px', background: 'transparent', color: imageInputModal.mode === 'url' ? 'var(--primary-color)' : 'inherit', borderBottom: imageInputModal.mode === 'url' ? '2px solid var(--primary-color)' : '2px solid transparent', borderRadius: 0, opacity: imageInputModal.mode === 'url' ? 1 : 0.5 }}
                >
                  <Link size={18} style={{ marginRight: '8px' }}/> По ссылке
                </button>
              </div>

              {imageInputModal.mode === 'url' ? (
                <>
                  <p style={{ opacity: 0.7, fontSize: '0.9rem', marginBottom: '20px', textAlign: 'center' }}>
                    Укажите прямую ссылку (URL) на картинку. Она будет привязана к выбранному вопросу.
                  </p>
                  <input 
                    type="url" 
                    placeholder="https://example.com/image.jpg"
                    value={imageInputModal.url}
                    onChange={e => setImageInputModal(p => ({ ...p, url: e.target.value }))}
                    style={{ width: '100%', padding: '12px 15px', marginBottom: '20px', fontSize: '1rem' }}
                    autoFocus
                  />
                </>
              ) : (
                <>
                  <p style={{ opacity: 0.7, fontSize: '0.9rem', marginBottom: '20px', textAlign: 'center' }}>
                    Выберите файл для загрузки в облако.
                  </p>
                  <div 
                    style={{ border: '2px dashed rgba(0,0,0,0.2)', borderRadius: '15px', padding: '40px 20px', textAlign: 'center', marginBottom: '20px', background: 'rgba(0,0,0,0.02)', position: 'relative' }}
                  >
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={e => { if (e.target.files && e.target.files[0]) setImageInputModal(p => ({...p, file: e.target.files[0]})); }}
                      style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                    />
                    <Upload size={32} style={{ opacity: 0.5, marginBottom: '10px' }} />
                    <div style={{ fontWeight: 'bold' }}>{imageInputModal.file ? imageInputModal.file.name : 'Нажмите или перетащите файл'}</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '5px' }}>JPG, PNG, WEBP (до 5 МБ)</div>
                  </div>
                </>
              )}

              <div className="grid-2" style={{ gap: '15px' }}>
                <button onClick={() => setImageInputModal({ isOpen: false, qIdx: null, mode: 'upload', url: '', file: null, uploading: false })} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
                
                {imageInputModal.mode === 'url' ? (
                  <button 
                    onClick={() => {
                      if (imageInputModal.url.trim()) {
                        addImageUrl(imageInputModal.qIdx, imageInputModal.url.trim());
                        setImageInputModal({ isOpen: false, qIdx: null, mode: 'upload', url: '', file: null, uploading: false });
                      }
                    }}
                    disabled={!imageInputModal.url.trim()}
                    style={{ background: 'var(--primary-color)', color: 'white', opacity: !imageInputModal.url.trim() ? 0.5 : 1 }}
                  >
                    Добавить по URL
                  </button>
                ) : (
                  <button 
                    onClick={handleFileUpload}
                    disabled={!imageInputModal.file || imageInputModal.uploading}
                    style={{ background: 'var(--primary-color)', color: 'white', opacity: (!imageInputModal.file || imageInputModal.uploading) ? 0.5 : 1 }}
                  >
                    {imageInputModal.uploading ? 'Загрузка...' : 'Загрузить файл'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {imagePreviewModal.isOpen && (
          <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }} onClick={() => setImagePreviewModal({ isOpen: false, url: '', qIdx: null, imgIdx: null })}>
            <div className="animate" style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
              <button 
                onClick={() => setImagePreviewModal({ isOpen: false, url: '', qIdx: null, imgIdx: null })}
                style={{ position: 'absolute', top: '-40px', right: '-40px', background: 'rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '50%', boxShadow: 'none' }}
              >
                <X size={24} />
              </button>
              <img src={imagePreviewModal.url} alt="Preview" style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '12px', border: '2px solid rgba(255,255,255,0.1)' }} />
              {imagePreviewModal.qIdx !== null && (
                <div style={{ position: 'absolute', bottom: '-40px', left: '0', width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
                  Вопрос {imagePreviewModal.qIdx + 1} • Изображение {imagePreviewModal.imgIdx + 1}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  // ─── MAIN EDITOR ──────────────────────────────────────────────
  return (
    <>
      <div className="container animate" style={{ padding: '40px 20px', paddingBottom: changed ? '130px' : '60px' }}>
        {/* Header */}
        <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '30px', flexWrap: 'wrap', gap: '12px' }}>
          <button onClick={() => changed ? setShowCancelModal(true) : navigate(-1)} className="flex-center" style={ghostBtnStyle}>
            <ChevronLeft size={20} /> Назад
          </button>
          <div className="flex-center" style={{ gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={undo} disabled={!canUndo} title="Отменить последнее действие" className="flex-center"
              style={{ padding: '10px', background: canUndo ? 'rgba(99,102,241,0.1)' : 'rgba(0,0,0,0.05)', color: canUndo ? 'var(--primary-color)' : 'inherit', opacity: canUndo ? 1 : 0.4, boxShadow: 'none', borderRadius: '12px' }}>
              <RotateCcw size={20} />
            </button>
            <button onClick={downloadJson} disabled={changed} title={changed ? 'Сначала сохраните изменения' : 'Скачать JSON'} className="flex-center"
              style={{ padding: '10px 18px', background: 'rgba(74,222,128,0.1)', color: '#4ade80', boxShadow: 'none', opacity: changed ? 0.4 : 1, borderRadius: '12px', fontSize: '0.9rem' }}>
              <Download size={16} style={{ marginRight: '6px' }} /> JSON
            </button>
            <button onClick={() => navigate(`/analytics?id=${quizId}`)} className="flex-center" style={{ ...ghostBtnStyle, padding: '10px 18px' }}>
              <BarChart2 size={16} style={{ marginRight: '6px' }} /> Аналитика
            </button>
            <button
              onClick={() => setIsHidden(!isHidden)}
              className="flex-center"
              title={isHidden ? "Показать ученикам" : "Скрыть от учеников"}
              style={{
                padding: '10px 18px',
                background: isHidden ? 'rgba(0,0,0,0.05)' : 'rgba(99,102,241,0.1)',
                color: isHidden ? 'inherit' : 'var(--primary-color)',
                boxShadow: 'none',
                borderRadius: '12px',
                fontSize: '0.9rem',
                opacity: isHidden ? 0.6 : 1
              }}
            >
              {isHidden ? <EyeOff size={16} style={{ marginRight: '6px' }} /> : <Eye size={16} style={{ marginRight: '6px' }} />}
              {isHidden ? 'Скрыт' : 'Виден'}
            </button>
            {canDelete && (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex-center"
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  color: '#ef4444',
                  boxShadow: 'none',
                  padding: '10px',
                  borderRadius: '12px'
                }}
                title="Удалить тест"
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Quiz title */}
        <div className="card" style={{ marginBottom: '25px', padding: '25px 30px' }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.4, marginBottom: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>Заголовок теста</div>
          {editingTitle ? (
            <div className="flex-center" style={{ gap: '10px' }}>
              <input
                id="quiz-title-edit"
                name="quiz-title"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
                style={{ fontSize: '1.5rem', fontWeight: '700', flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter') setEditingTitle(false); }}
              />
              <button onClick={() => setEditingTitle(false)} style={{ padding: '8px', background: 'var(--primary-color)', color: 'white', borderRadius: '10px', boxShadow: 'none' }}><Check size={20} /></button>
            </div>
          ) : (
            <div className="flex-center" style={{ gap: '15px', justifyContent: 'flex-start' }}>
              <h2 style={{ fontSize: '1.8rem', margin: 0, fontWeight: '700', flex: 1, lineHeight: '1.3' }}>
                {title || <span style={{ opacity: 0.3 }}>Без названия</span>}
              </h2>
              <button onClick={() => { pushHistory(title, questions); setEditingTitle(true); }}
                style={{ padding: '8px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary-color)', borderRadius: '10px', boxShadow: 'none', flexShrink: 0 }}>
                <Pencil size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Stats + validation summary */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '25px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={statPillStyle}>{questions.length} / {MAX_QUESTIONS} вопросов</div>
          {showValidErrors && validErrors.length > 0 && (
            <div style={{ ...statPillStyle, background: 'rgba(248,113,113,0.1)', color: '#f87171', cursor: 'pointer' }}
              onClick={() => setShowValidErrors(false)}>
              <AlertCircle size={14} style={{ marginRight: '5px' }} /> {validErrors.length} ошибок — нельзя сохранить &nbsp;×
            </div>
          )}
        </div>

        {/* Validation errors detail */}
        {showValidErrors && validErrors.length > 0 && (
          <div className="card animate" style={{ marginBottom: '25px', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.25)', padding: '20px' }}>
            <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
              <div className="flex-center" style={{ gap: '8px', color: '#f87171' }}><AlertCircle size={18} /><strong>Ошибки</strong></div>
              <button onClick={() => setShowValidErrors(false)} style={{ padding: '4px', background: 'transparent', boxShadow: 'none', color: '#f87171' }}><X size={16} /></button>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {validErrors.map((e, i) => <li key={i} style={{ fontSize: '0.88rem', opacity: 0.85 }}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* Questions list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {questions.map((q, qIdx) => (
            <div key={qIdx} className="card animate" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)' }}>
              {/* Question header */}
              <div style={{ padding: '20px 25px', background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <div className="flex-center" style={{ gap: '10px', justifyContent: 'space-between' }}>
                  <div className="flex-center" style={{ gap: '10px', flex: 1, minWidth: 0 }}>
                    <span style={{ background: 'var(--primary-color)', color: 'white', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: '700', flexShrink: 0 }}>{qIdx + 1}</span>
                    {editQIdx === qIdx ? (
                      <div className="flex-center" style={{ gap: '8px', flex: 1 }}>
                        <input
                          id={`q-text-${qIdx}`}
                          name={`question-${qIdx}`}
                          type="text"
                          value={q.question}
                          autoFocus
                          onChange={e => updateQText(qIdx, e.target.value)}
                          style={{ flex: 1, fontWeight: '600', fontSize: '1rem' }}
                          onKeyDown={e => { if (e.key === 'Enter') setEditQIdx(null); }}
                          onBlur={() => setEditQIdx(null)}
                        />
                        <button onClick={() => setEditQIdx(null)} style={{ padding: '6px', background: 'var(--primary-color)', color: 'white', borderRadius: '8px', boxShadow: 'none', flexShrink: 0 }}><Check size={16} /></button>
                      </div>
                    ) : (
                      <span style={{ fontWeight: '600', fontSize: '1rem', flex: 1 }}>{q.question || <span style={{ opacity: 0.3 }}>Текст вопроса...</span>}</span>
                    )}
                  </div>
                  <div className="flex-center" style={{ gap: '6px', flexShrink: 0 }}>
                    {editQIdx !== qIdx && (
                      <button onClick={() => { pushHistory(title, questions); setEditQIdx(qIdx); }}
                        style={{ padding: '7px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}>
                        <Pencil size={15} />
                      </button>
                    )}
                    <button onClick={() => { if (q.options?.length >= 1) setDeleteQModal(qIdx); else deleteQuestion(qIdx); }}
                      style={{ padding: '7px', background: 'rgba(255,0,0,0.07)', color: '#f87171', borderRadius: '8px', boxShadow: 'none' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.4, marginTop: '8px', marginLeft: '38px' }}>
                  {q.options?.length || 0} вариантов · {q.options?.length >= MAX_OPTIONS ? 'лимит вариантов' : `ещё ${MAX_OPTIONS - (q.options?.length || 0)}`}
                </div>
              </div>

              {/* Options */}
              <div style={{ padding: '15px 25px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(q.options || []).map((opt, oIdx) => {
                  const isCorrect = q.correctIndex === oIdx;
                  const key = `${qIdx}-${oIdx}`;
                  return (
                    <div key={oIdx} className="flex-center" style={{ gap: '10px' }}>
                      {/* Correct answer radio */}
                      <button
                        onClick={() => setCorrect(qIdx, oIdx)}
                        title={isCorrect ? 'Верный ответ' : 'Сделать верным'}
                        style={{
                          width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, padding: 0, boxShadow: 'none',
                          background: isCorrect ? 'var(--primary-color)' : 'transparent',
                          border: `2px solid ${isCorrect ? 'var(--primary-color)' : 'rgba(0,0,0,0.2)'}`,
                          transition: 'all 0.2s'
                        }}>
                        {isCorrect && <Check size={13} color="white" />}
                      </button>

                      {/* Option text */}
                      <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 14px', borderRadius: '12px', border: `2px solid ${isCorrect ? 'rgba(99,102,241,0.25)' : 'rgba(0,0,0,0.06)'}`,
                        background: isCorrect ? 'rgba(99,102,241,0.04)' : 'var(--card-bg)', transition: 'all 0.2s'
                      }}>
                        {editOptKey === key ? (
                          <input
                            id={`q-${qIdx}-opt-${oIdx}`}
                            name={`option-${qIdx}-${oIdx}`}
                            type="text"
                            value={opt}
                            autoFocus
                            onChange={e => updateOpt(qIdx, oIdx, e.target.value)}
                            onBlur={() => setEditOptKey(null)}
                            onKeyDown={e => { if (e.key === 'Enter') setEditOptKey(null); }}
                            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.95rem', color: 'var(--text-color)' }}
                          />
                        ) : (
                          <span style={{ flex: 1, fontSize: '0.95rem' }}>{opt || <span style={{ opacity: 0.3 }}>Текст варианта...</span>}</span>
                        )}
                      </div>

                      {/* Edit + delete option buttons */}
                      {editOptKey !== key && (
                        <button onClick={() => { pushHistory(title, questions); setEditOptKey(key); }}
                          style={{ padding: '7px', background: 'rgba(99,102,241,0.08)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none', flexShrink: 0 }}>
                          <Pencil size={14} />
                        </button>
                      )}
                      {q.options.length > MIN_OPTIONS && (
                        <button onClick={() => deleteOption(qIdx, oIdx)}
                          style={{ padding: '7px', background: 'rgba(255,0,0,0.06)', color: '#f87171', borderRadius: '8px', boxShadow: 'none', flexShrink: 0 }}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Add option */}
                {(q.options?.length || 0) < MAX_OPTIONS && (
                  <button onClick={() => addOption(qIdx)} className="flex-center"
                    style={{ padding: '10px', background: 'rgba(99,102,241,0.04)', color: 'var(--primary-color)', border: '1.5px dashed rgba(99,102,241,0.3)', borderRadius: '12px', boxShadow: 'none', width: '100%', fontSize: '0.88rem', gap: '6px', marginTop: '4px' }}>
                    <Plus size={15} /> Добавить вариант
                  </button>
                )}
                
                {/* Images Section */}
                <div style={{ marginTop: '10px', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '15px' }}>
                  <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.85rem', opacity: 0.6, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>Изображения ({(q.images || []).length}/4)</span>
                    {(q.images || []).length < 4 && (
                      <button 
                        onClick={() => setImageInputModal({ isOpen: true, qIdx, url: '' })}
                        className="flex-center" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(99,102,241,0.08)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}
                      >
                        <ImageIcon size={14} style={{ marginRight: '6px' }} /> Добавить по ссылке
                      </button>
                    )}
                  </div>
                  
                  {q.images && q.images.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px' }}>
                      {q.images.map((imgUrl, imgIdx) => (
                        <div key={imgIdx} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)', height: '100px', cursor: 'pointer', group: 'img-group' }}
                             onClick={() => setImagePreviewModal({ isOpen: true, url: imgUrl, qIdx, imgIdx })}>
                          <img src={imgUrl} alt={`Q${qIdx} / Img${imgIdx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button 
                            onClick={(e) => { e.stopPropagation(); removeImage(qIdx, imgIdx); }}
                            className="flex-center animate-fade-in"
                            style={{ position: 'absolute', top: '4px', right: '4px', width: '24px', height: '24px', padding: 0, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.8)', color: 'white', border: 'none', zIndex: 2 }}
                            title="Удалить"
                          >
                            <X size={14} />
                          </button>
                          
                          {/* Image controls overlay */}
                          <div style={{ position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '4px', zIndex: 2 }}>
                            {imgIdx > 0 && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); moveImageLeft(qIdx, imgIdx); }}
                                className="flex-center"
                                style={{ width: '24px', height: '24px', padding: 0, borderRadius: '6px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none' }}
                                title="Влево"
                              >
                                <ChevronLeft size={14} />
                              </button>
                            )}
                            {imgIdx < (q.images.length - 1) && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); moveImageRight(qIdx, imgIdx); }}
                                className="flex-center"
                                style={{ width: '24px', height: '24px', padding: 0, borderRadius: '6px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none' }}
                                title="Вправо"
                              >
                                <ChevronRight size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Add question */}
          {questions.length < MAX_QUESTIONS ? (
            <button onClick={addQuestion} className="flex-center"
              style={{ padding: '18px', background: 'rgba(99,102,241,0.04)', color: 'var(--primary-color)', border: '2px dashed rgba(99,102,241,0.25)', borderRadius: '18px', boxShadow: 'none', width: '100%', fontSize: '1rem', gap: '8px', fontWeight: '600' }}>
              <Plus size={20} /> Добавить вопрос
            </button>
          ) : (
            <div style={{ padding: '18px', textAlign: 'center', opacity: 0.4, fontSize: '0.9rem', border: '2px dashed rgba(0,0,0,0.1)', borderRadius: '18px' }}>
              Достигнут лимит в {MAX_QUESTIONS} вопросов
            </div>
          )}
        </div>
      </div>

      {/* ─── Unsaved changes bar ─── */}
      {hasChanges() && (
        <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: 'var(--card-bg)', padding: '15px 25px', borderRadius: '50px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 2000, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontWeight: '500', fontSize: '0.95rem' }}>⚠ Есть несохранённые изменения</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setShowCancelModal(true)}
              style={{ background: 'rgba(0,0,0,0.06)', color: 'inherit', padding: '9px 18px', borderRadius: '30px', boxShadow: 'none', fontSize: '0.9rem' }}>
              Отменить
            </button>
            <button onClick={() => { if (validate()) setShowSaveModal(true); else setShowValidErrors(true); }}
              style={{ padding: '9px 22px', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '600' }}>
              Сохранить
            </button>
          </div>
        </div>
      )}

      {renderModals()}
    </>
  );
};

// ─── Helpers ──────────────────────────────────────────────────
const iconBoxStyle = (color) => ({
  width: '70px', height: '70px', borderRadius: '20px',
  background: `${color}18`, color,
  display: 'flex', alignItems: 'center', justifyContent: 'center'
});
const ghostBtnStyle = {
  background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none', padding: '10px 20px'
};
const statPillStyle = {
  padding: '8px 18px', background: 'var(--card-bg)', borderRadius: '30px',
  fontSize: '0.85rem', fontWeight: '500', border: '1px solid rgba(0,0,0,0.06)',
  display: 'flex', alignItems: 'center'
};

export default QuizRedactor;
