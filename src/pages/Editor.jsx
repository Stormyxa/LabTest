import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useScrollRestoration } from '../lib/useScrollRestoration';
import {
  Plus, Trash2, FileJson, AlertCircle, TrendingUp,
  CheckCircle, Check, Copy, X, AlertTriangle,
  ChevronUp, ChevronDown, Save, Book, Link as LinkIcon,
  Pencil, Eye, EyeOff, Shield, Clock, Lock
} from 'lucide-react';
import { syncGithubRenames, updateQuizzesWithNewUrls } from '../lib/githubSync';
import { fetchWithCache, useCacheSync } from '../lib/cache';

const EditorSkeleton = () => (
  <div style={{ width: '100%', padding: '20px' }}>
    <div className="flex-center" style={{ marginBottom: '30px', opacity: 0.5, gap: '10px', justifyContent: 'flex-start' }}>
      <Clock size={20} className="spinner" />
      <span style={{ fontSize: '0.9rem', opacity: 0.6 }}>Загрузка структуры редактора...</span>
    </div>
    <div className="grid-2" style={{ gap: '30px' }}>
      <div className="card" style={{ padding: '30px' }}>
        <div className="skeleton" style={{ height: '30px', width: '40%', marginBottom: '25px', borderRadius: '10px' }}></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div className="skeleton" style={{ height: '14px', width: '30%', marginBottom: '8px' }}></div>
            <div className="skeleton" style={{ height: '80px', width: '100%', borderRadius: '12px' }}></div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="skeleton" style={{ height: '45px', flex: 1, borderRadius: '10px' }}></div>
            <div className="skeleton" style={{ height: '45px', flex: 1, borderRadius: '10px' }}></div>
          </div>
          <div>
            <div className="skeleton" style={{ height: '14px', width: '40%', marginBottom: '8px' }}></div>
            <div className="skeleton" style={{ height: '150px', width: '100%', borderRadius: '15px' }}></div>
          </div>
          <div className="skeleton" style={{ height: '50px', width: '100%', borderRadius: '12px' }}></div>
        </div>
      </div>
      <div className="card" style={{ padding: '30px' }}>
        <div className="flex-center" style={{ gap: '10px', marginBottom: '25px', justifyContent: 'flex-start' }}>
          <div className="skeleton" style={{ height: '32px', width: '32px', borderRadius: '10px' }}></div>
          <div className="skeleton" style={{ height: '24px', width: '60%', borderRadius: '8px' }}></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: '100px', width: '100%', borderRadius: '18px' }}></div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// Lazy component for section quizzes in Editor
