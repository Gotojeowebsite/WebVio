import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search as SearchIcon, X, Film, Tv, Sparkles, Zap, Inbox, Loader2 } from 'lucide-react'
import { useAddonStore } from '../store/addon-store'
import { AddonClient, MetaPreview } from '../api/addon-client'
import MediaCard from '../components/catalog/MediaCard'
import { calculateRelevanceScore } from '../utils/searchUtils';
const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json'
const ANIME_KITSU_URL = 'https://anime-kitsu.strem.fun/manifest.json'

const POPULAR_SUGGESTIONS = [
  'Demon Slayer',
  'Attack on Titan',
  'One Piece',
  'Jujutsu Kaisen',
  'Breaking Bad',
  'Stranger Things',
  'Inception',
  'Interstellar',
  'The Dark Knight',
  'The Last of Us',
  'Dune: Part Two',
  'Oppenheimer',
  'Spider-Man: Across the Spider-Verse',
  'Game of Thrones',
  'Chainsaw Man',
]

type CategoryFilter = 'all' | 'movie' | 'series' | 'anime'

// In-memory cache for instantaneous back/forth searches
const searchMemoryCache = new Map<string, MetaPreview[]>()
export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const [inputValue, setInputValue] = useState(query)
  const [results, setResults] = useState<MetaPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const { loadFromStorage } = useAddonStore()
  const queryCounterRef = useRef(0)

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  useEffect(() => {
    setInputValue(query)
  }, [query])

  const performSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      return
    }

    // Check instant cache
    const cacheKey = trimmed.toLowerCase()
    if (searchMemoryCache.has(cacheKey)) {
      setResults(searchMemoryCache.get(cacheKey)!)
      setLoading(false)
      return
    }

    const currentQueryId = ++queryCounterRef.current
    setLoading(true)

    try {
      let currentAddons = useAddonStore.getState().addons
      if (currentAddons.length === 0) {
        await loadFromStorage()
        currentAddons = useAddonStore.getState().addons
      }

      const enabledAddons = currentAddons.filter(a => a.enabled)

      const collectedMetas: MetaPreview[] = []
      const seenIds = new Set<string>()

      // Helper to push and progressively rank
      const pushMetas = (metas: MetaPreview[]) => {
        for (const item of metas) {
          if (!item || !item.id || !item.name) continue
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id)
            collectedMetas.push(item)
          }
        }

        if (currentQueryId === queryCounterRef.current && collectedMetas.length > 0) {
          const scored = collectedMetas
            .map(item => ({ item, score: calculateRelevanceScore(item, trimmed) }))
            .filter(s => s.score > 0)
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score
              const yearB = parseInt(String(b.item.year || b.item.releaseInfo || '0'), 10) || 0
              const yearA = parseInt(String(a.item.year || a.item.releaseInfo || '0'), 10) || 0
              return yearB - yearA
            })

          const ranked = scored.slice(0, 60).map(s => s.item)
          setResults(ranked)
        }
      }

      // Fast parallel queries to primary catalog providers with 3.5s timeout per request
      const fetchWithTimeout = async <T,>(promise: Promise<T>, ms = 3500): Promise<T | null> => {
        let timer: any
        const timeout = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), ms)
        })
        try {
          const res = await Promise.race([promise, timeout])
          clearTimeout(timer)
          return res
        } catch {
          clearTimeout(timer)
          return null
        }
      }

      const cinemetaClient = new AddonClient(CINEMETA_URL)
      const kitsuClient = new AddonClient(ANIME_KITSU_URL)

      // Parallel search tasks
      const coreTasks = [
        // Cinemeta Movies
        fetchWithTimeout(cinemetaClient.getCatalog('movie', 'top', { search: trimmed })).then(res => {
          if (res?.metas) pushMetas(res.metas)
        }),
        // Cinemeta Series
        fetchWithTimeout(cinemetaClient.getCatalog('series', 'top', { search: trimmed })).then(res => {
          if (res?.metas) pushMetas(res.metas)
        }),
        // Anime Kitsu Anime
        fetchWithTimeout(kitsuClient.getCatalog('anime', 'kitsu-anime-list', { search: trimmed })).then(res => {
          if (res?.metas) pushMetas(res.metas)
        }),
        // Anime Kitsu Series
        fetchWithTimeout(kitsuClient.getCatalog('series', 'kitsu-anime-list', { search: trimmed })).then(res => {
          if (res?.metas) pushMetas(res.metas)
        }),
      ]

      // Query installed addon catalogs
      const addonTasks = enabledAddons.map(async (addon) => {
        try {
          const client = new AddonClient(addon.manifestUrl)
          client.manifest = addon.manifest
          const catalogs = addon.manifest.catalogs || []

          for (const catalog of catalogs) {
            const hasExtraSearch = catalog.extra?.some(e => e.name === 'search') ?? false
            const isSearchable =
              hasExtraSearch ||
              catalog.id === 'search' ||
              catalog.id === 'top' ||
              catalog.id.includes('search') ||
              catalog.id.includes('list')

            if (isSearchable) {
              const res = await fetchWithTimeout(client.getCatalog(catalog.type, catalog.id, { search: trimmed }), 2500)
              if (res?.metas) pushMetas(res.metas)
            }
          }
        } catch {
          // Ignore individual addon errors
        }
      })

      // Wait for all queries to complete or timeout
      await Promise.allSettled([...coreTasks, ...addonTasks])

      if (currentQueryId !== queryCounterRef.current) return

      // Final scoring & caching
      const finalScored = collectedMetas
        .map(item => ({ item, score: calculateRelevanceScore(item, trimmed) }))
        .filter(s => s.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          const yearB = parseInt(String(b.item.year || b.item.releaseInfo || '0'), 10) || 0
          const yearA = parseInt(String(a.item.year || a.item.releaseInfo || '0'), 10) || 0
          return yearB - yearA
        })

      const finalRanked = finalScored.slice(0, 60).map(s => s.item)
      searchMemoryCache.set(cacheKey, finalRanked)
      setResults(finalRanked)
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      if (currentQueryId === queryCounterRef.current) {
        setLoading(false)
      }
    }
  }, [loadFromStorage])

  // Live debounced search as user types
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue.trim() !== query) {
        if (inputValue.trim()) {
          setSearchParams({ q: inputValue.trim() }, { replace: true })
        } else if (query) {
          setSearchParams({}, { replace: true })
        }
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [inputValue, query, setSearchParams])

  useEffect(() => {
    if (query) {
      performSearch(query)
    } else {
      setResults([])
      setLoading(false)
    }
  }, [query, performSearch])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      setSearchParams({ q: inputValue.trim() })
      performSearch(inputValue.trim())
    }
  }

  const handleSuggestionClick = (title: string) => {
    setInputValue(title)
    setSearchParams({ q: title })
    performSearch(title)
  }

  const movieCount = results.filter(i => i.type === 'movie').length
  const seriesCount = results.filter(i => i.type === 'series' || i.type === 'tv').length
  const animeCount = results.filter(
    i => i.type === 'anime' || i.genres?.includes('Animation') || i.genres?.includes('Anime')
  ).length

  const filteredResults = results.filter((item) => {
    if (activeCategory === 'all') return true
    if (activeCategory === 'movie') return item.type === 'movie'
    if (activeCategory === 'series') return item.type === 'series' || item.type === 'tv'
    if (activeCategory === 'anime')
      return item.type === 'anime' || item.genres?.includes('Animation') || item.genres?.includes('Anime')
    return true
  })

  return (
    <div className="page search-page">
      <form className="search-form" onSubmit={handleSubmit}>
        <div className="search-input-wrapper">
          <button type="submit" className="search-icon-btn" aria-label="Submit search" title="Search">
            <SearchIcon size={20} aria-hidden="true" />
          </button>
          <input
            type="text"
            className="input search-input-large"
            placeholder="Search movies, shows, anime..."
            value={inputValue}
            aria-label="Search movies, shows, anime"
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
          />
          {loading ? (
            <Loader2 size={18} className="search-spinner-icon" aria-hidden="true" />
          ) : (
            inputValue && (
              <button
                type="button"
                className="btn-ghost search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setInputValue('')
                  setResults([])
                  setSearchParams({})
                }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            )
          )}
        </div>
      </form>

      {/* Category Filter Tabs */}
      <div
        className="search-categories"
        style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}
      >
        {[
          { key: 'all', label: 'All Matches', count: results.length, icon: null },
          { key: 'movie', label: 'Movies', count: movieCount, icon: Film },
          { key: 'series', label: 'Series', count: seriesCount, icon: Tv },
          { key: 'anime', label: 'Anime', count: animeCount, icon: Sparkles },
        ].map((cat) => {
          const Icon = cat.icon
          return (
            <button
              key={cat.key}
              type="button"
              className={`btn-ghost ${activeCategory === cat.key ? 'active' : ''}`}
              style={{
                borderRadius: '9999px',
                padding: '0.4rem 1.1rem',
                fontSize: '0.85rem',
                fontWeight: activeCategory === cat.key ? '600' : '400',
                border:
                  activeCategory === cat.key
                    ? '1px solid var(--accent-violet)'
                    : '1px solid var(--border-subtle)',
                background:
                  activeCategory === cat.key
                    ? 'rgba(139, 92, 246, 0.2)'
                    : 'var(--bg-elevated)',
                color: activeCategory === cat.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all var(--duration-fast) var(--ease-out)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onClick={() => setActiveCategory(cat.key as CategoryFilter)}
            >
              {Icon && <Icon size={14} aria-hidden="true" />}
              {cat.label} {results.length > 0 ? `(${cat.count})` : ''}
            </button>
          )
        })}
      </div>

      {/* State 2: Loading State (12-card skeleton grid) */}
      {loading && results.length === 0 && (
        <div className="media-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="media-card skeleton" />
          ))}
        </div>
      )}

      {/* State 3: No Results State */}
      {!loading && query && filteredResults.length === 0 && (
        <div className="search-empty" style={{ textAlign: 'center', padding: 'var(--space-12) 0' }}>
          <Inbox size={48} aria-hidden="true" style={{ marginBottom: 'var(--space-4)', opacity: 0.4 }} />
          <h3>No results found for "{query}"</h3>
          <p style={{ marginTop: 'var(--space-2)', color: 'var(--text-muted)', maxWidth: '480px', margin: 'var(--space-2) auto var(--space-6)' }}>
            Try checking your spelling or enable more addons in Settings.
          </p>
          <div
            style={{
              display: 'flex',
              gap: '0.6rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
              maxWidth: '680px',
              margin: '0 auto',
            }}
          >
            {POPULAR_SUGGESTIONS.map((title) => (
              <button
                key={title}
                type="button"
                className="btn-ghost"
                style={{
                  borderRadius: '9999px',
                  padding: '0.45rem 1rem',
                  fontSize: '0.85rem',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  transition: 'all var(--duration-fast) var(--ease-out)',
                }}
                onClick={() => handleSuggestionClick(title)}
              >
                {title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results State */}
      {filteredResults.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <p className="search-result-count" style={{ margin: 0 }}>
              Found {filteredResults.length} relevant match{filteredResults.length !== 1 ? 'es' : ''} for "{query}"
            </p>
            {loading && (
              <span style={{ fontSize: '0.8rem', color: 'var(--accent-violet)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Zap size={14} aria-hidden="true" /> Scanning more catalogs...
              </span>
            )}
          </div>
          <div className="media-grid">
            {filteredResults.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {/* State 1: Idle / Initial State */}
      {!query && !loading && (
        <div className="search-empty" style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
          <Film size={48} aria-hidden="true" style={{ marginBottom: 'var(--space-4)', opacity: 0.4 }} />
          <h3>Search movies, shows, anime...</h3>
          <p
            style={{
              color: 'var(--text-muted)',
              maxWidth: '460px',
              margin: 'var(--space-2) auto var(--space-6)',
              lineHeight: 1.5,
            }}
          >
            Explore instant relevance-ranked search across all your installed catalogs.
          </p>
          <div
            style={{
              display: 'flex',
              gap: '0.6rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
              maxWidth: '680px',
              margin: '0 auto',
            }}
          >
            {POPULAR_SUGGESTIONS.map((title) => (
              <button
                key={title}
                type="button"
                className="btn-ghost"
                style={{
                  borderRadius: '9999px',
                  padding: '0.45rem 1rem',
                  fontSize: '0.85rem',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  transition: 'all var(--duration-fast) var(--ease-out)',
                }}
                onClick={() => handleSuggestionClick(title)}
              >
                {title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
