import React, { useState, useEffect, useRef } from 'react';
import { 
  Book, Maximize2, Play, Pause, Volume2, VolumeX, 
  Settings, FileText, ChevronLeft, ChevronRight 
} from 'lucide-react';

const ResourcePlayer = ({ resources, activeIdx, setActiveIdx, isMobile, onOpenModal, inline }) => {
  if (!resources || resources.length === 0) return null;
  const res = resources[activeIdx];

  const getYoutubeId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const ytId = getYoutubeId(res.url);

  // --- YouTube API Logic ---
  const [player, setPlayer] = useState(null);
  const [playerState, setPlayerState] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showPersistentUI, setShowPersistentUI] = useState(true);
  const persistentTimeoutRef = useRef(null);
  const timeUpdateRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  useEffect(() => {
    if (ytId) {
      if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
      
      const checkAndInit = () => {
        if (window.YT && window.YT.Player) {
          initPlayer();
        } else {
          setTimeout(checkAndInit, 100);
        }
      };

      if (!window.onYouTubeIframeAPIReady) {
        window.onYouTubeIframeAPIReady = () => initPlayer();
      }
      
      checkAndInit();
    }
    return () => {
      if (timeUpdateRef.current) clearInterval(timeUpdateRef.current);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (persistentTimeoutRef.current) clearTimeout(persistentTimeoutRef.current);
    };
  }, [ytId]);

  const initPlayer = () => {
    const playerElementId = `yt-player-${inline ? 'inline' : 'modal'}-${activeIdx}`;
    const el = document.getElementById(playerElementId);
    if (!el) return;

    if (window.YT_INSTANCES === undefined) window.YT_INSTANCES = {};
    if (window.YT_INSTANCES[playerElementId]) {
        try { window.YT_INSTANCES[playerElementId].destroy(); } catch(e) {}
    }

    window.YT_INSTANCES[playerElementId] = new window.YT.Player(playerElementId, {
      videoId: ytId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        origin: window.location.origin
      },
      events: {
        onReady: (event) => {
          setPlayer(event.target);
          setDuration(event.target.getDuration());
          event.target.setVolume(volume);
        },
        onStateChange: (event) => {
          setPlayerState(event.data);
          if (event.data === 1) { // Playing
            setDuration(event.target.getDuration());
            startTimeUpdate(event.target);
            
            setShowPersistentUI(true);
            if (persistentTimeoutRef.current) clearTimeout(persistentTimeoutRef.current);
            persistentTimeoutRef.current = setTimeout(() => {
              setShowPersistentUI(false);
            }, 5000);

            setIsHovered(false);
          } else {
            stopTimeUpdate();
            setShowPersistentUI(true);
          }
        }
      }
    });
  };

  const startTimeUpdate = (p) => {
    if (timeUpdateRef.current) clearInterval(timeUpdateRef.current);
    timeUpdateRef.current = setInterval(() => {
      if (p && p.getCurrentTime) {
        const t = p.getCurrentTime();
        if (typeof t === 'number') setCurrentTime(t);
        const d = p.getDuration();
        if (d > 0) setDuration(d);
      }
    }, 250);
  };

  const stopTimeUpdate = () => {
    if (timeUpdateRef.current) clearInterval(timeUpdateRef.current);
  };

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (!player) return;
    if (playerState === 1) player.pauseVideo();
    else player.playVideo();
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (player) player.seekTo(time, true);
  };

  const handleVolume = (e) => {
    const val = parseInt(e.target.value);
    setVolume(val);
    if (player) {
      player.setVolume(val);
      if (val > 0) {
        player.unMute();
        setIsMuted(false);
      }
    }
  };

  const toggleMute = (e) => {
    if (e) e.stopPropagation();
    if (!player) return;
    if (isMuted) {
      player.unMute();
      setIsMuted(false);
      player.setVolume(volume || 50);
    } else {
      player.mute();
      setIsMuted(true);
    }
  };

  const formatTime = (s) => {
    if (isNaN(s) || s === undefined) return "0:00";
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const handleMouseMove = () => {
    setIsHovered(true);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      if (playerState === 1) setIsHovered(false);
    }, 2000);
  };

  const containerStyle = inline ? {
    width: '100%',
    aspectRatio: ytId ? '16/9' : 'auto',
    minHeight: ytId ? '265px' : '650px',
    height: 'auto',
    background: 'var(--card-bg)',
    borderRadius: '20px',
    border: '1px solid var(--border-color)',
    overflow: 'hidden',
    marginBottom: '20px',
    position: 'relative'
  } : {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--card-bg)',
    overflow: 'hidden'
  };

  const showUI = isHovered || playerState !== 1 || showPersistentUI;

  return (
    <div 
      className="resource-player-container" 
      style={containerStyle}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playerState === 1 && setIsHovered(false)}
    >
      {/* Header */}
      {inline && (
        <div className="flex-center" style={{ 
            padding: '12px 20px', 
            background: 'rgba(99, 102, 241, 0.03)', 
            justifyContent: 'space-between', 
            borderBottom: '1px solid rgba(0,0,0,0.05)',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: showUI ? 1 : 0,
            transform: showUI ? 'translateY(0)' : 'translateY(-20px)',
            zIndex: 30
        }}>
          <div className="flex-center" style={{ gap: '10px' }}>
            <div className="flex-center" style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--primary-color)', color: 'white' }}>
              <Book size={16} />
            </div>
            <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{res.title || 'Материалы'}</span>
          </div>
          {onOpenModal && (
            <button
              onClick={onOpenModal}
              className="flex-center"
              style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '6px', borderRadius: '8px', color: 'var(--primary-color)', boxShadow: 'none', border: 'none' }}
            >
              <Maximize2 size={16} />
            </button>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, position: 'relative', background: ytId ? '#000' : 'var(--bg-color)', overflow: 'hidden' }}>
        {ytId ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            {/* Masking Bars - Taller and More Opaque for Full Scale Video */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '110px',
              background: 'linear-gradient(to bottom, rgba(10,10,11,1) 0%, rgba(10,10,11,1) 70%, rgba(10,10,11,0) 100%)',
              zIndex: 15,
              pointerEvents: 'none',
              opacity: showUI ? 1 : 0,
              transform: showUI ? 'translateY(0)' : 'translateY(-100%)',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              willChange: 'transform, opacity'
            }} />
            
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '170px',
              background: 'linear-gradient(to top, rgba(10,10,11,1) 0%, rgba(10,10,11,1) 70%, rgba(10,10,11,0) 100%)',
              zIndex: 15,
              pointerEvents: 'none',
              opacity: showUI ? 1 : 0,
              transform: showUI ? 'translateY(0)' : 'translateY(100%)',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              willChange: 'transform, opacity'
            }} />

            {/* Transparent click layer - Blocks YT interaction, handles toggle */}
            <div 
              onClick={togglePlay}
              style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'pointer' }}
            ></div>

            {/* The Player Div - NO CROP SCALE */}
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div id={`yt-player-${inline ? 'inline' : 'modal'}-${activeIdx}`} style={{ width: '100%', height: '100%' }}></div>
            </div>
            
            <div 
              className="player-controls"
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '20px 30px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: showUI ? 1 : 0,
                transform: showUI ? 'translateY(0)' : 'translateY(10px)',
                zIndex: 20
              }}
            >
              <div style={{ position: 'relative', width: '100%', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', cursor: 'pointer' }}>
                <input 
                  type="range"
                  min="0"
                  max={duration || 100}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: '-5px',
                    width: '100%',
                    height: '14px',
                    opacity: 0,
                    zIndex: 25,
                    cursor: 'pointer'
                  }}
                />
                <div style={{ 
                  position: 'absolute', 
                  left: 0, 
                  top: 0, 
                  height: '100%', 
                  width: `${(currentTime / (duration || 1)) * 100}%`, 
                  background: 'var(--primary-color)',
                  borderRadius: '2px',
                  boxShadow: '0 0 10px var(--primary-color)',
                  transition: 'width 0.1s linear'
                }} />
              </div>

              <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                <div className="flex-center" style={{ gap: '15px' }}>
                  <button onClick={togglePlay} style={{ background: 'transparent', color: 'white', padding: 0, boxShadow: 'none' }}>
                    {playerState === 1 ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                  </button>
                  
                  <div className="flex-center" style={{ gap: '10px' }}>
                    <button onClick={toggleMute} style={{ background: 'transparent', color: 'white', padding: 0, boxShadow: 'none' }}>
                      {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                    <div style={{ width: '80px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', position: 'relative', cursor: 'pointer' }}>
                        <input 
                          type="range"
                          min="0"
                          max="100"
                          value={isMuted ? 0 : volume}
                          onChange={handleVolume}
                          onClick={(e) => e.stopPropagation()}
                          style={{ 
                            position: 'absolute',
                            inset: 0,
                            width: '100%', 
                            height: '100%', 
                            cursor: 'pointer', 
                            opacity: 0,
                            zIndex: 2
                          }}
                        />
                        <div style={{ 
                            position: 'absolute', 
                            left: 0, 
                            top: 0, 
                            height: '100%', 
                            width: `${isMuted ? 0 : volume}%`, 
                            background: 'white', 
                            borderRadius: '2px' 
                        }} />
                    </div>
                  </div>

                  <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: '500', minWidth: '100px', textAlign: 'left', opacity: 0.8 }}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="flex-center" style={{ gap: '15px', position: 'relative' }}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }} 
                    style={{ background: 'transparent', color: 'white', padding: 0, boxShadow: 'none' }}
                  >
                    <Settings size={20} style={{ transform: showSettings ? 'rotate(90deg)' : 'none', transition: 'transform 0.3s' }} />
                  </button>

                  {showSettings && (
                    <div style={{
                      position: 'absolute',
                      bottom: '40px',
                      right: 0,
                      background: 'rgba(20, 20, 21, 0.98)',
                      backdropFilter: 'blur(15px)',
                      borderRadius: '12px',
                      padding: '8px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      minWidth: '130px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      zIndex: 100,
                      boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                    }}>
                      <p style={{ margin: '4px 0 6px 8px', fontSize: '0.65rem', color: 'white', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Скорость</p>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                        <button 
                          key={rate}
                          onClick={(e) => { e.stopPropagation(); setPlaybackRate(rate); if (player) player.setPlaybackRate(rate); setShowSettings(false); }}
                          style={{
                            padding: '8px 12px',
                            background: playbackRate === rate ? 'var(--primary-color)' : 'transparent',
                            color: 'white',
                            fontSize: '0.8rem',
                            textAlign: 'left',
                            borderRadius: '8px',
                            boxShadow: 'none',
                            fontWeight: playbackRate === rate ? 'bold' : 'normal'
                          }}
                        >
                          {rate === 1 ? 'Обычная' : `${rate}x`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {playerState !== 1 && (
              <div 
                onClick={togglePlay}
                style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', cursor: 'pointer', zIndex: 15, transition: 'all 0.1s' }}
              >
                <div style={{ width: '70px', height: '70px', borderRadius: '35px', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(99, 102, 241, 0.6)', transform: 'scale(1)', transition: 'transform 0.1s' }}>
                  <Play size={34} fill="currentColor" style={{ marginLeft: '4px' }} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: inline ? '300px' : '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
            <FileText size={48} style={{ opacity: 0.1, marginBottom: '20px', color: 'var(--primary-color)' }} />
            <h3 style={{ marginBottom: '10px', fontWeight: '700', fontSize: '1.1rem' }}>{res.title || 'Документ'}</h3>
            <p style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: '25px', maxWidth: '250px' }}>Нажмите кнопку ниже, чтобы открыть этот материал полностью.</p>
            {onOpenModal && (
              <button
                onClick={onOpenModal}
                className="flex-center"
                style={{ padding: '10px 20px', background: 'var(--primary-color)', color: 'white', borderRadius: '12px', fontWeight: 'bold', gap: '8px', fontSize: '0.9rem', border: 'none' }}
              >
                <Maximize2 size={16} /> Открыть полностью
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourcePlayer;