const EditorSectionQuizzes = ({
  section,
  profile,
  session,
  showHidden,
  setDeleteId,
  setRenamingItem,
  setNewName,
  toggleHideQuiz,
  swapQuizzes,
  handleCreateDivider,
  navigate
}) => {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(false);

  const cacheKey = `editor_quizzes_${section.id}_${showHidden ? 'hidden' : 'visible'}`;

  const fetchQuizzes = async () => {
    setLoading(true);
    try {
      const data = await fetchWithCache(cacheKey, async () => {
        let query = supabase.from('quizzes').select('*, quiz_sections(name, class_id, book_url), profiles(role, first_name, last_name)');

        if (profile?.role === 'editor' || profile?.role === 'teacher') {
          query = query.eq('author_id', session.user.id);
        } else if (!showHidden) {
          query = query.eq('is_hidden', false);
        }

        const { data: q } = await query
          .eq('section_id', section.id)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false });

        if (!q) return [];

        const allQuizIds = q.map(quiz => quiz.id);
        let statsMap = {};
        if (allQuizIds.length > 0) {
          const { data: statsData } = await supabase.rpc('get_quiz_stats_batch', { p_quiz_ids: allQuizIds });
          if (statsData) statsData.forEach(stat => { statsMap[stat.quiz_id] = { avgScore: stat.avg_score, participants: stat.participants }; });
        }

        let foreignResultsSet = new Set();
        if (allQuizIds.length > 0) {
          const { data: allResults } = await supabase.from('quiz_results').select('quiz_id, user_id').in('quiz_id', allQuizIds);
          if (allResults) q.forEach(quiz => { if (allResults.some(r => r.quiz_id === quiz.id && r.user_id !== quiz.author_id)) foreignResultsSet.add(quiz.id); });
        }

        return q.map(quiz => ({
          ...quiz,
          avgScore: statsMap[quiz.id]?.avgScore || 0,
          participants: statsMap[quiz.id]?.participants || 0,
          hasForeignResults: foreignResultsSet.has(quiz.id)
        }));
      });
      setQuizzes(data || []);
    } catch (err) {
      console.error('Section quizzes fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizzes();
  }, [section.id, showHidden]);

  useCacheSync(cacheKey, setQuizzes);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <Clock size={20} className="spinner" style={{ opacity: 0.3 }} />
      </div>
    );
  }

  if (quizzes.length === 0) {
    return (
      <div className="animate">
        {(profile?.role === 'admin' || profile?.role === 'creator' || profile?.id === section.author_id) && (
          <button onClick={() => handleCreateDivider(section.id)} style={{ width: '100%', padding: '10px', marginBottom: '20px', background: 'rgba(99, 102, 241, 0.05)', color: 'var(--primary-color)', border: '1px dashed rgba(99, 102, 241, 0.2)', boxShadow: 'none', fontWeight: 'bold', fontSize: '0.9rem' }}><Plus size={16} /> Добавить разделитель</button>
        )}
        <p style={{ opacity: 0.5, textAlign: 'center', margin: '20px 0' }}>Здесь пока пусто.</p>
      </div>
    );
  }

  return (
    <div className="animate">
      {(profile?.role === 'admin' || profile?.role === 'creator' || profile?.id === section.author_id) && (
        <button onClick={() => handleCreateDivider(section.id)} style={{ width: '100%', padding: '10px', marginBottom: '20px', background: 'rgba(99, 102, 241, 0.05)', color: 'var(--primary-color)', border: '1px dashed rgba(99, 102, 241, 0.2)', boxShadow: 'none', fontWeight: 'bold', fontSize: '0.9rem' }}><Plus size={16} /> Добавить разделитель</button>
      )}
      <div className="grid-2" style={{ gap: '15px' }}>
        {quizzes.map((quiz, qIndex) => {
          if (quiz.content?.is_divider) {
            return (
              <div key={quiz.id} className="grid-full" style={{
                gridColumn: '1 / -1',
                margin: '10px 0',
                padding: '15px 20px',
                background: 'rgba(99, 102, 241, 0.05)',
                border: '1px dashed rgba(99, 102, 241, 0.3)',
                borderRadius: '15px',
                display: 'flex',
                alignItems: 'center',
                gap: '15px'
              }}>
                <div className="flex-center" style={{ flexDirection: 'column', gap: '5px' }}>
                  <button onClick={() => swapQuizzes(section.id, qIndex, -1, quiz, quizzes, setQuizzes)} disabled={qIndex === 0} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronUp size={16} /></button>
                  <button onClick={() => swapQuizzes(section.id, qIndex, 1, quiz, quizzes, setQuizzes)} disabled={qIndex === quizzes.length - 1} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronDown size={16} /></button>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ height: '1px', background: 'rgba(99, 102, 241, 0.2)', flex: 1 }} />
                  <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                    {quiz.content.divider_text || 'Разделительная линия'}
                  </span>
                  <div style={{ height: '1px', background: 'rgba(99, 102, 241, 0.2)', flex: 1 }} />
                </div>
                <div className="flex-center" style={{ gap: '8px' }}>
                  <button onClick={() => { setRenamingItem({ id: quiz.id, name: quiz.title, type: 'quiz' }); setNewName(quiz.title); }} style={{ background: 'transparent', color: 'var(--primary-color)', opacity: 0.6, boxShadow: 'none', padding: '5px' }}><Pencil size={16} /></button>
                  <button onClick={() => toggleHideQuiz(quiz)} style={{ background: 'transparent', color: quiz.is_hidden ? '#ca8a04' : 'inherit', opacity: 0.6, boxShadow: 'none', padding: '5px' }}>{quiz.is_hidden ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                  {(profile?.role === 'creator' || profile?.role === 'admin' || (quiz.author_id === profile?.id && !quiz.hasForeignResults)) ? (
                    <button onClick={() => setDeleteId(quiz.id)} style={{ background: 'transparent', color: 'red', opacity: 0.6, boxShadow: 'none', padding: '5px' }}><Trash2 size={16} /></button>
                  ) : (
                    quiz.author_id === profile?.id && (
                      <div style={{ color: '#f87171', opacity: 0.6 }} title="Удаление ограничено: есть результаты других учеников. Обратитесь к админу.">
                        <Lock size={14} />
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={quiz.id} className="card" style={{
              padding: '20px',
              background: 'var(--card-bg)',
              border: quiz.is_hidden ? '1px dashed #ca8a04' : '1px solid rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'column',
              height: '100%'
            }}>
              <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px', gap: '10px' }}>
                <div className="flex-center" style={{ gap: '10px', flex: 1, minWidth: 0 }}>
                  {(profile?.role === 'creator' || profile?.role === 'admin' || quiz.author_id === profile?.id) && (
                    <div className="flex-center" style={{ flexDirection: 'column', gap: '5px' }}>
                      <button onClick={() => swapQuizzes(section.id, qIndex, -1, quiz, quizzes, setQuizzes)} disabled={qIndex === 0} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronUp size={18} /></button>
                      <button onClick={() => swapQuizzes(section.id, qIndex, 1, quiz, quizzes, setQuizzes)} disabled={qIndex === quizzes.length - 1} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronDown size={18} /></button>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ fontSize: '1.1rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: quiz.is_hidden ? 0.6 : 1 }}>{quiz.title}</h4>
                    <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', opacity: 0.5 }}>
                      <span>{new Date(quiz.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {quiz.is_verified && <CheckCircle size={18} color="var(--primary-color)" title="Верифицирован" />}
                </div>
                <div className="flex-center" style={{ gap: '10px' }}>
                  <button onClick={() => toggleHideQuiz(quiz)} style={{ background: 'transparent', color: quiz.is_hidden ? '#ca8a04' : 'inherit', opacity: 0.5, boxShadow: 'none', padding: '5px' }} title={quiz.is_hidden ? 'Скрыт' : 'Виден всем'}>{quiz.is_hidden ? <Shield size={18} /> : <Eye size={18} />}</button>
                  {(profile?.role === 'creator' || (profile?.role === 'admin' && quiz.profiles?.role !== 'creator') || (quiz.author_id === profile?.id && !quiz.hasForeignResults)) ? (
                    <button onClick={() => setDeleteId(quiz.id)} style={{ background: 'transparent', color: 'red', opacity: 0.5, boxShadow: 'none', padding: '5px' }} title="Удалить тест"><Trash2 size={18} /></button>
                  ) : (
                    quiz.author_id === profile?.id && (
                      <div className="flex-center" style={{ padding: '8px', background: 'rgba(248,113,113,0.05)', color: '#f87171', borderRadius: '10px' }} title="Удаление ограничено: есть результаты других учеников. Обратитесь к админу.">
                        <Lock size={18} />
                      </div>
                    )
                  )}
                </div>
              </div>
              <div className="flex-center" style={{ justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.6, marginBottom: '20px' }}>
                <div className="flex-center" style={{ gap: '10px' }}>
                  <div className="flex-center" style={{ gap: '5px' }}><TrendingUp size={14} /> <span>{quiz.avgScore}%</span></div>
                  <div className="flex-center" style={{ gap: '5px' }}><Pencil size={14} /> <span>{quiz.participants}</span></div>
                </div>
                <span style={{ fontSize: '0.75rem' }}>{quiz.profiles && `${quiz.profiles.last_name || ''} ${quiz.profiles.first_name || ''}`}</span>
              </div>
              <div className="flex-center" style={{ justifyContent: 'flex-end', gap: '8px', marginTop: 'auto' }}>
                <button onClick={() => navigate(`/analytics?id=${quiz.id}`)} style={{ padding: '8px', background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none', borderRadius: '10px' }} title="Аналитика"><TrendingUp size={15} /></button>
                <button onClick={() => navigate(`/redactor?id=${quiz.id}`)} style={{ padding: '8px 15px', borderRadius: '10px', fontSize: '0.9rem' }}>Редактировать</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Module-level cache persists across component remounts within the same browser session
let _editorTreeCache = null;
let _editorTreeCacheShowHidden = undefined;

const Editor = ({ session, profile }) => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [myQuizzes, setMyQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('create');

  const [deleteId, setDeleteId] = useState(null);

  useScrollRestoration(loading);
  const [deleteSectionId, setDeleteSectionId] = useState(null);
  const [deleteClassId, setDeleteClassId] = useState(null);
  const [editSectionLink, setEditSectionLink] = useState(null);

  const [titles, setTitles] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [renamingItem, setRenamingItem] = useState(null); // { id, name, type: 'class' | 'section' }
  const [newName, setNewName] = useState('');

  const [newClassName, setNewClassName] = useState('');
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionClassId, setNewSectionClassId] = useState('');
  const [newSectionBookUrl, setNewSectionBookUrl] = useState('');

  const [pendingEmptyQuiz, setPendingEmptyQuiz] = useState(null); // { titleList, canBulk, sectionId }
  const [dirtyQuizzesMap, setDirtyQuizzesMap] = useState({});
  const [successLoadedQuiz, setSuccessLoadedQuiz] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyFeedbackJson, setCopyFeedbackJson] = useState(false);
  const [copyFeedbackBulk, setCopyFeedbackBulk] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const activeTabRef = useRef('create');

  const [expandedClasses, setExpandedClasses] = useState(() => {
    const saved = localStorage.getItem('editor_expanded_classes');
    return saved ? JSON.parse(saved) : {};
  });
  const [expandedSections, setExpandedSections] = useState(() => {
    const saved = localStorage.getItem('editor_expanded_sections');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('editor_expanded_classes', JSON.stringify(expandedClasses));
  }, [expandedClasses]);

  useEffect(() => {
    localStorage.setItem('editor_expanded_sections', JSON.stringify(expandedSections));
  }, [expandedSections]);

  // Load only classes + sections (instant)
  const fetchStructure = async () => {
    setLoading(true);
    try {
      const c = await fetchWithCache('catalog_struct_classes', () => supabase.from('quiz_classes').select('*').order('sort_order', { ascending: true }).then(r => r.data));
      const secs = await fetchWithCache('catalog_struct_sections', () => supabase.from('quiz_sections').select('*').order('sort_order', { ascending: true }).then(r => r.data));
      if (c) setClasses(c);
      if (secs) setSections(secs);
    } catch (err) {
      console.error('Structure fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStructure();
  }, []);

  useCacheSync('catalog_struct_classes', (data) => setClasses(data));
  useCacheSync('catalog_struct_sections', (data) => setSections(data));

  // Load quizzes + stats — uses granular invalidation
  const fetchTreeData = () => {
    // Structural changes will trigger this to refresh classes/sections
    fetchStructure();
  };

  // Full refresh after any mutation — clears cache
  const fetchData = async () => {
    // Invalidate structural cache
    localStorage.removeItem('labtest_cache_catalog_struct_classes');
    localStorage.removeItem('labtest_cache_catalog_struct_sections');

    await fetchStructure();
  };

  const handleTabChange = (tab) => {
    activeTabRef.current = tab;
    setActiveTab(tab);
    if (tab === 'manage') fetchTreeData();
  };

  const handleCreateQuiz = async (e) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (jsonInput.trim()) {
        const parsedJson = JSON.parse(jsonInput);
        let quizzesList = [];

        if (Array.isArray(parsedJson)) quizzesList = parsedJson;
        else if (parsedJson.questions) quizzesList = [parsedJson];
        else if (parsedJson.quizzes) quizzesList = parsedJson.quizzes;
        else throw new Error('Некорректный формат JSON: не найден массив вопросов');

        const canBulk = profile?.role === 'admin' || profile?.role === 'creator';
        if (!canBulk && quizzesList.length > 1) {
          throw new Error('Массовое создание недоступно.');
        }

        const { data: maxOrderData, error: rpcError } = await supabase.rpc('get_max_sort_order', { p_section_id: sectionId });
        if (rpcError) throw rpcError;
        const maxOrder = maxOrderData || -1;

        const newQuizzesInsertion = quizzesList.map((q, i) => ({
          title: (q.title || titles.split('\n')[0] || 'Новый тест').trim(),
          section_id: sectionId,
          author_id: session.user.id,
          content: { questions: q.questions },
          is_verified: canBulk,
          sort_order: maxOrder + 1 + i
        }));

        const { error } = await supabase.from('quizzes').insert(newQuizzesInsertion);
        if (error) throw error;

        fetchData();
        setSuccessLoadedQuiz(newQuizzesInsertion.map(q => q.title).join(', '));
        setTitles('');
        setJsonInput('');
        setSectionId('');
        setSelectedClassId('');
      } else {
        let titleList = titles.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        if (titleList.length === 0) throw new Error('Введите хотя бы одно название');

        const canBulk = profile?.role === 'admin' || profile?.role === 'creator';
        if (!canBulk && titleList.length > 1) {
          throw new Error('Массовое создание тестов доступно только Создателям и Админам.');
        }

        // Show warning modal BEFORE inserting
        setPendingEmptyQuiz({ titleList, canBulk, sectionId });
      }
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmEmptyQuizCreation = async () => {
    if (!pendingEmptyQuiz || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { titleList, canBulk, sectionId: sId } = pendingEmptyQuiz;

      const { data: maxOrderData, error: rpcError } = await supabase.rpc('get_max_sort_order', { p_section_id: sId });
      if (rpcError) throw rpcError;
      const maxOrder = maxOrderData || -1;

      const newQuizzes = titleList.map((t, i) => ({
        title: t.trim(),
        section_id: sId,
        author_id: session.user.id,
        content: { questions: [] },
        is_verified: canBulk,
        is_hidden: true, // Auto-hide empty quiz
        sort_order: maxOrder + 1 + i
      }));

      const { data: inserted, error } = await supabase.from('quizzes').insert(newQuizzes).select();
      if (error) throw error;

      setPendingEmptyQuiz(null);
      setTitles('');
      setSectionId('');
      setSelectedClassId('');

      if (inserted && inserted.length > 0) {
        navigate(`/redactor?id=${inserted[0].id}`);
      } else {
        fetchData();
      }
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDivider = async (sId, text = '') => {
    try {
      // Use RPC to bypass RLS
      const { data: maxOrderData, error: rpcError } = await supabase.rpc('get_max_sort_order', { p_section_id: sId });
      if (rpcError) throw rpcError;
      const maxOrder = maxOrderData || -1;

      const { error } = await supabase.from('quizzes').insert({
        title: text || 'Разделитель',
        section_id: sId,
        author_id: session.user.id,
        content: { is_divider: true, divider_text: text },
        is_verified: true,
        sort_order: maxOrder + 1
      });

      if (error) throw error;
      fetchData();
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  const handleRename = async () => {
    if (!renamingItem || !newName.trim()) return;

    if (renamingItem.type === 'quiz') {
      const quizToRename = myQuizzes.find(q => q.id === renamingItem.id);
      const isDivider = quizToRename?.content?.is_divider;
      const updateData = { title: newName };
      if (isDivider) {
        updateData.content = {
          ...quizToRename.content,
          divider_text: newName
        };
      }
      const { error } = await supabase.from('quizzes').update(updateData).eq('id', renamingItem.id);
      if (error) alert('Ошибка переименования: ' + error.message);
      else {
        const oldName = renamingItem.name;
        const finalNewName = newName;
        setRenamingItem(null);
        setNewName('');
        await fetchData();

        if (!isDivider && oldName !== finalNewName) {
          const sName = quizToRename.quiz_sections?.name;
          const cId = quizToRename.quiz_sections?.class_id;
          if (sName && cId) {
            syncGithubRenames(cId, sName, sName, oldName, finalNewName)
              .then(renamedMap => updateQuizzesWithNewUrls([quizToRename], renamedMap))
              .catch(e => console.error('Failed to sync github assets:', e));
          }
        }
      }
      return;
    }

    const table = renamingItem.type === 'class' ? 'quiz_classes' : 'quiz_sections';
    const oldName = renamingItem.name;
    const finalNewName = newName;
    const { error } = await supabase.from(table).update({ name: newName }).eq('id', renamingItem.id);
    if (error) alert('Ошибка переименования: ' + error.message);
    else {
      setRenamingItem(null);
      setNewName('');
      await fetchData();

      if (renamingItem.type === 'section' && oldName !== finalNewName) {
        const sToRename = sections.find(s => s.id === renamingItem.id);
        const cId = sToRename?.class_id;
        const quizzesToUpdate = myQuizzes.filter(q => q.section_id === renamingItem.id);

        if (cId) {
          syncGithubRenames(cId, oldName, finalNewName, null, null)
            .then(renamedMap => updateQuizzesWithNewUrls(quizzesToUpdate, renamedMap))
            .catch(e => console.error('Failed to sync section github assets:', e));
        }
      }
    }
  };

  const copyJsonPrompt = () => {
    const prompt = `Без подобострастия. Качественно создай строгий интересный тест с вопросами высокого порядка без подсказок по одному большему параграфу с приложенных изображений из кратного 5 количества вопросов от 5 до 30 в зависимости от объёма информации (чем больше информации, тем больше число вопросов). Выведи результат СТРОГО в формате JSON:\n{\n"title":\n"§ Номер-Номер (если есть). Название",\n"questions": [\n{\n"question": "Текст вопроса?",\n"options": ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4", "...до 6 вариантов"],\n"correctIndex": 0 (всегда)\n}\n]\n}\nВАЖНО: Количество вариантов ответа может быть разным для каждого вопроса (от 2 до 6), но верный только один.\nСоставляй вопросы строго в рамках информации из параграфа, но делай их самодостаточными, чтобы ученик мог ответить на них, опираясь на общие знания по теме, даже если у него нет перед глазами текста или схем с изображений.\n\nХорошо составленный тест должен следовать правилу однородности:\n\nВсе варианты ответов должны быть примерно одинаковой длины.\nЕсли верный ответ длинный, нужно либо укоротить его, либо удлинить дистракторы, добавив в них детали.\nИногда детализацию лучше вынести в само условие вопроса, чтобы варианты ответов были лаконичными.\nДистракторы должны быть ничем не менее правдоподобны, чем верный ответ для запутывания учащихся.`;
    navigator.clipboard.writeText(prompt);
    setCopyFeedbackJson(true);
    setTimeout(() => setCopyFeedbackJson(false), 2000);
  };

  // --- Sorting Logic ---
  const swapClasses = (index, direction) => {
    const newClasses = [...classes];
    if (index + direction < 0 || index + direction >= newClasses.length) return;
    const temp = newClasses[index];
    newClasses[index] = newClasses[index + direction];
    newClasses[index + direction] = temp;
    setClasses(newClasses.map((c, i) => ({ ...c, sort_order: i, is_dirty: true })));
    setHasUnsavedChanges(true);
  };

  const swapSections = (classId, index, direction) => {
    const classSections = sections.filter(s => s.class_id === classId).sort((a, b) => a.sort_order - b.sort_order);
    if (index + direction < 0 || index + direction >= classSections.length) return;

    const temp = classSections[index];
    classSections[index] = classSections[index + direction];
    classSections[index + direction] = temp;

    let orderCounter = 0;
    const updatedSections = [...sections].map(s => {
      if (s.class_id === classId) {
        const matching = classSections.shift();
        return { ...matching, sort_order: orderCounter++, is_dirty: true };
      }
      return s;
    });
    setSections(updatedSections);
    setHasUnsavedChanges(true);
  };

  const swapQuizzes = (sectionId, index, direction, quiz, localQuizzes, setLocalQuizzes) => {
    const canMoveQuiz = (quiz) => {
      if (!profile) return false;
      if (profile.role === 'creator') return true;
      if (profile.role === 'admin') {
        return quiz.profiles?.role !== 'creator' && quiz.profiles?.role !== 'admin';
      }
      return (profile.role === 'teacher' || profile.role === 'editor') && quiz.author_id === profile.id;
    };

    if (!canMoveQuiz(quiz)) return;

    const qList = [...localQuizzes];
    if (index + direction < 0 || index + direction >= qList.length) return;

    const temp = qList[index];
    qList[index] = qList[index + direction];
    qList[index + direction] = temp;

    let order = 0;
    const final = qList.map(q => {
      return { ...q, sort_order: order++, is_dirty: true };
    });
    setLocalQuizzes(final);
    setDirtyQuizzesMap(prev => ({ ...prev, [sectionId]: final }));
    setHasUnsavedChanges(true);
  };

  // --- Creation Logic ---
  const handleCreateClass = async () => {
    if (!newClassName) return;
    const { error } = await supabase.from('quiz_classes').insert({ name: newClassName });
    if (error) alert(error.message);
    else { setNewClassName(''); fetchData(); }
  };

  const handleCreateSection = async () => {
    if (!newSectionName || !newSectionClassId) return alert('Укажите класс и название предмета');
    const { error } = await supabase.from('quiz_sections').insert({
      name: newSectionName,
      class_id: newSectionClassId,
      created_by: session.user.id,
      book_url: newSectionBookUrl || null
    });
    if (error) alert(error.message);
    else {
      setNewSectionName('');
      setNewSectionBookUrl('');
      fetchData();
    }
  };

  const saveSectionUrl = async () => {
    if (!editSectionLink) return;
    const urlValue = editSectionLink.url.trim() === '' ? null : editSectionLink.url;

    const { error } = await supabase
      .from('quiz_sections')
      .update({ book_url: urlValue })
      .eq('id', editSectionLink.id);

    if (error) alert(error.message);
    else {
      setEditSectionLink(null);
      fetchData();
    }
  };

  // --- Deletion Logic ---
  const confirmDeleteClass = async () => {
    if (!deleteClassId) return;
    const count = sections.filter(s => s.class_id === deleteClassId).length;
    if (count > 0) {
      alert('Сначала удалите или переместите предметы (секции) из этого класса.');
      setDeleteClassId(null);
      return;
    }
    const { error } = await supabase.from('quiz_classes').delete().eq('id', deleteClassId);
    if (error) alert(error.message);
    else fetchData();
    setDeleteClassId(null);
  };

  const confirmDeleteSection = async () => {
    if (!deleteSectionId) return;
    const count = myQuizzes.filter(q => q.section_id === deleteSectionId).length;
    if (count > 0) {
      alert('Сначала удалите или переместите тесты из этого предмета.');
      setDeleteSectionId(null);
      return;
    }
    const { error } = await supabase.from('quiz_sections').delete().eq('id', deleteSectionId);
    if (error) alert(error.message);
    else fetchData();
    setDeleteSectionId(null);
  };

  const confirmDeleteQuiz = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('quizzes').delete().eq('id', deleteId);
    if (error) alert(error.message);
    else fetchData();
    setDeleteId(null);
  };

  const toggleHideQuiz = async (quiz) => {
    const { error } = await supabase.from('quizzes').update({ is_hidden: !quiz.is_hidden }).eq('id', quiz.id);
    if (error) alert(error.message);
    else {
      // Invalidate specific section cache
      localStorage.removeItem(`labtest_cache_editor_quizzes_${quiz.section_id}_hidden`);
      localStorage.removeItem(`labtest_cache_editor_quizzes_${quiz.section_id}_visible`);
      fetchData(); // update structure if needed
    }
  };

  return (
    <>
      <div className="container animate" style={{ padding: '40px 20px' }}>
        <div className="flex-center animate" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-1px', margin: 0 }}>Управление тестами</h2>
          <div style={{ background: 'rgba(0,0,0,0.05)', padding: '5px', borderRadius: '15px', display: 'flex' }}>
            <button onClick={() => handleTabChange('create')} style={{ background: activeTab === 'create' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'create' ? 'white' : 'inherit', boxShadow: 'none' }}>Создать тест</button>
            <button onClick={() => handleTabChange('manage')} style={{ background: activeTab === 'manage' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'manage' ? 'white' : 'inherit', boxShadow: 'none' }}>Дерево тестов</button>
          </div>
        </div>

        <div className="grid-2" style={{ alignItems: 'start', gap: '30px' }}>
          {loading ? (
            <EditorSkeleton />
          ) : (
            <div className="grid-2 animate" style={{ alignItems: 'start', gap: '30px', gridColumn: '1 / -1' }}>
              {activeTab === 'create' ? (
                <>
                  <div className="card">
                    <h3 style={{ marginBottom: '25px' }}>Новый тест</h3>
                    <form onSubmit={handleCreateQuiz} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div>
                        <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '8px', display: 'block' }}>
                          {(profile?.role === 'admin' || profile?.role === 'creator') ? 'Название (необязательно если указано в JSON в качестве title)' : 'Название теста'}
                        </label>
                        {(profile?.role === 'admin' || profile?.role === 'creator') ? (
                          <textarea id="quiz-title" name="quiz-title" placeholder="Например:&#10;§ 17. Антропогенез и этногенез" value={titles} onChange={(e) => setTitles(e.target.value)} style={{ height: '80px', resize: 'vertical' }} required={!jsonInput.trim()} />
                        ) : (
                          <input id="quiz-title" name="quiz-title" type="text" placeholder="§ 17. Антропогенез и этногенез" value={titles} onChange={(e) => setTitles(e.target.value)} required={!jsonInput.trim()} />
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <select id="quiz-class" name="class" value={selectedClassId} onChange={(e) => { setSelectedClassId(e.target.value); setSectionId(''); }} required style={{ flex: 1 }}>
                          <option value="">Выберите класс...</option>
                          {classes.filter(c => !c.is_divider).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select id="quiz-section" name="section" value={sectionId} onChange={(e) => setSectionId(e.target.value)} required disabled={!selectedClassId} style={{ flex: 1 }}>
                          <option value="">Выберите предмет...</option>
                          {sections.filter(s => s.class_id === selectedClassId && !s.is_divider).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '8px', display: 'block' }}>JSON содержание (если есть)</label>
                        <textarea id="quiz-json" name="quiz-json" placeholder="Вставьте JSON формат вашего теста здесь..." value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} style={{ width: '100%', height: '150px' }} />
                        <FileJson size={24} style={{ position: 'absolute', right: '20px', top: '40px', opacity: 0.2 }} />
                      </div>

                      <div style={{ display: 'flex', gap: '15px' }}>
                        <button type="submit" style={{ flex: 1, padding: '15px' }}>
                          {jsonInput.trim() ? 'Опубликовать тест' : (titles.split('\n').filter(t => t.trim()).length > 1 ? 'Создать пачку тестов' : 'Создать пустой тест')}
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="card" style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px dashed var(--primary-color)' }}>
                    <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '10px', marginBottom: '20px', color: 'var(--primary-color)' }}>
                      <AlertCircle size={24} />
                      <h3 style={{ margin: 0 }}>Управление структурой и ИИ</h3>
                    </div>

                    <div style={{ background: 'var(--card-bg)', padding: '15px', borderRadius: '15px', marginBottom: '30px' }}>
                      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '10px' }}>
                        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold' }}>Промпт для ИИ (Формат JSON)</p>
                        <button type="button" onClick={copyJsonPrompt} style={{ padding: '5px 10px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}>
                          {copyFeedbackJson ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                      <code style={{ fontSize: '0.75rem', opacity: 0.7, whiteSpace: 'pre-wrap' }}>
                        <p style={{ margin: '0 0 3px 0', fontSize: '0.85rem', fontWeight: 'bold' }}>Создание теста через ИИ с JSON форматом</p>
                        1. Нажмите на кнопку копирования. По желанию измените значение в квадратных скобках на необходимое количество вопросов (от 1 до 30) и вставьте текст в качестве промпта любой ИИ-модели, приложив изображения страниц нужного параграфа.
                        <br />(Рекомендую <a href="https://aistudio.google.com/u/0/prompts/new_chat?model=gemini-3.1-flash-lite-preview" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'underline' }}>Gemini 3.1 Flash Lite Preview с High Thinking level</a>)
                        <br />2. В чате с ИИ убедитесь, что вместо квадратных скобок указано желаемое число вопросов.
                        <br />3. Скопируйте полученный JSON и вставьте его в поле "JSON содержание" на сайте. Проверьте правильность форматирования заголовка.
                        <br />4. Нажмите кнопку "Опубликовать тест" или "Создать пачку тестов".
                        <br />5. При успешной загрузке появится модальное окно с названием теста, который был опубликован. В каталоге или древе тестов вы сможете изменить его расположение.
                        <br />6. Чтобы изменить название после публикации, нажмите на иконку карандаша в нижней части плашки теста.

                        <p style={{ margin: '6px 0 3px 0', fontSize: '0.85rem', fontWeight: 'bold' }}>Создание теста вручную</p>
                        1. Введите заголовок теста в поле "Название".
                        <br />2. Нажмите кнопку "Создать пустой тест".
                        <br />3. В появившемся окне подтвердите действие, после чего вы перейдете в редактор.
                        <br />4. В редакторе можно добавить вопросы, варианты ответов и настроить параметры.
                        <br />5. После завершения сделайте тест видимым, нажав на кнопку с иконкой глаза в верхней части страницы.
                      </code>
                    </div>

                    {profile?.role === 'creator' && (
                      <div style={{ marginBottom: '30px' }}>
                        <h4 style={{ marginBottom: '15px' }}>Папки / Классы</h4>
                        <div className="flex-center" style={{ gap: '10px' }}>
                          <input id="new-class-name" name="new-class-name" type="text" placeholder="Название класса" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
                          <button onClick={handleCreateClass} style={{ padding: '10px 20px' }}><Plus size={20} /></button>
                        </div>
                      </div>
                    )}

                    {profile?.role === 'creator' && (
                      <div>
                        <h4 style={{ marginBottom: '15px' }}>Секции / Предметы</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <select id="new-section-class" name="new-section-class" value={newSectionClassId} onChange={(e) => setNewSectionClassId(e.target.value)}>
                            <option value="">Укажите класс...</option>
                            {classes.filter(c => !c.is_divider).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>

                          <div style={{ display: 'flex', gap: '10px' }}>
                            <input id="new-section-name" name="section-name" type="text" style={{ flex: 1 }} placeholder="Название предмета" value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} />
                          </div>

                          <div style={{ display: 'flex', gap: '10px' }}>
                            <input id="new-section-book-url" name="book-url" type="url" style={{ flex: 1 }} placeholder="Ссылка на учебник (опционально)" value={newSectionBookUrl} onChange={(e) => setNewSectionBookUrl(e.target.value)} />
                          </div>

                          <button onClick={handleCreateSection} style={{ padding: '10px 20px', width: '100%' }} disabled={!newSectionClassId}>
                            Создать предмет
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                    <p style={{ opacity: 0.5, fontSize: '0.9rem', margin: 0 }}>Управление структурой тестов, сортировкой и видимостью</p>
                    {(profile?.role === 'admin' || profile?.role === 'creator') && (
                      <button
                        onClick={() => setShowHidden(prev => !prev)}
                        style={{
                          padding: '8px 18px',
                          background: showHidden ? 'rgba(202, 138, 4, 0.15)' : 'rgba(0,0,0,0.05)',
                          color: showHidden ? '#ca8a04' : 'inherit',
                          border: showHidden ? '1px solid rgba(202,138,4,0.4)' : '1px solid transparent',
                          boxShadow: 'none',
                          borderRadius: '20px',
                          fontWeight: '600',
                          fontSize: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {showHidden ? <Eye size={16} /> : <EyeOff size={16} />}
                        {showHidden ? 'Скрытые: видны' : 'Скрытые: скрыты'}
                      </button>
                    )}
                  </div>
                  {treeLoading ? (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div className="flex-center" style={{ marginBottom: '25px', opacity: 0.5, gap: '10px', justifyContent: 'flex-start' }}>
                        <Clock size={18} className="skeleton-pulse" />
                        <span className="skeleton-text" style={{ width: '220px', height: '14px', margin: 0 }}>Загрузка дерева тестов...</span>
                      </div>
                      {[1, 2, 3].map(i => (
                        <div key={i} className="skeleton" style={{ height: '80px', width: '100%', borderRadius: '16px', marginBottom: '15px', opacity: 0.5 }} />
                      ))}
                    </div>
                  ) : (
                    <div style={{ gridColumn: '1 / -1' }}>
                      {classes.map((cls, cIndex) => {
                        const clsSections = sections.filter(s => s.class_id === cls.id);
                        if ((profile?.role === 'editor' || profile?.role === 'teacher') && myQuizzes.filter(q => clsSections.some(s => s.id === q.section_id)).length === 0) {
                          return null;
                        }

                        if (cls.is_divider) {
                          return (
                            <div key={cls.id} className="animate" style={{ padding: '20px 25px', marginBottom: '15px', background: 'rgba(0,0,0,0.02)', border: '2px dashed rgba(99, 102, 241, 0.2)', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                              <div style={{ height: '4px', background: 'var(--primary-color)', width: '30px', borderRadius: '2px' }} />
                              <h3 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0, textTransform: 'uppercase', color: 'var(--text-color)', flex: 1 }}>{cls.name}</h3>
                              {profile?.role === 'creator' && (
                                <div className="flex-center" style={{ gap: '10px' }}>
                                  <div className="flex-center" style={{ gap: '5px' }}>
                                    <button onClick={() => swapClasses(cIndex, -1)} disabled={cIndex === 0} style={{ padding: '5px', background: 'rgba(0,0,0,0.03)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}><ChevronUp size={16} /></button>
                                    <button onClick={() => swapClasses(cIndex, 1)} disabled={cIndex === classes.length - 1} style={{ padding: '5px', background: 'rgba(0,0,0,0.03)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}><ChevronDown size={16} /></button>
                                  </div>
                                  <button onClick={(e) => { e.stopPropagation(); setRenamingItem({ id: cls.id, name: cls.name, type: 'class' }); setNewName(cls.name); }} style={{ padding: '5px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '8px', boxShadow: 'none' }}><Pencil size={18} /></button>
                                  <button onClick={() => setDeleteClassId(cls.id)} style={{ padding: '5px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', boxShadow: 'none' }} title="Удалить разделитель"><Trash2 size={18} /></button>
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div key={cls.id} className="catalog-container" style={{ padding: '0', overflow: 'hidden', border: '2px solid rgba(0,0,0,0.05)', marginBottom: '30px' }}>
                            <div
                              onClick={() => setExpandedClasses(prev => ({ ...prev, [cls.id]: !prev[cls.id] }))}
                              className="editor-class-head"
                              style={{ padding: '25px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '24px 24px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                            >
                              <div className="flex-center" style={{ gap: '15px', overflow: 'hidden' }}>
                                {profile?.role === 'creator' && (
                                  <div className="flex-center" style={{ flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
                                    <button onClick={() => swapClasses(cIndex, -1)} disabled={cIndex === 0} style={{ padding: '2px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronUp size={20} /></button>
                                    <button onClick={() => swapClasses(cIndex, 1)} disabled={cIndex === classes.length - 1} style={{ padding: '2px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}><ChevronDown size={20} /></button>
                                  </div>
                                )}
                                <h2 style={{ fontSize: '1.6rem', margin: 0, color: 'var(--primary-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cls.name}</h2>
                                {profile?.role === 'creator' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setRenamingItem({ id: cls.id, name: cls.name, type: 'class' }); setNewName(cls.name); }}
                                    style={{ background: 'transparent', color: 'var(--primary-color)', opacity: 0.5, boxShadow: 'none', padding: '5px' }}
                                    title="Переименовать класс"
                                  >
                                    <Pencil size={18} />
                                  </button>
                                )}
                              </div>
                              {profile?.role === 'creator' && (
                                <button onClick={() => setDeleteClassId(cls.id)} style={{ background: 'transparent', color: 'red', boxShadow: 'none' }} title="Удалить класс">
                                  <Trash2 size={24} />
                                </button>
                              )}
                              {expandedClasses[cls.id] ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                            </div>

                            {expandedClasses[cls.id] && clsSections.map((section, sIndex) => {
                              const qs = myQuizzes.filter(q => q.section_id === section.id);
                              if (qs.length === 0 && (profile?.role === 'editor' || profile?.role === 'teacher')) return null;

                              if (section.is_divider) {
                                return (
                                  <div key={section.id} className="animate" style={{ padding: '15px 25px', borderTop: '1px solid rgba(0,0,0,0.03)', background: 'rgba(0,0,0,0.01)', display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ height: '3px', background: 'var(--primary-color)', width: '20px', borderRadius: '1.5px', opacity: 0.6 }} />
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-color)', flex: 1 }}>{section.name}</h3>
                                    {profile?.role === 'creator' && (
                                      <div className="flex-center" style={{ gap: '8px' }}>
                                        <div className="flex-center" style={{ gap: '3px' }}>
                                          <button onClick={() => swapSections(cls.id, sIndex, -1)} disabled={sIndex === 0} style={{ padding: '4px', background: 'rgba(0,0,0,0.03)', color: 'var(--primary-color)', borderRadius: '6px', boxShadow: 'none' }}><ChevronUp size={14} /></button>
                                          <button onClick={() => swapSections(cls.id, sIndex, 1)} disabled={sIndex === clsSections.length - 1} style={{ padding: '4px', background: 'rgba(0,0,0,0.03)', color: 'var(--primary-color)', borderRadius: '6px', boxShadow: 'none' }}><ChevronDown size={14} /></button>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); setRenamingItem({ id: section.id, name: section.name, type: 'section' }); setNewName(section.name); }} style={{ padding: '4px', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--primary-color)', borderRadius: '6px', boxShadow: 'none' }}><Pencil size={14} /></button>
                                        <button onClick={() => setDeleteSectionId(section.id)} style={{ padding: '4px', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', borderRadius: '6px', boxShadow: 'none' }} title="Удалить разделитель предмета"><Trash2 size={14} /></button>
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              return (
                                <div key={section.id} className="editor-section-container" style={{ padding: '25px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                                  <div
                                    onClick={() => setExpandedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                                    className="flex-center"
                                    style={{ gap: '15px', marginBottom: expandedSections[section.id] ? '25px' : '0', justifyContent: 'space-between', overflow: 'hidden', cursor: 'pointer' }}
                                  >
                                    <div className="flex-center" style={{ gap: '10px', overflow: 'hidden' }}>
                                      {profile?.role === 'creator' && (
                                        <div className="flex-center" style={{ gap: '5px', flexShrink: 0 }}>
                                          <button onClick={() => swapSections(cls.id, sIndex, -1)} disabled={sIndex === 0} style={{ padding: '5px', background: 'rgba(0,0,0,0.05)', boxShadow: 'none' }}><ChevronUp size={16} /></button>
                                          <button onClick={() => swapSections(cls.id, sIndex, 1)} disabled={sIndex === clsSections.length - 1} style={{ padding: '5px', background: 'rgba(0,0,0,0.05)', boxShadow: 'none' }}><ChevronDown size={16} /></button>
                                        </div>
                                      )}

                                      {section.book_url && (
                                        <a href={section.book_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ padding: '6px', background: 'var(--primary-color)', color: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center' }} title="Учебник"><Book size={18} /></a>
                                      )}
                                      <h3 style={{ margin: 0, fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{section.name}</h3>
                                      {profile?.role === 'creator' && (
                                        <div className="flex-center" style={{ gap: '5px' }}>
                                          <button onClick={(e) => { e.stopPropagation(); setRenamingItem({ id: section.id, name: section.name, type: 'section' }); setNewName(section.name); }} style={{ background: 'transparent', color: 'var(--primary-color)', opacity: 0.5, boxShadow: 'none', padding: '5px' }} title="Переименовать предмет"><Pencil size={18} /></button>
                                          <button onClick={(e) => { e.stopPropagation(); setEditSectionLink({ id: section.id, url: section.book_url || '' }); }} style={{ background: 'transparent', color: 'var(--primary-color)', opacity: 0.5, boxShadow: 'none', padding: '5px' }} title="Ссылка на учебник"><LinkIcon size={18} /></button>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-center" style={{ gap: '10px' }}>
                                      {profile?.role === 'creator' && (
                                        <button onClick={(e) => setDeleteSectionId(section.id)} style={{ background: 'transparent', color: 'red', boxShadow: 'none', padding: '5px' }} title="Удалить предмет"><Trash2 size={20} /></button>
                                      )}
                                      {expandedSections[section.id] ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                                    </div>
                                  </div>

                                  {expandedSections[section.id] && (
                                    <EditorSectionQuizzes
                                      section={section}
                                      profile={profile}
                                      session={session}
                                      showHidden={showHidden}
                                      setDeleteId={setDeleteId}
                                      setRenamingItem={setRenamingItem}
                                      setNewName={setNewName}
                                      toggleHideQuiz={toggleHideQuiz}
                                      swapQuizzes={swapQuizzes}
                                      handleCreateDivider={handleCreateDivider}
                                      navigate={navigate}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                      {classes.length === 0 && (
                        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                          <p style={{ opacity: 0.5 }}>У вас пока нет классов/папок. Создайте их в панели справа.</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {hasUnsavedChanges && (
        <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: 'var(--card-bg)', padding: '15px 25px', borderRadius: '50px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 2000 }}>
          <span style={{ fontWeight: '500', fontSize: '0.95rem' }}>⚠ Порядок изменён</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setHasUnsavedChanges(false); fetchData(); }} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '9px 18px', borderRadius: '30px', boxShadow: 'none', fontSize: '0.9rem' }}>Отменить</button>
            <button onClick={async () => {
              try {
                setHasUnsavedChanges(false);
                setLoading(true);
                const updates = [];
                for (const c of classes) {
                  if (c.is_dirty) updates.push(supabase.from('quiz_classes').update({ sort_order: c.sort_order }).eq('id', c.id));
                }
                for (const s of sections) {
                  if (s.is_dirty) updates.push(supabase.from('quiz_sections').update({ sort_order: s.sort_order }).eq('id', s.id));
                }
                for (const q of Object.values(dirtyQuizzesMap).flat()) {
                  if (q.is_dirty) updates.push(supabase.from('quizzes').update({ sort_order: q.sort_order }).eq('id', q.id));
                }
                await Promise.all(updates);
                setDirtyQuizzesMap({});
                await fetchData();
              } catch (e) {
                console.error(e);
              } finally {
                setLoading(false);
              }
            }} style={{ padding: '9px 22px', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '600' }} className="flex-center">
              Сохранить
            </button>
          </div>
        </div>
      )}

      {/* SUCCESS JSON LOAD MODAL */}
      {successLoadedQuiz && (
        <div className="modal-overlay" onClick={() => setSuccessLoadedQuiz(null)}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()} style={{ width: '400px' }}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '15px', background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', margin: '0 auto 20px' }}>
              <CheckCircle size={32} />
            </div>
            <h2 style={{ marginBottom: '10px', textAlign: 'center' }}>Успешная загрузка</h2>
            <p style={{ fontSize: '0.9rem', opacity: 0.7, textAlign: 'center', marginBottom: '25px', lineHeight: '1.5' }}>
              Ваш тест был успешно импортирован на платформу из JSON: <br />
              <strong>{successLoadedQuiz}</strong>
            </p>
            <div className="flex-center">
              <button onClick={() => setSuccessLoadedQuiz(null)} style={{ background: 'var(--primary-color)', color: 'white', padding: '12px 30px' }}>Отлично</button>
            </div>
          </div>
        </div>
      )}

      {/* PENDING EMPTY QUIZ MODAL */}
      {pendingEmptyQuiz && (
        <div className="modal-overlay" onClick={() => setPendingEmptyQuiz(null)}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()} style={{ width: '450px' }}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '15px', background: 'rgba(250, 204, 21, 0.1)', color: '#ca8a04', margin: '0 auto 20px' }}>
              <AlertTriangle size={32} />
            </div>
            <h2 style={{ marginBottom: '10px', textAlign: 'center' }}>Создание пустого теста</h2>
            <p style={{ fontSize: '0.9rem', opacity: 0.7, textAlign: 'center', marginBottom: '25px', lineHeight: '1.5' }}>
              Вы пытаетесь создать тест <strong>без вопросов</strong>. <br />Он будет по умолчанию скрытым от учеников. Вы будете перенаправлены в Редактор вопросов для его заполнения.
            </p>
            <div className="grid-2" style={{ gap: '10px' }}>
              <button onClick={() => setPendingEmptyQuiz(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none' }}>Отмена</button>
              <button onClick={confirmEmptyQuizCreation} style={{ background: 'var(--primary-color)', color: 'white' }}>Продолжить</button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА ПЕРЕИМЕНОВАНИЯ КЛАССА / СЕКЦИИ */}
      {renamingItem && (
        <div className="modal-overlay" onClick={() => setRenamingItem(null)}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()} style={{ width: '400px' }}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '15px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', margin: '0 auto 20px' }}>
              <Pencil size={32} />
            </div>
            <h2 style={{ marginBottom: '10px', textAlign: 'center' }}>Переименовать</h2>
            <p style={{ fontSize: '0.85rem', opacity: 0.5, textAlign: 'center', marginBottom: '20px' }}>
              Старое название: <span style={{ fontWeight: '600' }}>{renamingItem.name}</span>
            </p>
            <div style={{ marginBottom: '25px' }}>
              <input
                autoFocus
                id="rename-input"
                name="new-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                placeholder="Введите новое название..."
                style={{ width: '100%', padding: '12px' }}
              />
            </div>
            <div className="grid-2" style={{ gap: '10px' }}>
              <button onClick={() => setRenamingItem(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none' }}>Отмена</button>
              <button onClick={handleRename} style={{ background: 'var(--primary-color)', color: 'white' }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {editSectionLink && (
        <div className="modal-overlay" onClick={() => setEditSectionLink(null)}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', margin: '0 auto 25px' }}>
              <Book size={32} />
            </div>
            <h2 style={{ marginBottom: '15px', textAlign: 'center' }}>Ссылка на учебник</h2>
            <p style={{ opacity: 0.7, marginBottom: '20px', textAlign: 'center', fontSize: '0.9rem' }}>
              Укажите URL адрес материала, либо оставьте пустым для удаления
            </p>
            <input
              id="edit-book-url"
              name="book-url"
              type="url"
              placeholder="https://..."
              value={editSectionLink.url}
              onChange={(e) => setEditSectionLink({ ...editSectionLink, url: e.target.value })}
              style={{ width: '100%', marginBottom: '25px', padding: '15px', borderRadius: '12px' }}
            />
            <div className="grid-2" style={{ gap: '15px' }}>
              <button onClick={() => setEditSectionLink(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={saveSectionUrl} style={{ background: 'var(--primary-color)', color: 'white' }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal-content animate modal-content-danger" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}><AlertTriangle size={32} /></div>
            <h2 style={{ marginBottom: '15px' }}>Удалить тест?</h2>
            <div className="grid-2" style={{ gap: '15px', marginTop: '30px' }}>
              <button onClick={() => setDeleteId(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={confirmDeleteQuiz} style={{ background: '#f87171', color: 'white' }}>Да, удалить</button>
            </div>
          </div>
        </div>
      )}

      {deleteSectionId && (
        <div className="modal-overlay" onClick={() => setDeleteSectionId(null)}>
          <div className="modal-content animate modal-content-danger" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}><AlertTriangle size={32} /></div>
            <h2 style={{ marginBottom: '15px' }}>Удалить предмет?</h2>
            <div className="grid-2" style={{ gap: '15px', marginTop: '30px' }}>
              <button onClick={() => setDeleteSectionId(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={confirmDeleteSection} style={{ background: '#f87171', color: 'white' }}>Да, удалить</button>
            </div>
          </div>
        </div>
      )}

      {deleteClassId && (
        <div className="modal-overlay" onClick={() => setDeleteClassId(null)}>
          <div className="modal-content animate modal-content-danger" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}><AlertTriangle size={32} /></div>
            <h2 style={{ marginBottom: '15px' }}>Удалить Класс/Папку?</h2>
            <div className="grid-2" style={{ gap: '15px', marginTop: '30px' }}>
              <button onClick={() => setDeleteClassId(null)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Отмена</button>
              <button onClick={confirmDeleteClass} style={{ background: '#f87171', color: 'white' }}>Да, удалить</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Editor;