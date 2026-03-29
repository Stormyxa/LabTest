import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Plus, Trash2, FileJson, AlertCircle, TrendingUp,
  CheckCircle, Check, Copy, X, AlertTriangle,
  ChevronUp, ChevronDown, Save, Book, Link as LinkIcon,
  Pencil, Eye, EyeOff, Shield
} from 'lucide-react';

const Editor = ({ session, profile }) => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [myQuizzes, setMyQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('create');

  const [deleteId, setDeleteId] = useState(null);
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

  const [copyFeedbackJson, setCopyFeedbackJson] = useState(false);
  const [copyFeedbackBulk, setCopyFeedbackBulk] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

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

  useEffect(() => {
    fetchData();
  }, [showHidden]);

  const fetchData = async () => {
    setLoading(true);
    const { data: c } = await supabase.from('quiz_classes').select('*').order('sort_order', { ascending: true });
    const { data: s } = await supabase.from('quiz_sections').select('*').order('sort_order', { ascending: true });

    if (c) setClasses(c);
    if (s) setSections(s);

    // Добавляем получение роли автора profiles(role) чтобы Админы знали, можно ли удалять
    let query = supabase.from('quizzes').select('*, quiz_sections(name, class_id, book_url), profiles(role, first_name, last_name)');

    // Редактор и Учитель видят только свои тесты в редакторе
    if (profile?.role === 'editor' || profile?.role === 'teacher') {
      query = query.eq('author_id', session.user.id);
    } else if (!showHidden) {
      query = query.eq('is_hidden', false);
    }

    const { data: q } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });

    if (q) {
      const quizzesWithStats = await Promise.all(q.map(async (quiz) => {
        const { data: res } = await supabase.from('quiz_results').select('score, total_questions').eq('quiz_id', quiz.id);
        const participants = res?.length || 0;
        const avgScore = participants > 0
          ? Math.round((res.reduce((acc, curr) => acc + curr.score, 0) / res.reduce((acc, curr) => acc + curr.total_questions, 0)) * 100)
          : 0;
        return { ...quiz, participants, avgScore };
      }));
      setMyQuizzes(quizzesWithStats);
    }
    setLoading(false);
  };

  const handleCreateQuiz = async (e) => {
    e.preventDefault();
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

        // --- Ordering Fix: Always fetch current absolute max from DB ---
        const { data: dbQ } = await supabase.from('quizzes').select('sort_order').eq('section_id', sectionId).order('sort_order', { ascending: false }).limit(1);
        const maxOrder = dbQ && dbQ.length > 0 ? dbQ[0].sort_order : -1;

        const newQuizzesInsertion = quizzesList.map((q, i) => ({
          title: q.title || titles.split('\n')[0] || 'Новый тест',
          section_id: sectionId,
          author_id: session.user.id,
          content: { questions: q.questions },
          is_verified: canBulk,
          sort_order: maxOrder + 1 + i
        }));

        const { error } = await supabase.from('quizzes').insert(newQuizzesInsertion);
        if (error) throw error;
      } else {
        let titleList = titles.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        if (titleList.length === 0) throw new Error('Введите хотя бы одно название');

        const canBulk = profile?.role === 'admin' || profile?.role === 'creator';
        if (!canBulk && titleList.length > 1) {
          throw new Error('Массовое создание тестов доступно только Создателям и Админам.');
        }

        const sectionQuizzes = myQuizzes.filter(q => q.section_id === sectionId);
        const maxOrder = sectionQuizzes.length > 0 ? Math.max(...sectionQuizzes.map(q => q.sort_order || 0)) : -1;

        const newQuizzes = titleList.map((t, i) => ({
          title: t,
          section_id: sectionId,
          author_id: session.user.id,
          content: { questions: [] },
          is_verified: canBulk,
          sort_order: maxOrder + 1 + i
        }));

        const { error } = await supabase.from('quizzes').insert(newQuizzes);
        if (error) throw error;
      }

      fetchData();
      setTitles('');
      setJsonInput('');
      setSectionId('');
      setSelectedClassId('');
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  const handleCreateDivider = async (sId, text = '') => {
    try {
      // --- Ordering Fix: Always fetch current absolute max from DB ---
      const { data: dbQ } = await supabase.from('quizzes').select('sort_order').eq('section_id', sId).order('sort_order', { ascending: false }).limit(1);
      const maxOrder = dbQ && dbQ.length > 0 ? dbQ[0].sort_order : -1;

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
        setRenamingItem(null);
        setNewName('');
        fetchData();
      }
      return;
    }

    const table = renamingItem.type === 'class' ? 'quiz_classes' : 'quiz_sections';
    const { error } = await supabase.from(table).update({ name: newName }).eq('id', renamingItem.id);
    if (error) alert('Ошибка переименования: ' + error.message);
    else {
      setRenamingItem(null);
      setNewName('');
      fetchData();
    }
  };

  const copyJsonPrompt = () => {
    const prompt = `Создай тест на тему с приложенных изображений из [КОЛИЧЕСТВО] вопросов. Выведи результат СТРОГО в формате JSON:\n{\n  "title": "§. Название",\n  "questions": [\n    {\n      "question": "Текст вопроса?",\n      "options": ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4", "...до 6 вариантов"],\n      "correctIndex": 0\n    }\n  ]\n}\nВАЖНО: Количество вариантов ответа может быть разным для каждого вопроса (от 2 до 6).`;
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
    setClasses(newClasses.map((c, i) => ({ ...c, sort_order: i })));
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
        return { ...matching, sort_order: orderCounter++ };
      }
      return s;
    });
    setSections(updatedSections);
    setHasUnsavedChanges(true);
  };

  const swapQuizzes = (sectionId, index, direction, quiz) => {
    // admin/creator can move any quiz; teacher/editor only their own
    const isAdminOrCreator = profile?.role === 'admin' || profile?.role === 'creator';
    if (!isAdminOrCreator && quiz?.author_id !== profile?.id) return;

    const qList = [...myQuizzes];
    const sectionQuizzes = qList.filter(q => q.section_id === sectionId);
    if (index + direction < 0 || index + direction >= sectionQuizzes.length) return;

    const temp = sectionQuizzes[index];
    sectionQuizzes[index] = sectionQuizzes[index + direction];
    sectionQuizzes[index + direction] = temp;

    let order = 0;
    const final = qList.map(q => {
      if (q.section_id === sectionId) {
        const updated = sectionQuizzes.shift();
        updated.sort_order = order++;
        return updated;
      }
      return q;
    });
    setMyQuizzes(final);
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
    else fetchData();
  };

  if (loading) return <div className="flex-center" style={{ height: '60vh' }}>Загрузка панели редактора...</div>;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px' }}>
        <h2 style={{ fontSize: '2rem' }}>Управление тестами</h2>
        <div style={{ background: 'rgba(0,0,0,0.05)', padding: '5px', borderRadius: '15px', display: 'flex' }}>
          <button onClick={() => setActiveTab('create')} style={{ background: activeTab === 'create' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'create' ? 'white' : 'inherit', boxShadow: 'none' }}>Создать тест</button>
          <button onClick={() => setActiveTab('manage')} style={{ background: activeTab === 'manage' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'manage' ? 'white' : 'inherit', boxShadow: 'none' }}>Дерево тестов</button>
        </div>
      </div>

      {activeTab === 'manage' && (profile?.role === 'admin' || profile?.role === 'creator') && (
        <div className="flex-center" style={{ justifyContent: 'flex-end', marginBottom: '20px', gap: '10px' }}>
          <label style={{ fontSize: '0.9rem', opacity: 0.7, cursor: 'pointer' }} className="flex-center">
            <input type="checkbox" checked={showHidden} onChange={(e) => { setShowHidden(e.target.checked); setTimeout(() => fetchData(), 50); }} style={{ marginRight: '8px' }} />
            Показывать скрытые тесты
          </label>
        </div>
      )}

      <div className="grid-2" style={{ alignItems: 'start', gap: '30px' }}>
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
                    <textarea placeholder="Например:&#10;§17. Антропогенез и этногенез" value={titles} onChange={(e) => setTitles(e.target.value)} style={{ height: '80px', resize: 'vertical' }} required={!jsonInput.trim()} />
                  ) : (
                    <input type="text" placeholder="Напр: История Древнего мира" value={titles} onChange={(e) => setTitles(e.target.value)} required={!jsonInput.trim()} />
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <select value={selectedClassId} onChange={(e) => { setSelectedClassId(e.target.value); setSectionId(''); }} required style={{ flex: 1 }}>
                    <option value="">Выберите класс...</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} required disabled={!selectedClassId} style={{ flex: 1 }}>
                    <option value="">Выберите предмет...</option>
                    {sections.filter(s => s.class_id === selectedClassId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div style={{ position: 'relative' }}>
                  <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '8px', display: 'block' }}>JSON содержание (если есть)</label>
                  <textarea placeholder="Вставьте JSON формат вашего теста здесь..." value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} style={{ width: '100%', height: '150px' }} />
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
                  Нажмите кнопку копирования, измените значения в квадратных скобках и вставьте в качестве промпта любой ИИ модели.
                </code>
              </div>

              {profile?.role === 'creator' && (
                <div style={{ marginBottom: '30px' }}>
                  <h4 style={{ marginBottom: '15px' }}>Папки / Классы</h4>
                  <div className="flex-center" style={{ gap: '10px' }}>
                    <input type="text" placeholder="Название класса" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
                    <button onClick={handleCreateClass} style={{ padding: '10px 20px' }}><Plus size={20} /></button>
                  </div>
                </div>
              )}

              {/* ТОЛЬКО СОЗДАТЕЛЬ МОЖЕТ СОЗДАВАТЬ СЕКЦИИ */}
              {profile?.role === 'creator' && (
                <div>
                  <h4 style={{ marginBottom: '15px' }}>Секции / Предметы</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <select value={newSectionClassId} onChange={(e) => setNewSectionClassId(e.target.value)}>
                      <option value="">Укажите класс...</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input type="text" style={{ flex: 1 }} placeholder="Название предмета" value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} />
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input type="url" style={{ flex: 1 }} placeholder="Ссылка на учебник (опционально)" value={newSectionBookUrl} onChange={(e) => setNewSectionBookUrl(e.target.value)} />
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
          <div style={{ gridColumn: '1 / -1' }}>
            {classes.map((cls, cIndex) => {
              const clsSections = sections.filter(s => s.class_id === cls.id);

              if ((profile?.role === 'editor' || profile?.role === 'teacher') && myQuizzes.filter(q => clsSections.some(s => s.id === q.section_id)).length === 0) {
                return null;
              }

              return (
                <div key={cls.id} className="card" style={{ padding: '0', overflow: 'hidden', border: '2px solid rgba(0,0,0,0.05)', marginBottom: '30px' }}>

                  {/* CLASS HEADER */}
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

                  {/* SECTIONS */}
                  {expandedClasses[cls.id] && clsSections.map((section, sIndex) => {
                    const qs = myQuizzes.filter(q => q.section_id === section.id);
                    if (qs.length === 0 && (profile?.role === 'editor' || profile?.role === 'teacher')) return null;

                    return (
                      <div key={section.id} className="editor-section-container" style={{ padding: '25px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                        <div 
                          onClick={() => setExpandedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                          className="flex-center" 
                          style={{ gap: '15px', marginBottom: expandedSections[section.id] ? '25px' : '0', justifyContent: 'space-between', overflow: 'hidden', cursor: 'pointer' }}
                        >

                          <div className="flex-center" style={{ gap: '10px', overflow: 'hidden' }}>
                            {/* ТОЛЬКО СОЗДАТЕЛЬ сортирует предметы */}
                            {profile?.role === 'creator' && (
                              <div className="flex-center" style={{ gap: '5px', flexShrink: 0 }}>
                                <button onClick={() => swapSections(cls.id, sIndex, -1)} disabled={sIndex === 0} style={{ padding: '5px', background: 'rgba(0,0,0,0.05)', boxShadow: 'none' }}><ChevronUp size={16} /></button>
                                <button onClick={() => swapSections(cls.id, sIndex, 1)} disabled={sIndex === clsSections.length - 1} style={{ padding: '5px', background: 'rgba(0,0,0,0.05)', boxShadow: 'none' }}><ChevronDown size={16} /></button>
                              </div>
                            )}

                            {section.book_url && (
                              <a
                                href={section.book_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  padding: '6px',
                                  background: 'var(--primary-color)',
                                  color: 'white',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                title="Учебник"
                              >
                                <Book size={18} />
                              </a>
                            )}

                            <h3 style={{ fontSize: '1.3rem', margin: 0, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{section.name}</h3>
                            {profile?.role === 'creator' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setRenamingItem({ id: section.id, name: section.name, type: 'section' }); setNewName(section.name); }} 
                                style={{ background: 'transparent', color: 'var(--text-color)', opacity: 0.4, boxShadow: 'none', padding: '5px' }}
                                title="Переименовать предмет"
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                          </div>

                          <div className="flex-center" style={{ gap: '10px' }}>
                            {profile?.role === 'creator' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditSectionLink({ id: section.id, url: section.book_url || '' });
                                }}
                                style={{ background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none', padding: '5px' }}
                                title="Прикрепить/Изменить ссылку на учебник"
                              >
                                <LinkIcon size={18} />
                              </button>
                            )}

                            {/* ТОЛЬКО СОЗДАТЕЛЬ удаляет предметы */}
                            {profile?.role === 'creator' && (
                              <div className="flex-center" style={{ gap: '10px' }}>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleCreateDivider(section.id); }} 
                                  className="flex-center" 
                                  style={{ 
                                    padding: '5px 12px', 
                                    fontSize: '0.75rem', 
                                    background: 'rgba(99, 102, 241, 0.1)', 
                                    color: 'var(--primary-color)', 
                                    borderRadius: '8px',
                                    border: 'none',
                                    boxShadow: 'none',
                                    fontWeight: 'bold'
                                  }}
                                >
                                  <Plus size={14} style={{ marginRight: '4px' }} /> Разделитель
                                </button>
                                <button onClick={() => setDeleteSectionId(section.id)} style={{ background: 'transparent', color: 'red', boxShadow: 'none', padding: '5px' }}>
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            )}
                            {expandedSections[section.id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </div>
                        </div>

                        {/* QUIZZES */}
                        {expandedSections[section.id] && (
                        <div className="grid-2">
                          {qs.map((quiz, qIndex) => {
                            // Проверка прав на удаление теста:
                            // 1. Создатель (может всё)
                            // 2. Админ (может удалить, если автор НЕ Создатель)
                            // 3. Автор этого теста
                            const isCreator = profile?.role === 'creator';
                            const isAdminAndNotCreatorQuiz = profile?.role === 'admin' && quiz.profiles?.role !== 'creator';
                            const isAuthor = profile?.id === quiz.author_id;
                            const canDeleteQuiz = isCreator || isAdminAndNotCreatorQuiz || isAuthor;
                            const canEdit = isCreator || (profile?.role === 'admin' && quiz.profiles?.role !== 'creator') || isAuthor;
                            const canMove = isCreator || (profile?.role === 'admin') || isAuthor;

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
                                    <button onClick={() => swapQuizzes(section.id, qIndex, -1, quiz)} disabled={qIndex === 0} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronUp size={16} /></button>
                                    <button onClick={() => swapQuizzes(section.id, qIndex, 1, quiz)} disabled={qIndex === qs.length - 1} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronDown size={16} /></button>
                                  </div>
                                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ height: '1px', background: 'rgba(99, 102, 241, 0.2)', flex: 1 }} />
                                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                                      {quiz.content.divider_text || 'Разделительная линия'}
                                    </span>
                                    <div style={{ height: '1px', background: 'rgba(99, 102, 241, 0.2)', flex: 1 }} />
                                  </div>
                                  <div className="flex-center" style={{ gap: '8px' }}>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setRenamingItem({ id: quiz.id, name: quiz.title, type: 'quiz' }); setNewName(quiz.title); }} 
                                      style={{ background: 'transparent', color: 'var(--primary-color)', opacity: 0.6, boxShadow: 'none', padding: '5px' }}
                                    >
                                      <Pencil size={16} />
                                    </button>
                                    <button 
                                      onClick={() => toggleHideQuiz(quiz)} 
                                      style={{ background: 'transparent', color: quiz.is_hidden ? '#ca8a04' : 'inherit', opacity: 0.6, boxShadow: 'none', padding: '5px' }}
                                    >
                                      {quiz.is_hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                                    </button>
                                    <button onClick={() => setDeleteId(quiz.id)} style={{ background: 'transparent', color: 'red', opacity: 0.6, boxShadow: 'none', padding: '5px' }}>
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div key={quiz.id} className="card" style={{ 
                                background: quiz.is_hidden ? 'rgba(255, 200, 0, 0.05)' : 'rgba(0,0,0,0.02)', 
                                border: quiz.is_hidden ? '1px dashed #ca8a04' : 'none',
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%'
                              }}>
                                {quiz.is_hidden && (
                                  <div style={{ fontSize: '0.7rem', color: '#ca8a04', marginBottom: '8px', fontWeight: 'bold' }}>👁 СКРЫТЫЙ ТЕСТ</div>
                                )}
                                <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '10px' }}>
                                  <div className="flex-center" style={{ gap: '15px' }}>
                                    {canMove && (
                                      <div className="flex-center" style={{ flexDirection: 'column', gap: '5px' }}>
                                        <button onClick={() => swapQuizzes(section.id, qIndex, -1, quiz)} disabled={qIndex === 0} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronUp size={20} /></button>
                                        <button onClick={() => swapQuizzes(section.id, qIndex, 1, quiz)} disabled={qIndex === qs.length - 1} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronDown size={20} /></button>
                                      </div>
                                    )}
                                    <div>
                                      <h4 style={{ fontSize: '1.2rem', margin: 0, opacity: quiz.is_hidden ? 0.7 : 1 }}>{quiz.title}</h4>
                                      <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', opacity: 0.5 }}>
                                        <span>{new Date(quiz.created_at).toLocaleDateString()}</span>
                                        {quiz.profiles && (
                                          <>
                                            <span>•</span>
                                            <span>Автор: {quiz.profiles.last_name} {quiz.profiles.first_name}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex-center" style={{ gap: '10px' }}>
                                    {quiz.is_hidden ? <EyeOff size={18} color="#ca8a04" /> : (quiz.is_verified && <CheckCircle size={22} color="#4ade80" title="Верифицирован" />)}
                                  </div>
                                </div>

                                <div className="flex-center" style={{ justifyContent: 'flex-end', gap: '8px', marginTop: 'auto', paddingTop: '15px' }}>
                                  {canEdit && (
                                    <button onClick={() => navigate(`/redactor?id=${quiz.id}`)} style={{ background: 'rgba(99,102,241,0.05)', color: 'var(--primary-color)', boxShadow: 'none', padding: '10px' }} title="Редактировать"><Pencil size={18} /></button>
                                  )}
                                  {canEdit && (
                                    <button onClick={() => toggleHideQuiz(quiz)} style={{ background: 'rgba(250,204,21,0.05)', color: '#ca8a04', boxShadow: 'none', padding: '10px' }} title={quiz.is_hidden ? 'Сделать видимым' : 'Скрыть тест'}>
                                      {quiz.is_hidden ? <Eye size={18} /> : <EyeOff size={18} />}
                                    </button>
                                  )}
                                  <button onClick={() => navigate(`/analytics?id=${quiz.id}`)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none', padding: '10px' }} title="Аналитика"><TrendingUp size={18} /></button>
                                  {canDeleteQuiz && (
                                    <button onClick={() => setDeleteId(quiz.id)} style={{ background: 'rgba(255,0,0,0.05)', color: 'red', boxShadow: 'none', padding: '10px' }} title="Удалить"><Trash2 size={18} /></button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {qs.length === 0 && (
                            <div style={{ opacity: 0.5, gridColumn: '1/-1', padding: '20px' }}>В предмете пока нет тестов.</div>
                          )}
                        </div>
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
                <button onClick={() => setActiveTab('create')} style={{ marginTop: '20px' }}>Перейти</button>
              </div>
            )}

            {hasUnsavedChanges && (
              <div className="animate" style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--card-bg)', padding: '15px 25px', borderRadius: '50px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 1000 }}>
                <span style={{ fontWeight: '500' }}>Порядок изменён</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setHasUnsavedChanges(false); fetchData(); }} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '8px 15px', borderRadius: '30px', boxShadow: 'none', fontSize: '0.9rem' }}>Отмена</button>
                  <button onClick={async () => {
                    setLoading(true);
                    for (const c of classes) {
                      await supabase.from('quiz_classes').update({ sort_order: c.sort_order }).eq('id', c.id);
                    }
                    for (const s of sections) {
                      await supabase.from('quiz_sections').update({ sort_order: s.sort_order }).eq('id', s.id);
                    }
                    for (const q of myQuizzes) {
                      await supabase.from('quizzes').update({ sort_order: q.sort_order }).eq('id', q.id);
                    }
                    setHasUnsavedChanges(false);
                    fetchData();
                  }} style={{ padding: '8px 15px', borderRadius: '30px', fontSize: '0.9rem' }} className="flex-center">
                    <Save size={16} style={{ marginRight: '5px' }} /> Сохранить порядок
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
    </div>
  );
};

export default Editor;