import { SIMKL_API_BASE } from '../utils/constants'
import { fetchWithProxy } from '../utils/cors-proxy'
import { Meta, Video } from './addon-client'

export interface SimklIds {
  simkl?: number
  imdb?: string
  tmdb?: number
  kitsu?: number
  mal?: number
  slug?: string
}

export interface SimklEpisode {
  number: number
  watched_at?: string
  user_rating?: number
}

export interface SimklSeason {
  number: number
  episodes?: SimklEpisode[]
}

export interface SimklShowItem {
  show: {
    title: string
    year?: number
    poster?: string
    ids: SimklIds
  }
  status: 'watching' | 'plantowatch' | 'completed' | 'hold' | 'dropped' | string
  last_watched_at?: string
  user_rating?: number
  seasons?: SimklSeason[]
  watched_episodes_count?: number
  total_episodes_count?: number
}

export interface SimklMovieItem {
  movie: {
    title: string
    year?: number
    poster?: string
    ids: SimklIds
  }
  status: 'watching' | 'plantowatch' | 'completed' | 'hold' | 'dropped' | string
  last_watched_at?: string
  user_rating?: number
}

export interface SimklAnimeItem {
  anime: {
    title: string
    year?: number
    poster?: string
    ids: SimklIds
  }
  status: 'watching' | 'plantowatch' | 'completed' | 'hold' | 'dropped' | string
  last_watched_at?: string
  user_rating?: number
  episodes?: SimklEpisode[]
  watched_episodes_count?: number
  total_episodes_count?: number
}

export interface SimklHistoryData {
  shows: SimklShowItem[]
  movies: SimklMovieItem[]
  anime: SimklAnimeItem[]
  lastFetched: number
}

export interface EpisodeProgress {
  time: number
  duration: number
  percent: number
  completed: boolean
  watchedAt?: string
  updatedAt?: number
}

export interface SimklQueueItem {
  id: string
  action: 'watched' | 'remove'
  type: 'episode' | 'movie' | 'anime' | 'raw'
  payload: any
  timestamp: number
  attempts: number
}

export interface NextUpResult {
  nextEpisode: Video
  isResume: boolean
  progressPercent: number
  totalEpisodes: number
  watchedCount: number
  isCompleted: boolean
}

const CACHE_KEY = 'webvio_simkl_history_cache'
const QUEUE_KEY = 'webvio_simkl_queue'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function simklHeaders(clientId: string, accessToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'simkl-api-key': clientId,
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  return headers
}

/**
 * Fetch all watched history (shows, movies, anime) with 5-minute localStorage cache
 */
export async function fetchUserHistory(
  clientId: string,
  accessToken: string,
  forceRefresh = false
): Promise<SimklHistoryData> {
  if (!clientId || !accessToken) {
    return { shows: [], movies: [], anime: [], lastFetched: 0 }
  }

  // 1. Check cache first
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed: SimklHistoryData = JSON.parse(cached)
        if (parsed && typeof parsed.lastFetched === 'number' && Date.now() - parsed.lastFetched < CACHE_TTL) {
          return parsed
        }
      }
    } catch {
      // Ignore cache parse error
    }
  }

  // 2. Fetch from Simkl API in parallel
  try {
    const headers = simklHeaders(clientId, accessToken)
    const [showsRes, moviesRes, animeRes] = await Promise.allSettled([
      fetchWithProxy(`${SIMKL_API_BASE}/sync/all-items/shows?extended=full`, { headers }),
      fetchWithProxy(`${SIMKL_API_BASE}/sync/all-items/movies?extended=full`, { headers }),
      fetchWithProxy(`${SIMKL_API_BASE}/sync/all-items/anime?extended=full`, { headers }),
    ])

    const shows: SimklShowItem[] =
      showsRes.status === 'fulfilled' && showsRes.value.ok
        ? await showsRes.value.json().then(d => (Array.isArray(d) ? d : d?.shows || [])).catch(() => [])
        : []

    const movies: SimklMovieItem[] =
      moviesRes.status === 'fulfilled' && moviesRes.value.ok
        ? await moviesRes.value.json().then(d => (Array.isArray(d) ? d : d?.movies || [])).catch(() => [])
        : []

    const anime: SimklAnimeItem[] =
      animeRes.status === 'fulfilled' && animeRes.value.ok
        ? await animeRes.value.json().then(d => (Array.isArray(d) ? d : d?.anime || [])).catch(() => [])
        : []

    const result: SimklHistoryData = {
      shows: Array.isArray(shows) ? shows : [],
      movies: Array.isArray(movies) ? movies : [],
      anime: Array.isArray(anime) ? anime : [],
      lastFetched: Date.now(),
    }

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(result))
      localStorage.setItem('webvio_simkl_last_sync', String(Date.now()))
    } catch {
      // Ignore localStorage quota errors
    }

    // Process any pending offline items asynchronously
    processSyncQueue(clientId, accessToken).catch(() => {})

    return result
  } catch (err) {
    console.error('Failed to fetch Simkl history:', err)
    // Fall back to cache if available
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) return JSON.parse(cached)
    } catch {
      // Ignore
    }
    return { shows: [], movies: [], anime: [], lastFetched: 0 }
  }
}

