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

  const handleTimeUpdate = useCallback((time: number) => {
    updateTime(time)

    // Scrobble at 75% watched
    const { duration } = usePlayerStore.getState()
    if (!scrobbled.current && duration > 0 && time / duration > 0.75) {
      triggerScrobble()
    }
  }, [updateTime, triggerScrobble])

  const handleEnded = useCallback(() => {
    triggerScrobble()
    saveProgress()
  }, [triggerScrobble, saveProgress])

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
    </div>
  )
}
