import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, FileJson, AlertCircle, TrendingUp, CheckCircle, Check, Copy, X, AlertTriangle, ChevronUp, ChevronDown, Save } from 'lucide-react';

const Editor = ({ session, profile }) => {
  const navigate = useNavigate();
  const [sections, setSections] = useState([]);
  const [myQuizzes, setMyQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('create'); // 'create' or 'manage'
  const [deleteId, setDeleteId] = useState(null); // quiz to delete
  const [deleteSectionId, setDeleteSectionId] = useState(null); // section to delete

  const [titles, setTitles] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [newSectionName, setNewSectionName] = useState('');
  const [copyFeedbackJson, setCopyFeedbackJson] = useState(false);
  const [copyFeedbackBulk, setCopyFeedbackBulk] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: s } = await supabase.from('quiz_sections').select('*').order('sort_order', { ascending: true });
    if (s) setSections(s);

    let query = supabase.from('quizzes').select('*, quiz_sections(name)');
    if (profile?.role === 'editor') {
      query = query.eq('author_id', session.user.id);
    }
    const { data: q } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });

    if (q) {
      const quizzesWithStats = await Promise.all(q.map(async (quiz) => {
        const { data: res } = await supabase
          .from('quiz_results')
          .select('score, total_questions')
          .eq('quiz_id', quiz.id);

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

        const newQuizzesInsertion = quizzesList.map(q => ({
          title: q.title || titles.split('\n')[0] || 'Новый тест',
          section_id: sectionId,
          author_id: session.user.id,
          content: { questions: q.questions },
          is_verified: canBulk,
          sort_order: 0
        }));

        const { error } = await supabase.from('quizzes').insert(newQuizzesInsertion);
        if (error) throw error;
      } else {
        // Bulk creation from titles (Empty quizzes)
        let titleList = titles.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        if (titleList.length === 0) throw new Error('Введите хотя бы одно название');

        const canBulk = profile?.role === 'admin' || profile?.role === 'creator';
        if (!canBulk && titleList.length > 1) {
          throw new Error('Массовое создание тестов доступно только Создателям и Админам.');
        }

        const newQuizzes = titleList.map(t => ({
          title: t,
          section_id: sectionId,
          author_id: session.user.id,
          content: { questions: [] },
          is_verified: canBulk
        }));

        const { error } = await supabase.from('quizzes').insert(newQuizzes);
        if (error) throw error;
      }

      fetchData();
      setTitles('');
      setJsonInput('');
      setSectionId('');
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  const copyJsonPrompt = () => {
    // ВЫ МОЖЕТЕ ИЗМЕНИТЬ ЭТОТ ТЕКСТ НИЖЕ
    const prompt = `Создай тест на тему с приложенных изображений из [КОЛИЧЕСТВО] вопросов. Выведи результат СТРОГО в формате JSON:
{
  "title": "§. Название",
  "questions": [
    {
      "question": "Текст вопроса?",
      "options": ["Ответ 1", "Ответ 2", "Ответ 3", "Ответ 4"],
      "correctIndex": 0
    }
  ]
}`;

    navigator.clipboard.writeText(prompt);
    setCopyFeedbackJson(true);
    setTimeout(() => setCopyFeedbackJson(false), 2000);
  };

  const swapSections = (index, direction) => {
    const newSec = [...sections];
    if (index + direction < 0 || index + direction >= newSec.length) return;
    const temp = newSec[index];
    newSec[index] = newSec[index + direction];
    newSec[index + direction] = temp;
    setSections(newSec.map((s, i) => ({ ...s, sort_order: i })));
    setHasUnsavedChanges(true);
  };

  const swapQuizzes = (sectionId, index, direction) => {
    const qList = [...myQuizzes];
    const sectionQuizzes = qList.filter(q => q.section_id === sectionId);
    if (index + direction < 0 || index + direction >= sectionQuizzes.length) return;

    // Swap in section subgroup
    const temp = sectionQuizzes[index];
    sectionQuizzes[index] = sectionQuizzes[index + direction];
    sectionQuizzes[index + direction] = temp;

    // Rebuild global logic
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

  const copyBulkPrompt = () => {
    const prompt = "Составь список из 20 названий тестов по теме [Вставьте тему] для школьной программы. Выведи только названия по одному в строке, без нумерации и лишнего текста.";
    navigator.clipboard.writeText(prompt);
    setCopyFeedbackBulk(true);
    setTimeout(() => setCopyFeedbackBulk(false), 2000);
  };

  const handleCreateSection = async () => {
    if (!newSectionName) return;
    const { error } = await supabase.from('quiz_sections').insert({
      name: newSectionName,
      created_by: session.user.id
    });
    if (error) alert(error.message);
    else {
      setNewSectionName('');
      fetchData();
    }
  };

  const confirmDeleteQuiz = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('quizzes').delete().eq('id', deleteId);
    if (error) alert(error.message);
    else fetchData();
    setDeleteId(null);
  };

  const confirmDeleteSection = async () => {
    if (!deleteSectionId) return;

    const count = myQuizzes.filter(q => q.section_id === deleteSectionId).length;
    if (count > 0) {
      alert('Нельзя удалить секцию, в которой содержатся тесты. Сначала удалите или переместите тесты.');
      setDeleteSectionId(null);
      return;
    }

    const { error } = await supabase.from('quiz_sections').delete().eq('id', deleteSectionId);
    if (error) alert(error.message);
    else fetchData();
    setDeleteSectionId(null);
  };

  if (loading) return <div className="flex-center" style={{ height: '60vh' }}>Загрузка панели редактора...</div>;

  return (
    <div className="container animate" style={{ padding: '40px 20px' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '40px' }}>
        <h2 style={{ fontSize: '2rem' }}>Управление тестами</h2>
        <div style={{ background: 'rgba(0,0,0,0.05)', padding: '5px', borderRadius: '15px', display: 'flex' }}>
          <button
            onClick={() => setActiveTab('create')}
            style={{
              background: activeTab === 'create' ? 'var(--primary-color)' : 'transparent',
              color: activeTab === 'create' ? 'white' : 'inherit',
              boxShadow: 'none'
            }}
          >
            Создать тест
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            style={{
              background: activeTab === 'manage' ? 'var(--primary-color)' : 'transparent',
              color: activeTab === 'manage' ? 'white' : 'inherit',
              boxShadow: 'none'
            }}
          >
            Мои тесты
          </button>
        </div>
      </div>

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
                    <textarea
                      placeholder="Например:&#10;§17. Антропогенез и этногенез"
                      value={titles}
                      onChange={(e) => setTitles(e.target.value)}
                      style={{ height: '80px', resize: 'vertical' }}
                      required={!jsonInput.trim()}
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder="Напр: История Древнего мира"
                      value={titles}
                      onChange={(e) => setTitles(e.target.value)}
                      required={!jsonInput.trim()}
                    />
                  )}
                </div>

                <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
                  <option value="">Выберите секцию для вложения...</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                <div style={{ position: 'relative' }}>
                  <label style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '8px', display: 'block' }}>
                    JSON содержание (если есть)
                  </label>
                  <textarea
                    placeholder="Вставьте JSON формат вашего теста здесь (необязательно при массовом создании)..."
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    style={{ width: '100%', height: '150px' }}
                  />
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
                <h3 style={{ margin: 0 }}>Промпт для ИИ помощника</h3>
              </div>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '20px' }}>
                Обязательный шаблон для генерации материалов через нейросети:
              </p>

              <div style={{ display: 'grid', gap: '15px' }}>
                <div style={{ background: 'var(--card-bg)', padding: '15px', borderRadius: '15px' }}>
                  <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '10px' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold' }}>Промпт для ИИ (Приложите изображения страниц с учебника)</p>
                    <button type="button" onClick={copyJsonPrompt} style={{ padding: '5px 10px', background: 'transparent', color: 'var(--primary-color)', boxShadow: 'none' }}>
                      {copyFeedbackJson ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                  <code style={{ fontSize: '0.75rem', opacity: 0.7, whiteSpace: 'pre-wrap' }}>
                    {`Создай тест на тему с приложенных изображений из [КОЛИЧЕСТВО] вопросов. Выведи результат СТРОГО в формате JSON:
{
  "title": "§. Название",
  "questions": [
    {
      "question": "Текст вопроса?",
      "options": ["Ответ 1", "Ответ 2", "Ответ 3", "Ответ 4"],
      "correctIndex": 0
    }
  ]
}`}
                  </code>
                </div>
              </div>

              {(profile?.role === 'admin' || profile?.role === 'creator') && (
                <div style={{ marginTop: '40px' }}>
                  <h4 style={{ marginBottom: '15px' }}>Управление секциями</h4>

                  <div style={{ marginBottom: '20px', maxHeight: '150px', overflowY: 'auto' }}>
                    {sections.map(s => (
                      <div key={s.id} className="flex-center" style={{ justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <span style={{ fontSize: '0.9rem' }}>{s.name}</span>
                        {profile?.role === 'creator' && (
                          <button
                            onClick={() => setDeleteSectionId(s.id)}
                            style={{ padding: '5px', background: 'transparent', color: 'red', boxShadow: 'none' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex-center" style={{ gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Название новой секции"
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                    />
                    <button onClick={handleCreateSection} style={{ padding: '10px 20px' }}>
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ gridColumn: '1 / -1' }}>
            {sections.map((section, sIndex) => {
              const qs = myQuizzes.filter(q => q.section_id === section.id);
              if (qs.length === 0 && profile?.role === 'editor') return null; // hide empty sections for regular editors
              return (
                <div key={section.id} style={{ marginBottom: '40px' }}>

                  <div className="flex-center" style={{ gap: '15px', marginBottom: '20px' }}>
                    {(profile?.role === 'admin' || profile?.role === 'creator') && (
                      <div className="flex-center" style={{ gap: '5px' }}>
                        <button onClick={() => swapSections(sIndex, -1)} disabled={sIndex === 0} style={{ padding: '5px', background: 'rgba(0,0,0,0.05)', boxShadow: 'none' }} title="Вверх"><ChevronUp size={16} /></button>
                        <button onClick={() => swapSections(sIndex, 1)} disabled={sIndex === sections.length - 1} style={{ padding: '5px', background: 'rgba(0,0,0,0.05)', boxShadow: 'none' }} title="Вниз"><ChevronDown size={16} /></button>
                      </div>
                    )}
                    <h3 style={{ fontSize: '1.5rem', margin: 0 }}>{section.name}</h3>
                  </div>

                  <div className="grid-2">
                    {qs.map((quiz, qIndex) => (
                      <div key={quiz.id} className="card">
                        <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '20px' }}>
                          <div className="flex-center" style={{ gap: '15px' }}>
                            <div className="flex-center" style={{ flexDirection: 'column', gap: '5px' }}>
                              <button onClick={() => swapQuizzes(section.id, qIndex, -1)} disabled={qIndex === 0} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronUp size={20} /></button>
                              <button onClick={() => swapQuizzes(section.id, qIndex, 1)} disabled={qIndex === qs.length - 1} style={{ padding: '2px', background: 'transparent', color: 'var(--text-color)', boxShadow: 'none' }}><ChevronDown size={20} /></button>
                            </div>
                            <div>
                              <h4 style={{ fontSize: '1.3rem', margin: 0 }}>{quiz.title}</h4>
                              <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>{new Date(quiz.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          {quiz.is_verified && <CheckCircle size={24} color="#4ade80" title="Верифицирован" />}
                        </div>

                        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '30px' }}>
                          <div style={{ textAlign: 'center', padding: '15px', background: 'rgba(0,0,0,0.03)', borderRadius: '15px' }}>
                            <p style={{ fontSize: '1.2rem', fontWeight: '800' }}>{quiz.participants}</p>
                            <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Участников</p>
                          </div>
                          <div style={{ textAlign: 'center', padding: '15px', background: 'rgba(0,0,0,0.03)', borderRadius: '15px' }}>
                            <p style={{ fontSize: '1.2rem', fontWeight: '800' }}>{quiz.avgScore}%</p>
                            <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Средний</p>
                          </div>
                        </div>

                        <div className="flex-center" style={{ justifyContent: 'flex-end', gap: '10px' }}>
                          <button onClick={() => navigate(`/analytics?id=${quiz.id}`)} style={{ background: 'rgba(0,0,0,0.03)', color: 'var(--text-color)', boxShadow: 'none' }}>Аналитика</button>
                          <button onClick={() => setDeleteId(quiz.id)} style={{ background: 'rgba(255,0,0,0.1)', color: 'red', boxShadow: 'none' }}><Trash2 size={18} /></button>
                        </div>
                      </div>
                    ))}
                    {qs.length === 0 && (
                      <div className="card" style={{ opacity: 0.5, gridColumn: '1/-1', textAlign: 'center', padding: '30px' }}>Пустая секция</div>
                    )}
                  </div>
                </div>
              );
            })}

            {myQuizzes.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                <p style={{ opacity: 0.5 }}>У вас пока нет тестов.</p>
                <button onClick={() => setActiveTab('create')} style={{ marginTop: '20px' }}>Создать тест</button>
              </div>
            )}

            {/* Floating Save Panel for D&D */}
            {hasUnsavedChanges && (
              <div className="animate" style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--card-bg)', padding: '15px 25px', borderRadius: '50px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 1000 }}>
                <span style={{ fontWeight: '500' }}>Порядок изменён</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setHasUnsavedChanges(false); fetchData(); }} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '8px 15px', borderRadius: '30px', boxShadow: 'none', fontSize: '0.9rem' }}>Отмена</button>
                  <button onClick={async () => {
                    setLoading(true);
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

      {/* Quiz Delete Modal */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal-content animate modal-content-danger" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}>
              <AlertTriangle size={32} />
            </div>
            <h2 style={{ marginBottom: '15px' }}>Удалить тест?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
              Это действие необратимо. <br /> Все результаты учеников по этому тесту будут навсегда удалены из базы.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button
                onClick={() => setDeleteId(null)}
                style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}
              >
                Отмена
              </button>
              <button onClick={confirmDeleteQuiz} style={{ background: '#f87171', color: 'white' }}>
                Да, удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section Delete Modal */}
      {deleteSectionId && (
        <div className="modal-overlay" onClick={() => setDeleteSectionId(null)}>
          <div className="modal-content animate modal-content-danger" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}>
              <AlertTriangle size={32} />
            </div>
            <h2 style={{ marginBottom: '15px' }}>Удалить секцию?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
              Вы уверены? Это удалит категорию из списка. <br /> Если в секции есть тесты, удаление будет заблокировано.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button
                onClick={() => setDeleteSectionId(null)}
                style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}
              >
                Отмена
              </button>
              <button onClick={confirmDeleteSection} style={{ background: '#f87171', color: 'white' }}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Editor;
