import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CheckCircle, XCircle, ChevronRight, ChevronLeft, RotateCcw, X, AlertTriangle } from 'lucide-react';

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

  useEffect(() => {
    fetchQuiz();
  }, [id]);

  const fetchQuiz = async () => {
    const { data } = await supabase.from('quizzes').select('*').eq('id', id).single();
    if (data) {
      setQuiz(data);
      setQuestions(data.content.questions || []);
    }
    setLoading(false);
  };

  const handleSelect = (optionIdx) => {
    if (answers[currentIdx] !== undefined) return;
    setAnswers(prev => ({ ...prev, [currentIdx]: optionIdx }));
    
    setTimeout(() => {
      if (currentIdx < questions.length - 1) {
        setCurrentIdx(prev => prev + 1);
      } else {
        finishQuiz();
      }
    }, 1000);
  };

  const finishQuiz = async () => {
    setShowResult(true);
    const correctCount = questions.filter((q, idx) => answers[idx] === q.correctIndex).length;
    const isPassed = (correctCount / questions.length) >= 0.5;
    const now = new Date().toISOString();
    
    // Формируем карту ответов для инфографики (true - верно, false - нет)
    const answersArray = questions.map((q, idx) => answers[idx] === q.correctIndex);

    // Проверяем, есть ли уже результат для сохранения first_score
    const { data: existing } = await supabase
      .from('quiz_results')
      .select('id, first_score, first_completed_at')
      .eq('quiz_id', id)
      .eq('user_id', session.user.id)
      .single();

    const resultData = {
      score: correctCount,
      total_questions: questions.length,
      is_passed: isPassed,
      completed_at: now
    };

    if (existing) {
      await supabase.from('quiz_results').update(resultData).eq('quiz_id', id).eq('user_id', session.user.id);
    } else {
      resultData.quiz_id = id;
      resultData.user_id = session.user.id;
      resultData.first_score = correctCount;
      resultData.first_completed_at = now;
      resultData.answers_map = answersArray; // Инфографика основана только на первой попытке
      await supabase.from('quiz_results').insert(resultData);
    }
  };

  if (loading) return <div className="flex-center" style={{height: '60vh'}}>Загрузка теста...</div>;
  if (!quiz) return <div className="container" style={{textAlign: 'center', padding: '100px'}}>Тест не найден.</div>;

  if (showResult) {
    const correctCount = questions.filter((q, idx) => answers[idx] === q.correctIndex).length;
    const percent = Math.round((correctCount / questions.length) * 100);
    const timeSpent = Math.round((Date.now() - startTime) / 1000);

    return (
      <div className="container flex-center animate" style={{ padding: '60px 20px' }}>
        <div className="card" style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '20px' }}>Результаты</h2>
          <div style={{ fontSize: '4rem', fontWeight: '800', color: percent >= 50 ? 'var(--primary-color)' : 'red', marginBottom: '10px' }}>
            {percent}%
          </div>
          <p style={{ fontSize: '1.2rem', opacity: 0.8, marginBottom: '30px' }}>
            Вы ответили правильно на {correctCount} из {questions.length} вопросов за {Math.floor(timeSpent / 60)}м {timeSpent % 60}с.
          </p>
          
          <div className="flex-center" style={{ gap: '15px' }}>
            <button 
              onClick={() => navigate('/catalog')} 
              style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}
            >
              В каталог
            </button>
            <button onClick={() => window.location.reload()}>
              <RotateCcw size={18} style={{marginRight: '8px'}} /> Перепройти
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const chosen = answers[currentIdx];

  return (
    <div className="container animate" style={{ maxWidth: '800px', padding: '60px 20px', position: 'relative' }}>
      
      {/* Exit Button */}
      <button 
        onClick={() => setShowExitModal(true)}
        className="flex-center" 
        style={{ position: 'absolute', top: '20px', right: '20px', width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,0,0,0.05)', color: 'red', padding: 0, boxShadow: 'none' }}
        title="Выйти из теста"
      >
        <X size={20} />
      </button>

      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '20px', opacity: 0.6, paddingRight: '40px' }}>
        <span>Вопрос {currentIdx + 1} из {questions.length}</span>
        <h3 style={{ fontSize: '1.2rem', fontWeight: '600', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{quiz.title}</h3>
      </div>
      
      <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', marginBottom: '40px', overflow: 'hidden' }}>
        <div style={{ width: `${((currentIdx + 1) / questions.length) * 100}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.3s' }} />
      </div>

      <div className="card animate" key={currentIdx} style={{ padding: '40px' }}>
        <h2 style={{ marginBottom: '40px', fontSize: '1.8rem', lineHeight: '1.4' }}>{currentQ.question}</h2>
        
        <div style={{ display: 'grid', gap: '15px' }}>
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
                  border: `2px solid ${borderColor}`, padding: '20px 25px', borderRadius: '20px', 
                  fontSize: '1.1rem', position: 'relative', boxShadow: 'none'
                }}
              >
                <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                  {opt}
                  {chosen !== undefined && isCorrect && <CheckCircle size={24} color="#4ade80" />}
                  {chosen !== undefined && isSelected && !isCorrect && <XCircle size={24} color="#f87171" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-center" style={{ justifyContent: 'space-between', marginTop: '30px' }}>
        <button 
          onClick={() => setCurrentIdx(prev => prev - 1)} 
          disabled={currentIdx === 0}
          style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', opacity: currentIdx === 0 ? 0.3 : 1 }}
        >
          <ChevronLeft size={24} /> Назад
        </button>
        <button 
          onClick={currentIdx < questions.length - 1 ? () => setCurrentIdx(prev => prev + 1) : finishQuiz}
          style={{ padding: '12px 40px' }}
        >
          {currentIdx === questions.length - 1 ? 'Завершить' : 'Далее'} <ChevronRight size={24} />
        </button>
      </div>

      {/* Exit Confirmation Modal */}
      {showExitModal && (
        <div className="modal-overlay" onClick={() => setShowExitModal(false)}>
          <div className="modal-content animate" onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', borderRadius: '20px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', margin: '0 auto 25px' }}>
              <AlertTriangle size={32} />
            </div>
            <h2 style={{ marginBottom: '15px' }}>Прервать тест?</h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
              Ваш прогресс в этом тесте не будет сохранен. <br/> Вы действительно хотите выйти?
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button 
                onClick={() => setShowExitModal(false)}
                style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)', boxShadow: 'none' }}
              >
                Вернуться
              </button>
              <button 
                onClick={() => navigate('/catalog')}
                style={{ background: '#f87171', color: 'white', padding: '15px' }}
              >
                Да, выйти
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default QuizView;
