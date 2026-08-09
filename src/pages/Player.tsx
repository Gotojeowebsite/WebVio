import { useEffect, useRef, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { usePlayerStore } from '../store/player-store'
import { useAuthStore } from '../store/auth-store'
import { markWatched } from '../api/simkl'
import { markTraktWatched } from '../api/trakt'
import VideoPlayer from '../components/player/VideoPlayer'
import { AddonClient, Subtitle } from '../api/addon-client'
import './player.css'

export default function Player() {
  const navigate = useNavigate()
  const { currentStream, currentMeta, currentVideo, saveProgress, updateTime, setDuration, loadProgress, clearPlayer } = usePlayerStore()
  const { simklConnected, simklAccessToken, simklClientId, traktConnected, traktAccessToken, traktClientId } = useAuthStore()
  const progressInterval = useRef<number | null>(null)
  const scrobbled = useRef(false)
  const traktScrobbled = useRef(false)
  const [subtitles, setSubtitles] = useState<Subtitle[]>([])

  useEffect(() => {
    let mounted = true
    const fetchSubtitles = async () => {
      if (!currentMeta) return
      try {
        const client = new AddonClient('https://opensubtitles-v3.strem.io/manifest.json')
        const idToFetch = currentVideo?.id || currentMeta.id
        const res = await client.getSubtitles(currentMeta.type, idToFetch)
        if (mounted && res.subtitles) {
          setSubtitles(res.subtitles)
        }
      } catch (err) {
        console.error('Failed to fetch subtitles', err)
      }
    }
    fetchSubtitles()
    return () => { mounted = false }
  }, [currentMeta, currentVideo])

  // Auto-save progress every 5 seconds
  useEffect(() => {
    progressInterval.current = window.setInterval(() => {
      saveProgress()
    }, 5000)

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current)
      }
      saveProgress() // Save on unmount
      clearPlayer() // Clear stale state
    }
  }, [saveProgress, clearPlayer])

  // Get start time for resume
  const savedTime = currentMeta
    ? loadProgress(currentVideo?.id || currentMeta.id)
    : 0

  const [promptResume, setPromptResume] = useState(savedTime > 30)
  const [startTime, setStartTime] = useState(0)
  const [actuallyStart, setActuallyStart] = useState(!promptResume)

  const handleResumeChoice = (resume: boolean) => {
    if (resume) {
      setStartTime(savedTime)
    } else {
      setStartTime(0)
    }
    setPromptResume(false)
    setActuallyStart(true)
  }

  const triggerScrobble = useCallback(() => {
    if (scrobbled.current || !currentMeta) return
    scrobbled.current = true

    const imdbId = currentMeta.id.startsWith('tt') ? currentMeta.id : undefined
    const isKitsu = currentMeta.id.startsWith('kitsu:')
    const kitsuParts = isKitsu ? currentMeta.id.replace('kitsu:', '').split(':') : []
    const kitsuAnimeId = kitsuParts.length > 0 ? parseInt(kitsuParts[0], 10) : undefined
    const episodeNum = currentVideo?.episode || (kitsuParts.length > 1 ? parseInt(kitsuParts[1], 10) : 1)

    if (simklConnected && simklAccessToken && simklClientId) {
      if (currentMeta.type === 'movie' && imdbId) {
        markWatched(simklClientId, simklAccessToken, {
          movies: [{ ids: { imdb: imdbId }, watched_at: new Date().toISOString() }],
        }).catch((e) => console.warn('Simkl movie scrobble failed', e))
      } else if (currentMeta.type === 'anime' || isKitsu) {
        markWatched(simklClientId, simklAccessToken, {
          anime: [{
            ids: {
              ...(imdbId ? { imdb: imdbId } : {}),
              ...(kitsuAnimeId ? { kitsu: kitsuAnimeId } : {}),
            },
            episodes: [{ number: episodeNum, watched_at: new Date().toISOString() }],
          }],
        }).catch((e) => console.warn('Simkl anime scrobble failed', e))
      } else if (currentVideo?.season && currentVideo?.episode && imdbId) {
        markWatched(simklClientId, simklAccessToken, {
          shows: [{
            ids: { imdb: imdbId },
            seasons: [{
              number: currentVideo.season,
              episodes: [{ number: currentVideo.episode, watched_at: new Date().toISOString() }],
            }],
          }],
        }).catch((e) => console.warn('Simkl show scrobble failed', e))
      }
    }

    if (traktConnected && traktAccessToken && traktClientId && imdbId) {
      traktScrobbled.current = true
      if (currentMeta.type === 'movie') {
        markTraktWatched(traktClientId, traktAccessToken, {
          movies: [{ title: currentMeta.name, year: currentMeta.year, ids: { imdb: imdbId }, watched_at: new Date().toISOString() }],
        }).catch(() => {})
      } else if (currentVideo?.season && currentVideo?.episode) {
        markTraktWatched(traktClientId, traktAccessToken, {
          shows: [{
            title: currentMeta.name,
            year: currentMeta.year,
            ids: { imdb: imdbId },
            seasons: [{
              number: currentVideo.season,
              episodes: [{ number: currentVideo.episode, watched_at: new Date().toISOString() }],
            }],
          }],
        }).catch(() => {})
      }
    }
  }, [currentMeta, currentVideo, simklConnected, simklAccessToken, simklClientId, traktConnected, traktAccessToken, traktClientId])

  const currentIndex = currentVideo && currentMeta?.videos ? currentMeta.videos.findIndex(v => v.id === currentVideo.id) : -1
  const nextVideo = currentIndex !== -1 && currentMeta?.videos && currentIndex + 1 < currentMeta.videos.length ? currentMeta.videos[currentIndex + 1] : null

  const [countdown, setCountdown] = useState<number | null>(null)

  const handleTimeUpdate = useCallback((time: number) => {
    updateTime(time)

    // Scrobble at 75% watched
    const { duration } = usePlayerStore.getState()
    if (!scrobbled.current && duration > 0 && time / duration > 0.75) {
      triggerScrobble()
    }

    // Auto-Play Countdown logic
    if (nextVideo && duration > 0 && duration - time <= 10 && duration - time > 0) {
      setCountdown(Math.ceil(duration - time))
    } else if (countdown !== null) {
      setCountdown(null)
    }
  }, [updateTime, triggerScrobble, nextVideo, countdown])

  const handleEnded = useCallback(() => {
    triggerScrobble()
    saveProgress()
    if (nextVideo && currentMeta) {
      navigate(`/detail/${currentMeta.type}/${encodeURIComponent(currentMeta.id)}?episode=${encodeURIComponent(nextVideo.id)}`)
    }
  }, [triggerScrobble, saveProgress, nextVideo, currentMeta, navigate])

  const handleBack = () => {
    saveProgress()
    clearPlayer()
    navigate(-1)
  }

  if (!currentStream) {
    return (
      <div className="player-page">
        <div className="player-no-stream">
          <p>No stream selected</p>
          <button className="btn btn-primary" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    )
  }

  if (promptResume) {
    const m = Math.floor(savedTime / 60)
    const s = Math.floor(savedTime % 60)
    const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`
    return (
      <div className="player-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <div style={{ textAlign: 'center', background: 'var(--bg-elevated)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-lg)' }}>
          <h2 style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--text-2xl)' }}>Resume Playback?</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-5)' }}>You left off at {timeStr}</p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center' }}>
            <button className="btn btn-primary btn-lg" onClick={() => handleResumeChoice(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Play size={18} fill="currentColor" aria-hidden="true" /> Resume from {timeStr}
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => handleResumeChoice(false)}>
              Start from Beginning
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!actuallyStart) return null

  return (
    <div className="player-page" style={{ position: 'relative' }}>
      <VideoPlayer
        src={currentStream.url}
        title={currentMeta?.name || 'Playing'}
        subtitle={currentVideo ? `S${currentVideo.season}E${currentVideo.episode} - ${currentVideo.title}` : undefined}
        quality={currentStream.quality}
        onBack={handleBack}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={setDuration}
        onEnded={handleEnded}
        startTime={startTime}
        subtitles={subtitles}
      />
      
      {countdown !== null && nextVideo && (
        <div style={{
          position: 'absolute', bottom: '120px', right: '40px', background: 'rgba(0,0,0,0.8)',
          padding: '20px', borderRadius: '12px', border: '1px solid #333', zIndex: 100,
          color: '#fff', display: 'flex', flexDirection: 'column', gap: '10px'
        }}>
          <h4 style={{ margin: 0, color: '#aaa' }}>Up Next in {countdown}</h4>
          <p style={{ margin: 0, fontWeight: 'bold' }}>S{nextVideo.season}E{nextVideo.episode} - {nextVideo.title}</p>
          <button className="btn btn-primary" onClick={handleEnded}>Play Now</button>
        </div>
      )}
    </div>
  )
}
