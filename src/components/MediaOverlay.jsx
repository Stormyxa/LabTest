import React, { useEffect, useState } from 'react';
import { X, Youtube, FileText, Maximize2, Minimize2, ExternalLink, Play } from 'lucide-react';

const MediaOverlay = ({ 
  isOpen, 
  onClose, 
  resources = [], 
  title = "Материалы", 
  onStartQuiz, 
  quiz,
  isSplitMode = false,
  initialIdx = 0
}) => {
  const [selectedIdx, setSelectedIdx] = useState(initialIdx);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setSelectedIdx(initialIdx);
  }, [initialIdx, isOpen]);

  useEffect(() => {
    if (isOpen && !isSplitMode) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen, isSplitMode]);

  if ((!isOpen && !isSplitMode) || !resources || resources.length === 0) return null;

  const current = resources[selectedIdx];

  const getEmbedUrl = (url) => {
    if (!url) return '';
    
    // YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const vidId = url.includes('v=') 
        ? url.split('v=')[1].split('&')[0] 
        : url.split('/').pop().split('?')[0];
      return `https://www.youtube.com/embed/${vidId}`;
    }

    // Google Drive
    if (url.includes('drive.google.com')) {
      let docId = '';
      if (url.includes('/file/d/')) {
        docId = url.split('/file/d/')[1].split('/')[0];
      } else if (url.includes('id=')) {
        docId = url.split('id=')[1].split('&')[0];
      }
      
      if (docId) {
        return `https://drive.google.com/file/d/${docId}/preview`;
      }
      return url.replace('/view', '/preview').replace('/edit', '/preview').replace('/sharing', '/preview');
    }

    return url;
  };

  const content = (
    <div 
      className={isSplitMode ? "" : "modal-content animate"} 
      onClick={e => e.stopPropagation()} 
      style={{ 
        width: isSplitMode ? '100%' : (isFullscreen ? '100%' : '90%'), 
        maxWidth: isSplitMode ? 'none' : (isFullscreen ? 'none' : '1000px'), 
        height: isSplitMode ? '100%' : (isFullscreen ? '100%' : '85vh'),
        borderRadius: (isFullscreen || isSplitMode) ? 0 : '25px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--card-bg)',
        boxShadow: isSplitMode ? 'none' : '0 20px 50px rgba(0,0,0,0.3)'
      }}
    >
      {/* Header */}
      <div style={{ 
        padding: '15px 25px', 
        borderBottom: '1px solid rgba(0,0,0,0.05)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: 'var(--card-bg)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div className="flex-center" style={{ 
            width: '40px', height: '40px', borderRadius: '10px', 
            background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)' 
          }}>
            {current?.url?.includes('youtu') ? <Youtube size={20} /> : <FileText size={20} />}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {current?.title || title}
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.5 }}>{selectedIdx + 1} из {resources.length}</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          {!isSplitMode && (
            <button 
              onClick={() => setIsFullscreen(!isFullscreen)} 
              className="flex-center"
              style={{ background: 'rgba(0,0,0,0.03)', padding: '10px', borderRadius: '10px', boxShadow: 'none' }}
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          )}
          <button 
            onClick={onClose} 
            className="flex-center"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px', borderRadius: '10px', boxShadow: 'none' }}
          >
            {isSplitMode ? <X size={20} /> : <X size={20} />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, position: 'relative', background: '#000' }}>
        <iframe
          src={getEmbedUrl(current?.url)}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      {/* Footer / Navigation */}
        <div style={{ 
          padding: isSplitMode ? '10px 20px' : '15px 25px', 
          background: 'var(--card-bg)', 
          borderTop: '1px solid rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px'
        }}>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', flex: 1, paddingBottom: isSplitMode ? '0' : '5px' }} className="custom-scrollbar">
            {resources.length > 1 ? resources.map((res, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedIdx(idx)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                  background: selectedIdx === idx ? 'var(--primary-color)' : 'rgba(0,0,0,0.05)',
                  color: selectedIdx === idx ? 'white' : 'inherit',
                  boxShadow: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {res.url?.includes('youtu') ? <Youtube size={12} /> : <FileText size={12} />}
                {res.title || `Ресурс ${idx + 1}`}
              </button>
            )) : (
              !isSplitMode && <span style={{ fontSize: '0.85rem', opacity: 0.5 }}>{quiz?.title || title}</span>
            )}
          </div>

        {onStartQuiz && (
          <button 
            onClick={() => { onClose(); onStartQuiz(); }}
            className="flex-center animate"
            style={{ 
              padding: '10px 20px', 
              background: 'var(--primary-color)', 
              color: 'white', 
              borderRadius: '10px', 
              fontWeight: 'bold',
              gap: '8px',
              flexShrink: 0,
              fontSize: '0.9rem'
            }}
          >
            <Play size={16} fill="white" /> Тест
          </button>
        )}
      </div>
    </div>
  );

  if (isSplitMode) return content;

  return (
    <div className="modal-overlay" style={{ zIndex: 2000, padding: isFullscreen ? 0 : '20px' }} onClick={onClose}>
      {content}
    </div>
  );
};

export default MediaOverlay;
