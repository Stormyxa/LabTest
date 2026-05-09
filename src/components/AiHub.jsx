import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MathRenderer from './MathRenderer';
import { X, Maximize2, Minimize2, Sparkles, Send, Download, Copy, RefreshCw, History, Trash2, ChevronLeft, ChevronRight, MessageSquare, Check, User } from 'lucide-react';
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
  
  const [position, setPosition] = useState({ x: window.innerWidth - 450, y: window.innerHeight - 650 });
  const [size, setSize] = useState({ width: 400, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Global event listener to open AI Hub
  useEffect(() => {
    const handleOpen = (e) => {
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

    window.addEventListener('open-ai-hub', handleOpen);
    return () => window.removeEventListener('open-ai-hub', handleOpen);
  }, [isOpen, isMinimized]);

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
    // Check limits (client side check)
    const todayCount = history.filter(h => new Date(h.created_at).toDateString() === new Date().toDateString()).length;
    const limit = profile?.role === 'player' ? 10 : (profile?.role === 'admin' ? 999 : 50);
    
    if (todayCount >= limit) {
      setStatus('limit');
      setMessages(prev => [...prev, { role: 'assistant', content: `🛑 **Лимит достигнут.**\nВы использовали все ${limit} запросов на сегодня. Возвращайтесь завтра!` }]);
      return;
    }

    setIsStreaming(true);
    setStatus('streaming');
    
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
        onChunk: (chunk) => {
          fullText += chunk;
          setMessages(prev => {
            const newMsgs = [...prev];
            newMsgs[newMsgs.length - 1].content = fullText;
            return newMsgs;
          });
        }
      });

      // Save to history only if not already saved by streaming completion
      if (!instruction) {
        const cacheKey = `chat_${Date.now()}_${session.user.id}`;
        await saveAiAnalysis({
          cache_key: cacheKey,
          user_id: session.user.id,
          context_type: 'chat',
          context_id: null,
          title: 'AI Chat',
          messages: [...chatMessages, { role: 'assistant', content: fullText }]
        });
        loadHistory();
      }
      
      setStatus('idle');
    } catch (e) {
      console.error('Streaming error:', e);
      setStatus('error');
    } finally {
      setIsStreaming(false);
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
        <div className={`ai-history-panel ${isHistoryOpen ? 'open' : ''}`}>
          <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '15px' }}>
            <h4 style={{ margin: 0 }}>История</h4>
            <button className="no-drag" style={{ background: 'transparent', padding: 0 }} onClick={() => setIsHistoryOpen(false)}><X size={18} /></button>
          </div>
          <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1 }}>
            {history.map(item => (
              <div 
                key={item.id} 
                className={`history-item ${currentChatId === item.id ? 'active' : ''}`}
                onClick={() => {
                  setMessages(item.data?.messages || [{ role: 'assistant', content: item.content }]);
                  setCurrentChatId(item.id);
                  setIsHistoryOpen(false);
                }}
              >
                {item.data?.messages?.[0]?.content || item.cache_key}
              </div>
            ))}
            {history.length === 0 && <div style={{ opacity: 0.4, fontSize: '0.8rem', textAlign: 'center' }}>История пуста</div>}
          </div>
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
          <div className="ai-input-wrapper no-drag">
            <input 
              ref={inputRef}
              type="text" 
              placeholder="Спроси меня о чем угодно..." 
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              disabled={isStreaming}
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
              setSize({
                width: Math.max(300, startW + (e.clientX - startX)),
                height: Math.max(400, startH + (e.clientY - startY))
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
    </div>
  );
};

export default AiHub;
