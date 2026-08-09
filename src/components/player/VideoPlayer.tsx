import { useEffect, useRef, useState, useCallback, MouseEvent as ReactMouseEvent } from 'react'
import Hls from 'hls.js'
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Subtitles, Music, RotateCcw, RotateCw, ArrowLeft, X, Zap, Globe, AlertCircle } from 'lucide-react'
import { usePlayerStore, EnrichedStream } from '../../store/player-store'
import { parseStreamInfo, resolveStreamUrl } from '../../utils/stream-resolver'
import { useAuthStore } from '../../store/auth-store'

export interface SubtitleTrack {
  id: string
  url: string
  lang: string
}

interface ParsedCue {
  start: number
  end: number
  text: string
}

interface VideoPlayerProps {
  src: string
  title?: string
  subtitle?: string
  quality?: string
  onBack?: () => void
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
  onEnded?: () => void
  startTime?: number
  subtitles?: SubtitleTrack[]
}

const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

function parseTimestamp(timeStr: string): number {
  const parts = timeStr.trim().replace(',', '.').split(':')
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  } else if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  return 0
}

function parseSubtitleText(content: string): ParsedCue[] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const cues: ParsedCue[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()
    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->')
      const start = parseTimestamp(startStr)
      const end = parseTimestamp(endStr.split(' ')[0])

      i++
      const textLines: string[] = []
      while (i < lines.length && lines[i].trim() !== '') {
        const cleanText = lines[i].replace(/<[^>]*>/g, '').trim()
        if (cleanText) textLines.push(cleanText)
        i++
      }

      if (textLines.length > 0 && end > start) {
        cues.push({
          start,
          end,
          text: textLines.join('\n'),
        })
      }
    }
    i++
  }

  return cues
}

