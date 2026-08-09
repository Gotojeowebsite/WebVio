import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchUserHistory,
  recordEpisodeWatched,
  recordMovieWatched,
  removeHistoryItem,
  calculateNextUpEpisode,
  getNextUpDetails,
  getEpisodeWatchStatus,
  getEpisodeWatchProgress,
  queueOfflineSync,
  getSyncQueue,
  processSyncQueue,
  clearSyncQueue,
  markEpisodeWatchedLocally,
  markMovieWatchedLocally,
  SimklHistoryData,
} from '../api/simkl-sync'
import { Meta } from '../api/addon-client'

// Mock cors-proxy fetchWithProxy
vi.mock('../utils/cors-proxy', () => ({
  fetchWithProxy: vi.fn(),
}))

import { fetchWithProxy } from '../utils/cors-proxy'

describe('Simkl Sync & Episode-Level Tracking (simkl-sync.ts)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('fetchUserHistory & Caching', () => {
    const mockShows = [
      {
        show: { title: 'Breaking Bad', ids: { imdb: 'tt0903747', simkl: 123 } },
        status: 'watching',
        seasons: [
          {
            number: 1,
            episodes: [
              { number: 1, watched_at: '2026-08-01T00:00:00Z' },
              { number: 2, watched_at: '2026-08-02T00:00:00Z' },
            ],
          },
        ],
      },
    ]

    const mockMovies = [
      {
        movie: { title: 'Inception', ids: { imdb: 'tt1375666', simkl: 456 } },
        status: 'completed',
        last_watched_at: '2026-08-05T00:00:00Z',
      },
    ]

    const mockAnime = [
      {
        anime: { title: 'Attack on Titan', ids: { imdb: 'tt2560140', simkl: 789 } },
        status: 'watching',
        seasons: [
          {
            number: 1,
            episodes: [{ number: 1, watched_at: '2026-08-06T00:00:00Z' }],
          },
        ],
      },
    ]

    it('fetches history from Simkl and caches for 5 minutes', async () => {
      vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
        if (typeof url === 'string' && url.includes('/sync/all-items/shows')) {
          return { ok: true, json: async () => mockShows } as any
        }
        if (typeof url === 'string' && url.includes('/sync/all-items/movies')) {
          return { ok: true, json: async () => mockMovies } as any
        }
        if (typeof url === 'string' && url.includes('/sync/all-items/anime')) {
          return { ok: true, json: async () => mockAnime } as any
        }
        return { ok: true, json: async () => [] } as any
      })

      const data = await fetchUserHistory('client123', 'tokenABC')
      expect(data.shows.length).toBe(1)
      expect(data.movies.length).toBe(1)
      expect(data.anime.length).toBe(1)
      expect(data.shows[0].show.title).toBe('Breaking Bad')
      expect(data.anime[0].anime.title).toBe('Attack on Titan')

      // Check localStorage cache
      const cachedRaw = localStorage.getItem('webvio_simkl_history_cache')
      expect(cachedRaw).toBeTruthy()

      // Subsequent call within 5 minutes returns cached without new fetch
      vi.mocked(fetchWithProxy).mockClear()
      const cachedData = await fetchUserHistory('client123', 'tokenABC')
      expect(cachedData.shows[0].show.title).toBe('Breaking Bad')
      expect(fetchWithProxy).not.toHaveBeenCalled()

      // Force refresh bypasses cache
      await fetchUserHistory('client123', 'tokenABC', true)
      expect(fetchWithProxy).toHaveBeenCalled()
    })

    it('handles empty credentials gracefully', async () => {
      const data = await fetchUserHistory('', '')
      expect(data.shows).toEqual([])
      expect(data.movies).toEqual([])
      expect(data.anime).toEqual([])
    })
  })

  describe('recordEpisodeWatched & recordMovieWatched', () => {
    it('sends episode payload to Simkl and optimistically updates local storage', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as any)

      const success = await recordEpisodeWatched(
        'client123',
        'tokenABC',
        'tt0903747',
        1,
        3,
        '2026-08-09T21:00:00Z'
      )

      expect(success).toBe(true)
      expect(fetchWithProxy).toHaveBeenCalledWith(
        expect.stringContaining('/sync/history'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"number":3'),
        })
      )

      // Optimistic local storage
      const progress = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
      expect(progress['tt0903747:1:3']?.completed).toBe(true)
    })

    it('queues offline sync if network fails', async () => {
      vi.mocked(fetchWithProxy).mockRejectedValueOnce(new Error('Network error'))

      const success = await recordEpisodeWatched(
        'client123',
        'tokenABC',
        'tt0903747',
        2,
        1
      )

      expect(success).toBe(false)
      const queue = getSyncQueue()
      expect(queue.length).toBe(1)
      expect(queue[0].action).toBe('watched')
      expect(queue[0].type).toBe('episode')
    })

    it('records movie watched and marks locally', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as any)

      const success = await recordMovieWatched('client123', 'tokenABC', 'tt1375666')
      expect(success).toBe(true)
      const progress = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
      expect(progress['tt1375666']?.completed).toBe(true)
    })

    it('removes history item', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as any)

      const success = await removeHistoryItem('client123', 'tokenABC', {
        movies: [{ ids: { imdb: 'tt1375666' } }],
      })
      expect(success).toBe(true)
    })

    it('supports local manual marking via markEpisodeWatchedLocally and markMovieWatchedLocally', () => {
      markEpisodeWatchedLocally('tt0903747', 1, 4)
      const isWatched = getEpisodeWatchStatus('tt0903747', 1, 4)
      expect(isWatched).toBe(true)

      const epProgress = getEpisodeWatchProgress('tt0903747:1:4', 'tt0903747', 1, 4)
      expect(epProgress.completed).toBe(true)
      expect(epProgress.percent).toBeGreaterThanOrEqual(80)

      markMovieWatchedLocally('tt9999999')
      const progress = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
      expect(progress['tt9999999']?.completed).toBe(true)
    })
  })

  describe('calculateNextUpEpisode & getNextUpDetails', () => {
    const sampleMeta: Meta = {
      id: 'tt0903747',
      type: 'series',
      name: 'Breaking Bad',
      videos: [
        { id: 'tt0903747:0:1', title: 'Special Behind The Scenes', season: 0, episode: 1 },
        { id: 'tt0903747:1:1', title: 'Pilot', season: 1, episode: 1 },
        { id: 'tt0903747:1:2', title: "Cat's in the Bag...", season: 1, episode: 2 },
        { id: 'tt0903747:1:3', title: "...And the Bag's in the River", season: 1, episode: 3 },
        { id: 'tt0903747:2:1', title: 'Seven Thirty-Seven', season: 2, episode: 1 },
      ],
    }

    it('returns S1E1 when nothing is watched, ignoring Season 0 specials', () => {
      const nextUp = calculateNextUpEpisode(sampleMeta, null)
      expect(nextUp).toBeDefined()
      expect(nextUp?.season).toBe(1)
      expect(nextUp?.episode).toBe(1)
    })

    it('calculates S1E3 when S1E1 and S1E2 are watched in Simkl history', () => {
      const history: SimklHistoryData = {
        shows: [
          {
            show: { title: 'Breaking Bad', ids: { imdb: 'tt0903747' } },
            status: 'watching',
            seasons: [
              {
                number: 1,
                episodes: [
                  { number: 1, watched_at: '2026-08-01T00:00:00Z' },
                  { number: 2, watched_at: '2026-08-02T00:00:00Z' },
                ],
              },
            ],
          },
        ],
        movies: [],
        anime: [],
        lastFetched: Date.now(),
      }

      const nextUp = calculateNextUpEpisode(sampleMeta, history)
      expect(nextUp?.season).toBe(1)
      expect(nextUp?.episode).toBe(3)
    })

    it('returns in-progress episode when user left off partially watched', () => {
      // User is 45% through S1E2
      localStorage.setItem(
        'webvio_progress',
        JSON.stringify({
          'tt0903747:1:2': {
            time: 1200,
            duration: 2700,
            completed: false,
            updatedAt: Date.now(),
          },
        })
      )

      const details = getNextUpDetails(sampleMeta, null)
      expect(details?.isResume).toBe(true)
      expect(details?.nextEpisode.episode).toBe(2)
      expect(details?.progressPercent).toBe(44)
    })

    it('marks series as completed when all regular episodes are watched', () => {
      const history: SimklHistoryData = {
        shows: [
          {
            show: { title: 'Breaking Bad', ids: { imdb: 'tt0903747' } },
            status: 'completed',
            seasons: [
              {
                number: 1,
                episodes: [
                  { number: 1, watched_at: '2026-08-01' },
                  { number: 2, watched_at: '2026-08-02' },
                  { number: 3, watched_at: '2026-08-03' },
                ],
              },
              {
                number: 2,
                episodes: [{ number: 1, watched_at: '2026-08-04' }],
              },
            ],
          },
        ],
        movies: [],
        anime: [],
        lastFetched: Date.now(),
      }

      const details = getNextUpDetails(sampleMeta, history)
      expect(details?.isCompleted).toBe(true)
      expect(details?.watchedCount).toBe(4)
    })
  })

  describe('Offline Queue & processSyncQueue', () => {
    it('manages queue operations, retries, and clearing', async () => {
      queueOfflineSync({
        id: 'item_1',
        action: 'watched',
        type: 'episode',
        payload: { test: 1 },
        timestamp: Date.now(),
        attempts: 0,
      })

      expect(getSyncQueue().length).toBe(1)

      // First try succeeds
      vi.mocked(fetchWithProxy).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as any)

      const result = await processSyncQueue('client123', 'tokenABC')
      expect(result.success).toBe(1)
      expect(result.failed).toBe(0)
      expect(getSyncQueue().length).toBe(0)

      // Test clearSyncQueue
      queueOfflineSync({
        id: 'item_2',
        action: 'watched',
        type: 'movie',
        payload: { test: 2 },
        timestamp: Date.now(),
        attempts: 0,
      })
      expect(getSyncQueue().length).toBe(1)
      clearSyncQueue()
      expect(getSyncQueue().length).toBe(0)
    })
  })
})
