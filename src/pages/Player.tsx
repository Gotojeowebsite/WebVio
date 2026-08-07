import { useEffect, useRef, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
    }
  }, [saveProgress])

  // Get start time for resume
  const startTime = currentMeta
    ? loadProgress(currentVideo?.id || currentMeta.id)
    : 0

  const handleTimeUpdate = useCallback((time: number) => {
    updateTime(time)

    // Simkl scrobble at 80% watched
    const { duration } = usePlayerStore.getState()
    if (
      !scrobbled.current &&
      simklConnected &&
      simklAccessToken &&
      simklClientId &&
      currentMeta &&
      duration > 0 &&
      time / duration > 0.8
    ) {
      scrobbled.current = true
      const imdbId = currentMeta.id.startsWith('tt') ? currentMeta.id : undefined
      if (imdbId) {
        if (currentMeta.type === 'movie') {
          markWatched(simklClientId, simklAccessToken, {
            movies: [{ ids: { imdb: imdbId }, watched_at: new Date().toISOString() }],
          }).catch(() => {})
        } else if (currentVideo?.season && currentVideo?.episode) {
          markWatched(simklClientId, simklAccessToken, {
            shows: [{
              ids: { imdb: imdbId },
              seasons: [{
                number: currentVideo.season,
                episodes: [{ number: currentVideo.episode, watched_at: new Date().toISOString() }],
              }],
            }],
          }).catch(() => {})
        }
      }
    }

    // Trakt scrobble at 80% watched
    if (
      !traktScrobbled.current &&
      traktConnected &&
      traktAccessToken &&
      traktClientId &&
      currentMeta &&
      duration > 0 &&
      time / duration > 0.8
    ) {
      traktScrobbled.current = true
      const imdbId = currentMeta.id.startsWith('tt') ? currentMeta.id : undefined
      if (imdbId) {
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
    }
  }, [updateTime, simklConnected, simklAccessToken, simklClientId, traktConnected, traktAccessToken, traktClientId, currentMeta, currentVideo])

  const handleEnded = useCallback(() => {
    saveProgress()
  }, [saveProgress])

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

  return (
    <div className="player-page">
      {/* Top bar */}
      <div className="player-top-bar">
        <button className="btn btn-ghost player-back" onClick={handleBack}>
          ← Back
        </button>
        <div className="player-now-playing">
          <p className="player-title">{currentMeta?.name || 'Playing'}</p>
          {currentVideo && (
            <p className="player-subtitle">
              S{currentVideo.season}E{currentVideo.episode} - {currentVideo.title}
            </p>
          )}
          {currentStream.quality && (
            <span className="badge badge-hd">{currentStream.quality}</span>
          )}
        </div>
      </div>

      <VideoPlayer
        src={currentStream.url}
        title={currentStream.title}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={setDuration}
        onEnded={handleEnded}
        startTime={startTime}
        subtitles={subtitles}
      />
    </div>
  )
}
