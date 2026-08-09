import { useEffect, useRef, useState, useCallback, MouseEvent as ReactMouseEvent } from 'react'
import Hls from 'hls.js'
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

  // Icons
  const PlayIcon = () => <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
  const PauseIcon = () => <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
  const VolumeIcon = () => <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
  const MuteIcon = () => <svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
  const FullscreenIcon = () => <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
  const ExitFullscreenIcon = () => <svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
  const SubtitlesIcon = () => <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-9 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/></svg>
  const AudioIcon = () => <svg viewBox="0 0 24 24"><path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>

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
        >
          🔊 Click to Unmute Audio
        </button>
      )}

      {error && (
        <div className="video-error">
          <p style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600 }}>⚠️ {error}</p>
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
              >
                {switchingStream ? 'Transcoding...' : '⚡ Switch to Alternate Stream'}
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
            <button className="player-back-btn" onClick={onBack} title="Back">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
              </svg>
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
              <h4>💬 Subtitles</h4>
              <button className="popover-close" onClick={() => setShowSubMenu(false)}>✕</button>
            </div>

            <div className="popover-section">
              <label>Tracks ({subtitles.length})</label>
              <div className="popover-list">
                <button
                  className={`popover-item ${selectedSubId === 'off' ? 'active' : ''}`}
                  onClick={() => setSelectedSubId('off')}
                >
                  🚫 Off
                </button>
                {subtitles.map(sub => (
                  <button
                    key={sub.id || sub.lang}
                    className={`popover-item ${selectedSubId === (sub.id || sub.lang) ? 'active' : ''}`}
                    onClick={() => setSelectedSubId(sub.id || sub.lang)}
                  >
                    🌐 {sub.lang.toUpperCase()}
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
              <h4>🎧 Audio Tracks</h4>
              <button className="popover-close" onClick={() => setShowAudioMenu(false)}>✕</button>
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
                    >
                      🎵 {t.name} ({t.lang})
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
          <div className="video-progress-container" onClick={handleSeek}>
            <div className="video-progress-bar" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}>
              <div className="video-progress-thumb" />
            </div>
          </div>

          <div className="video-actions">
            <div className="video-left-actions">
              <button className="control-btn play-pause-btn" onClick={togglePlay} title="Play/Pause (Space)">
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>

              <button className="control-btn skip-btn" onClick={() => skipSeconds(-10)} title="Rewind 10s (←)">
                ⏪ 10s
              </button>

              <button className="control-btn skip-btn" onClick={() => skipSeconds(10)} title="Forward 10s (→)">
                ⏩ 10s
              </button>
              
              <div className="volume-container">
                <button className="control-btn" onClick={toggleMute} title="Mute/Unmute (M)">
                  {isMuted || volume === 0 ? <MuteIcon /> : <VolumeIcon />}
                </button>
                <div className="volume-slider" onClick={handleVolume}>
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
                title="Subtitles (C)"
              >
                <SubtitlesIcon />
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
                  title="Audio Tracks"
                >
                  <AudioIcon />
                  <span className="btn-label">Audio</span>
                </button>
              )}

              {/* Fullscreen Button */}
              <button className="control-btn" onClick={toggleFullscreen} title="Fullscreen (F)">
                {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
