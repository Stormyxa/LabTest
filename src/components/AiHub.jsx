import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MathRenderer from './MathRenderer';
import { X, Maximize2, Minimize2, Sparkles, Send, Download, Copy, RefreshCw, History, Trash2, ChevronLeft, ChevronRight, MessageSquare, Check, User, Shield, AlertTriangle } from 'lucide-react';
import { streamAiAnalysis, getAiHistory, saveAiAnalysis, deleteAiAnalysis } from '../lib/aiService';
import { createModalOverlay } from '../utils/blurUtils';
import './AiAnalysisModal.css';

const AiHub = ({ session, profile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [aiChatTitle, setAiChatTitle] = useState('ИИ-Хаб LabTest');
  
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, loading, streaming, error, limit
  const [accessError, setAccessError] = useState(null); // Access denial error
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);
  const [historyPanelWidth, setHistoryPanelWidth] = useState(() => {
    const saved = sessionStorage.getItem('ai_history_width');
    return saved ? parseInt(saved) : 250;
  });

  // Save history panel width when changed
  useEffect(() => {
    sessionStorage.setItem('ai_history_width', historyPanelWidth.toString());
  }, [historyPanelWidth]);
  
  const [position, setPosition] = useState({ x: window.innerWidth - 450, y: window.innerHeight - 650 });
  const [size, setSize] = useState({ width: 400, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Handle window resize to keep AI hub within bounds
  useEffect(() => {
    const handleResize = () => {
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
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
          setTimeout(() => {
            runStreaming(initialMessages, e.detail.instruction, e.detail.data, e.detail.contextType, e.detail.contextId, e.detail.title);
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
    }
  }, [session]);

  const loadHistory = async () => {
    try {
      const data = await getAiHistory(session.user.id);
      setHistory(data || []);
    } catch (e) {
      console.error('History load failed:', e);
    }
  };

  const startNewAnalysis = async (type, id, instruction, data, title) => {
    const userMsg = { role: 'user', content: `Анализ: ${title || type}` };
    const initialMessages = [userMsg];
    setMessages(initialMessages);
    setCurrentChatId(null);
    
    await runStreaming(initialMessages, instruction, data, type, id, title);
  };

  const runStreaming = async (chatMessages, instruction = null, contextData = null, type = null, id = null, title = null) => {
    setIsStreaming(true);
    setStatus('streaming');
    setAccessError(null); // Clear previous access errors
    
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
          // Fetch user's recent quiz attempts and performance data
          const { data: attempts } = await supabase
            .from('quiz_results')
            .select('*, quizzes!inner(title)')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(10);
          
          // Fetch user's classes and schools
          const { data: userClasses } = await supabase
            .from('class_members')
            .select('*, classes!inner(name)')
            .eq('user_id', session.user.id);
          
          return {
            profile: {
              name: `${profile.first_name} ${profile.last_name}`,
              role: profile.role,
              email: profile.email,
              school_id: profile.school_id,
              city_id: profile.city_id
            },
            recentAttempts: attempts || [],
            classes: userClasses || [],
            summary: {
              totalAttempts: attempts?.length || 0,
              averageScore: attempts?.reduce((sum, a) => sum + (a.score || 0), 0) / (attempts?.length || 1),
              recentActivity: attempts?.[0]?.created_at
            }
          };
        } catch (e) {
          console.error('Failed to gather user info:', e);
          return null;
        }
      };
      
      // Only include JSON context for the initial message or when instruction is provided
      if (instruction && chatMessages.length === 1) {
        apiMessages[0].content = `${instruction}\n\nКонтекст данных: ${JSON.stringify(contextData)}\n\nПользователь запросил анализ этого контекста.`;
      } else if (instruction && chatMessages.length > 1) {
        // For continued conversations, include comprehensive user data if talking about themselves
        if (isAboutUser) {
          const userInfo = await getUserInfo();
          if (userInfo) {
            apiMessages[0].content = `${instruction}\n\nДанные пользователя: ${JSON.stringify(userInfo, null, 2)}\n\nПродолжение диалога. Пользователь говорит о себе.`;
          } else {
            apiMessages[0].content = `${instruction}\n\nПродолжение диалога на основе предыдущего анализа.`;
          }
        } else {
          apiMessages[0].content = `${instruction}\n\nПродолжение диалога на основе предыдущего анализа.`;
        }
      } else if (!instruction && isAboutUser && profile && chatMessages.length === 1) {
        // For personal chat without analysis, include comprehensive user data
        const userInfo = await getUserInfo();
        if (userInfo) {
          apiMessages[0].content = `Пользователь говорит о себе. Данные пользователя: ${JSON.stringify(userInfo, null, 2)}\n\n${input}`;
        }
      }

      await streamAiAnalysis({
        messages: apiMessages,
        contextType: type,
        contextId: id,
        viewerRole: profile?.role || 'student',
        title: title || 'AI Chat',
        profile: profile,
        chatId: currentChatId, // Pass current chat ID to update existing chat
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
      console.error('Error reason:', e.reason);
      console.error('Error detail:', e.messageDetail);
      
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

  const startNewChat = () => {
    setMessages([]);
    setInput('');
    setCurrentChatId(null);
    setAiChatTitle('ИИ-Хаб LabTest');
    setAccessError(null);
    setInputDisabled(false);
  };

  const handleDeleteChat = (chatId) => {
    setChatToDelete(chatId);
    setShowDeleteModal(true);
  };

  const confirmDeleteChat = async () => {
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
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    
    const userMsg = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    
    await runStreaming(newMessages);
  };

  // Dragging logic
  const handleMouseDown = (e) => {
    if (e.target.closest('.no-drag')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    
    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
  };

  useEffect(() => {
    let animationFrameId = null;
    
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      // Throttle with requestAnimationFrame for smooth performance
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      
      animationFrameId = requestAnimationFrame(() => {
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragOffset.x)),
          y: Math.max(0, Math.min(window.innerHeight - size.height, e.clientY - dragOffset.y))
        });
      });
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      
      // Cleanup animation frame
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      
      // Restore text selection after resize
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    };
    
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      
      // Cleanup animation frame on unmount
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isDragging, dragOffset, size]);

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
        <div className={`ai-history-panel ${isHistoryOpen ? 'open' : ''}`} style={{ width: isHistoryOpen ? `${historyPanelWidth}px` : '0px' }}>
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
          {isHistoryOpen && (
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
                
                const onMouseMove = (e) => {
                  const newWidth = startWidth + (e.clientX - startX);
                  setHistoryPanelWidth(Math.max(200, Math.min(newWidth, size.width - 200)));
                };
                
                const onMouseUp = () => {
                  window.removeEventListener('mousemove', onMouseMove);
                  window.removeEventListener('mouseup', onMouseUp);
                };
                
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            />
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
            
            const onMouseMove = (e) => {
              const maxWidth = window.innerWidth - position.x - 20;
              const maxHeight = window.innerHeight - position.y - 20;
              
              setSize({
                width: Math.max(300, Math.min(startW + (e.clientX - startX), maxWidth)),
                height: Math.max(400, Math.min(startH + (e.clientY - startY), maxHeight))
              });
            };
            const onMouseUp = () => {
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