/**
 * Record a single episode as watched in Simkl and update local state
 */
export async function recordEpisodeWatched(
  clientId: string,
  accessToken: string,
  imdbId: string,
  season: number,
  episode: number,
  watchedAt?: string
): Promise<boolean> {
  const timestamp = watchedAt || new Date().toISOString()
  const payload = {
    shows: [
      {
        ids: { imdb: imdbId },
        seasons: [
          {
            number: season,
            episodes: [{ number: episode, watched_at: timestamp }],
          },
        ],
      },
    ],
  }

  // Update optimistic local progress immediately
  saveLocalEpisodeProgress(imdbId, season, episode, timestamp)

  if (!clientId || !accessToken || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    queueOfflineSync({
      id: `${imdbId}_s${season}e${episode}_${Date.now()}`,
      action: 'watched',
      type: 'episode',
      payload,
      timestamp: Date.now(),
      attempts: 0,
    })
    return false
  }

  try {
    const res = await fetchWithProxy(`${SIMKL_API_BASE}/sync/history`, {
      method: 'POST',
      headers: simklHeaders(clientId, accessToken),
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      throw new Error(`Simkl sync responded with status ${res.status}`)
    }

    // Update memory/localStorage cache
    updateCachedEpisode(imdbId, season, episode, timestamp)
    return true
  } catch (err) {
    console.warn('Network error recording episode to Simkl, queueing offline:', err)
    queueOfflineSync({
      id: `${imdbId}_s${season}e${episode}_${Date.now()}`,
      action: 'watched',
      type: 'episode',
      payload,
      timestamp: Date.now(),
      attempts: 0,
    })
    return false
  }
}

/**
 * Record a movie as watched in Simkl and update local state
 */
export async function recordMovieWatched(
  clientId: string,
  accessToken: string,
  imdbId: string,
  watchedAt?: string
): Promise<boolean> {
  const timestamp = watchedAt || new Date().toISOString()
  const payload = {
    movies: [
      {
        ids: { imdb: imdbId },
        watched_at: timestamp,
      },
    ],
  }

  // Optimistic local progress
  saveLocalMovieProgress(imdbId, timestamp)

  if (!clientId || !accessToken || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    queueOfflineSync({
      id: `movie_${imdbId}_${Date.now()}`,
      action: 'watched',
      type: 'movie',
      payload,
      timestamp: Date.now(),
      attempts: 0,
    })
    return false
  }

  try {
    const res = await fetchWithProxy(`${SIMKL_API_BASE}/sync/history`, {
      method: 'POST',
      headers: simklHeaders(clientId, accessToken),
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      throw new Error(`Simkl movie sync responded with ${res.status}`)
    }

    updateCachedMovie(imdbId, timestamp)
    return true
  } catch (err) {
    console.warn('Network error recording movie to Simkl, queueing offline:', err)
    queueOfflineSync({
      id: `movie_${imdbId}_${Date.now()}`,
      action: 'watched',
      type: 'movie',
      payload,
      timestamp: Date.now(),
      attempts: 0,
    })
    return false
  }
}

/**
 * Remove an item or episode from Simkl history
 */
export async function removeHistoryItem(
  clientId: string,
  accessToken: string,
  item: any
): Promise<boolean> {
  if (!clientId || !accessToken || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    queueOfflineSync({
      id: `remove_${Date.now()}`,
      action: 'remove',
      type: 'raw',
      payload: item,
      timestamp: Date.now(),
      attempts: 0,
    })
    return false
  }

  try {
    const res = await fetchWithProxy(`${SIMKL_API_BASE}/sync/history/remove`, {
      method: 'POST',
      headers: simklHeaders(clientId, accessToken),
      body: JSON.stringify(item),
    })
    return res.ok
  } catch (err) {
    console.warn('Failed to remove history item, queueing offline:', err)
    queueOfflineSync({
      id: `remove_${Date.now()}`,
      action: 'remove',
      type: 'raw',
      payload: item,
      timestamp: Date.now(),
      attempts: 0,
    })
    return false
  }
}

/**
 * Check if a specific episode is watched
 */
export function getEpisodeWatchStatus(
  showImdbOrId: string,
  season: number,
  episode: number,
  history?: SimklHistoryData | null
): boolean {
  // 1. Check local progress first
  const localProg = getEpisodeWatchProgress(`${showImdbOrId}:${season}:${episode}`, showImdbOrId, season, episode)
  if (localProg.completed) return true

  // 2. Check Simkl history
  if (!history?.shows && !history?.anime) {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) history = JSON.parse(cached)
    } catch {
      // Ignore
    }
  }

  if (history?.shows) {
    const cleanId = showImdbOrId.replace(/^simkl-/, '').toLowerCase()
    const show = history.shows.find(s => {
      const imdb = s.show?.ids?.imdb?.toLowerCase()
      const simkl = String(s.show?.ids?.simkl)
      const tmdb = String(s.show?.ids?.tmdb)
      return imdb === cleanId || simkl === cleanId || tmdb === cleanId
    })

    if (show?.seasons) {
      const s = show.seasons.find(sn => sn.number === season)
      if (s?.episodes?.some(ep => ep.number === episode && ep.watched_at)) {
        return true
      }
    }
  }

  if (history?.anime) {
    const cleanId = showImdbOrId.replace(/^simkl-/, '').replace(/^kitsu:/, '').toLowerCase()
    const anime = history.anime.find(a => {
      const imdb = a.anime?.ids?.imdb?.toLowerCase()
      const simkl = String(a.anime?.ids?.simkl)
      const kitsu = String(a.anime?.ids?.kitsu)
      return imdb === cleanId || simkl === cleanId || kitsu === cleanId
    })

    if (anime?.episodes?.some(ep => ep.number === episode && ep.watched_at)) {
      return true
    }
  }

  return false
}

