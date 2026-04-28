import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchWithCache, useCacheSync } from '../lib/cache';
import { resolveImgUrl } from '../lib/imageUtils';
import { ChevronLeft, BarChart2, Clock, CheckCircle, XCircle, Search, Filter, AlertTriangle, Menu, Pencil, Trash2, Eye, X, ChevronRight, Sparkles, Copy, Check, RefreshCw, FileText } from 'lucide-react';
import { buildDetailedQuizPrompt, downloadJSON } from '../lib/aiPromptBuilder';

const UserListItem = React.memo(({ u, isSelected, onSelect }) => {
  return (
    <button
      onClick={() => onSelect(u.id)}
      style={{
        textAlign: 'left', padding: '10px',
        background: isSelected ? 'var(--primary-color)' :
          (u.is_incomplete_user ? 'rgba(156, 163, 175, 0.15)' :
            (u.is_suspicious_user ? 'rgba(239, 68, 68, 0.08)' :
              (u.is_underperforming_user ? 'rgba(250, 204, 21, 0.08)' :
                (u.is_observer ? 'rgba(234, 179, 8, 0.05)' : 'rgba(0,0,0,0.02)')))),
        color: isSelected ? 'white' : 'var(--text-color)',
        borderRadius: '8px', border: isSelected ? 'none' :
          (u.is_suspicious_user ? '1px solid rgba(239, 68, 68, 0.2)' :
            (u.is_observer ? '1px dashed #eab308' : 'none')),
        cursor: 'pointer',
        fontSize: '0.85rem', width: '100%'
      }}>
      <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
        {u.last_name} {u.first_name}
        {u.is_observer && <Eye size={12} title="Наблюдатель" />}
      </div>
      <div style={{ opacity: 0.8, fontSize: '0.75rem' }}>Max: {u.maxScore} баллов</div>
    </button>
  );
});

const SidebarUserList = React.memo(({
  loading, quizFolders, sections, quizzes, users, filteredUsers, targetUser,
  filterFolder, setFilterFolder, filterSection, setFilterSection, filterQuiz, handleQuizSelect,
  filterCity, setFilterCity, filterSchool, setFilterSchool, filterClass, setFilterClass,
  searchQuery, setSearchQuery, showObservers, setShowObservers, handleUserSelect, handleScroll,
  scrollRef, validSections, validQuizzes, isFolderEmpty, isSectionEmpty,
  profile, cities, schools, classes, teacherClasses, navigate, setSidebarOpen
}) => {
  const isTeacher = profile?.role === 'teacher';
  let canChangeCity = !isTeacher;
  let canChangeSchool = !isTeacher;
  let canChangeClass = !isTeacher;

  if (isTeacher && classes.length > 0 && schools.length > 0) {
    const myClasses = classes.filter(c => teacherClasses.includes(c.id));
    const mySchoolIds = [...new Set(myClasses.map(c => c.school_id))];
    const mySchools = schools.filter(s => mySchoolIds.includes(s.id));
    const myCityIds = [...new Set(mySchools.map(s => s.city_id))];

    if (myClasses.length > 1) {
      if (mySchoolIds.length === 1) {
        canChangeClass = true; // Multiple classes in 1 school
      } else if (myCityIds.length === 1) {
        canChangeClass = true;
        canChangeSchool = true; // Multiple schools in 1 city
      } else {
        canChangeClass = true;
        canChangeSchool = true;
        canChangeCity = true; // Multiple cities
      }
    }
  }

  // Filter out options the teacher has no access to
  const availableCities = isTeacher
    ? cities.filter(c => {
        const myCityIds = schools.filter(s => classes.some(cl => teacherClasses.includes(cl.id) && cl.school_id === s.id)).map(s => s.city_id);
        return myCityIds.includes(c.id);
      })
    : cities;

  const availableSchools = isTeacher
    ? schools.filter(s => {
        const mySchoolIds = classes.filter(cl => teacherClasses.includes(cl.id)).map(cl => cl.school_id);
        return mySchoolIds.includes(s.id) && (filterCity === 'all' || s.city_id === filterCity);
      })
    : schools.filter(s => filterCity === 'all' || s.city_id === filterCity);

  const availableClasses = isTeacher
    ? classes.filter(c => teacherClasses.includes(c.id) && (filterSchool === 'all' || c.school_id === filterSchool))
    : classes.filter(c => filterSchool === 'all' || c.school_id === filterSchool);

  // Compute total possible users based on class max_students limit
  const totalPossibleUsers = classes.filter(c => {
    if (filterClass !== 'all' && c.id !== filterClass) return false;
    if (filterSchool !== 'all' && c.school_id !== filterSchool) return false;
    if (filterCity !== 'all') {
      const school = schools.find(s => s.id === c.school_id);
      if (!school || school.city_id !== filterCity) return false;
    }
    if (isTeacher && !teacherClasses.includes(c.id)) return false;
    return true;
  }).reduce((sum, c) => sum + (c.max_students || 0), 0);

  return (
    <div style={{ padding: '20px', width: '320px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px' }}>
        <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Аналитика</h3>
        <button onClick={() => setSidebarOpen(false)} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none', padding: '8px', borderRadius: '10px' }}><X size={20} /></button>
      </div>

      <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', padding: '4px', marginBottom: '15px' }}>
        <button style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '0.8rem', background: 'var(--card-bg)', border: 'none', boxShadow: 'var(--soft-shadow)', cursor: 'default', fontWeight: 'bold', color: 'var(--primary-color)' }}>По Тестам</button>
        <button onClick={() => navigate('/user-analytics')} style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '0.8rem', background: 'transparent', border: 'none', boxShadow: 'none', cursor: 'pointer', color: 'var(--text-color)', opacity: 0.7 }}>По Ученикам</button>
      </div>

      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.02)', padding: '10px', borderRadius: '8px' }}>
        <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Показать наблюдателей</span>
        <button
          onClick={() => setShowObservers(!showObservers)}
          style={{
            width: '40px', height: '20px', borderRadius: '10px',
            background: showObservers ? 'var(--primary-color)' : '#ccc',
            position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.3s'
          }}
        >
          <div style={{
            position: 'absolute', top: '2px', left: showObservers ? '22px' : '2px',
            width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.3s'
          }} />
        </button>
      </div>

      {loading ? (
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: '30px', marginBottom: '10px' }} />
          <div className="skeleton" style={{ height: '30px', marginBottom: '10px' }} />
          <div className="skeleton" style={{ height: '30px', marginBottom: '20px' }} />
          <div className="skeleton" style={{ height: '100px' }} />
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="ad-folder" style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '5px', display: 'block' }}>Выбор Теста</label>
            <select id="ad-folder" value={filterFolder} onChange={e => setFilterFolder(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '8px' }}>
              <option value="all">Все папки</option>
              {quizFolders.map(f => (
                <option key={f.id} value={f.id} disabled={f.is_divider || isFolderEmpty(f.id)}>
                  {f.is_divider ? `--- ${f.name} ---` : f.name} {isFolderEmpty(f.id) && !f.is_divider ? '(пусто)' : ''}
                </option>
              ))}
            </select>
            <select id="ad-section" value={filterSection} onChange={e => setFilterSection(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '8px' }} aria-label="Предмет">
              <option value="all">Все предметы</option>
              {validSections.map(s => (
                <option key={s.id} value={s.id} disabled={s.is_divider || isSectionEmpty(s.id)}>
                  {s.is_divider ? `--- ${s.name} ---` : s.name} {isSectionEmpty(s.id) && !s.is_divider ? '(пусто)' : ''}
                </option>
              ))}
            </select>
            <select id="ad-quiz" value={filterQuiz} onChange={e => handleQuizSelect(e.target.value)} style={{ width: '100%', padding: '8px' }} aria-label="Тест">
              <option value="" disabled>-- Выберите тест --</option>
              {validQuizzes.map(q => (
                <option key={q.id} value={q.id} disabled={q.is_divider}>
                  {q.is_divider ? `--- ${q.divider_text || 'Разделитель'} ---` : q.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ height: '1px', background: 'rgba(0,0,0,0.05)', margin: '15px 0' }} />

          {filterQuiz ? (
            <>
              <label htmlFor="ad-city" style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '10px', display: 'block' }}>Фильтры Учеников</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                <select id="ad-city" value={filterCity} onChange={e => { setFilterCity(e.target.value); setFilterSchool('all'); setFilterClass('all'); }} style={{ padding: '6px', fontSize: '0.85rem' }} disabled={!canChangeCity}>
                  <option value="all">Все города</option>
                  {availableCities.map(c => {
                    const hasResults = users.some(u => u.city_id === c.id);
                    return (
                      <option key={c.id} value={c.id} disabled={!hasResults && !isTeacher}>
                        {c.name} {!hasResults ? '(нет результатов)' : ''}
                      </option>
                    );
                  })}
                </select>
                <select id="ad-school" value={filterSchool} onChange={e => { setFilterSchool(e.target.value); setFilterClass('all'); }} disabled={!canChangeSchool} style={{ padding: '6px', fontSize: '0.85rem' }} aria-label="Школа">
                  <option value="all">Все школы</option>
                  {availableSchools.map(s => {
                    const hasResults = users.some(u => u.school_id === s.id);
                    return (
                      <option key={s.id} value={s.id} disabled={!hasResults && !isTeacher}>
                        {s.name} {!hasResults ? '(нет результатов)' : ''}
                      </option>
                    );
                  })}
                </select>
                <select id="ad-class" value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ padding: '6px', fontSize: '0.85rem' }} aria-label="Класс" disabled={!canChangeClass}>
                  <option value="all">Все классы</option>
                  {availableClasses.map(c => {
                    const hasResults = users.some(u => u.class_id === c.id);
                    return (
                      <option key={c.id} value={c.id} disabled={!hasResults && !isTeacher}>
                        {c.name} {!hasResults ? '(нет результатов)' : ''}
                      </option>
                    );
                  })}
                </select>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', opacity: 0.5 }} />
                  <label htmlFor="ad-search" style={{ display: 'none' }}>Поиск</label>
                  <input id="ad-search" type="text" placeholder="Поиск..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '6px 10px 6px 30px', fontSize: '0.85rem' }} />
                </div>
              </div>

              <label style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '10px', display: 'block', display: 'flex', flexDirection: 'column' }}>
                <span>Ученики</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>(выполнили хотя бы раз: {filteredUsers.length} / общее возможное: {totalPossibleUsers})</span>
              </label>
              <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', paddingRight: '5px' }}>
                {filteredUsers.map(u => (
                  <UserListItem
                    key={u.id}
                    u={u}
                    isSelected={targetUser?.id === u.id}
                    onSelect={handleUserSelect}
                  />
                ))}
                {filteredUsers.length === 0 && <div style={{ fontSize: '0.8rem', opacity: 0.5, textAlign: 'center', marginTop: '10px' }}>Нет учеников по фильтру</div>}
              </div>
            </>
          ) : (
            <div style={{ opacity: 0.5, fontSize: '0.9rem', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Сначала выберите тест<br />для просмотра учеников.</div>
          )}
        </>
      )}
    </div>
  );
});

