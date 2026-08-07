import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'

interface VideoPlayerProps {
  src: string
  title?: string
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
  onEnded?: () => void
  startTime?: number
}

export default function VideoPlayer({ src, title, onTimeUpdate, onDurationChange, onEnded, startTime }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    // Clean up previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (src.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
        if (startTime && startTime > 0) {
          video.currentTime = startTime
        }
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError(`Playback error: ${data.details}`)
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad()
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError()
          }
        }
      })
    } else if (src.includes('.m3u8') && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = src
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {})
        if (startTime && startTime > 0) {
          video.currentTime = startTime
        }
      })
    } else {
      // Direct MP4 / other formats
      video.src = src
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {})
        if (startTime && startTime > 0) {
          video.currentTime = startTime
        }
      })
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [src, startTime])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && onTimeUpdate) {
      onTimeUpdate(videoRef.current.currentTime)
    }
  }, [onTimeUpdate])

  const handleDurationChange = useCallback(() => {
    if (videoRef.current && onDurationChange) {
      onDurationChange(videoRef.current.duration)
    }
  }, [onDurationChange])

  return (
    <div className="video-player-wrapper">
      {error && (
        <div className="video-error">
          <p>⚠️ {error}</p>
          <button className="btn btn-secondary" onClick={() => {
            setError('')
            if (videoRef.current) {
              videoRef.current.load()
              videoRef.current.play().catch(() => {})
            }
          }}>
            Retry
          </button>
        </div>
      )}
      <video
        ref={videoRef}
        className="video-element"
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onEnded={onEnded}
        onError={() => setError('Failed to load video. The stream may be unavailable.')}
        controls
        playsInline
        autoPlay
      />
    </div>
  )
}