/**
 * Return local watch progress and completion status for a video
 */
export function getEpisodeWatchProgress(
  videoId: string,
  showId?: string,
  season?: number,
  episode?: number
): EpisodeProgress {
  let progressMap: Record<string, any> = {}
  try {
    progressMap = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
  } catch {
    // Ignore
  }

  // Check direct videoId
  let item = progressMap[videoId]

  // If not found, try alternative key combinations
  if (!item && showId && season !== undefined && episode !== undefined) {
    item =
      progressMap[`${showId}:${season}:${episode}`] ||
      progressMap[`${showId}:s${season}:e${episode}`] ||
      progressMap[`${showId}_s${season}_e${episode}`]
  }

  if (item && item.time > 0 && item.duration > 0) {
    const percent = Math.min(100, Math.round((item.time / item.duration) * 100))
    const completed = percent >= 80 || item.completed === true
    return {
      time: item.time,
      duration: item.duration,
      percent,
      completed,
      watchedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : undefined,
      updatedAt: item.updatedAt,
    }
  }

  if (item && item.completed) {
    return {
      time: item.duration || 0,
      duration: item.duration || 0,
      percent: 100,
      completed: true,
      watchedAt: item.watchedAt,
      updatedAt: item.updatedAt,
    }
  }

  return {
    time: 0,
    duration: 0,
    percent: 0,
    completed: false,
  }
}

/**
 * Calculate the Next Up episode for a TV show or anime
 */
export function calculateNextUpEpisode(
  meta: Meta | null | undefined,
  history?: SimklHistoryData | null
): Video | null {
  const details = getNextUpDetails(meta, history)
  return details ? details.nextEpisode : null
}