const AttemptChart = React.memo(({
  attempts,
  selectedAttempt,
  setSelectedAttempt,
  targetQuiz,
  stats
}) => {
  if (attempts.length === 0) return <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>Нет данных о прохождениях</div>;

  const last10 = attempts.slice(-10);
  const chartBars = [];

  const qsLength = targetQuiz?.content?.questions?.length || 1;

  // Max Score Bar
  chartBars.push({
    label: 'Максимум',
    score: stats.maxScore,
    maxPossible: qsLength,
    color: stats.isSuspiciousUser ? '#ef4444' : 'var(--primary-color)',
    data: null,
    type: 'max'
  });

  // First Attempt Bar
  if (attempts.length > 0) {
    const firstAtt = attempts[0];
    let color = firstAtt.is_incomplete ? '#9ca3af' : (firstAtt.is_suspicious ? '#ef4444' : '#3b82f6');

    chartBars.push({
      label: '1-я попытка',
      score: firstAtt.score,
      maxPossible: firstAtt.max_score || qsLength,
      color: color,
      data: firstAtt,
      type: 'first',
      isFirst: true,
      id: firstAtt.id
    });
  }

  // Attempt bars
  last10.forEach((att, idx) => {
    if (attempts.length > 1 && idx === 0 && attempts.length <= 10) return;

    let color = att.is_incomplete ? '#9ca3af' : (att.is_suspicious ? '#ef4444' : (!att.is_passed ? '#facc15' : '#4ade80'));

    chartBars.push({
      label: `Попытка ${attempts.length - last10.length + idx + 1}`,
      score: att.score,
      maxPossible: att.max_score || qsLength,
      color: color,
      data: att,
      type: 'attempt',
      id: att.id
    });
  });

  const MAX_BAR_HEIGHT = 85;

  return (
    <div style={{ position: 'relative', display: 'flex', height: '240px', padding: '20px 20px 20px 0', background: 'rgba(0,0,0,0.02)', borderRadius: '15px' }}>
      <div style={{ width: '50px', position: 'relative', display: 'flex', justifyContent: 'flex-end', paddingRight: '15px', height: '100%' }}>
        <div style={{ position: 'absolute', bottom: 0, width: '6px', height: `${MAX_BAR_HEIGHT}%`, background: 'linear-gradient(to top, #ef4444 0%, #ef4444 20%, #facc15 20%, #facc15 50%, #4ade80 50%, #4ade80 100%)', borderRadius: '3px', zIndex: 5 }} />
      </div>

      <div style={{ position: 'relative', flex: 1, height: '100%' }}>
        <div style={{ position: 'absolute', left: '-40px', bottom: `${MAX_BAR_HEIGHT}%`, width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(0,0,0,0.1)', pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', opacity: 0.5, fontWeight: 'bold' }}>100%</span>
        </div>
        <div style={{ position: 'absolute', left: '-40px', bottom: `${MAX_BAR_HEIGHT * 0.8}%`, width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(74, 222, 128, 0.3)', pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', color: '#4ade80', fontWeight: 'bold' }}>80%</span>
        </div>
        <div style={{ position: 'absolute', left: '-40px', bottom: `${MAX_BAR_HEIGHT * 0.5}%`, width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(250, 204, 21, 0.3)', pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', color: '#ca8a04', fontWeight: 'bold' }}>50%</span>
        </div>
        <div style={{ position: 'absolute', left: '-40px', bottom: `${MAX_BAR_HEIGHT * 0.2}%`, width: 'calc(100% + 40px)', borderTop: '2px dashed rgba(239, 68, 68, 0.3)', pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', left: '-5px', bottom: '2px', fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold' }}>20%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '100%', position: 'relative', zIndex: 1 }}>
          {chartBars.map((bar, i) => {
            const maxP = bar.maxPossible || 1;
            const heightPercent = (bar.score / maxP) * MAX_BAR_HEIGHT;
            const isSpecial = bar.type === 'max';
            const isZero = bar.score === 0;

            return (
              <div
                key={i}
                onClick={() => !isSpecial && setSelectedAttempt(bar.data)}
                style={{
                  flex: 1, minWidth: '20px', maxWidth: '60px', height: '100%',
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                  cursor: isSpecial ? 'default' : 'pointer',
                  opacity: (selectedAttempt?.id === bar.id || isSpecial) ? 1 : 0.6,
                  transition: 'opacity 0.2s', zIndex: 1
                }}
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%' }}>
                  {bar.score === maxP && bar.score > 0 && (
                    <div style={{ textAlign: 'center', color: '#eab308', fontSize: '1.2rem', marginBottom: '-2px', zIndex: 10 }}>👑</div>
                  )}
                  <div style={{ textAlign: 'center', fontSize: '0.7rem', paddingBottom: '4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{bar.score}</div>
                  <div style={{
                    width: '100%',
                    height: isZero ? '5px' : `${heightPercent}%`,
                    background: isZero ? 'rgba(239, 68, 68, 0.3)' : bar.color,
                    borderRadius: '6px 6px 0 0', flexShrink: 0, position: 'relative'
                  }}>
                    {bar.isFirst && !isZero && (heightPercent > 10) && (
                      <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        background: 'white', color: bar.color, width: '16px', height: '16px', borderRadius: '50%',
                        fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontWeight: 'bold'
                      }}>1</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

const AttemptDetailsView = React.memo(({
  selectedAttempt,
  targetQuiz,
  attempts,
  profile,
  handleDeleteClick,
  setDetailedImageModal
}) => {
  if (!selectedAttempt || !targetQuiz) return <div style={{ padding: '20px', opacity: 0.5 }}>Выберите попытку на графике</div>;

  const qs = targetQuiz.content.questions;
  const ansData = selectedAttempt.answers_data || [];

  const { avgTimePerQ, isSkippedHeavy, isShortTimeFail, minutes, seconds, scorePercent } = useMemo(() => {
    const avg = {};
    attempts.forEach(att => {
      const d = att.answers_data;
      if (Array.isArray(d)) {
        d.forEach(ans => {
          if (!avg[ans.originalIndex]) avg[ans.originalIndex] = { totalTime: 0, count: 0 };
          avg[ans.originalIndex].totalTime += (ans.timeSpent || 0);
          avg[ans.originalIndex].count++;
        });
      }
    });

    const totalQs = qs.length || 1;
    const skippedCount = ansData.filter(a => a.chosenIndex === null).length;
    const skippedPerc = skippedCount / totalQs;
    const limitTime = totalQs * 25;
    const timeSpent = selectedAttempt.time_spent_total || 0;
    const sPercent = (selectedAttempt.score / (selectedAttempt.total_questions || totalQs)) || 0;

    return {
      avgTimePerQ: avg,
      isSkippedHeavy: skippedPerc > 0.4,
      isShortTimeFail: timeSpent < limitTime * 0.12 && sPercent < 0.4,
      minutes: Math.floor(timeSpent / 60),
      seconds: timeSpent % 60,
      scorePercent: sPercent
    };
  }, [attempts, selectedAttempt, qs, ansData]);

  return (
    <div style={{ marginTop: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0 }}>
          Детали прохождения от {new Date(selectedAttempt.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })} (KZ)
          <div style={{ marginTop: '5px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px', opacity: 0.7 }}>
            <Clock size={16} /> <span>Времени затрачено: <strong>{minutes}м {seconds}с</strong></span>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
            {selectedAttempt.is_suspicious && (
              <span style={{ fontSize: '0.8rem', background: 'rgba(239, 68, 68, 1)', color: 'white', padding: '4px 10px', borderRadius: '10px' }}>Подозрительно</span>
            )}
            {isSkippedHeavy && (
              <span style={{ fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: '10px', border: '1px solid #ef4444' }}>
                Пропущено более 40% вопросов
              </span>
            )}
            {isShortTimeFail && (
              <span style={{ fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: '10px', border: '1px solid #ef4444' }}>
                Низкий результат за слишком короткое время
              </span>
            )}
            {selectedAttempt.is_incomplete && (
              <span style={{ fontSize: '0.8rem', background: 'rgba(0, 0, 0, 0.05)', color: 'var(--text-color)', opacity: 0.6, padding: '4px 10px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)' }}>
                Вышел до завершения
              </span>
            )}
          </div>
        </h3>
        {(profile?.role === 'admin' || profile?.role === 'creator') && (
          <button
            onClick={() => handleDeleteClick('attempt', selectedAttempt)}
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', padding: '8px 15px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Trash2 size={16} /> Удалить попытку
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {ansData.map((ans, i) => {
          const originQ = qs.find(q => (q.originalIndex || qs.indexOf(q)) === ans.originalIndex);
          if (!originQ) return null;

          const qImages = originQ.images || (originQ.image ? [originQ.image] : []);
          const stat = avgTimePerQ[ans.originalIndex] || { totalTime: 0, count: 1 };
          const avgQ = Math.round(stat.totalTime / stat.count);

          const openModal = () => {
            if (qImages.length > 0) {
              setDetailedImageModal({
                isOpen: true,
                images: qImages,
                currentImgIdx: 0,
                question: originQ.question,
                userAnswer: ans.chosenIndex !== null ? originQ.options[ans.chosenIndex] : 'Пропущено',
                correctAnswer: originQ.options[originQ.correctIndex],
                isCorrect: ans.isCorrect,
                timeSpent: ans.timeSpent || 0,
                avgQTime: avgQ,
                explanation: originQ.explanation
              });
            }
          };

          return (
            <div key={i} className="card" style={{ padding: '20px', borderLeft: `4px solid ${ans.isCorrect ? '#4ade80' : '#ef4444'}`, overflowWrap: 'anywhere' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <h4 style={{ marginBottom: '10px', fontSize: '1.1rem' }}>{i + 1}. {originQ.question}</h4>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ opacity: 0.6, fontSize: '0.9rem' }}>Ваш ответ:</span>
                    <strong style={{ color: ans.isCorrect ? '#4ade80' : '#ef4444', fontSize: '0.95rem' }}>
                      {ans.chosenIndex !== null ? originQ.options[ans.chosenIndex] : 'Пропущено'}
                    </strong>
                    {ans.isCorrect ? <CheckCircle size={16} color="#4ade80" /> : <XCircle size={16} color="#ef4444" />}
                  </div>

                  {!ans.isCorrect && (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', color: '#4ade80', fontSize: '0.9rem' }}>
                      <span style={{ opacity: 0.8 }}>Верный:</span>
                      <strong>{originQ.options[originQ.correctIndex]}</strong>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '15px', marginTop: '10px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', opacity: 0.7 }}>
                      <Clock size={14} /> <span>{ans.timeSpent || 0} сек</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', opacity: 0.5 }}>
                      <BarChart2 size={14} /> <span>Среднее: {avgQ} сек</span>
                    </div>
                  </div>

                  {originQ.explanation && (
                    <div style={{ marginTop: '15px', padding: '12px 15px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px dashed rgba(99, 102, 241, 0.2)' }}>
                      <div style={{ fontSize: '0.75rem', opacity: 0.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.5px' }}>Пояснение</div>
                      <div style={{ fontSize: '0.9rem', lineHeight: '1.5', opacity: 0.9 }}>{originQ.explanation}</div>
                    </div>
                  )}
                </div>

                {qImages.length > 0 && (
                  <div
                    onClick={openModal}
                    style={{
                      width: '100px', height: '100px', borderRadius: '12px', overflow: 'hidden',
                      cursor: 'pointer', border: '1px solid rgba(0,0,0,0.1)', position: 'relative'
                    }}
                  >
                    <img src={resolveImgUrl(qImages[0])} alt="Question" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                      <Eye size={20} color="white" />
                    </div>
                    {qImages.length > 1 && (
                      <div style={{ position: 'absolute', bottom: '5px', right: '5px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                        +{qImages.length - 1}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─── AI Prompt Button Component ──────────────────────────────────
const AiDetailedPromptButton = ({ userId, quizId, viewerProfile }) => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading_copy' | 'loading_file' | 'copied' | 'downloaded' | 'error'
  const [count, setCount] = useState(null);
  const isSelf = viewerProfile?.id === userId;
  const viewerRole = isSelf ? 'student' : 'teacher';

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const { count: c } = await supabase
          .from('quiz_attempts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('quiz_id', quizId);
        setCount(c || 0);
      } catch (e) {
        setCount(0);
      }
    };
    fetchCount();
  }, [userId, quizId]);

  const handleAction = async (type) => {
    if (count < 5) return;
    setStatus(type === 'copy' ? 'loading_copy' : 'loading_file');
    try {
      const result = await buildDetailedQuizPrompt(userId, quizId, viewerRole, isSelf ? null : viewerProfile);
      if (result) {
        if (type === 'copy' && result.instruction) {
          await navigator.clipboard.writeText(result.instruction);
          setStatus('copied');
        } else if (type === 'file' && result.data) {
          downloadJSON(result.data, result.filename);
          setStatus('downloaded');
        } else {
          setStatus('error');
        }
        setTimeout(() => setStatus('idle'), 2500);
      } else {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch (e) {
      console.error('AI action failed:', e);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  if (count !== null && count < 5) {
    return (
      <div className="flex-center shake" style={{ 
        padding: '8px 12px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.05)', 
        border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', gap: '8px',
        fontSize: '0.75rem', fontWeight: 'bold'
      }}>
        <AlertTriangle size={14} />
        {count === 0 ? 'Нет попыток' : `Мало попыток (${count}/5)`}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        onClick={() => handleAction('copy')}
        disabled={status.startsWith('loading') || count === null}
        className="flex-center"
        title="Скопировать промпт для детального ИИ-анализа"
        style={{
          padding: '8px 12px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold',
          background: status === 'copied' ? 'rgba(34, 197, 94, 0.12)' : 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(99, 102, 241, 0.1))',
          color: status === 'copied' ? '#16a34a' : '#a855f7',
          border: '1px solid ' + (status === 'copied' ? '#16a34a33' : '#a855f733'),
          boxShadow: 'none', gap: '6px', cursor: (status.startsWith('loading') || count === null) ? 'wait' : 'pointer',
          transition: 'all 0.3s', flexShrink: 0, whiteSpace: 'nowrap'
        }}
      >
        {status === 'loading_copy' ? <RefreshCw size={14} className="spinner" /> : status === 'copied' ? <Check size={14} /> : <Sparkles size={14} />}
        {status === 'copied' ? 'Промпт скопирован' : 'ИИ-Разбор'}
      </button>

      <button
        onClick={() => handleAction('file')}
        disabled={status.startsWith('loading') || count === null}
        className="flex-center"
        title="Скачать историю попыток (JSON)"
        style={{
          padding: '8px 12px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold',
          background: status === 'downloaded' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(99, 102, 241, 0.05)',
          color: status === 'downloaded' ? '#16a34a' : 'var(--primary-color)',
          border: '1px solid ' + (status === 'downloaded' ? '#16a34a33' : 'rgba(99, 102, 241, 0.1)'),
          boxShadow: 'none', gap: '6px', cursor: (status.startsWith('loading') || count === null) ? 'wait' : 'pointer',
          transition: 'all 0.3s', flexShrink: 0, whiteSpace: 'nowrap'
        }}
      >
        {status === 'loading_file' ? <RefreshCw size={14} className="spinner" /> : status === 'downloaded' ? <Check size={14} /> : <FileText size={14} />}
        JSON
      </button>
    </div>
  );
};

const AnalyticsDetails = ({ session, profile: initialProfile }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const quizIdParam = searchParams.get('quizId');
  const userIdParam = searchParams.get('userId');

  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [profile, setProfile] = useState(initialProfile);

  // Data for sidebar
  const [quizFolders, setQuizFolders] = useState([]);
  const [sections, setSections] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [users, setUsers] = useState([]); // users who took the selected quiz
  const [teacherClasses, setTeacherClasses] = useState([]); // Array of class IDs

  const [cities, setCities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  // Quiz-specific sections for test filters
  const [quizSections, setQuizSections] = useState([]);

  // Test Filters
  const [filterFolder, setFilterFolder] = useState(sessionStorage.getItem('ad_t_folder') || 'all');
  const [filterSection, setFilterSection] = useState(sessionStorage.getItem('ad_t_section') || 'all');
  const [filterQuiz, setFilterQuiz] = useState(quizIdParam || sessionStorage.getItem('ad_t_quiz') || '');

  // User Filters
  const [filterCity, setFilterCity] = useState(sessionStorage.getItem('f_city') || initialProfile?.city_id || 'all');
  const [filterSchool, setFilterSchool] = useState(sessionStorage.getItem('f_school') || initialProfile?.school_id || 'all');
  const [filterClass, setFilterClass] = useState(sessionStorage.getItem('f_class') || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showObservers, setShowObservers] = useState(sessionStorage.getItem('an_show_observers') === 'true');

  const [sidebarOpen, setSidebarOpen] = useState(sessionStorage.getItem('ad_sidebar_open') !== 'false');
  const scrollRef = React.useRef(null);

  const [detailedImageModal, setDetailedImageModal] = useState({ isOpen: false, images: [], currentImgIdx: 0, question: '', userAnswer: '', correctAnswer: '', isCorrect: false, timeSpent: 0, avgQTime: 0 });

  // category-specific memory for "smart" persistence - using Refs for callback stability
  const folderMemory = useRef(JSON.parse(sessionStorage.getItem('ad_folder_to_section') || '{}'));
  const sectionMemory = useRef(JSON.parse(sessionStorage.getItem('ad_section_to_quiz') || '{}'));
  const quizMemory = useRef(JSON.parse(sessionStorage.getItem('ad_quiz_to_user') || '{}'));

  useEffect(() => { sessionStorage.setItem('ad_sidebar_open', sidebarOpen); }, [sidebarOpen]);

  // Delete Modal States
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLock, setDeleteLock] = useState(3);
  const [deleteAction, setDeleteAction] = useState(null); // { type: 'user_all' | 'attempt', data: attemptObj? }

  useEffect(() => { sessionStorage.setItem('an_show_observers', showObservers); }, [showObservers]);

  useEffect(() => { sessionStorage.setItem('ad_t_folder', filterFolder); }, [filterFolder]);
  useEffect(() => { sessionStorage.setItem('ad_t_section', filterSection); }, [filterSection]);
  useEffect(() => { sessionStorage.setItem('ad_t_quiz', filterQuiz); }, [filterQuiz]);
  useEffect(() => { sessionStorage.setItem('f_city', filterCity); }, [filterCity]);
  useEffect(() => { sessionStorage.setItem('f_school', filterSchool); }, [filterSchool]);
  useEffect(() => { sessionStorage.setItem('f_class', filterClass); }, [filterClass]);

  // Data for main content
  const [targetUser, setTargetUser] = useState(null);
  const [targetQuiz, setTargetQuiz] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [selectedAttempt, setSelectedAttempt] = useState(null);

  useEffect(() => {
    if (initialProfile) {
      fetchInitialData();
    }
  }, [initialProfile]);

  const fetchInitialData = async () => {
    setLoading(true);
    const p = initialProfile;
    if (p) {
      setProfile(p);

      let targetTeacherClasses = [];
      if (p.role === 'teacher') {
        const { data: tc } = await supabase.from('class_teachers').select('class_id').eq('email', session.user.email.toLowerCase());
        if (tc) {
          targetTeacherClasses = tc.map(row => row.class_id);
          setTeacherClasses(targetTeacherClasses);
        }
      }

      const isPrivileged = p.role === 'admin' || p.role === 'creator' || p.role === 'teacher' || p.role === 'editor';
      if (!isPrivileged) {
        setSidebarOpen(false); // Force close for players
      }

      const [qF, secs, qs, c, s, cl] = await Promise.all([
        fetchWithCache('quiz_classes', () => supabase.from('quiz_classes').select('id, name, sort_order, is_divider').order('sort_order', { ascending: true }).then(res => res.data)),
        fetchWithCache('quiz_sections', () => supabase.from('quiz_sections').select('id, class_id, name, sort_order, is_divider').order('sort_order', { ascending: true }).then(res => res.data)),
        fetchWithCache(`catalog_struct_quizzes_analytics_${p.role === 'editor' ? p.id : 'all'}`, () => {
          let quizQuery = supabase.from('quizzes').select('id, title, section_id, author_id, is_archived, sort_order, is_divider:content->is_divider, divider_text:content->divider_text').eq('is_archived', false).order('sort_order', { ascending: true });
          if (p.role === 'editor') quizQuery = quizQuery.eq('author_id', p.id);
          return quizQuery.then(res => res.data);
        }),
        fetchWithCache('cities', () => supabase.from('cities').select('*').order('name').then(res => res.data)),
        fetchWithCache('schools', () => supabase.from('schools').select('*').order('name').then(res => res.data)),
        fetchWithCache('classes', () => supabase.from('classes').select('*').order('name').then(res => res.data))
      ]);

      if (qF) setQuizFolders(qF);
      if (secs) setSections(secs);
      if (qs) setQuizzes(qs);
      if (c) setCities(c);
      if (s) setSchools(s);
      if (cl) setClasses(cl);

      // Default Filters logic
      const savedCity = sessionStorage.getItem('f_city');
      const savedSchool = sessionStorage.getItem('f_school');
      const savedClass = sessionStorage.getItem('f_class');

      if (p.role === 'teacher') {
        const tClasses = cl.filter(c => targetTeacherClasses.includes(c.id));
        const tSchoolIds = [...new Set(tClasses.map(c => c.school_id))];
        const tSchools = s.filter(sch => tSchoolIds.includes(sch.id));
        const tCityIds = [...new Set(tSchools.map(sch => sch.city_id))];

        if (tClasses.length === 1) {
          setFilterCity(tSchools[0]?.city_id || 'all');
          setFilterSchool(tSchoolIds[0] || 'all');
          setFilterClass(tClasses[0]?.id || 'all');
        } else if (tSchoolIds.length === 1) {
          setFilterCity(tSchools[0]?.city_id || 'all');
          setFilterSchool(tSchoolIds[0] || 'all');
          if (!savedClass) setFilterClass('all');
        } else if (tCityIds.length === 1) {
          setFilterCity(tCityIds[0] || 'all');
          if (!savedSchool) setFilterSchool('all');
        }
      } else if (p.role === 'admin' || p.role === 'creator') {
        if (!savedCity) {
          if (p.city_id) setFilterCity(p.city_id);
        }
        if (!savedSchool) {
          if (p.school_id) setFilterSchool(p.school_id);
        }
      }

      const targetQuizId = quizIdParam || sessionStorage.getItem('ad_t_quiz');
      if (targetQuizId && qs) {
        setFilterQuiz(targetQuizId);

        // Auto-select folder/section from active quiz
        const found = qs.find(q => q.id === targetQuizId);
        if (found && found.section_id && secs) {
          const section = secs.find(s => s.id === found.section_id);
          if (section) {
            setFilterFolder(section.class_id);
            setFilterSection(section.id);

            // Update memory from URL params immediately
            const fMem = { ...JSON.parse(sessionStorage.getItem('ad_folder_to_section') || '{}'), [section.class_id]: section.id };
            const sMem = { ...JSON.parse(sessionStorage.getItem('ad_section_to_quiz') || '{}'), [section.id]: targetQuizId };
            const qMem = userIdParam ? { ...JSON.parse(sessionStorage.getItem('ad_quiz_to_user') || '{}'), [targetQuizId]: userIdParam } : JSON.parse(sessionStorage.getItem('ad_quiz_to_user') || '{}');

            folderMemory.current = fMem;
            sectionMemory.current = sMem;
            quizMemory.current = qMem;
            sessionStorage.setItem('ad_folder_to_section', JSON.stringify(fMem));
            sessionStorage.setItem('ad_section_to_quiz', JSON.stringify(sMem));
            sessionStorage.setItem('ad_quiz_to_user', JSON.stringify(qMem));
          }
        }

        fetchUsersForQuiz(targetQuizId, p, userIdParam, targetTeacherClasses);
      } else if (p.role === 'player' && !targetQuizId) {
        // If player but no quiz selected, they just see empty state
      }
    }
    setLoading(false);

    // Restore scroll
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = sessionStorage.getItem('ad_list_scroll') || 0;
    }, 100);
  };

  const parseAttemptsData = useCallback((atts) => {
    if (!atts) return [];
    return atts.map(att => {
      if (typeof att.answers_data === 'string') {
        try { return { ...att, answers_data: JSON.parse(att.answers_data) }; } catch (e) { return att; }
      }
      return att;
    });
  }, []);

  const fetchAttempts = useCallback(async (qId, uId) => {
    setContentLoading(true);

    const cacheKey = `ad_attempts_${qId}_${uId}`;
    const data = await fetchWithCache(cacheKey, async () => {
      const [{ data: q }, { data: u }, { data: rawAtts, error }] = await Promise.all([
        supabase.from('quizzes').select('*').eq('id', qId).single(),
        supabase.from('profiles').select('*').eq('id', uId).single(),
        supabase.from('quiz_attempts').select('*').eq('quiz_id', qId).eq('user_id', uId).order('created_at', { ascending: true })
      ]);

      if (q) setTargetQuiz(q);
      if (u) setTargetUser(u);

      if (!error && rawAtts) return parseAttemptsData(rawAtts);
      return [];
    });

    if (data) {
      const parsed = Array.isArray(data) ? data : parseAttemptsData(data);
      setAttempts(parsed);
      if (parsed.length > 0) setSelectedAttempt(parsed[parsed.length - 1]);
      else setSelectedAttempt(null);
    } else {
      setAttempts([]);
      setSelectedAttempt(null);
    }

    setContentLoading(false);
  }, [parseAttemptsData]);

  useCacheSync(`ad_attempts_${filterQuiz}_${targetUser?.id}`, (rawAtts) => {
    if (rawAtts) {
      const parsed = parseAttemptsData(rawAtts);
      setAttempts(parsed);
      if (parsed.length > 0) setSelectedAttempt(parsed[parsed.length - 1]);
    }
  });

  const handleUserSelect = useCallback((uId) => {
    // Immediate UI feedback
    const u = users.find(user => user.id === uId);
    if (u) {
      // Use startTransition for the heavy analytics updates to keep the sidebar responsive
      React.startTransition(() => {
        setTargetUser(u);
      });
    }

    // Save to memory Ref (stable, no re-render needed for this side effect)
    quizMemory.current[filterQuiz] = uId;
    sessionStorage.setItem('ad_quiz_to_user', JSON.stringify(quizMemory.current));

    setSearchParams({ quizId: filterQuiz, userId: uId });
    fetchAttempts(filterQuiz, uId);
  }, [filterQuiz, fetchAttempts, setSearchParams, users]);

  useCacheSync('quiz_classes', (data) => { if (data) setQuizFolders(data); });
  useCacheSync('quiz_sections', (data) => { if (data) setSections(data); });
  useCacheSync(`catalog_struct_quizzes_analytics_${profile?.role === 'editor' ? profile?.id : 'all'}`, (data) => { if (data) setQuizzes(data); });
  useCacheSync('cities', (data) => { if (data) setCities(data); });
  useCacheSync('schools', (data) => { if (data) setSchools(data); });
  useCacheSync('classes', (data) => { if (data) setClasses(data); });

  const fetchUsersForQuiz = useCallback(async (qId, currentUserProfile, targetUserId = null, overrideTeacherClasses = null) => {
    const cacheKey = `ad_users_${qId}`;

    const userList = await fetchWithCache(cacheKey, async () => {
      const [{ data: results }, { data: currentQuizObj }] = await Promise.all([
        supabase.from('quiz_results').select('user_id, score, total_questions').eq('quiz_id', qId),
        supabase.from('quizzes').select('author_id').eq('id', qId).single()
      ]);

      if (!results || results.length === 0) return [];

      const userIds = [...new Set(results.map(r => r.user_id))];
      const [{ data: profs }, { data: attemptsData }] = await Promise.all([
        supabase.from('profiles').select('id, first_name, last_name, city_id, school_id, class_id, is_observer').in('id', userIds),
        supabase.from('quiz_attempts').select('user_id, is_suspicious, is_passed, is_incomplete, score, max_score, created_at').eq('quiz_id', qId).order('created_at', { ascending: true })
      ]);

      const latestStatusMap = {};
      if (attemptsData) {
        attemptsData.forEach(att => {
          const scorePercent = (att.max_score || 0) > 0 ? (att.score / att.max_score) : 0;
          latestStatusMap[att.user_id] = {
            is_incomplete: att.is_incomplete,
            is_suspicious: att.is_suspicious,
            is_underperforming: scorePercent <= 0.5 && !att.is_incomplete
          };
        });
      }

      if (profs) {
        const isTeacher = currentUserProfile?.role === 'teacher';
        let validProfs = profs.filter(p => (p.first_name?.trim() || p.last_name?.trim()));

        if (isTeacher && currentQuizObj?.author_id !== currentUserProfile?.id) {
          const activeTeacherClasses = overrideTeacherClasses || teacherClasses;
          validProfs = validProfs.filter(p => activeTeacherClasses.includes(p.class_id));
        }

        const uList = validProfs.map(p => {
          const userResults = results.filter(r => r.user_id === p.id);
          const maxScore = userResults.length > 0 ? Math.max(...userResults.map(r => r.score)) : 0;
          const lStatus = latestStatusMap[p.id] || {};
          return {
            ...p,
            maxScore,
            is_incomplete_user: !!lStatus.is_incomplete,
            is_suspicious_user: !!lStatus.is_suspicious,
            is_underperforming_user: !!lStatus.is_underperforming
          };
        });

        uList.sort((a, b) => {
          const lnA = (a.last_name || '').trim();
          const lnB = (b.last_name || '').trim();
          const primaryA = lnA || (a.first_name || '').trim();
          const primaryB = lnB || (b.first_name || '').trim();
          const res = primaryA.localeCompare(primaryB, 'ru');
          if (res !== 0) return res;
          return (a.first_name || '').trim().localeCompare((b.first_name || '').trim(), 'ru');
        });

        return uList;
      }
      return [];
    });

    if (!userList || userList.length === 0) {
      setUsers([]);
      setTargetUser(null);
      setAttempts([]);
      return;
    }

    setUsers(userList);

    // Restoration Logic
    const finalTargetId = targetUserId || userIdParam;

    if (finalTargetId) {
      const tu = userList.find(u => u.id === finalTargetId);
      if (tu) {
        fetchAttempts(qId, tu.id);
      } else {
        setTargetUser(null);
        setAttempts([]);
      }
    } else if (currentUserProfile?.role === 'player' || currentUserProfile?.is_observer) {
      const self = userList.find(u => u.id === currentUserProfile.id);
      if (self) handleUserSelect(self.id);
    } else {
      setTargetUser(null);
      setAttempts([]);
    }
  }, [userIdParam, fetchAttempts, handleUserSelect]);

  useCacheSync(`ad_users_${filterQuiz}`, (freshUsers) => {
    if (freshUsers) setUsers(freshUsers);
  });

  const handleQuizSelect = useCallback((qId, overrideUserId = null, sId = null, isAutomated = false) => {
    const currentSId = sId || filterSection;

    // 1. Save to memory ONLY if manual selection and we have a valid context
    if (!isAutomated && currentSId !== 'all' && qId) {
      sectionMemory.current[currentSId] = qId;
      sessionStorage.setItem('ad_section_to_quiz', JSON.stringify(sectionMemory.current));
    }

    setFilterQuiz(qId);

    // 2. Determine target user (use provided quizMemory Ref)
    const targetUId = overrideUserId || quizMemory.current[qId] || 'none';

    setSearchParams(qId ? (targetUId !== 'none' ? { quizId: qId, userId: targetUId } : { quizId: qId }) : {});
    setTargetUser(null);
    setTargetQuiz(null); // Clear the quiz info as well
    setAttempts([]);

    if (qId) {
      fetchUsersForQuiz(qId, profile, targetUId === 'none' ? null : targetUId);
    } else {
      setUsers([]);
    }
  }, [profile, filterSection, fetchUsersForQuiz, setSearchParams]);

  const handleSectionChange = useCallback((sId, folderId = filterFolder, isAutomated = false) => {
    const currentFId = folderId || filterFolder;

    // 1. Save current state to memory Ref ONLY if manual
    if (!isAutomated && filterSection !== 'all') {
      sectionMemory.current[filterSection] = filterQuiz;
      sessionStorage.setItem('ad_section_to_quiz', JSON.stringify(sectionMemory.current));

      if (currentFId !== 'all') {
        folderMemory.current[currentFId] = sId;
        sessionStorage.setItem('ad_folder_to_section', JSON.stringify(folderMemory.current));
      }
    }

    setFilterSection(sId);

    // 2. Restore quiz for new section (read from ref)
    const rememberedQuiz = sId === 'all' ? '' : (sectionMemory.current[sId] || '');
    handleQuizSelect(rememberedQuiz, null, sId, true);
  }, [filterFolder, filterSection, filterQuiz, handleQuizSelect]);

  const handleFolderChange = useCallback((fId) => {
    // 1. Save old folder's section
    if (filterFolder !== 'all') {
      folderMemory.current[filterFolder] = filterSection;
      sessionStorage.setItem('ad_folder_to_section', JSON.stringify(folderMemory.current));
    }

    setFilterFolder(fId);

    // 2. Restore section for new folder (read from Ref)
    const rememberedSection = fId === 'all' ? 'all' : (folderMemory.current[fId] || 'all');
    handleSectionChange(rememberedSection, fId, true);
  }, [filterFolder, filterSection, handleSectionChange]);

  const handleScroll = useCallback((e) => {
    sessionStorage.setItem('ad_list_scroll', e.target.scrollTop);
  }, []);

  const validSections = useMemo(() => filterFolder === 'all' ? sections : sections.filter(s => s.class_id === filterFolder), [filterFolder, sections]);
  const validQuizzes = useMemo(() => filterSection === 'all'
    ? quizzes.filter(q => filterFolder === 'all' || validSections.some(vs => vs.id === q.section_id))
    : quizzes.filter(q => q.section_id === filterSection), [filterSection, filterFolder, quizzes, validSections]);

  const isFolderEmpty = useCallback((fId) => !quizzes.some(q => sections.some(s => s.class_id === fId && q.section_id === s.id)), [quizzes, sections]);
  const isSectionEmpty = useCallback((sId) => !quizzes.some(q => q.section_id === sId), [quizzes]);

  const filteredUsers = useMemo(() => users.filter(u => {
    if (!showObservers && u.is_observer) return false;
    if (filterCity !== 'all' && u.city_id !== filterCity) return false;
    if (filterSchool !== 'all' && u.school_id !== filterSchool) return false;
    if (filterClass !== 'all' && u.class_id !== filterClass) return false;
    if (searchQuery) {
      const name = `${u.last_name || ''} ${u.first_name || ''}`.toLowerCase();
      if (!name.includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  }), [users, showObservers, filterCity, filterSchool, filterClass, searchQuery]);

  const stats = useMemo(() => {
    if (attempts.length === 0) return { totalTime: 0, avgTime: 0, maxScore: 0, passed: 0, failed: 0, isSuspiciousUser: false };
    let totalTime = 0; let maxS = 0; let passed = 0; let failed = 0;
    attempts.forEach(a => {
      totalTime += a.time_spent_total;
      if (a.score > maxS) maxS = a.score;
      if (a.is_passed) passed++; else failed++;
    });
    const isSuspiciousUser = (attempts.filter(a => a.is_suspicious).length / attempts.length) > 0.4;
    return { totalTime, avgTime: Math.round(totalTime / attempts.length), maxScore: maxS, passed, failed, isSuspiciousUser };
  }, [attempts]);

  const handleDeleteClick = useCallback((type, data = null) => {
    setDeleteAction({ type, data });
    setDeleteLock(3);
    setShowDeleteModal(true);
  }, []);

  useEffect(() => {
    let timer;
    if (showDeleteModal && deleteLock > 0) {
      timer = setInterval(() => {
        setDeleteLock(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showDeleteModal, deleteLock]);

  const confirmDeleteAction = async () => {
    if (deleteLock > 0) return;
    try {
      if (deleteAction.type === 'user_all') {
        const { error } = await supabase.from('quiz_attempts').delete().eq('quiz_id', filterQuiz).eq('user_id', targetUser.id);
        if (error) throw error;
        await supabase.from('quiz_results').delete().eq('quiz_id', filterQuiz).eq('user_id', targetUser.id);
        setAttempts([]);
        setSelectedAttempt(null);
        fetchUsersForQuiz(filterQuiz, profile);
      } else if (deleteAction.type === 'attempt') {
        const { error } = await supabase.from('quiz_attempts').delete().eq('id', deleteAction.data.id);
        if (error) throw error;
        fetchAttempts(filterQuiz, targetUser.id);
        fetchUsersForQuiz(filterQuiz, profile);
      }
      setShowDeleteModal(false);
    } catch (err) {
      alert(`Ошибка при удалении: ${err.message}`);
    }
  };

  const isPrivileged = profile?.role === 'admin' || profile?.role === 'creator' || profile?.role === 'teacher' || profile?.role === 'editor';

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 70px)', overflow: 'hidden' }}>
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      {isPrivileged && (
        <div
          className={`details-sidebar ${sidebarOpen ? 'open' : ''}`}
          style={{
            width: sidebarOpen ? '320px' : '0',
            background: 'var(--card-bg)',
            borderRight: '1px solid rgba(0,0,0,0.05)',
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            flexShrink: 0
          }}
        >
          <SidebarUserList
            loading={loading} quizFolders={quizFolders} sections={sections} quizzes={quizzes}
            users={users} filteredUsers={filteredUsers} targetUser={targetUser}
            filterFolder={filterFolder} setFilterFolder={handleFolderChange}
            filterSection={filterSection} setFilterSection={handleSectionChange}
            filterQuiz={filterQuiz} handleQuizSelect={handleQuizSelect}
            filterCity={filterCity} setFilterCity={setFilterCity}
            filterSchool={filterSchool} setFilterSchool={setFilterSchool}
            filterClass={filterClass} setFilterClass={setFilterClass}
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            showObservers={showObservers} setShowObservers={setShowObservers}
            handleUserSelect={handleUserSelect} handleScroll={handleScroll}
            scrollRef={scrollRef} validSections={validSections} validQuizzes={validQuizzes}
            isFolderEmpty={isFolderEmpty} isSectionEmpty={isSectionEmpty}
            profile={profile} cities={cities} schools={schools} classes={classes} teacherClasses={teacherClasses} navigate={navigate}
            setSidebarOpen={setSidebarOpen}
          />
        </div>
      )}

      <div className="main-content" style={{ flex: 1, padding: '40px 60px', overflowY: 'auto', position: 'relative', height: '100%' }}>
        {isPrivileged && !sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex-center sidebar-toggle-btn"
            style={{ position: 'absolute', left: '20px', top: '40px', background: 'var(--card-bg)', color: 'inherit', padding: '10px', borderRadius: '10px', zIndex: 10 }}
          >
            <Menu size={20} />
          </button>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', marginLeft: (!sidebarOpen && isPrivileged) ? '50px' : '0' }}>
          <button onClick={() => navigate(-1)} className="flex-center" style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', boxShadow: 'none', padding: '10px 20px', width: 'max-content' }}>
            <ChevronLeft size={20} /> Вернуться
          </button>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(profile?.role === 'admin' || profile?.role === 'creator' || profile?.role === 'teacher' || targetQuiz?.author_id === profile?.id) && (
              <>
                <button
                  onClick={() => navigate(`/analytics?id=${filterQuiz}`)}
                  title="Общая аналитика"
                  style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '10px', borderRadius: '10px' }}
                >
                  <BarChart2 size={20} />
                </button>
                <button
                  onClick={() => navigate(`/redactor?id=${filterQuiz}`)}
                  title="Редактор"
                  style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit', padding: '10px', borderRadius: '10px' }}
                >
                  <Pencil size={20} />
                </button>
              </>
            )}
            {targetUser && targetQuiz && (
              <AiDetailedPromptButton userId={targetUser.id} quizId={targetQuiz.id} viewerProfile={profile} />
            )}
            {(profile?.role === 'admin' || profile?.role === 'creator') && targetUser && targetQuiz && (
              <button
                onClick={() => handleDeleteClick('user_all')}
                title="Удалить все результаты ученика по этому тесту"
                style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px', borderRadius: '10px' }}
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>

        {loading || contentLoading ? (
          <div className="animate" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="skeleton" style={{ height: '40px', width: '300px' }} />
            <div className="skeleton" style={{ height: '30px', width: '200px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', margin: '30px 0' }}>
              <div className="skeleton" style={{ height: '100px' }} />
              <div className="skeleton" style={{ height: '100px' }} />
              <div className="skeleton" style={{ height: '100px' }} />
            </div>
            <div className="skeleton" style={{ height: '240px' }} />
          </div>
        ) : (!targetQuiz || !targetUser) ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', flexDirection: 'column', opacity: 0.5, textAlign: 'center' }}>
            <BarChart2 size={64} style={{ marginBottom: '20px', color: 'var(--primary-color)' }} />
            <h2 style={{ padding: '0 20px' }}>
              {loading ? 'Загрузка данных...' : 'Выберите тест и ученика для анализа'}
            </h2>
          </div>
        ) : (
          <div className="animate">
            <h2 style={{ fontSize: '2rem', marginBottom: '10px', color: stats.isSuspiciousUser ? '#ef4444' : 'inherit' }}>
              {targetUser.last_name} {targetUser.first_name}
              {stats.isSuspiciousUser && <span style={{ marginLeft: '10px', fontSize: '0.9rem', background: '#ef4444', color: 'white', padding: '4px 12px', borderRadius: '20px', verticalAlign: 'middle' }}>Низкая успеваемость</span>}
            </h2>
            <h3 style={{ opacity: 0.6, fontSize: '1.2rem', marginBottom: '30px' }}>Тест: {targetQuiz.title}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Всего попыток</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{attempts.length}</div>
              </div>
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Успешных / Провальных</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#4ade80' }}>
                  {stats.passed} <span style={{ color: 'var(--text-color)', opacity: 0.3 }}>/</span> <span style={{ color: '#facc15' }}>{stats.failed}</span>
                </div>
              </div>
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Среднее время</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.avgTime} сек</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: '20px' }}>График попыток</h3>
              <AttemptChart
                attempts={attempts}
                selectedAttempt={selectedAttempt}
                setSelectedAttempt={setSelectedAttempt}
                targetQuiz={targetQuiz}
                stats={stats}
              />
              <div className="flex-center" style={{ gap: '15px', marginTop: '15px', fontSize: '0.8rem', opacity: 0.7, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', background: 'var(--primary-color)', borderRadius: '3px' }} /> Максимальный балл</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', background: '#3b82f6', borderRadius: '3px' }} /> 1-я попытка</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', background: '#4ade80', borderRadius: '3px' }} /> Успех</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', background: '#facc15', borderRadius: '3px' }} /> Провал</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '3px' }} /> Подозрительно</div>
              </div>
            </div>

            <AttemptDetailsView
              selectedAttempt={selectedAttempt}
              targetQuiz={targetQuiz}
              attempts={attempts}
              profile={profile}
              handleDeleteClick={handleDeleteClick}
              setDetailedImageModal={setDetailedImageModal}
            />
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card animate" style={{ maxWidth: '400px', width: '100%', padding: '30px', textAlign: 'center' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <AlertTriangle size={30} />
            </div>
            <h3 style={{ marginBottom: '10px' }}>Подтвердите удаление</h3>
            <p style={{ opacity: 0.7, marginBottom: '25px', fontSize: '0.95rem' }}>
              {deleteAction.type === 'user_all'
                ? `Вы уверены, что хотите удалить ВСЕ попытки пользователя ${targetUser.first_name} по тесту "${targetQuiz.title}"? Это действие необратимо.`
                : `Вы уверены, что хотите удалить выбранную попытку?`
              }
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowDeleteModal(false)} style={{ flex: 1, padding: '12px', background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
              <button
                onClick={confirmDeleteAction}
                disabled={deleteLock > 0}
                style={{
                  flex: 1, padding: '12px', background: '#ef4444', color: 'white',
                  opacity: deleteLock > 0 ? 0.5 : 1, cursor: deleteLock > 0 ? 'not-allowed' : 'pointer',
                  position: 'relative'
                }}
              >
                {deleteLock > 0 ? `Подождите (${deleteLock})` : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED IMAGE MODAL (GALLERY) */}
      {detailedImageModal.isOpen && detailedImageModal.images && detailedImageModal.images.length > 0 && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 99999, padding: '20px' }} onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }} onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; (() => setDetailedImageModal({ isOpen: false, images: [], currentImgIdx: 0 }))(e); }}}>
          <div className="animate" style={{ position: 'relative', width: '100%', maxWidth: '900px', maxHeight: 'max-content', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setDetailedImageModal({ isOpen: false, images: [], currentImgIdx: 0 })}
              style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.5)', color: 'white', padding: '10px', borderRadius: '50%', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', zIndex: 50, cursor: 'pointer', border: 'none' }}
              className="flex-center"
            >
              <X size={24} />
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', maxHeight: '55vh', padding: '0px' }}>
                <img src={resolveImgUrl(detailedImageModal.images[detailedImageModal.currentImgIdx])} alt="Preview" style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: '12px', border: '2px solid rgba(255,255,255,0.1)' }} />
                {detailedImageModal.images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailedImageModal(p => ({ ...p, currentImgIdx: p.currentImgIdx === 0 ? p.images.length - 1 : p.currentImgIdx - 1 })); }}
                      style={{ position: 'absolute', left: '-10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', padding: '15px', cursor: 'pointer', boxShadow: 'none' }}
                      className="flex-center"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailedImageModal(p => ({ ...p, currentImgIdx: p.currentImgIdx === p.images.length - 1 ? 0 : p.currentImgIdx + 1 })); }}
                      style={{ position: 'absolute', right: '-10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', padding: '15px', cursor: 'pointer', boxShadow: 'none' }}
                      className="flex-center"
                    >
                      <ChevronRight size={24} />
                    </button>
                  </>
                )}
                {detailedImageModal.images.length > 1 && (
                  <div style={{ position: 'absolute', bottom: '10px', color: 'rgba(255,255,255,0.9)', fontSize: '1rem', fontWeight: 'bold', background: 'rgba(0,0,0,0.5)', padding: '5px 15px', borderRadius: '20px' }}>
                    {detailedImageModal.currentImgIdx + 1} / {detailedImageModal.images.length}
                  </div>
                )}
              </div>
              <div style={{ background: 'var(--card-bg)', color: 'var(--text-color)', padding: '25px', borderRadius: '20px', marginTop: '15px', width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
                <h4 style={{ margin: '0 0 15px 0', fontSize: '1.2rem', lineHeight: '1.4' }}>{detailedImageModal.question}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ opacity: 0.6 }}>Ответ:</span>
                    <strong style={{ color: detailedImageModal.isCorrect ? '#4ade80' : '#f87171' }}>
                      {detailedImageModal.userAnswer}
                    </strong>
                    {detailedImageModal.isCorrect ? <CheckCircle size={18} color="#4ade80" /> : <XCircle size={18} color="#f87171" />}
                  </div>
                  {!detailedImageModal.isCorrect && detailedImageModal.correctAnswer && (
                    <div style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(74, 222, 128, 0.05)', borderRadius: '10px', marginTop: '5px' }}>
                      <span style={{ opacity: 0.6 }}>Правильный:</span>
                      <strong style={{ color: '#4ade80' }}>
                        {detailedImageModal.correctAnswer}
                      </strong>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '20px', fontSize: '0.9rem', opacity: 0.8, background: 'rgba(0,0,0,0.02)', padding: '10px 15px', borderRadius: '8px', marginTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={16} /> Эта попытка: <strong style={{ color: detailedImageModal.timeSpent > detailedImageModal.avgQTime * 1.5 ? '#facc15' : 'inherit' }}>{detailedImageModal.timeSpent}с</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <BarChart2 size={16} /> Среднее: <strong>{detailedImageModal.avgQTime}с</strong>
                    </div>
                  </div>

                  {detailedImageModal.explanation && (
                    <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '15px', border: '1px dashed rgba(99, 102, 241, 0.2)' }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px', color: 'var(--primary-color)' }}>Пояснение</div>
                      <div style={{ fontSize: '1rem', lineHeight: '1.5', opacity: 0.9 }}>{detailedImageModal.explanation}</div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const mobileStyles = `
@media (max-width: 768px) {
  .details-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 300px;
    max-width: 85%;
    height: 100vh !important;
    z-index: 1000;
    box-shadow: 10px 0 30px rgba(0,0,0,0.2);
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .details-sidebar.open {
    transform: translateX(0);
  }
  .sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    backdrop-filter: blur(2px);
    z-index: 999;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s;
  }
  .sidebar-overlay.active {
    opacity: 1;
    visibility: visible;
  }
  .main-content {
    padding: 20px !important;
  }
  .sidebar-toggle-btn {
    left: 10px !important;
    top: 20px !important;
  }
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = mobileStyles;
  document.head.append(style);
}

export default AnalyticsDetails;