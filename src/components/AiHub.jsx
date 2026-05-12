import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MathRenderer from './MathRenderer';
import { X, Maximize2, Minimize2, Sparkles, Send, Download, Copy, RefreshCw, History, Trash2, ChevronLeft, ChevronRight, MessageSquare, Check, User, Shield, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { streamAiAnalysis, getAiHistory, saveAiAnalysis, deleteAiAnalysis, searchUserFacts } from '../lib/aiService';
import { buildStudentRagPrompt, vectorizeConversation } from '../lib/ragService';
import { createModalOverlay } from '../utils/blurUtils';
import './AiAnalysisModal.css';

const AiHub = ({ session, profile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [aiChatTitle, setAiChatTitle] = useState('ИИ-Хаб LabTest');
  const [currentQuizId, setCurrentQuizId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, loading, streaming, error, limit
  
  // Refs to capture latest state for cleanup vectorization
  const messagesRef = useRef(messages);
  const chatIdRef = useRef(currentChatId);
  const contextIdRef = useRef(null);
  const titleRef = useRef(aiChatTitle);
  
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { chatIdRef.current = currentChatId; }, [currentChatId]);
  useEffect(() => { titleRef.current = aiChatTitle; }, [aiChatTitle]);
  const [accessError, setAccessError] = useState(null); // Access denial error
  const [plotlyLoaded, setPlotlyLoaded] = useState(false);

  // Load Plotly for visualizations
  useEffect(() => {
    if (window.Plotly) {
      setPlotlyLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.plot.ly/plotly-2.27.0.min.js';
    script.async = true;
    script.onload = () => setPlotlyLoaded(true);
    document.head.appendChild(script);
  }, []);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);
  const [historyPanelWidth, setHistoryPanelWidth] = useState(() => {
    const saved = sessionStorage.getItem('ai_history_width');
    return saved ? parseInt(saved) : 250;
  });

  // Save history panel width when changed (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      sessionStorage.setItem('ai_history_width', historyPanelWidth.toString());
    }, 300);
    return () => clearTimeout(timeout);
  }, [historyPanelWidth]);

  const [position, setPosition] = useState(() => {
    const savedPos = sessionStorage.getItem('ai_hub_position');
    const savedSize = sessionStorage.getItem('ai_hub_size');
    if (savedPos && savedSize) {
      const pos = JSON.parse(savedPos);
      const size = JSON.parse(savedSize);
      // Ensure position is within window bounds
      const x = Math.min(pos.x, window.innerWidth - size.width - 20);
      const y = Math.min(pos.y, window.innerHeight - size.height - 20);
      return { x: Math.max(0, x), y: Math.max(0, y) };
    }
    return { x: window.innerWidth - 450, y: window.innerHeight - 650 };
  });
  const [size, setSize] = useState(() => {
    const saved = sessionStorage.getItem('ai_hub_size');
    return saved ? JSON.parse(saved) : { width: 400, height: 600 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Save position and size to sessionStorage when changed (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      sessionStorage.setItem('ai_hub_position', JSON.stringify(position));
    }, 300);
    return () => clearTimeout(timeout);
  }, [position]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      sessionStorage.setItem('ai_hub_size', JSON.stringify(size));
    }, 300);
    return () => clearTimeout(timeout);
  }, [size]);

  // Handle window resize to keep AI hub within bounds (debounced)
  useEffect(() => {
    let timeout;
    const handleResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // Check if AI hub is out of bounds
        let needsUpdate = false;
        const newPosition = { ...position };
        const newSize = { ...size };

        // Check if AI hub is too far right
        if (position.x + size.width > windowWidth - 20) {
          newPosition.x = Math.max(0, windowWidth - size.width - 20);
          needsUpdate = true;
        }

        // Check if AI hub is too far down
        if (position.y + size.height > windowHeight - 20) {
          newPosition.y = Math.max(0, windowHeight - size.height - 20);
          needsUpdate = true;
        }

        // Check if AI hub is too far left
        if (position.x < 0) {
          newPosition.x = 0;
          needsUpdate = true;
        }

        // Check if AI hub is too far up
        if (position.y < 0) {
          newPosition.y = 0;
          needsUpdate = true;
        }

        // Check if AI hub is too wide for window
        if (size.width > windowWidth - 20) {
          newSize.width = windowWidth - 20;
          needsUpdate = true;
        }

        // Check if AI hub is too tall for window
        if (size.height > windowHeight - 20) {
          newSize.height = windowHeight - 20;
          needsUpdate = true;
        }

        if (needsUpdate) {
          setPosition(newPosition);
          setSize(newSize);
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [position, size]);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Global event listener to open AI Hub
  useEffect(() => {
    const handleOpenAiHub = (e) => {
      // Check access control before opening
      const userRole = profile?.role;
      const hasClass = profile?.class_id ? true : false;
      const isAuthenticated = !!userRole;

      if (!isAuthenticated) {
        setAccessError({
          type: 'NOT_AUTHENTICATED',
          message: 'Войдите в систему, чтобы использовать ИИ-анализ.'
        });
        setInputDisabled(true);
        setShowAccessModal(true);
        setIsOpen(true);
        setIsMinimized(false);
        return;
      }

      if (userRole === 'player' && !hasClass) {
        setAccessError({
          type: 'SPECTATOR',
          message: 'Наблюдатели (без класса) не имеют доступа к ИИ-анализу.'
        });
        setInputDisabled(true);
        setShowAccessModal(true);
        setIsOpen(true);
        setIsMinimized(false);
        return;
      }

      // Check if user is in first attempt mode
      const isFirstAttemptMode = localStorage.getItem('quiz_first_attempt_mode') === 'true';
      if (isFirstAttemptMode) {
        // Show restriction modal instead of opening AI
        showRestrictionModal();
        return;
      }

      // Toggle logic: if open and not minimized, minimize to bubble; otherwise open normally
      if (isOpen && !isMinimized) {
        setIsMinimized(true);
      } else {
        setIsOpen(true);
        setIsMinimized(false);

        // Pre-warm embedding model when opening
        import('../lib/embeddingService').then(m => m.preloadEmbeddingModel());

        if (e.detail?.title) {
          setAiChatTitle(e.detail.title);
        }

        // Auto-run analysis if instruction and data provided
        if (e.detail?.instruction && e.detail?.data) {
          // Create user-friendly message instead of showing system instructions
          let userMessage = '';
          if (e.detail.contextType === 'detailed_quiz') {
            userMessage = 'Проведи детальный анализ моих результатов по тесту';
          } else if (e.detail.contextType === 'quiz') {
            userMessage = 'Проанализируй мои результаты по тесту';
          } else if (e.detail.title) {
            userMessage = `Проведи анализ: ${e.detail.title}`;
          } else {
            userMessage = 'Проведи анализ предоставленных данных';
          }

          const initialMessages = [{ role: 'user', content: userMessage }];
          setMessages(initialMessages);
          setCurrentQuizId(e.detail.quizId || null);

          setTimeout(() => {
            runStreaming(initialMessages, e.detail.instruction, e.detail.data, e.detail.contextType, e.detail.contextId, e.detail.title, initialMessages, e.detail.quizId);
          }, 100);
        }
      }
    };

    window.addEventListener('open-ai-hub', handleOpenAiHub);
    return () => window.removeEventListener('open-ai-hub', handleOpenAiHub);
  }, [profile, isOpen, isMinimized]);

  // Auto-close AI chat when user starts first attempt
  useEffect(() => {
    const checkFirstAttemptStart = () => {
      const isFirstAttemptMode = localStorage.getItem('quiz_first_attempt_mode') === 'true';
      if (isFirstAttemptMode && isOpen) {
        setIsOpen(false);
        setIsMinimized(false);
      }
    };

    // Check periodically
    const interval = setInterval(checkFirstAttemptStart, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const showRestrictionModal = () => {
    const modal = document.createElement('div');
    Object.assign(modal.style, createModalOverlay(10001));
    modal.style.animation = 'fadeIn 0.3s ease-out';

    modal.innerHTML = `
      <div style="
        background: linear-gradient(135deg, #7c3aed, #6366f1);
        color: white;
        padding: 30px;
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        text-align: center;
        max-width: 400px;
        margin: 20px;
        animation: slideUp 0.4s ease-out;
      ">
        <div style="font-size: 48px; margin-bottom: 15px;">🚫</div>
        <h2 style="margin: 0 0 15px 0; font-size: 24px; font-weight: 700;">Доступ к ИИ ограничен</h2>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; opacity: 0.9;">
          Во время <strong>первой попытки теста</strong> ("Проверочная попытка") доступ к ИИ-помощнику временно запрещён.
        </p>
        <p style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.8;">
          Это необходимо для обеспечения <strong>честности результатов</strong> и предотвращения возможных подсказок.
        </p>
        <p style="margin: 15px 0 25px 0; font-size: 15px; font-weight: 600;">
          🎯 Завершите тест, и ИИ-чат станет доступен!
        </p>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 10px;
          transition: all 0.2s ease;
        " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">
          Понятно
        </button>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { 
          opacity: 0;
          transform: translateY(20px);
        }
        to { 
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);

    // Auto-close after 5 seconds or on click outside
    const timeout = setTimeout(() => {
      modal.remove();
      style.remove();
    }, 5000);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        clearTimeout(timeout);
        modal.remove();
        style.remove();
      }
    });
  };

  // Fetch history
  useEffect(() => {
    if (session?.user?.id) {
      loadHistory();
    } else {
      setHistory([]);
    }
  }, [session?.user?.id]);

  // Vectorize on close if there were new messages
  useEffect(() => {
    const handleUnload = () => {
      if (messagesRef.current.length > 2 && session?.user?.id) {
        vectorizeConversation(
          session.user.id, 
          titleRef.current || 'AI Анализ', 
          messagesRef.current, 
          contextIdRef.current
        );
      }
    };
    
    window.addEventListener('beforeunload', handleUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload();
    };
  }, [session?.user?.id]); // Only re-run if user changes

  const loadHistory = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const data = await getAiHistory(session.user.id);
      setHistory(data || []);
    } catch (e) {
      console.error('History load failed:', e);
    }
  }, [session?.user?.id]);

  const startNewAnalysis = async (type, id, instruction, data, title) => {
    const userMsg = { role: 'user', content: `Анализ: ${title || type}` };
    const initialMessages = [userMsg];
    setMessages(initialMessages);
    setCurrentChatId(null);

    await runStreaming(initialMessages, instruction, data, type, id, title, initialMessages);
  };

  const runStreaming = async (chatMessages, instruction = null, contextData = null, type = null, id = null, title = null, displayMessages = null, quizId = null) => {
    setIsStreaming(true);
    setStatus('streaming');
    setAccessError(null); // Clear previous access errors
    contextIdRef.current = id; // Track context for vectorization on cleanup

    let fullText = '';
    const assistantMsg = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      // Prepare full messages for API
      const apiMessages = chatMessages.map(m => ({ role: m.role, content: m.content }));

      // Check if user is talking about themselves
      const isAboutUser = input.toLowerCase().includes('я ') ||
        input.toLowerCase().includes('меня') ||
        input.toLowerCase().includes('мой') ||
        input.toLowerCase().includes('моя') ||
        input.toLowerCase().includes('мои') ||
        input.toLowerCase().includes('мне');

      // Gather comprehensive user info for personal conversations
      const getUserInfo = async () => {
        if (!profile || !session?.user?.id) return null;

        try {
          // Fetch user's recent detailed attempts for deep analysis
          const { data: recentAttempts, error: attemptsError } = await supabase
            .from('quiz_attempts')
            .select('*, quizzes(id, title, section_id, is_verified, is_public)')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(5);

          if (attemptsError) {
            console.error('Error fetching quiz_attempts:', attemptsError);
          }

          // Fetch sections for the attempts
          let sections = {};
          if (recentAttempts && recentAttempts.length > 0) {
            const sectionIds = [...new Set(recentAttempts.map(a => a.quizzes?.section_id).filter(Boolean))];
            if (sectionIds.length > 0) {
              const { data: sectionsData } = await supabase
                .from('quiz_sections')
                .select('id, name, book_url')
                .in('id', sectionIds);
              sections = Object.fromEntries((sectionsData || []).map(s => [s.id, s]));
            }
          }

          // Fetch user's class info (ONLY if they have a class)
          let userClass = null;
          if (profile.class_id) {
            const { data } = await supabase
              .from('classes')
              .select('name, school_id')
              .eq('id', profile.class_id)
              .maybeSingle();
            userClass = data;
          }

          return {
            profile: {
              name: `${profile.first_name} ${profile.last_name}`,
              role: profile.role,
              geo: `${profile.city_id ? 'City:' + profile.city_id : ''} ${profile.school_id ? 'School:' + profile.school_id : ''}`,
              class: userClass?.name || '—'
            },
            recentDetailedAttempts: (recentAttempts || []).map(a => ({
              id: a.id,
              quiz: a.quizzes?.title,
              subject: sections[a.quizzes?.section_id]?.name,
              book: sections[a.quizzes?.section_id]?.book_url,
              score: `${a.score}/${a.max_score}`,
              time: a.time_spent_total,
              timestamp: a.created_at,
              telemetry: {
                focus_lost: a.focus_lost_cnt,
                off_site_ms: a.off_site_ms,
                is_suspicious: a.is_suspicious,
                reason: a.suspicion_reason
              },
              // Include errors with question texts (from aiPromptBuilder logic but simplified)
              errors: (a.answers_data || [])
                .filter(ans => !ans.isCorrect && ans.chosenIndex !== null)
                .map(ans => {
                  const q = a.quizzes?.content?.questions?.[ans.originalIndex];
                  return q ? {
                    q: q.question,
                    ua: q.options?.[ans.chosenIndex] || '—',
                    ca: q.options?.[ans.correctIndex] || '—'
                  } : null;
                }).filter(Boolean).slice(0, 3)
            })),
            summary: {
              totalRecent: recentAttempts?.length || 0,
              avgScorePercent: recentAttempts?.reduce((sum, a) => sum + (a.score / (a.max_score || 1)) * 100, 0) / (recentAttempts?.length || 1)
            }
          };
        } catch (e) {
          console.error('Failed to gather user info:', e);
          return null;
        }
      };

      // Construction of the prompt with context
      let currentContextStr = '';

      if (instruction) {
        // Case: Detailed analysis mode (e.g. from AnalyticsDetails)
        const contextJson = contextData ? `\n\nКонтекст данных: ${JSON.stringify(contextData)}` : '';
        const recentMessage = chatMessages[chatMessages.length - 1].content;

        // Intent detection for better RAG search
        let searchQuery = recentMessage;
        const isErrorSearch = recentMessage.toLowerCase().includes('ошибк') ||
          recentMessage.toLowerCase().includes('неверн') ||
          recentMessage.toLowerCase().includes('разбор');

        if (isErrorSearch) {
          // Boost search with quiz title and status tags
          searchQuery = `[STATUS: WRONG] [QUESTION] "${aiChatTitle}" ${recentMessage}`;
        }

        // Search RAG for every message to provide maximum context
        let ragStr = '';
        if (session?.user?.id) {
          // If we are analyzing a specific student, we should search their RAG memory
          const targetUserId = (type === 'student' || type === 'detailed_quiz') 
            ? id 
            : session.user.id;

          const relevantFacts = await searchUserFacts(targetUserId, searchQuery, {
            quizId: quizId || currentQuizId,
            limit: 30
          });
          if (relevantFacts.length > 0) {
            ragStr = `\n\n### ИСТОРИЧЕСКИЙ КОНТЕКСТ ИЗ ПАМЯТИ (RAG)\n*Внимание: эти данные могут быть устаревшими или относиться к прошлым попыткам. Ты можешь просить пользователя предоставить более свежие данные через "Детальный анализ", если видишь противоречия.*\n${relevantFacts.map((f, i) => `${i + 1}. ${f.fact}`).join('\n')}`;
          }
        }

        const currentDataContext = contextData ? `\n\n### АКТУАЛЬНЫЕ ДАННЫЕ ДЛЯ АНАЛИЗА (ПРИОРИТЕТ)\n*Это текущий контекст, который пользователь просит проанализировать прямо сейчас.*\n${JSON.stringify(contextData)}` : '';

        apiMessages[0].content = `${instruction}${currentDataContext}${ragStr}\n\nПользователь запросил детальный анализ этого актуального контекста. В первую очередь опирайся на "АКТУАЛЬНЫЕ ДАННЫЕ". Ты имеешь право просить дополнительные данные по конкретным ученикам или тестам, если это поможет сделать анализ глубже.`;
      } else if (profile) {
        // Case: General chat mode
        const lastUserMsg = chatMessages[chatMessages.length - 1].content;
        const isErrorSearch = lastUserMsg.toLowerCase().includes('ошибк') ||
          lastUserMsg.toLowerCase().includes('неверн') ||
          lastUserMsg.toLowerCase().includes('разбор');

        const generalSearchQuery = isErrorSearch
          ? `[STATUS: WRONG] [QUESTION] ${lastUserMsg}`
          : lastUserMsg;

        const isTeacherRole = profile.role === 'teacher' || profile.role === 'editor';

        // For teachers: search RAG of their students (class context)
        // For students: search their own RAG
        let relevantFacts = [];
        let classStudentFacts = [];
        let classFactStr = '';
        
        const userInfoPromise = getUserInfo();
        const ownFactsPromise = session?.user?.id 
          ? searchUserFacts(session.user.id, generalSearchQuery, { quizId: currentQuizId, limit: 10 }) 
          : Promise.resolve([]);

        if (isTeacherRole) {
          // Teacher: also get facts from class students across all their classes
          try {
            // 1. Get teacher's classes
            const { data: teacherClasses } = await supabase
              .from('class_teachers')
              .select('class_id')
              .eq('email', session.user.email.toLowerCase());
            
            const classIds = teacherClasses?.map(tc => tc.class_id) || [];
            if (profile.class_id) classIds.push(profile.class_id);
            const uniqueClassIds = [...new Set(classIds)].filter(Boolean);

            if (uniqueClassIds.length > 0) {
              // 2. Get students from these classes
              const { data: classStudents } = await supabase
                .from('profiles')
                .select('id, first_name, last_name')
                .in('class_id', uniqueClassIds)
                .eq('is_observer', false)
                .neq('id', session.user.id)
                .limit(100);

              if (classStudents && classStudents.length > 0) {
                const { generateEmbedding } = await import('../lib/embeddingService');
                const queryVector = await generateEmbedding(generalSearchQuery);
                
                const studentFactPromises = classStudents.map(async (student) => {
                  return searchUserFacts(student.id, generalSearchQuery, { 
                    queryVector, 
                    limit: 5 
                  }).then(facts => (facts || []).map(f => ({ 
                    ...f, 
                    studentName: `${student.last_name} ${student.first_name}`,
                    studentId: student.id 
                  })));
                });

                const studentResults = await Promise.all(studentFactPromises);
                classStudentFacts = studentResults.flat().sort((a, b) => b.score - a.score).slice(0, 50);

                // Add a "Dry Facts" summary for the teacher (Hybrid mode)
                const { data: studentStats } = await supabase
                  .from('quiz_results')
                  .select('user_id, score, total_questions, is_passed, attempt_count')
                  .in('user_id', classStudents.map(s => s.id));
                
                const statsMap = {};
                (studentStats || []).forEach(s => {
                  if (!statsMap[s.user_id]) statsMap[s.user_id] = { tests: 0, avg: 0, sum: 0 };
                  statsMap[s.user_id].tests++;
                  statsMap[s.user_id].sum += (s.score / (s.total_questions || 1)) * 100;
                });

                const registry = classStudents.map(s => {
                  const stat = statsMap[s.id] || { tests: 0, sum: 0 };
                  return {
                    id: s.id.slice(0, 8),
                    n: `${s.last_name} ${s.first_name}`,
                    ts: stat.tests,
                    avg: stat.tests > 0 ? Math.round(stat.sum / stat.tests) : 0
                  };
                });

                classFactStr += `\n\nСВОДНЫЙ РЕЕСТР КЛАССА (Dry Facts):\n${JSON.stringify(registry)}`;
              }
            }
          } catch (e) {
            console.warn('Failed to fetch class student RAG:', e);
          }
        }

        const [userInfo, ownFacts] = await Promise.all([userInfoPromise, ownFactsPromise]);
        relevantFacts = ownFacts;

        const userInfoStr = userInfo ? `\nОбщая сводка: ${JSON.stringify(userInfo)}` : '';
        const ownFactStr = relevantFacts.length > 0
          ? `\n\nЛичные факты из памяти (RAG):\n${relevantFacts.map(f => `- ${f.fact}`).join('\n')}`
          : '';
        
        // Combine student facts with registry (if any)
        if (classStudentFacts.length > 0) {
          const ragPrefix = `\n\nФакты учеников класса (RAG):\n${classStudentFacts.map(f => `- [${f.studentName} | ID: ${f.studentId?.slice(0,8)}] ${f.fact}`).join('\n')}`;
          classFactStr = ragPrefix + classFactStr;
        }

        const roleContext = isTeacherRole
          ? `\nРоль пользователя: УЧИТЕЛЬ. Обращайся к нему на «вы». Он не ученик — он преподаёт и хочет знать об успехах/проблемах СВОИХ учеников. Не анализируй его личные попытки прохождения тестов как ученические.
Тебе доступен "Сводный Реестр Класса" (ID, ФИО, кол-во тестов, ср. балл) и RAG-факты по конкретным ситуациям. Сочетай "сухие цифры" из реестра с "живыми фактами" из RAG.`
          : '';

        apiMessages[0].content = `Контекст пользователя:${userInfoStr}${roleContext}${ownFactStr}${classFactStr}\n\nЗапрос: ${chatMessages[0].content}`;
      }

      await streamAiAnalysis({
        messages: apiMessages,
        contextType: type,
        contextId: id,
        userId: session.user.id,
        viewerRole: profile?.role || 'student',
        title: title || 'AI Chat',
        profile: profile,
        chatId: currentChatId, // Pass current chat ID to update existing chat
        displayMessages: displayMessages || chatMessages, // Pass user-friendly messages for display
        systemInstruction: `
          Ты - продвинутый педагогический ИИ-ассистент LabTest. 
          Твоя задача - помогать учителю и ученику анализировать результаты обучения.
          
          ВАЖНО: Для визуализации данных (диаграммы, графики, тренды) ОБЯЗАТЕЛЬНО используй формат JSON для библиотеки Plotly.js.
          Пример формата в твоем ответе:
          {
            "type": "chart",
            "data": {
              "data": [{ "x": ["Тест 1", "Тест 2"], "y": [70, 85], "type": "scatter", "mode": "lines+markers", "name": "Успеваемость" }],
              "layout": { "title": "Динамика результатов", "xaxis": {"title": "Попытки"}, "yaxis": {"title": "Баллы", "range": [0, 100]} }
            }
          }
          
          Используй Plotly для наглядной демонстрации прогресса.
          Пиши на русском языке. Будь конструктивным.
        `,
        onChunk: (chunk) => {
          fullText += chunk;
          setMessages(prev => {
            const newMsgs = [...prev];
            newMsgs[newMsgs.length - 1].content = fullText;
            return newMsgs;
          });
        },
        onDone: (fullText, savedChat) => {
          // Reload history after streaming completes
          loadHistory();
          // If this was a new chat, get the saved chat ID and set it as current
          if (!currentChatId && savedChat) {
            // Find the newly saved chat in history
            setTimeout(() => {
              loadHistory().then(() => {
                const newChat = history.find(h => h.data?.messages === chatMessages);
                if (newChat) setCurrentChatId(newChat.id);
              });
            }, 100);
          }
        }
      });

      setStatus('idle');
    } catch (e) {
      console.error('Streaming error:', e);
      console.error('Error message:', e.message);
      if (e.reason) console.error('Error reason:', e.reason);
      if (e.messageDetail) console.error('Error detail:', e.messageDetail);

      // Handle access denial errors specifically
      if (e.message?.includes('NO_ACCESS') || e.reason === 'NO_ACCESS' || e.message?.includes('SPECTATOR') || e.message?.includes('NOT_AUTHENTICATED')) {
        const errorType = e.reason === 'SPECTATOR' || e.message?.includes('SPECTATOR') ? 'SPECTATOR' :
          e.reason === 'NOT_AUTHENTICATED' || e.message?.includes('NOT_AUTHENTICATED') ? 'NOT_AUTHENTICATED' :
            'NO_ACCESS';
        setAccessError({
          type: errorType,
          message: e.messageDetail || e.message || 'Доступ к ИИ ограничен'
        });
        setInputDisabled(true);
        setMessages(prev => prev.filter(msg => msg.role !== 'assistant' || msg.content !== '')); // Remove empty assistant message
        setShowAccessModal(true); // Show modal
      } else {
        setStatus('error');
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const startNewChat = useCallback(() => {
    setMessages([]);
    setInput('');
    setCurrentChatId(null);
    setAiChatTitle('ИИ-Хаб LabTest');
    setAccessError(null);
    setInputDisabled(false);
  }, []);

  const handleDeleteChat = useCallback((chatId) => {
    setChatToDelete(chatId);
    setShowDeleteModal(true);
  }, []);

  const confirmDeleteChat = useCallback(async () => {
    if (!chatToDelete) return;

    try {
      await deleteAiAnalysis(chatToDelete);
      loadHistory();

      // If the deleted chat was the current one, start a new chat
      if (currentChatId === chatToDelete) {
        startNewChat();
      }

      setShowDeleteModal(false);
      setChatToDelete(null);
    } catch (e) {
      console.error('Failed to delete chat:', e);
    }
  }, [chatToDelete, currentChatId, loadHistory, startNewChat]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    await runStreaming(newMessages, null, null, null, null, null, newMessages, currentQuizId);
  }, [input, isStreaming, messages, currentQuizId]);

  // Dragging logic
  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('.no-drag')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });

    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
  }, [position]);

  useEffect(() => {
    let animationFrameId = null;

    const handleMouseMove = (e) => {
      if (!isDragging) return;

      // Throttle with requestAnimationFrame for smooth performance
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        // Clamp position within viewport boundaries
        const clampedX = Math.max(0, Math.min(newX, window.innerWidth - size.width));
        const clampedY = Math.max(0, Math.min(newY, window.innerHeight - size.height));
        
        setPosition({ x: clampedX, y: clampedY });
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const downloadChat = () => {
    const text = messages.map(m => `### ${m.role === 'user' ? 'Вы' : 'ИИ'}\n${m.content}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LabTest_AI_Chat_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
  };

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div className="ai-hub-bubble" onClick={() => setIsMinimized(false)}>
        <Sparkles size={28} />
        {isStreaming && <div className="badge"><RefreshCw size={10} className="spinner" /></div>}
      </div>
    );
  }

  return (
    <div
      className="ai-hub-container animate"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        opacity: isDragging ? 0.8 : 1
      }}
    >
      <div className="ai-hub-header" onMouseDown={handleMouseDown}>
        <div className="flex-center" style={{ gap: '10px' }}>
          <Sparkles size={18} />
          <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>ИИ-Хаб LabTest</span>
        </div>
        <div className="flex-center no-drag" style={{ gap: '8px' }}>
          <button className="ai-action-btn" onClick={startNewChat} title="Новый чат">
            <MessageSquare size={16} />
          </button>
          <button className="ai-action-btn" onClick={() => setIsHistoryOpen(!isHistoryOpen)} title="История">
            <History size={16} />
          </button>
          <button className="ai-action-btn" onClick={() => setIsMinimized(true)} title="Свернуть">
            <Minimize2 size={16} />
          </button>
          <button className="ai-action-btn" onClick={() => setIsOpen(false)} title="Закрыть">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="ai-hub-content">
        {/* History Panel */}
        <div className={`ai-history-panel ${isHistoryOpen ? 'open' : ''}`} style={{
          width: isHistoryOpen ? `${historyPanelWidth}px` : '0px',
          overflow: isHistoryOpen ? 'visible' : 'hidden'
        }}>
          {isHistoryOpen && (
            <>
              <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px' }}>
                <h4 style={{ margin: 0 }}>История</h4>
                <button className="no-drag" style={{ background: 'transparent', padding: 0 }} onClick={() => setIsHistoryOpen(false)}><X size={18} /></button>
              </div>
              <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1 }}>
                {history.map(item => (
                  <div
                    key={item.id}
                    className={`history-item ${currentChatId === item.id ? 'active' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <button
                      className="no-drag"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        padding: '4px',
                        cursor: 'pointer',
                        opacity: 0.6,
                        transition: 'opacity 0.2s',
                        marginRight: '8px'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChat(item.id);
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = '1'}
                      onMouseLeave={(e) => e.target.style.opacity = '0.6'}
                      title="Удалить чат"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div
                      style={{ flex: 1, cursor: 'pointer' }}
                      onClick={() => {
                        setMessages(item.data?.messages || [{ role: 'assistant', content: item.content }]);
                        setCurrentChatId(item.id);
                        setIsHistoryOpen(false);
                      }}
                    >
                      {item.data?.messages?.[0]?.content || item.cache_key}
                    </div>
                  </div>
                ))}
                {history.length === 0 && <div style={{ opacity: 0.4, fontSize: '0.8rem', textAlign: 'center' }}>История пуста</div>}
              </div>
              {/* History Panel Resizer */}
              <div
                className="no-drag"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '5px',
                  cursor: 'ew-resize',
                  background: 'transparent',
                  transition: 'background 0.2s'
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const startX = e.clientX;
                  const startWidth = historyPanelWidth;
                  let animationFrameId = null;

                  const onMouseMove = (e) => {
                    if (animationFrameId) {
                      cancelAnimationFrame(animationFrameId);
                    }
                    animationFrameId = requestAnimationFrame(() => {
                      const newWidth = startWidth + (e.clientX - startX);
                      setHistoryPanelWidth(Math.max(200, Math.min(newWidth, size.width - 200)));
                    });
                  };

                  const onMouseUp = () => {
                    if (animationFrameId) {
                      cancelAnimationFrame(animationFrameId);
                    }
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                  };

                  window.addEventListener('mousemove', onMouseMove);
                  window.addEventListener('mouseup', onMouseUp);
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              />
            </>
          )}
        </div>

        <div className="ai-chat-messages custom-scrollbar" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="flex-center" style={{ height: '100%', flexDirection: 'column', opacity: 0.5, textAlign: 'center', padding: '20px' }}>
              <MessageSquare size={40} style={{ marginBottom: '15px' }} />
              <p>Чем я могу помочь? Задай вопрос по тестам или нажми на кнопку анализа в любом разделе.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '20px' }}>
                {['Как улучшить оценки?', 'Топ моих ошибок', 'План подготовки'].map(t => (
                  <button
                    key={t}
                    className="no-drag"
                    style={{ padding: '6px 12px', fontSize: '0.75rem', background: 'rgba(0,0,0,0.05)', color: 'var(--text-color)' }}
                    onClick={() => { setInput(t); }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`ai-message ${msg.role}`}>
              <div className="ai-markdown-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    math: ({ node, inline, ...props }) => {
                      return <MathRenderer text={node.value} noSelect={false} />;
                    },
                    code: ({ node, inline, className, children, ...props }) => {
                      const match = /language-chart/.exec(className || '');
                      if (!inline && match) {
                        try {
                          const chartData = JSON.parse(String(children).replace(/\n/g, ' '));
                          return <AiChart data={chartData} />;
                        } catch (e) {
                          return <pre className={className} {...props}>{children}</pre>;
                        }
                      }
                      return <code className={className} {...props}>{children}</code>;
                    }
                  }}
                >{msg.content}</ReactMarkdown>
              </div>
              <div className="ai-message-actions">
                <button className="ai-action-btn" onClick={() => copyToClipboard(msg.content)} title="Копировать">
                  <Copy size={12} />
                </button>
              </div>
            </div>
          ))}

          {status === 'streaming' && (
            <div className="ai-status-tag streaming" style={{ alignSelf: 'flex-start', marginLeft: '20px' }}>
              <RefreshCw size={12} className="spinner" /> Печатает...
            </div>
          )}
        </div>

        <div className="ai-hub-footer">
          {/* Inline access denial message - always show when accessError is set */}
          {accessError && (
            <div style={{
              padding: '12px 16px',
              margin: '0 16px 12px 16px',
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: 'white',
              borderRadius: '12px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Shield size={18} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                  {accessError.type === 'SPECTATOR' ? 'Доступ ограничен' :
                    accessError.type === 'NOT_AUTHENTICATED' ? 'Требуется авторизация' :
                      'Нет доступа'}
                </div>
                <div style={{ opacity: 0.9, fontSize: '0.8rem' }}>
                  {accessError.type === 'SPECTATOR' ? 'Наблюдатели (без класса) не имеют доступа к ИИ-анализу.' :
                    accessError.type === 'NOT_AUTHENTICATED' ? 'Войдите в систему, чтобы использовать ИИ-анализ.' :
                      accessError.message}
                </div>
              </div>
            </div>
          )}

          <div className="ai-input-wrapper no-drag">
            <input
              ref={inputRef}
              type="text"
              placeholder={inputDisabled ? "Доступ ограничен" : "Спроси меня о чем угодно..."}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              disabled={isStreaming || inputDisabled}
              style={{
                opacity: inputDisabled ? 0.5 : 1,
                cursor: inputDisabled ? 'not-allowed' : 'text'
              }}
            />
            <div style={{ display: 'flex', gap: '5px', paddingRight: '5px' }}>
              <button className="ai-action-btn" onClick={downloadChat} title="Скачать .md">
                <Download size={14} />
              </button>
              <button
                onClick={handleSend}
                disabled={isStreaming || !input.trim()}
                style={{
                  background: 'var(--primary-color)',
                  width: '32px', height: '32px',
                  borderRadius: '50%', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Send size={14} color="white" />
              </button>
            </div>
          </div>
        </div>

        {/* Resizer */}
        <div
          className="ai-resizer no-drag"
          onMouseDown={(e) => {
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = size.width;
            const startH = size.height;
            let animationFrameId = null;

            const onMouseMove = (e) => {
              if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
              }
              animationFrameId = requestAnimationFrame(() => {
                const maxWidth = window.innerWidth - position.x - 20;
                const maxHeight = window.innerHeight - position.y - 20;
                const minWidth = isHistoryOpen ? historyPanelWidth + 250 : 300; // Ensure space for chat when history is open

                setSize({
                  width: Math.max(minWidth, Math.min(startW + (e.clientX - startX), maxWidth)),
                  height: Math.max(400, Math.min(startH + (e.clientY - startY), maxHeight))
                });
              });
            };
            const onMouseUp = () => {
              if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
              }
              window.removeEventListener('mousemove', onMouseMove);
              window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
          }}
        />
      </div>

      {/* Access Denial Modal */}
      {showAccessModal && createPortal(
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content animate" style={{ width: '450px', textAlign: 'center' }}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '60px', height: '60px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '20px', margin: '0 auto 20px' }}>
              <Shield size={32} />
            </div>
            <h2 style={{ marginBottom: '15px' }}>
              {accessError?.type === 'SPECTATOR' ? 'Доступ ограничен' :
                accessError?.type === 'NOT_AUTHENTICATED' ? 'Требуется авторизация' :
                  'Нет доступа'}
            </h2>
            <p style={{ opacity: 0.7, lineHeight: '1.6', marginBottom: '25px' }}>
              {accessError?.type === 'SPECTATOR' ?
                'Наблюдатели (без класса) не имеют доступа к ИИ-анализу. Присоединитесь к классу для получения доступа.' :
                accessError?.type === 'NOT_AUTHENTICATED' ?
                  'Войдите в систему, чтобы использовать ИИ-анализ.' :
                  accessError?.message || 'Доступ к ИИ ограничен'}
            </p>
            <button
              onClick={() => setShowAccessModal(false)}
              style={{ width: '100%', background: 'var(--primary-color)', color: 'white' }}
            >
              Понятно
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Chat Confirmation Modal - Inside AI Hub */}
      {showDeleteModal && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-secondary, #1e1e2e)',
            color: 'var(--text-primary, white)',
            padding: '30px',
            borderRadius: '20px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            textAlign: 'center',
            width: '100%',
            maxWidth: '400px',
            animation: 'slideUp 0.3s ease-out'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '60px',
              height: '60px',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              borderRadius: '20px',
              margin: '0 auto 20px'
            }}>
              <Trash2 size={32} />
            </div>
            <h2 style={{ marginBottom: '15px' }}>Удалить чат?</h2>
            <p style={{ opacity: 0.7, lineHeight: '1.6', marginBottom: '25px' }}>
              Вы уверены, что хотите удалить этот чат? Это действие нельзя отменить.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setChatToDelete(null);
                }}
                style={{
                  flex: 1,
                  background: 'var(--bg-tertiary, rgba(255,255,255,0.1))',
                  color: 'var(--text-primary, white)',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Отмена
              </button>
              <button
                onClick={confirmDeleteChat}
                style={{
                  flex: 1,
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiHub;

// Helper component for rendering charts in the chat
const AiChart = ({ data }) => {
  const chartRef = useRef(null);
  
  useEffect(() => {
    if (window.Plotly && chartRef.current) {
      const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { t: 30, r: 20, l: 40, b: 40 },
        font: { color: '#888', size: 10 },
        showlegend: data.showlegend || false,
        autosize: true,
        height: 250,
        ...data.layout
      };
      
      const config = { 
        displayModeBar: false, 
        responsive: true 
      };
      
      window.Plotly.newPlot(chartRef.current, data.data, layout, config);
    }
  }, [data]);

  return (
    <div className="ai-chart-wrapper" style={{ 
      width: '100%', 
      margin: '10px 0',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '12px',
      padding: '10px',
      border: '1px solid rgba(124, 58, 237, 0.1)'
    }}>
      <div ref={chartRef} style={{ width: '100%', height: '250px' }} />
    </div>
  );
};
