import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  ChevronLeft, Pencil, Check, X, Plus, Trash2, RotateCcw,
  AlertTriangle, Download, AlertCircle, Lock, BarChart2,
  GripVertical
} from 'lucide-react';

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

  // Editing state
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState([]);
  const [savedTitle, setSavedTitle] = useState('');
  const [savedQuestions, setSavedQuestions] = useState([]);

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
  const [deleteQModal, setDeleteQModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [validErrors, setValidErrors] = useState([]);
  const [showValidErrors, setShowValidErrors] = useState(false);

  useEffect(() => { if (quizId) fetchAll(); }, [quizId]);

  const fetchAll = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/auth'); return; }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setProfile(p);

    const { data: q } = await supabase
      .from('quizzes')
      .select('*, profiles!quizzes_author_id_fkey(role)')
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

    const { count } = await supabase
      .from('quiz_results')
      .select('*', { count: 'exact', head: true })
      .eq('quiz_id', quizId);

    if (count > 0) { setBlocked('has_results'); setResultCount(count); setLoading(false); return; }

    const qs = deepClone(q.content?.questions || []);
    setTitle(q.title);
    setQuestions(qs);
    setSavedTitle(q.title);
    setSavedQuestions(deepClone(qs));
    historyRef.current = [];
    setCanUndo(false);
    setLoading(false);
  };

  const hasChanges = () =>
    title !== savedTitle || JSON.stringify(questions) !== JSON.stringify(savedQuestions);

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

  const handleSave = async () => {
    if (!validate()) { setShowValidErrors(true); setShowSaveModal(false); return; }
    setSaving(true);
    const trimmedTitle = title.trim();
    const { error } = await supabase.from('quizzes').update({
      title: trimmedTitle,
      content: { questions }
    }).eq('id', quizId);

    if (error) { alert('Ошибка: ' + error.message); setSaving(false); setShowSaveModal(false); return; }
    setSavedTitle(trimmedTitle);
    setTitle(trimmedTitle);
    setSavedQuestions(deepClone(questions));
    historyRef.current = [];
    setCanUndo(false);
    setSaving(false);
    setShowSaveModal(false);
    setShowValidErrors(false);
    setValidErrors([]);
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
    setQuestions(p => [...p, { question: 'Новый вопрос', options: ['Вариант 1', 'Вариант 2'], correctIndex: null }]);
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

  // ─── BLOCKED STATES ───────────────────────────────────────────
  if (loading) return <div className="flex-center" style={{ height: '60vh' }}>Загрузка редактора...</div>;
  if (notFound) return <div className="container" style={{ textAlign: 'center', padding: '100px' }}>Тест не найден.</div>;

  if (blocked === 'no_permission') return (
    <div className="container flex-center animate" style={{ flexDirection: 'column', height: '60vh', gap: '20px' }}>
      <div style={iconBoxStyle('#f87171')}><Lock size={36} /></div>
      <h2>Нет доступа</h2>
      <p style={{ opacity: 0.6, textAlign: 'center', maxWidth: '400px' }}>У вас недостаточно прав для редактирования этого теста.</p>
      <button onClick={() => navigate(-1)} className="flex-center" style={ghostBtnStyle}><ChevronLeft size={18} style={{ marginRight: '6px' }} /> Назад</button>
    </div>
  );

  if (blocked === 'has_results') return (
    <div className="container flex-center animate" style={{ flexDirection: 'column', height: '70vh', gap: '20px' }}>
      <div style={iconBoxStyle('#f87171')}><AlertTriangle size={36} /></div>
      <h2>Редактирование невозможно</h2>
      <p style={{ opacity: 0.6, textAlign: 'center', maxWidth: '520px', lineHeight: '1.7' }}>
        Этот тест был пройден <strong>{resultCount}</strong> раз(а). Чтобы редактировать его, необходимо
        сначала удалить все результаты через страницу аналитики.<br />
        <span style={{ fontSize: '0.85rem', color: '#f87171' }}>Удаление результатов уберёт их из статистики учеников.</span>
      </p>
      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={() => navigate(-1)} className="flex-center" style={ghostBtnStyle}><ChevronLeft size={18} style={{ marginRight: '6px' }} /> Назад</button>
        <button onClick={() => navigate(`/analytics?id=${quizId}`)} className="flex-center" style={{ padding: '12px 24px' }}>
          <BarChart2 size={18} style={{ marginRight: '8px' }} /> Перейти к аналитике
        </button>
      </div>
    </div>
  );

  const changed = hasChanges();

  // ─── MAIN EDITOR ──────────────────────────────────────────────
  return (
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
        </div>
      </div>

      {/* Quiz title */}
      <div className="card" style={{ marginBottom: '25px', padding: '25px 30px' }}>
        <div style={{ fontSize: '0.75rem', opacity: 0.4, marginBottom: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>Заголовок теста</div>
        {editingTitle ? (
          <div className="flex-center" style={{ gap: '10px' }}>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus
              style={{ fontSize: '1.5rem', fontWeight: '700', flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') setEditingTitle(false); }} />
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
                      <input type="text" value={q.question} autoFocus
                        onChange={e => updateQText(qIdx, e.target.value)}
                        style={{ flex: 1, fontWeight: '600', fontSize: '1rem' }}
                        onKeyDown={e => { if (e.key === 'Enter') setEditQIdx(null); }}
                        onBlur={() => setEditQIdx(null)} />
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
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '10px 14px', borderRadius: '12px', border: `2px solid ${isCorrect ? 'rgba(99,102,241,0.25)' : 'rgba(0,0,0,0.06)'}`,
                      background: isCorrect ? 'rgba(99,102,241,0.04)' : 'var(--card-bg)', transition: 'all 0.2s' }}>
                      {editOptKey === key ? (
                        <input type="text" value={opt} autoFocus
                          onChange={e => updateOpt(qIdx, oIdx, e.target.value)}
                          onBlur={() => setEditOptKey(null)}
                          onKeyDown={e => { if (e.key === 'Enter') setEditOptKey(null); }}
                          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.95rem', color: 'var(--text-color)' }} />
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

      {/* ─── Unsaved changes bar ─── */}
      {changed && (
        <div className="animate" style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--card-bg)', padding: '15px 25px', borderRadius: '50px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 1000, flexWrap: 'wrap', justifyContent: 'center' }}>
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

      {/* ─── MODALS ─── */}

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
              <button onClick={handleSave} disabled={saving}>{saving ? 'Сохранение...' : 'Да, сохранить'}</button>
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
    </div>
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
