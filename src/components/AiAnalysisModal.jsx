import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Sparkles, Copy, Check, Download, RefreshCw, Send, AlertTriangle } from 'lucide-react';
import {
  getCachedAnalysis,
  streamAiAnalysis,
  buildInitialMessage,
  downloadChatAsMarkdown,
  clearLocalAiCache,
} from '../lib/aiService';
import './AiAnalysisModal.css';

/**
 * AI Analysis Modal with streaming, chat continuation, and markdown rendering.
 *
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - title: string (e.g. "Анализ ученика Иванов А.")
 * - cacheKey: string (from buildAiCacheKey)
 * - contextType: 'student' | 'quiz' | 'class' | 'detailed_quiz'
 * - contextId: string (entity UUID)
 * - viewerRole: 'student' | 'teacher'
 * - instruction: string (from aiPromptBuilder)
 * - data: object (JSON data from aiPromptBuilder)
 */
const AiAnalysisModal = ({
  isOpen,
  onClose,
  title,
  cacheKey,
  contextType,
  contextId,
  viewerRole,
  instruction,
  data,
}) => {
  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userInput, setUserInput] = useState('');
  const [copyStatus, setCopyStatus] = useState(false);
  const [usedModel, setUsedModel] = useState(null);
  const [modalSize, setModalSize] = useState({ width: 800, height: 600 });
  const [isResizing, setIsResizing] = useState(false);

  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const hasInitialized = useRef(false);
  const modalRef = useRef(null);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  // Initialize: check cache or start new analysis
  useEffect(() => {
    if (!isOpen || hasInitialized.current) return;
    hasInitialized.current = true;

    const init = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Check cache
        const cached = await getCachedAnalysis(cacheKey);

        if (cached) {
          setMessages(cached.messages);
          setIsLoading(false);
          setTimeout(scrollToBottom, 100);
          return;
        }

        // No cache — start fresh analysis
        if (!instruction) {
          setError('Нет данных для анализа');
          setIsLoading(false);
          return;
        }

        const initialMsg = buildInitialMessage(instruction, data);
        setMessages([initialMsg]);
        setIsLoading(false);

        // Start streaming
        startStreaming([initialMsg]);
      } catch (err) {
        console.error('AI init error:', err);
        setError('Ошибка инициализации: ' + err.message);
        setIsLoading(false);
      }
    };

    init();

    return () => {
      abortRef.current?.abort();
    };
  }, [isOpen, cacheKey, instruction, data, scrollToBottom]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      hasInitialized.current = false;
      setStreamingText('');
      setIsStreaming(false);
      setError(null);
      setUserInput('');
      setCopyStatus(false);
      setMessages([]);
      abortRef.current?.abort();
    }
  }, [isOpen]);

  const startStreaming = useCallback((msgs) => {
    setIsStreaming(true);
    setStreamingText('');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    streamAiAnalysis({
      messages: msgs.map(m => ({ role: m.role, content: m.content })),
      cacheKey,
      contextType,
      contextId,
      viewerRole,
      title,
      signal: controller.signal,
      onChunk: (chunk) => {
        setStreamingText(prev => prev + chunk);
        scrollToBottom();
      },
      onDone: (fullText) => {
        setMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
        setStreamingText('');
        setIsStreaming(false);
        scrollToBottom();
      },
      onError: (errMsg) => {
        setError(errMsg);
        setIsStreaming(false);
        setStreamingText('');
      },
    });
  }, [cacheKey, contextType, contextId, viewerRole, title, scrollToBottom]);

  // Send follow-up message
  const handleSendFollowUp = useCallback(() => {
    const text = userInput.trim();
    if (!text || isStreaming) return;

    const newUserMsg = { role: 'user', content: text, ts: new Date().toISOString() };
    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setUserInput('');
    scrollToBottom();

    startStreaming(updatedMessages);
  }, [userInput, isStreaming, messages, startStreaming, scrollToBottom]);

  // Refresh analysis
  const handleRefresh = useCallback(() => {
    if (isStreaming) return;
    abortRef.current?.abort();
    clearLocalAiCache(cacheKey);

    const initialMsg = buildInitialMessage(instruction, data);
    setMessages([initialMsg]);
    setStreamingText('');
    setError(null);
    startStreaming([initialMsg]);
  }, [isStreaming, cacheKey, instruction, data, startStreaming]);

  // Copy last AI response
  const handleCopy = useCallback(async () => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;

    try {
      await navigator.clipboard.writeText(lastAssistant.content);
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), 2000);
    } catch {}
  }, [messages]);

  // Download as .md
  const handleDownload = useCallback(() => {
    downloadChatAsMarkdown(messages, title);
  }, [messages, title]);

  // Key handling
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendFollowUp();
    }
  }, [handleSendFollowUp]);

  // Resize handlers
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = modalSize.width;
    const startHeight = modalSize.height;

    const handleMouseMove = (moveEvent) => {
      const newWidth = Math.max(400, startWidth + (moveEvent.clientX - startX));
      const newHeight = Math.max(300, startHeight + (moveEvent.clientY - startY));
      setModalSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [modalSize]);

  if (!isOpen) return null;

  const hasAssistantMessages = messages.some(m => m.role === 'assistant');

  return (
    <div
      className="ai-modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = 'true'; }}
      onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === 'true') { e.target.dataset.md = 'false'; onClose(); } }}
    >
      <div 
        ref={modalRef}
        className="ai-modal-container" 
        onClick={e => e.stopPropagation()}
        style={{ 
          width: modalSize.width, 
          height: modalSize.height,
          minWidth: '400px',
          minHeight: '300px'
        }}
      >
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-header-left">
            <div className={`ai-modal-icon ${isStreaming ? 'generating' : ''}`}>
              <Sparkles size={22} />
            </div>
            <div className="ai-modal-title-group">
              <h3 className="ai-modal-title">{title || 'ИИ-Анализ'}</h3>
              <p className="ai-modal-subtitle">
                {isStreaming ? 'Генерация...' : usedModel ? `Модель: ${usedModel}` : 'Gemini AI'}
              </p>
            </div>
          </div>
          <div className="ai-modal-header-actions">
            {hasAssistantMessages && (
              <>
                <button
                  className="ai-modal-header-btn"
                  onClick={handleCopy}
                  title="Скопировать ответ"
                >
                  {copyStatus ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <button
                  className="ai-modal-header-btn"
                  onClick={handleDownload}
                  title="Скачать чат (.md)"
                >
                  <Download size={16} />
                </button>
                <button
                  className="ai-modal-header-btn"
                  onClick={handleRefresh}
                  disabled={isStreaming}
                  title="Обновить анализ"
                >
                  <RefreshCw size={16} className={isStreaming ? 'spinner' : ''} />
                </button>
              </>
            )}
            <button className="ai-modal-header-btn" onClick={onClose} title="Закрыть">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="ai-modal-messages">
          {isLoading && (
            <div className="ai-typing-indicator">
              <div className="ai-typing-dots">
                <span /><span /><span />
              </div>
              Загрузка...
            </div>
          )}

          {error && (
            <div className="ai-error-banner">
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          {messages.filter(msg => msg.role !== 'system').map((msg, idx) => {
            if (msg.role === 'user') {
              const isLong = msg.content.length > 500;
              return (
                <div key={idx} className="ai-msg ai-msg-user">
                  <div className="ai-msg-user-label">
                    <Sparkles size={10} />
                    Запрос
                  </div>
                  {isLong ? (
                    <div className="ai-msg-user-truncated">
                      📊 Отправлены данные аналитики для анализа
                    </div>
                  ) : (
                    <div>{msg.content}</div>
                  )}
                </div>
              );
            }

            if (msg.role === 'assistant') {
              return (
                <div key={idx} className="ai-msg ai-msg-assistant">
                  <div className="ai-msg-assistant-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {/* Streaming text */}
          {isStreaming && streamingText && (
            <div className="ai-msg ai-msg-assistant">
              <div className="ai-msg-assistant-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingText}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Typing indicator during streaming without text yet */}
          {isStreaming && !streamingText && !isLoading && (
            <div className="ai-typing-indicator">
              <div className="ai-typing-dots">
                <span /><span /><span />
              </div>
              ИИ анализирует данные...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area — always visible for chat continuation */}
        {!isLoading && (
          <div className="ai-modal-input-area">
            <textarea
              ref={inputRef}
              className="ai-modal-input"
              placeholder={isStreaming ? 'Подождите завершения...' : 'Задайте уточняющий вопрос...'}
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              rows={1}
            />
            <button
              className="ai-modal-send-btn"
              onClick={handleSendFollowUp}
              disabled={isStreaming || !userInput.trim()}
              title="Отправить"
            >
              <Send size={16} />
            </button>
          </div>
        )}
        
        {/* Resizer handle */}
        <div 
          className="ai-resizer"
          onMouseDown={handleMouseDown}
          style={{ cursor: isResizing ? 'nwse-resize' : 'nwse-resize' }}
        />
      </div>
    </div>
  );
};

export default React.memo(AiAnalysisModal);
