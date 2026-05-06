import React, { useState, useEffect, useRef } from 'react';
import { 
  Book, Maximize2, Play, Pause, Volume2, VolumeX, 
  Settings, FileText, ChevronLeft, ChevronRight, ExternalLink, X 
} from 'lucide-react';

const ResourcePlayer = ({ resources, activeIdx, setActiveIdx, isMobile, onOpenModal, inline, hideExternalLink }) => {
  if (!resources || resources.length === 0) return null;
  const res = resources[activeIdx];

  const getYoutubeId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const getDriveEmbedUrl = (url) => {
    if (!url) return null;
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
      // Regex to extract the File ID from various Google Drive URL formats
      const fileIdMatch = url.match(/\/d\/([^/]+)/) || url.match(/id=([^&]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        // Return strictly formatted /preview link
        return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
      }
      
      // Fallback for direct preview links
      if (url.includes('/preview')) return url;
      
      // Traditional replacement if regex fails
      let embedUrl = url;
      if (embedUrl.includes('/view')) embedUrl = embedUrl.split('/view')[0] + '/preview';
      else if (embedUrl.includes('/edit')) embedUrl = embedUrl.split('/edit')[0] + '/preview';
      return embedUrl;
    }
    return null;
  };

  const ytId = getYoutubeId(res.url);
  const driveUrl = getDriveEmbedUrl(res.url);

  // Helper for opening external links (Mobile App deep linking vs PC)
  const openExternal = (e) => {
    if (e) e.stopPropagation();
    if (hideExternalLink) return;
    
    let targetUrl = res.url;
    
    // If it's YouTube and we are on mobile, we can try to force app behavior
    // though standard https links usually work best for OS handoff
    if (ytId && isMobile) {
        // Some systems prefer the short link for app triggering
        targetUrl = `https://youtu.be/${ytId}`;
    }
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const [player, setPlayer] = useState(null);
  const [playerState, setPlayerState] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('app_player_volume');
    return saved ? parseInt(saved) : 100;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showPersistentUI, setShowPersistentUI] = useState(true);
  const persistentTimeoutRef = useRef(null);
  const timeUpdateRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  const storageKey = ytId ? `yt_pos_${ytId}` : null;

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
          const p = event.target;
          setPlayer(p);
          setDuration(p.getDuration());
          const savedVol = localStorage.getItem('app_player_volume');
          if (savedVol) {
            const v = parseInt(savedVol);
            p.setVolume(v);
            setVolume(v);
          } else {
            p.setVolume(volume);
          }
          if (storageKey) {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
              const pos = parseFloat(saved);
              p.seekTo(pos, true);
              setCurrentTime(pos);
            }
          }
        },
        onStateChange: (event) => {
          setPlayerState(event.data);
          if (event.data === 1) {
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
        if (typeof t === 'number') {
          setCurrentTime(t);
          if (storageKey) localStorage.setItem(storageKey, t.toString());
        }
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
    if (player) {
      player.seekTo(time, true);
      if (storageKey) localStorage.setItem(storageKey, time.toString());
    }
  };

  const handleVolume = (e) => {
    const val = parseInt(e.target.value);
    setVolume(val);
    localStorage.setItem('app_player_volume', val.toString());
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
      const savedVol = localStorage.getItem('app_player_volume');
      player.setVolume(savedVol ? parseInt(savedVol) : 100);
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

  const themeColor = 'var(--bg-color)'; 

  const containerStyle = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: themeColor,
    overflow: 'hidden'
  };

  const showUI = isHovered || playerState !== 1 || showPersistentUI;
  const topMaskHeight = isMobile ? '65px' : '85px'; 
  const bottomMaskHeight = isMobile ? '70px' : '110px';

  return (
    <div 
      className="resource-player-container" 
      style={containerStyle}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playerState === 1 && setIsHovered(false)}
    >
      <div style={{ flex: 1, position: 'relative', background: themeColor, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {ytId ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', aspectRatio: '16/9', position: 'relative', overflow: 'hidden', background: themeColor }}>
                <div id={`yt-player-${inline ? 'inline' : 'modal'}-${activeIdx}`} style={{ width: '100.2%', height: '100.2%', position: 'absolute', top: '-0.1%', left: '-0.1%' }}></div>
                {playerState !== 1 && (
                  <div 
                    onClick={togglePlay}
                    style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <div style={{ width: '70px', height: '70px', borderRadius: '35px', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(var(--primary-color-rgb), 0.6)' }}>
                      <Play size={34} fill="currentColor" style={{ marginLeft: '4px' }} />
                    </div>
                  </div>
                )}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: topMaskHeight,
                  background: `linear-gradient(to bottom, ${themeColor} 0%, ${themeColor} 70%, transparent 100%)`,
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
                  height: bottomMaskHeight,
                  background: `linear-gradient(to top, ${themeColor} 0%, ${themeColor} 70%, transparent 100%)`,
                  zIndex: 15,
                  pointerEvents: 'none',
                  opacity: showUI ? 1 : 0,
                  transform: showUI ? 'translateY(0)' : 'translateY(100%)',
                  transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                  willChange: 'transform, opacity'
                }} />
                <div 
                  className="player-controls"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: isMobile ? '10px 15px' : '20px 30px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isMobile ? '8px' : '12px',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    opacity: showUI ? 1 : 0,
                    transform: showUI ? 'translateY(0)' : 'translateY(10px)',
                    zIndex: 20,
                    color: 'var(--text-main)'
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', height: '6px', background: 'rgba(var(--text-main-rgb, 128, 128, 128), 0.15)', borderRadius: '3px', cursor: 'pointer' }}>
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
                        top: '-10px',
                        left: 0,
                        width: '100%',
                        height: '26px',
                        opacity: 0,
                        zIndex: 25,
                        cursor: 'pointer',
                        margin: 0,
                        padding: 0,
                        appearance: 'none',
                        background: 'transparent'
                      }}
                    />
                    <div style={{ 
                      position: 'absolute', 
                      left: 0, 
                      top: 0, 
                      height: '100%', 
                      width: `${(currentTime / (duration || 1)) * 100}%`, 
                      background: 'var(--primary-color)',
                      borderRadius: '3px',
                      boxShadow: '0 0 10px var(--primary-color)',
                      transition: 'width 0.1s linear'
                    }} />
                  </div>
                  <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                    <div className="flex-center" style={{ gap: '15px' }}>
                      <button onClick={togglePlay} style={{ background: 'transparent', color: 'inherit', padding: 0, boxShadow: 'none', border: 'none' }}>
                        {playerState === 1 ? <Pause size={isMobile ? 20 : 24} fill="currentColor" /> : <Play size={isMobile ? 20 : 24} fill="currentColor" />}
                      </button>
                      <div className="flex-center" style={{ gap: '10px' }}>
                        <button onClick={toggleMute} style={{ background: 'transparent', color: 'inherit', padding: 0, boxShadow: 'none', border: 'none' }}>
                          {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>
                        <div style={{ width: isMobile ? '60px' : '80px', height: '4px', background: 'rgba(128, 128, 128, 0.25)', borderRadius: '2px', position: 'relative', cursor: 'pointer' }}>
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
                                zIndex: 2,
                                margin: 0,
                                padding: 0,
                                appearance: 'none',
                                background: 'transparent'
                              }}
                            />
                            <div style={{ 
                                position: 'absolute', 
                                left: 0, 
                                top: 0, 
                                height: '100%', 
                                width: `${isMuted ? 0 : volume}%`, 
                                background: 'var(--text-main)', 
                                borderRadius: '2px',
                                opacity: 0.8
                            }} />
                        </div>
                      </div>

                      <span style={{ color: 'inherit', fontSize: isMobile ? '0.75rem' : '0.85rem', fontWeight: '500', minWidth: isMobile ? '70px' : '100px', textAlign: 'left', opacity: 0.8 }}>
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    </div>

                    <div className="flex-center" style={{ gap: '15px', position: 'relative' }}>
                      {!hideExternalLink && (
                        <button 
                            onClick={openExternal}
                            title="Открыть оригинал"
                            style={{ background: 'transparent', color: 'inherit', padding: 0, border: 'none', opacity: 0.6, cursor: 'pointer' }}
                        >
                            <ExternalLink size={18} />
                        </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }} 
                        style={{ background: 'transparent', color: 'inherit', padding: 0, boxShadow: 'none', border: 'none' }}
                      >
                        <Settings size={isMobile ? 18 : 20} style={{ transform: showSettings ? 'rotate(90deg)' : 'none', transition: 'transform 0.3s' }} />
                      </button>

                      {showSettings && (
                        <div style={{
                          position: 'absolute',
                          bottom: '40px',
                          right: 0,
                          background: 'var(--card-bg)',
                          backdropFilter: 'blur(15px)',
                          borderRadius: '12px',
                          padding: '8px',
                          border: '1px solid var(--border-color)',
                          minWidth: '130px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          zIndex: 100,
                          boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
                        }}>
                          <p style={{ margin: '4px 0 6px 8px', fontSize: '0.65rem', color: 'var(--text-main)', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Скорость</p>
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                            <button 
                              key={rate}
                              onClick={(e) => { e.stopPropagation(); setPlaybackRate(rate); if (player) player.setPlaybackRate(rate); setShowSettings(false); }}
                              style={{
                                padding: '8px 12px',
                                background: playbackRate === rate ? 'var(--primary-color)' : 'transparent',
                                color: playbackRate === rate ? 'white' : 'var(--text-main)',
                                fontSize: '0.8rem',
                                textAlign: 'left',
                                borderRadius: '8px',
                                boxShadow: 'none',
                                fontWeight: playbackRate === rate ? 'bold' : 'normal',
                                border: 'none'
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
            </div>

            {/* INTERACTION LAYER (Only for YouTube) */}
            {ytId && (
              <div 
                onClick={togglePlay}
                style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'pointer' }}
              ></div>
            )}
            
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            {driveUrl ? (
              <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
                <iframe 
                  src={driveUrl} 
                  style={{ 
                    width: '100%', 
                    height: 'calc(100% + 56px)', 
                    marginTop: '-56px',
                    border: 'none' 
                  }}
                  allow="autoplay; fullscreen"
                  title={res.title || 'Документ'}
                />
              </div>
            ) : (
              <div style={{ height: inline ? '300px' : '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
                <FileText size={48} style={{ opacity: 0.1, marginBottom: '20px', color: 'var(--primary-color)' }} />
                <h3 style={{ marginBottom: '10px', fontWeight: '700', fontSize: '1.1rem' }}>{res.title || 'Материалы'}</h3>
                <p style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: '25px', maxWidth: '250px' }}>Этот ресурс нельзя отобразить встроенно. {!hideExternalLink && 'Используйте кнопку ниже для открытия.'}</p>
                {!hideExternalLink && (
                  <button
                    onClick={openExternal}
                    className="flex-center"
                    style={{ padding: '10px 20px', background: 'var(--primary-color)', color: 'white', borderRadius: '12px', fontWeight: 'bold', gap: '8px', fontSize: '0.9rem', border: 'none', textDecoration: 'none', cursor: 'pointer' }}
                  >
                    <ExternalLink size={16} /> Открыть оригинал
                  </button>
                )}
              </div>
            )}
            
            {/* External link floating button for non-YT */}
            {!hideExternalLink && (
                <button 
                onClick={openExternal}
                className="flex-center"
                title="Открыть оригинал"
                style={{ 
                    position: 'absolute', 
                    bottom: '20px', 
                    right: '20px', 
                    background: 'var(--primary-color)', 
                    color: 'white', 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '20px', 
                    boxShadow: '0 4px 15px rgba(var(--primary-color-rgb, 99, 102, 241), 0.3)',
                    zIndex: 40,
                    border: 'none',
                    cursor: 'pointer'
                }}
                >
                <ExternalLink size={20} />
                </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourcePlayer;