/**
 * Compute rich Next Up details (next episode, resume status, completion stats)
 */
export function getNextUpDetails(
  meta: Meta | null | undefined,
  history?: SimklHistoryData | null
): NextUpResult | null {
  if (!meta || !meta.videos || meta.videos.length === 0) return null

  // Sort episodes canonically: Season ASC, Episode ASC
  const sortedVideos = [...meta.videos].sort((a, b) => {
    const sA = a.season !== undefined ? a.season : 1
    const sB = b.season !== undefined ? b.season : 1
    if (sA !== sB) return sA - sB
    const eA = a.episode !== undefined ? a.episode : 0
    const eB = b.episode !== undefined ? b.episode : 0
    return eA - eB
  })

  // Filter out season 0 specials if regular seasons exist
  const regularVideos = sortedVideos.filter(v => (v.season === undefined ? true : v.season > 0))
  const videoList = regularVideos.length > 0 ? regularVideos : sortedVideos

  if (videoList.length === 0) return null

  let watchedCount = 0
  let inProgressEpisode: { video: Video; percent: number } | null = null
  let firstUnwatchedEpisode: Video | null = null

  for (let i = 0; i < videoList.length; i++) {
    const v = videoList[i]
    const seasonNum = v.season !== undefined ? v.season : 1
    const epNum = v.episode !== undefined ? v.episode : i + 1

    const isWatched = getEpisodeWatchStatus(meta.id, seasonNum, epNum, history)
    const progress = getEpisodeWatchProgress(v.id, meta.id, seasonNum, epNum)

    if (isWatched || progress.completed) {
      watchedCount++
    } else {
      if (!inProgressEpisode && progress.time > 30 && progress.percent > 0 && progress.percent < 80) {
        inProgressEpisode = { video: v, percent: progress.percent }
      }
      if (!firstUnwatchedEpisode) {
        firstUnwatchedEpisode = v
      }
    }
  }

  // 1. If user has an in-progress episode they left mid-way, continue that one
  if (inProgressEpisode) {
    return {
      nextEpisode: inProgressEpisode.video,
      isResume: true,
      progressPercent: inProgressEpisode.percent,
      totalEpisodes: videoList.length,
      watchedCount,
      isCompleted: false,
    }
  }

  // 2. Otherwise return the first unwatched episode
  if (firstUnwatchedEpisode) {
    return {
      nextEpisode: firstUnwatchedEpisode,
      isResume: false,
      progressPercent: 0,
      totalEpisodes: videoList.length,
      watchedCount,
      isCompleted: false,
    }
  }

  // 3. All episodes watched
  return {
    nextEpisode: videoList[videoList.length - 1],
    isResume: false,
    progressPercent: 100,
    totalEpisodes: videoList.length,
    watchedCount,
    isCompleted: true,
  }
}

/**
 * Offline Sync Queue: Add item
 */
export function queueOfflineSync(item: SimklQueueItem): void {
  try {
    const existing = getSyncQueue()
    // Avoid duplicate queue entries for the same show episode
    const filtered = existing.filter(i => i.id !== item.id)
    filtered.push(item)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered))
  } catch (err) {
    console.error('Failed to write to Simkl sync queue:', err)
  }
}

/**
 * Get current offline queue
 */
export function getSyncQueue(): SimklQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Process pending sync queue items against Simkl API
 */
export async function processSyncQueue(
  clientId: string,
  accessToken: string
): Promise<{ success: number; failed: number }> {
  if (!clientId || !accessToken) return { success: 0, failed: 0 }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { success: 0, failed: 0 }

  const queue = getSyncQueue()
  if (queue.length === 0) return { success: 0, failed: 0 }

  const remaining: SimklQueueItem[] = []
  let successCount = 0
  let failedCount = 0

  for (const item of queue) {
    try {
      const endpoint = item.action === 'remove' ? '/sync/history/remove' : '/sync/history'
      const res = await fetchWithProxy(`${SIMKL_API_BASE}${endpoint}`, {
        method: 'POST',
        headers: simklHeaders(clientId, accessToken),
        body: JSON.stringify(item.payload),
      })

      if (res.ok) {
        successCount++
      } else if (res.status >= 400 && res.status < 500) {
        // Bad request - discard to prevent infinite loop
        console.warn(`Simkl queue item ${item.id} rejected with ${res.status}, discarding`)
        failedCount++
      } else {
        // Server or proxy error - keep with incremented attempts
        item.attempts += 1
        if (item.attempts < 5) remaining.push(item)
        failedCount++
      }
    } catch {
      item.attempts += 1
      if (item.attempts < 5) remaining.push(item)
      failedCount++
    }
  }

  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining))
  } catch {
    // Ignore
  }

  return { success: successCount, failed: failedCount }
}

