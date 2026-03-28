import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CheckCircle, XCircle, ChevronRight, ChevronLeft, RotateCcw, X, AlertTriangle, Book, FileText, ChevronDown, ChevronUp } from 'lucide-react';

const QuizView = ({ session }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showExitModal, setShowExitModal] = useState(false);
  const [startTime] = useState(Date.now());

  // Состояние для отображения списка правильных ответов в конце
  const [showAnswersList, setShowAnswersList] = useState(false);

  useEffect(() => {
    fetchQuiz();
  }, [id]);

  const fetchQuiz = async () => {
    const { data } = await supabase
      .from('quizzes')
      .select('*, quiz_sections(name, book_url)')
      .eq('id', id)
      .single();

    if (data) {
      setQuiz(data);
      const rawQuestions = data.content.questions || [];
      
      // 1. Перемешиваем вопросы (Fisher-Yates)
      const shuffledQuestions = [...rawQuestions];
      for (let i = shuffledQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledQuestions[i], shuffledQuestions[j]] = [shuffledQuestions[j], shuffledQuestions[i]];
      }

      // 2. Перемешиваем варианты ответа внутри каждого вопроса
      const fullyShuffled = shuffledQuestions.map(q => {
        const optionsWithIndices = q.options.map((opt, idx) => ({ opt, originalIndex: idx }));
        
        // Перемешиваем варианты
        for (let i = optionsWithIndices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [optionsWithIndices[i], optionsWithIndices[j]] = [optionsWithIndices[j], optionsWithIndices[i]];
        }

        // Находим новый индекс правильного ответа
        const newCorrectIndex = optionsWithIndices.findIndex(o => o.originalIndex === q.correctIndex);

        return {
          ...q,
          options: optionsWithIndices.map(o => o.opt),
          correctIndex: newCorrectIndex
        };
      });

      setQuestions(fullyShuffled);
    }
    setLoading(false);
  };

  const handleSelect = (optionIdx) => {
    if (answers[currentIdx] !== undefined) return;

    const updatedAnswers = { ...answers, [currentIdx]: optionIdx };
    setAnswers(updatedAnswers);

    setTimeout(() => {
      if (currentIdx < questions.length - 1) {
        setCurrentIdx(prev => prev + 1);
      } else {
        finishQuiz(updatedAnswers);
      }
    }, 1000);
  };

  const finishQuiz = async (finalAnswers = answers) => {
    setShowResult(true);

    const correctCount = questions.filter((q, idx) => finalAnswers[idx] === q.correctIndex).length;
    const isPassed = (correctCount / questions.length) >= 0.5;
    const now = new Date().toISOString();
    const answersArray = questions.map((q, idx) => finalAnswers[idx] === q.correctIndex);

    try {
      const { data: existing, error: checkError } = await supabase
        .from('quiz_results')
        .select('id, first_score, first_completed_at')
        .eq('quiz_id', id)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (checkError) throw checkError;

      const timeSpentRel = Math.round((Date.now() - startTime) / 1000);
      const resultData = {
        score: correctCount,
        total_questions: questions.length,
        is_passed: isPassed,
        completed_at: now,
        time_spent: timeSpentRel
      };

      if (existing) {
        const { error: updateError } = await supabase.from('quiz_results').update(resultData).eq('quiz_id', id).eq('user_id', session.user.id);
        if (updateError) throw updateError;
      } else {
        resultData.quiz_id = id;
        resultData.user_id = session.user.id;
        resultData.first_score = correctCount;
        resultData.first_completed_at = now;
        resultData.answers_map = answersArray;
        const { error: insertError } = await supabase.from('quiz_results').insert(resultData);
        if (insertError) throw insertError;
      }
    } catch (err) {
      console.error("Ошибка сохранения результата:", err);
      alert("Не удалось сохранить результат в базу данных. Пожалуйста, сообщите администратору. Ошибка: " + err.message);
    }
  };

  if (loading) return <div className="flex-center" style={{ height: '60vh' }}>Загрузка теста...</div>;
  if (!quiz) return <div className="container" style={{ textAlign: 'center', padding: '100px' }}>Тест не найден.</div>;

  // ЭКРАН РЕЗУЛЬТАТОВ
  if (showResult) {
    const correctCount = questions.filter((q, idx) => answers[idx] === q.correctIndex).length;
    const percent = Math.round((correctCount / questions.length) * 100);
    const timeSpent = Math.round((Date.now() - startTime) / 1000);

    return (
      <div className="container flex-center animate" style={{ padding: '60px 20px', flexDirection: 'column' }}>
        <div className="card" style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '20px' }}>Результаты</h2>
          <div style={{ fontSize: '4rem', fontWeight: '800', color: percent >= 50 ? 'var(--primary-color)' : 'red', marginBottom: '10px' }}>
            {percent}%
          </div>
          <p style={{ fontSize: '1.2rem', opacity: 0.8, marginBottom: '30px' }}>
            Правильных ответов: {correctCount} из {questions.length} <br />
            Время: {Math.floor(timeSpent / 60)}м {timeSpent % 60}с.
          </p>

          <div className="flex-center" style={{ gap: '15px', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/catalog')} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>В каталог</button>
            <button onClick={() => window.location.reload()}><RotateCcw size={18} style={{ marginRight: '8px' }} /> Перепройти</button>
            <button
              onClick={() => setShowAnswersList(!showAnswersList)}
              style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none' }}
            >
              {showAnswersList ? <ChevronUp size={18} style={{ marginRight: '8px' }} /> : <FileText size={18} style={{ marginRight: '8px' }} />}
              {showAnswersList ? 'Скрыть разбор' : 'Посмотреть разбор'}
            </button>
          </div>
        </div>

        {/* БЛОК РАЗБОРА ОТВЕТОВ */}
        {showAnswersList && (
          <div className="animate" style={{ maxWidth: '600px', width: '100%', marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ textAlign: 'left', marginBottom: '10px', opacity: 0.7 }}>Подробный разбор:</h3>
            {questions.map((q, idx) => {
              const userChoice = answers[idx];
              const isCorrect = userChoice === q.correctIndex;

              return (
                <div key={idx} className="card" style={{ textAlign: 'left', padding: '25px', background: 'var(--card-bg)', border: `1px solid ${isCorrect ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)'}` }}>
                  <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isCorrect ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                      color: isCorrect ? '#4ade80' : '#f87171',
                      fontWeight: 'bold', fontSize: '0.9rem'
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 15px 0', lineHeight: '1.4' }}>{q.question}</h4>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Твой ответ */}
                        <div style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ opacity: 0.6 }}>Ваш ответ:</span>
                          <span style={{ color: isCorrect ? '#4ade80' : '#f87171', fontWeight: '600' }}>
                            {q.options[userChoice] || 'Пропущено'}
                          </span>
                          {isCorrect ? <CheckCircle size={16} color="#4ade80" /> : <XCircle size={16} color="#f87171" />}
                        </div>

                        {/* Правильный ответ (если ошибся) */}
                        {!isCorrect && (
                          <div style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(74, 222, 128, 0.05)', borderRadius: '10px' }}>
                            <span style={{ opacity: 0.6 }}>Правильный:</span>
                            <span style={{ color: '#4ade80', fontWeight: '600' }}>
                              {q.options[q.correctIndex]}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const chosen = answers[currentIdx];

  return (
    <div className="container animate" style={{ maxWidth: '800px', padding: '60px 20px', position: 'relative' }}>

      <button
        onClick={() => setShowExitModal(true)}
        className="flex-center"
        style={{ position: 'absolute', top: '20px', right: '20px', width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,0,0,0.05)', color: 'red', padding: 0, boxShadow: 'none', zIndex: 10 }}
        title="Выйти из теста"
      >
        <X size={20} />
      </button>

      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '20px', opacity: 0.6, paddingRight: '50px' }}>
        <span style={{ whiteSpace: 'nowrap', fontSize: '0.9rem', fontWeight: '500' }}>Вопрос {currentIdx + 1} из {questions.length}</span>

        <div className="flex-center" style={{ gap: '10px', flex: 1, justifyContent: 'flex-end', marginLeft: '20px', minWidth: 0 }}>
          {quiz.quiz_sections?.book_url && (
            <a
              href={quiz.quiz_sections.book_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--primary-color)', flexShrink: 0, display: 'flex' }}
              title="Открыть учебник"
            >
              <Book size={20} />
            </a>
          )}
          <h3 style={{
            fontSize: '0.95rem',
            fontWeight: '600',
            margin: 0,
            textAlign: 'right',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {quiz.title}
          </h3>
        </div>
      </div>

      <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', marginBottom: '40px', overflow: 'hidden' }}>
        <div style={{ width: `${((currentIdx + 1) / questions.length) * 100}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.3s' }} />
      </div>

      <div className="card animate" key={currentIdx} style={{ padding: '40px', minHeight: '450px', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ marginBottom: '40px', fontSize: '1.7rem', lineHeight: '1.4' }}>{currentQ.question}</h2>

        <div style={{
          display: 'grid',
          gap: '12px',
          marginTop: 'auto',
          gridTemplateColumns: currentQ.options.some(opt => opt.length > 40) ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))'
        }}>
          {currentQ.options.map((opt, idx) => {
            const isCorrect = idx === currentQ.correctIndex;
            const isSelected = chosen === idx;
            let bgColor = 'var(--card-bg)';
            let borderColor = 'rgba(0,0,0,0.1)';

            if (chosen !== undefined) {
              if (isCorrect) bgColor = 'rgba(74, 222, 128, 0.2)', borderColor = '#4ade80';
              else if (isSelected) bgColor = 'rgba(248, 113, 113, 0.2)', borderColor = '#f87171';
            }

            return (
              <button
                key={idx}
                onClick={() => handleSelect(idx)}
                style={{
                  textAlign: 'left', background: bgColor, color: 'var(--text-color)',
                  border: `2px solid ${borderColor}`, padding: '18px 25px', borderRadius: '18px',
                  fontSize: '1.05rem', position: 'relative', boxShadow: 'none', transition: 'all 0.2s'
                }}
              >
                <div className="flex-center" style={{ justifyContent: 'space-between', gap: '10px' }}>
                  <span>{opt}</span>
                  <div style={{ flexShrink: 0 }}>
                    {chosen !== undefined && isCorrect && <CheckCircle size={22} color="#4ade80" />}
                    {chosen !== undefined && isSelected && !isCorrect && <XCircle size={22} color="#f87171" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-center" style={{ justifyContent: 'space-between', marginTop: '30px', gap: '15px' }}>
        <button
          onClick={() => setCurrentIdx(prev => prev - 1)}
          disabled={currentIdx === 0}
          className="flex-center"
          style={{
            background: 'rgba(0,0,0,0.05)',
            color: 'var(--text-color)',
            opacity: currentIdx === 0 ? 0.3 : 1,
            padding: '12px 25px',
            fontSize: '1.1rem',
            fontWeight: '600',
            gap: '8px',
            flex: 1,
            maxWidth: '200px'
          }}
        >
          <ChevronLeft size={24} /> <span>Назад</span>
        </button>

        <button
          onClick={currentIdx < questions.length - 1 ? () => setCurrentIdx(prev => prev + 1) : () => finishQuiz()}
          className="flex-center"
          style={{
            padding: '12px 25px',
            fontSize: '1.1rem',
            fontWeight: '600',
            gap: '8px',
            flex: 1,
            maxWidth: '250px'
          }}
        >
          <span>{currentIdx === questions.length - 1 ? 'Завершить' : 'Далее'}</span> <ChevronRight size={24} />
        </button>
      </div>

      {showExitModal && (
        <div className="modal-overlay" onClick={() => setShowExitModal(false)}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}>
              <AlertTriangle size={32} />
            </div>
            <h2 style={{ marginBottom: '15px' }}>Прервать тест?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
              Ваш прогресс в этом тесте не будет сохранен. <br /> Вы действительно хотите выйти?
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button onClick={() => setShowExitModal(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}>Вернуться</button>
              <button onClick={() => navigate('/catalog')} style={{ background: '#f87171', color: 'white', padding: '15px' }}>Да, выйти</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default QuizView;