export default function VideoPlayer({ 
  src: initialSrc, 
  title, 
  subtitle, 
  quality, 
  onBack, 
  onTimeUpdate, 
  onDurationChange, 
  onEnded, 
  startTime, 
  subtitles = []
}: VideoPlayerProps) {
  const [activeSrc, setActiveSrc] = useState(initialSrc)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  const { availableStreams, setStream } = usePlayerStore()
  const { torboxApiKey } = useAuthStore()
  
  const [error, setError] = useState('')
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(() => parseFloat(localStorage.getItem('webvio_volume') || '1'))
  const [isMuted, setIsMuted] = useState(false)
  const [needsUserUnmute, setNeedsUserUnmute] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [switchingStream, setSwitchingStream] = useState(false)

  // Subtitle States
  const [selectedSubId, setSelectedSubId] = useState<string>('off')
  const [activeCues, setActiveCues] = useState<ParsedCue[]>([])
  const [currentSubtitleText, setCurrentSubtitleText] = useState<string>('')
  const [subOffset, setSubOffset] = useState<number>(0)
  const [subSize, setSubSize] = useState<'normal' | 'large' | 'xlarge'>('normal')
  const [showSubMenu, setShowSubMenu] = useState(false)
  const [showAudioMenu, setShowAudioMenu] = useState(false)

  // Audio Tracks (HLS)
  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string; lang: string }[]>([])
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(0)

  const controlsTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setActiveSrc(initialSrc)
  }, [initialSrc])

  // Direct HTML5 Audio Synchronization
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = Math.max(0, Math.min(1, volume))
    video.muted = isMuted
  }, [volume, isMuted])

  // Initialize Video & Robust Stream Pipeline
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeSrc) return

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const onMetadataLoaded = () => {
      if (startTime && startTime > 0) {
        video.currentTime = startTime
      }

      const playPromise = video.play()
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true)
            setNeedsUserUnmute(false)
          })
          .catch((err) => {
            if (err.name === 'NotAllowedError') {
              video.muted = true
              setIsMuted(true)
              video.play().then(() => {
                setIsPlaying(true)
                setNeedsUserUnmute(true)
              }).catch(() => setIsPlaying(false))
            } else {
              setIsPlaying(false)
            }
          })
      }
    }

    if (activeSrc.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        enableWorker: true,
        backBufferLength: 30,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 20000,
      })
      hlsRef.current = hls
      hls.loadSource(activeSrc)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        onMetadataLoaded()
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          setAudioTracks(
            hls.audioTracks.map((t, idx) => ({
              id: idx,
              name: t.name || `Track ${idx + 1}`,
              lang: t.lang || 'und',
            }))
          )
        }
      })

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        setSelectedAudioTrack(data.id)
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad()
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError()
          } else {
            setError(`Playback issue: ${data.details}`)
          }
        }
      })
    } else {
      video.src = activeSrc
      video.addEventListener('loadedmetadata', onMetadataLoaded)
    }

    return () => {
      video.removeEventListener('loadedmetadata', onMetadataLoaded)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [activeSrc, startTime])

  // Subtitle Loader
  useEffect(() => {
    if (selectedSubId === 'off' || !subtitles.length) {
      setActiveCues([])
      setCurrentSubtitleText('')
      return
    }

    const sub = subtitles.find(s => s.id === selectedSubId || s.lang === selectedSubId)
    if (!sub || !sub.url) return

    let cancelled = false
    fetch(sub.url)
      .then(res => res.text())
      .then(content => {
        if (cancelled) return
        const parsed = parseSubtitleText(content)
        setActiveCues(parsed)
      })
      .catch(err => {
        console.warn('Failed to load subtitle file:', err)
        setActiveCues([])
      })

    return () => {
      cancelled = true
    }
  }, [selectedSubId, subtitles])

  // Auto-select English subtitles if available on start
  useEffect(() => {
    if (subtitles.length > 0 && selectedSubId === 'off') {
      const engSub = subtitles.find(s => s.lang.toLowerCase().startsWith('en') || s.lang.toLowerCase() === 'eng')
      if (engSub) {
        setSelectedSubId(engSub.id || engSub.lang)
      }
    }
  }, [subtitles, selectedSubId])

  // Match active subtitle cue
  useEffect(() => {
    if (!activeCues.length) {
      setCurrentSubtitleText('')
      return
    }

    const adjustedTime = currentTime + subOffset
    const match = activeCues.find(cue => adjustedTime >= cue.start && adjustedTime <= cue.end)
    setCurrentSubtitleText(match ? match.text : '')
  }, [currentTime, activeCues, subOffset])

  // Hide controls on idle
  const handleMouseMove = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = window.setTimeout(() => {
      setShowControls(false)
      setShowSubMenu(false)
      setShowAudioMenu(false)
    }, 3500)
  }, [])

  useEffect(() => {
    handleMouseMove()
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    }
  }, [handleMouseMove])

  // Fullscreen listener
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Video Events
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
      if (onTimeUpdate) onTimeUpdate(videoRef.current.currentTime)
    }
  }, [onTimeUpdate])

  const handleDurationChange = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
      if (onDurationChange) onDurationChange(videoRef.current.duration)
    }
  }, [onDurationChange])

  // Switch to an alternate transcode stream if current stream is unavailable
  const handleSwitchToStream = async (alternateStream: EnrichedStream) => {
    setSwitchingStream(true)
    setError('')
    try {
      const url = await resolveStreamUrl(alternateStream, torboxApiKey || undefined)
      if (url) {
        const info = parseStreamInfo(alternateStream)
        setStream({
          url,
          title: title || 'Playing',
          quality: info.quality || undefined,
          source: alternateStream.addonName,
        })
        setActiveSrc(url)
      } else {
        setError('Could not resolve alternate stream.')
      }
    } catch {
      setError('Failed to switch stream.')
    } finally {
      setSwitchingStream(false)
    }
  }


  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
        setIsPlaying(true)
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
      }
    }
  }, [])

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted
      setIsMuted(videoRef.current.muted)
      if (!videoRef.current.muted && needsUserUnmute) {
        setNeedsUserUnmute(false)
      }
    }
  }, [needsUserUnmute])

  const handleUserUnmuteClick = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = false
      setIsMuted(false)
      setNeedsUserUnmute(false)
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(err => console.error(err))
    } else {
      await document.exitFullscreen().catch(err => console.error(err))
    }
  }, [])

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return

      const video = videoRef.current
      if (!video) return

      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        video.currentTime = Math.max(0, video.currentTime - 10)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const newVol = Math.min(1, volume + 0.1)
        video.volume = newVol
        setVolume(newVol)
        localStorage.setItem('webvio_volume', String(newVol))
        video.muted = false
        setIsMuted(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const newVol = Math.max(0, volume - 0.1)
        video.volume = newVol
        setVolume(newVol)
        localStorage.setItem('webvio_volume', String(newVol))
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen()
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        toggleMute()
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        setSelectedSubId(prev => (prev === 'off' && subtitles.length ? subtitles[0].id || subtitles[0].lang : 'off'))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [subtitles, volume, togglePlay, toggleMute, toggleFullscreen])

  const handleSeek = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    const newTime = pos * duration
    videoRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleVolume = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    let pos = (e.clientX - rect.left) / rect.width
    pos = Math.max(0, Math.min(1, pos))
    videoRef.current.volume = pos
    setVolume(pos)
    localStorage.setItem('webvio_volume', String(pos))
    if (pos > 0 && isMuted) {
      videoRef.current.muted = false
      setIsMuted(false)
      setNeedsUserUnmute(false)
    } else if (pos === 0) {
      videoRef.current.muted = true
      setIsMuted(true)
    }
  }

  const handleAudioTrackSelect = (trackId: number) => {
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId
      setSelectedAudioTrack(trackId)
    }
  }

  const skipSeconds = (sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration || 0, videoRef.current.currentTime + sec))
    }
  }

  return (
    <div 
      className="video-container" 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={() => setShowControls(true)}
      onDoubleClick={toggleFullscreen}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Unmute Floating Banner if autoplay was muted by browser policy */}
      {needsUserUnmute && (
        <button
          type="button"
          className="unmute-toast"
          onClick={handleUserUnmuteClick}
          aria-label="Click to unmute audio"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <Volume2 size={20} aria-hidden="true" /> Click to Unmute Audio
        </button>
      )}

      {error && (
        <div className="video-error">
          <p style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <AlertCircle size={20} color="#f59e0b" aria-hidden="true" /> {error}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => {
              setError('')
              if (videoRef.current) {
                videoRef.current.load()
                videoRef.current.play().catch(() => setIsPlaying(false))
              }
            }}>
              Retry Stream
            </button>
            {availableStreams.length > 1 && (
              <button
                className="btn btn-secondary"
                disabled={switchingStream}
                onClick={() => {
                  const alt = availableStreams.find(s => s.url !== activeSrc && s.infoHash) || availableStreams[1]
                  if (alt) handleSwitchToStream(alt)
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Zap size={16} aria-hidden="true" />
                {switchingStream ? 'Transcoding...' : 'Switch to Alternate Stream'}
              </button>
            )}
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        className="video-element"
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onEnded={onEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          setError('Stream decoding stalled. Switch to an alternate transcode stream below.')
        }}
        onClick={togglePlay}
        playsInline
        autoPlay
      />

      {/* High-Precision Outlined Subtitle Overlay */}
      {currentSubtitleText && (
        <div className={`subtitle-overlay-container ${subSize}`}>
          <div className="subtitle-text-box">
            {currentSubtitleText.split('\n').map((line, idx) => (
              <span key={idx} className="subtitle-line">
                {line}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Custom Player Overlay */}
      <div className={`video-overlay ${showControls || !isPlaying ? 'show-controls' : ''}`}>
        <div className="video-top-gradient" />
        <div className="video-bottom-gradient" />

        <div className="video-top-bar">
          {onBack && (
            <button className="player-back-btn" onClick={onBack} aria-label="Go back" title="Back">
              <ArrowLeft size={24} aria-hidden="true" />
            </button>
          )}
          <div className="player-title-info">
            <h1 className="player-title-main">
              {title || 'Playing'}
              {quality && <span className="player-badge-hd">{quality}</span>}
              {selectedSubId !== 'off' && <span className="player-badge-sub">CC</span>}
            </h1>
            {subtitle && <p className="player-title-sub">{subtitle}</p>}
          </div>
        </div>

        {/* Subtitles Menu Popover */}
        {showSubMenu && (
          <div className="player-popover sub-popover" onClick={e => e.stopPropagation()}>
            <div className="popover-header">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Subtitles size={18} aria-hidden="true" /> Subtitles
              </h4>
              <button className="popover-close" onClick={() => setShowSubMenu(false)} aria-label="Close subtitle menu">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="popover-section">
              <label>Tracks ({subtitles.length})</label>
              <div className="popover-list">
                <button
                  className={`popover-item ${selectedSubId === 'off' ? 'active' : ''}`}
                  onClick={() => setSelectedSubId('off')}
                >
                  Off
                </button>
                {subtitles.map(sub => (
                  <button
                    key={sub.id || sub.lang}
                    className={`popover-item ${selectedSubId === (sub.id || sub.lang) ? 'active' : ''}`}
                    onClick={() => setSelectedSubId(sub.id || sub.lang)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Globe size={14} aria-hidden="true" /> {sub.lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="popover-section">
              <label>Sync Offset: {subOffset >= 0 ? `+${subOffset.toFixed(1)}s` : `${subOffset.toFixed(1)}s`}</label>
              <div className="offset-buttons">
                <button onClick={() => setSubOffset(o => parseFloat((o - 0.5).toFixed(1)))}>-0.5s</button>
                <button onClick={() => setSubOffset(0)}>Reset</button>
                <button onClick={() => setSubOffset(o => parseFloat((o + 0.5).toFixed(1)))}>+0.5s</button>
              </div>
            </div>

            <div className="popover-section">
              <label>Font Size</label>
              <div className="size-buttons">
                <button className={subSize === 'normal' ? 'active' : ''} onClick={() => setSubSize('normal')}>Normal</button>
                <button className={subSize === 'large' ? 'active' : ''} onClick={() => setSubSize('large')}>Large</button>
                <button className={subSize === 'xlarge' ? 'active' : ''} onClick={() => setSubSize('xlarge')}>XL</button>
              </div>
            </div>
          </div>
        )}

        {/* Audio Tracks Popover */}
        {showAudioMenu && (
          <div className="player-popover audio-popover" onClick={e => e.stopPropagation()}>
            <div className="popover-header">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Music size={18} aria-hidden="true" /> Audio Tracks
              </h4>
              <button className="popover-close" onClick={() => setShowAudioMenu(false)} aria-label="Close audio menu">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {audioTracks.length > 1 ? (
              <div className="popover-section">
                <label>Audio Tracks ({audioTracks.length})</label>
                <div className="popover-list">
                  {audioTracks.map(t => (
                    <button
                      key={t.id}
                      className={`popover-item ${selectedAudioTrack === t.id ? 'active' : ''}`}
                      onClick={() => handleAudioTrackSelect(t.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Music size={14} aria-hidden="true" /> {t.name} ({t.lang})
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="popover-section">
                <p style={{ color: '#aaa', fontSize: '0.85rem', margin: 0 }}>
                  Standard Stereo Audio track active.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="video-bottom-controls">
          <div className="video-progress-container" onClick={handleSeek} role="slider" aria-label="Video timeline" aria-valuenow={currentTime} aria-valuemin={0} aria-valuemax={duration || 0}>
            <div className="video-progress-bar" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}>
              <div className="video-progress-thumb" />
            </div>
          </div>

          <div className="video-actions">
            <div className="video-left-actions">
              <button
                className="control-btn play-pause-btn"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title="Play/Pause (Space)"
              >
                {isPlaying ? <Pause size={24} aria-hidden="true" /> : <Play size={24} fill="currentColor" aria-hidden="true" />}
              </button>

              <button
                className="control-btn skip-btn"
                onClick={() => skipSeconds(-10)}
                aria-label="Rewind 10 seconds"
                title="Rewind 10s (←)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <RotateCcw size={16} aria-hidden="true" /> 10s
              </button>

              <button
                className="control-btn skip-btn"
                onClick={() => skipSeconds(10)}
                aria-label="Forward 10 seconds"
                title="Forward 10s (→)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <RotateCw size={16} aria-hidden="true" /> 10s
              </button>
              
              <div className="volume-container">
                <button
                  className="control-btn"
                  onClick={toggleMute}
                  aria-label={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
                  title="Mute/Unmute (M)"
                >
                  {isMuted || volume === 0 ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
                </button>
                <div className="volume-slider" onClick={handleVolume} role="slider" aria-label="Volume slider" aria-valuenow={isMuted ? 0 : volume * 100} aria-valuemin={0} aria-valuemax={100}>
                  <div className="volume-level" style={{ width: `${isMuted ? 0 : volume * 100}%` }} />
                </div>
              </div>

              <span className="time-display">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="video-right-actions">
              {/* Subtitles Button */}
              <button
                className={`control-btn popover-trigger ${selectedSubId !== 'off' ? 'active-neon' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowSubMenu(!showSubMenu)
                  setShowAudioMenu(false)
                }}
                aria-label="Subtitles menu"
                title="Subtitles (C)"
              >
                <Subtitles size={20} aria-hidden="true" />
                <span className="btn-label">Subtitles</span>
              </button>

              {/* Audio Button */}
              {audioTracks.length > 1 && (
                <button
                  className="control-btn popover-trigger"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowAudioMenu(!showAudioMenu)
                    setShowSubMenu(false)
                  }}
                  aria-label="Audio tracks menu"
                  title="Audio Tracks"
                >
                  <Music size={20} aria-hidden="true" />
                  <span className="btn-label">Audio</span>
                </button>
              )}

              {/* Fullscreen Button */}
              <button
                className="control-btn"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize size={20} aria-hidden="true" /> : <Maximize size={20} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