/**
 * Clear the offline sync queue
 */
export function clearSyncQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY)
  } catch {
    // Ignore
  }
}

/**
 * Mark an episode watched locally in webvio_progress
 */
export function markEpisodeWatchedLocally(
  imdbId: string,
  season: number,
  episode: number,
  watchedAt?: string
): void {
  saveLocalEpisodeProgress(imdbId, season, episode, watchedAt || new Date().toISOString())
}

/**
 * Mark a movie watched locally in webvio_progress
 */
export function markMovieWatchedLocally(imdbId: string, watchedAt?: string): void {
  saveLocalMovieProgress(imdbId, watchedAt || new Date().toISOString())
}

// -------------------------------------------------------------
// Internal helper functions for local optimistic cache updates
// -------------------------------------------------------------

function saveLocalEpisodeProgress(
  imdbId: string,
  season: number,
  episode: number,
  watchedAt: string
): void {
  try {
    const key = `${imdbId}:${season}:${episode}`
    const progressMap = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
    progressMap[key] = {
      completed: true,
      time: 1800,
      duration: 1800,
      updatedAt: Date.now(),
      watchedAt,
      meta: { id: imdbId, type: 'series' },
      video: { id: key, season, episode },
    }
    localStorage.setItem('webvio_progress', JSON.stringify(progressMap))
  } catch {
    // Ignore
  }
}

function saveLocalMovieProgress(imdbId: string, watchedAt: string): void {
  try {
    const progressMap = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
    progressMap[imdbId] = {
      completed: true,
      time: 7200,
      duration: 7200,
      updatedAt: Date.now(),
      watchedAt,
      meta: { id: imdbId, type: 'movie' },
    }
    localStorage.setItem('webvio_progress', JSON.stringify(progressMap))
  } catch {
    // Ignore
  }
}

function updateCachedEpisode(
  imdbId: string,
  season: number,
  episode: number,
  watchedAt: string
): void {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return
    const history: SimklHistoryData = JSON.parse(cached)
    let show = history.shows.find(s => s.show?.ids?.imdb === imdbId)

    if (!show) {
      show = {
        show: { title: imdbId, ids: { imdb: imdbId } },
        status: 'watching',
        seasons: [],
      }
      history.shows.push(show)
    }

    if (!show.seasons) show.seasons = []
    let s = show.seasons.find(sn => sn.number === season)
    if (!s) {
      s = { number: season, episodes: [] }
      show.seasons.push(s)
    }
    if (!s.episodes) s.episodes = []
    const ep = s.episodes.find(e => e.number === episode)
    if (ep) {
      ep.watched_at = watchedAt
    } else {
      s.episodes.push({ number: episode, watched_at: watchedAt })
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(history))
  } catch {
    // Ignore
  }
}

function updateCachedMovie(imdbId: string, watchedAt: string): void {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return
    const history: SimklHistoryData = JSON.parse(cached)
    const movie = history.movies.find(m => m.movie?.ids?.imdb === imdbId)
    if (movie) {
      movie.last_watched_at = watchedAt
      movie.status = 'completed'
    } else {
      history.movies.push({
        movie: { title: imdbId, ids: { imdb: imdbId } },
        status: 'completed',
        last_watched_at: watchedAt,
      })
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(history))
  } catch {
    // Ignore
  }
}

// Auto-register network reconnect listener
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const clientId = localStorage.getItem('webvio_simkl_clientId') || ''
    const token = localStorage.getItem('webvio_simkl_token') || ''
    if (clientId && token) {
      processSyncQueue(clientId, token).catch(() => {})
    }
  })
}
