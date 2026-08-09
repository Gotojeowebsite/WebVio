import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search as SearchIcon,
  X,
  Film,
  Tv,
  Sparkles,
  Zap,
  Inbox,
  Loader2,
  SlidersHorizontal,
  Layers,
  History,
} from 'lucide-react'
import { useAddonStore } from '../store/addon-store'
import { AddonClient, MetaPreview } from '../api/addon-client'
import MediaCard from '../components/catalog/MediaCard'
import { calculateRelevanceScore } from '../utils/searchUtils'

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
  'Spider-Man',
  'Game of Thrones',
  'Chainsaw Man',
  'Arcane',
]

type CategoryFilter = 'all' | 'movie' | 'series' | 'anime'
type SearchSortOption = 'relevance' | 'rating' | 'year' | 'title'

// In-memory search results cache for instant back/forth browsing
const searchMemoryCache = new Map<string, MetaPreview[]>()

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const [inputValue, setInputValue] = useState(query)
  const [results, setResults] = useState<MetaPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [sortBy, setSortBy] = useState<SearchSortOption>('relevance')
  const { loadFromStorage } = useAddonStore()
  const queryCounterRef = useRef(0)
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('webvio_search_history') || '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  useEffect(() => {
    setInputValue(query)
  }, [query])

  const saveToHistory = (term: string) => {
    const trimmed = term.trim()
    if (!trimmed) return
    setSearchHistory((prev) => {
      const updated = [trimmed, ...prev.filter((h) => h.toLowerCase() !== trimmed.toLowerCase())].slice(0, 10)
      localStorage.setItem('webvio_search_history', JSON.stringify(updated))
      return updated
    })
  }

  const performSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim()
      if (!trimmed) {
        setResults([])
        setLoading(false)
        return
      }

      saveToHistory(trimmed)

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

        const enabledAddons = currentAddons.filter((a) => a.enabled)
        const collectedMetas: MetaPreview[] = []
        const seenIds = new Set<string>()

        // Push and rank results progressively
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
              .map((item) => ({ item, score: calculateRelevanceScore(item, trimmed) }))
              .filter((s) => s.score > 0)
              .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score
                const yearB = parseInt(String(b.item.year || b.item.releaseInfo || '0'), 10) || 0
                const yearA = parseInt(String(a.item.year || a.item.releaseInfo || '0'), 10) || 0
                return yearB - yearA
              })

            const ranked = scored.slice(0, 75).map((s) => s.item)
            setResults(ranked)
          }
        }

        const fetchWithTimeout = async <T,>(promise: Promise<T>, ms = 3800): Promise<T | null> => {
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

        // Parallel tasks
        const coreTasks = [
          // Cinemeta Movies & Series search
          fetchWithTimeout(cinemetaClient.getCatalog('movie', 'top', { search: trimmed })).then(
            (res) => res?.metas && pushMetas(res.metas)
          ),
          fetchWithTimeout(cinemetaClient.getCatalog('series', 'top', { search: trimmed })).then(
            (res) => res?.metas && pushMetas(res.metas)
          ),
          // Anime Kitsu search
          fetchWithTimeout(kitsuClient.getCatalog('anime', 'kitsu-anime-list', { search: trimmed })).then(
            (res) => res?.metas && pushMetas(res.metas)
          ),
          fetchWithTimeout(kitsuClient.getCatalog('series', 'kitsu-anime-list', { search: trimmed })).then(
            (res) => res?.metas && pushMetas(res.metas)
          ),
        ]

        // Addon catalog search
        const addonTasks = enabledAddons.map(async (addon) => {
          try {
            const client = new AddonClient(addon.manifestUrl)
            client.manifest = addon.manifest
            const catalogs = addon.manifest.catalogs || []

            for (const catalog of catalogs) {
              const hasExtraSearch = catalog.extra?.some((e) => e.name === 'search') ?? false
              const isSearchable =
                hasExtraSearch ||
                catalog.id === 'search' ||
                catalog.id === 'top' ||
                catalog.id.includes('search') ||
                catalog.id.includes('list')

              if (isSearchable) {
                const res = await fetchWithTimeout(
                  client.getCatalog(catalog.type, catalog.id, { search: trimmed }),
                  2800
                )
                if (res?.metas) pushMetas(res.metas)
              }
            }
          } catch {
            // Ignore
          }
        })

        await Promise.allSettled([...coreTasks, ...addonTasks])

        if (currentQueryId !== queryCounterRef.current) return

        const finalScored = collectedMetas
          .map((item) => ({ item, score: calculateRelevanceScore(item, trimmed) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            const yearB = parseInt(String(b.item.year || b.item.releaseInfo || '0'), 10) || 0
            const yearA = parseInt(String(a.item.year || a.item.releaseInfo || '0'), 10) || 0
            return yearB - yearA
          })

        const finalRanked = finalScored.slice(0, 75).map((s) => s.item)
        searchMemoryCache.set(cacheKey, finalRanked)
        setResults(finalRanked)
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        if (currentQueryId === queryCounterRef.current) {
          setLoading(false)
        }
      }
    },
    [loadFromStorage]
  )

  // Live debounced search as user types (200ms)
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

  const movieCount = useMemo(() => results.filter((i) => i.type === 'movie').length, [results])
  const seriesCount = useMemo(
    () => results.filter((i) => i.type === 'series' || i.type === 'tv').length,
    [results]
  )
  const animeCount = useMemo(
    () =>
      results.filter(
        (i) => i.type === 'anime' || i.genres?.includes('Animation') || i.genres?.includes('Anime')
      ).length,
    [results]
  )

  const filteredAndSortedResults = useMemo(() => {
    return results
      .filter((item) => {
        if (activeCategory === 'all') return true
        if (activeCategory === 'movie') return item.type === 'movie'
        if (activeCategory === 'series') return item.type === 'series' || item.type === 'tv'
        if (activeCategory === 'anime')
          return (
            item.type === 'anime' ||
            item.genres?.includes('Animation') ||
            item.genres?.includes('Anime')
          )
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'rating') {
          const ra = parseFloat(a.imdbRating || '0')
          const rb = parseFloat(b.imdbRating || '0')
          return rb - ra
        }
        if (sortBy === 'year') {
          const ya = parseInt(String(a.year || a.releaseInfo || '0'), 10) || 0
          const yb = parseInt(String(b.year || b.releaseInfo || '0'), 10) || 0
          return yb - ya
        }
        if (sortBy === 'title') {
          return a.name.localeCompare(b.name)
        }
        // Default: relevance score is already applied in performSearch
        return 0
      })
  }, [results, activeCategory, sortBy])

  return (
    <div className="page search-page">
      {/* Search Input Bar */}
      <form className="search-form" onSubmit={handleSubmit}>
        <div className="search-input-wrapper">
          <button type="submit" className="search-icon-btn" aria-label="Submit search" title="Search">
            <SearchIcon size={22} aria-hidden="true" />
          </button>
          <input
            type="text"
            className="input search-input-large"
            placeholder="Search movies, TV series, anime, directors..."
            value={inputValue}
            aria-label="Search movies, shows, anime"
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
          />
          {loading ? (
            <Loader2 size={20} className="search-spinner-icon" aria-hidden="true" />
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
                <X size={20} aria-hidden="true" />
              </button>
            )
          )}
        </div>
      </form>

      {/* Category Tabs & Sort Toolbar */}
      <div className="search-toolbar-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div
          className="search-categories"
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
          role="tablist"
          aria-label="Search category filters"
        >
          {[
            { key: 'all', label: 'All Matches', count: results.length, icon: Layers },
            { key: 'movie', label: 'Movies', count: movieCount, icon: Film },
            { key: 'series', label: 'TV Shows', count: seriesCount, icon: Tv },
            { key: 'anime', label: 'Anime', count: animeCount, icon: Sparkles },
          ].map((cat) => {
            const Icon = cat.icon
            return (
              <button
                key={cat.key}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat.key}
                className={`tab-btn ${activeCategory === cat.key ? 'tab-active' : ''}`}
                style={{
                  borderRadius: '9999px',
                  padding: '0.45rem 1.15rem',
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onClick={() => setActiveCategory(cat.key as CategoryFilter)}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{cat.label}</span>
                {results.length > 0 && (
                  <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '999px', background: 'rgba(255,255,255,0.15)' }}>
                    {cat.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Sort selector if results exist */}
        {results.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="search-sort-select" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span>Sort:</span>
            </label>
            <select
              id="search-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SearchSortOption)}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: '#fff',
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="relevance">Best Relevance Match</option>
              <option value="rating">Highest IMDb Rating</option>
              <option value="year">Release Year (Newest)</option>
              <option value="title">Title (A - Z)</option>
            </select>
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {loading && results.length === 0 && (
        <div className="media-grid media-grid-dense">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="media-card skeleton" />
          ))}
        </div>
      )}

      {/* No Results State */}
      {!loading && query && filteredAndSortedResults.length === 0 && (
        <div className="search-empty card-glass" style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-6)', borderRadius: 'var(--radius-xl)' }}>
          <Inbox size={48} aria-hidden="true" style={{ marginBottom: 'var(--space-4)', opacity: 0.4 }} />
          <h3>No results found for "{query}"</h3>
          <p style={{ marginTop: 'var(--space-2)', color: 'var(--text-muted)', maxWidth: '480px', margin: 'var(--space-2) auto var(--space-6)' }}>
            Try checking your spelling, switching filter tabs, or installing more stream addons in Settings.
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
      {filteredAndSortedResults.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <p className="search-result-count" style={{ margin: 0, fontSize: '0.85rem' }}>
              Found <strong>{filteredAndSortedResults.length}</strong> matching title{filteredAndSortedResults.length !== 1 ? 's' : ''} for "{query}"
            </p>
            {loading && (
              <span style={{ fontSize: '0.8rem', color: 'var(--accent-violet)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Zap size={14} aria-hidden="true" /> Scanning additional catalogs...
              </span>
            )}
          </div>
          <div className="media-grid media-grid-dense">
            {filteredAndSortedResults.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {/* Idle / Initial State with Suggestions & Recent Searches */}
      {!query && !loading && (
        <div className="search-idle-section" style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
          {/* Recent Search History if present */}
          {searchHistory.length > 0 && (
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: 'var(--space-3)', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
                <History size={16} aria-hidden="true" />
                <span>Recent Searches</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '640px', margin: '0 auto' }}>
                {searchHistory.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="btn-ghost"
                    style={{
                      borderRadius: '9999px',
                      padding: '0.35rem 0.9rem',
                      fontSize: '0.8rem',
                      background: 'rgba(139, 92, 246, 0.1)',
                      border: '1px solid rgba(139, 92, 246, 0.25)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleSuggestionClick(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <Film size={48} aria-hidden="true" style={{ marginBottom: 'var(--space-4)', opacity: 0.35 }} />
            <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 800 }}>Explore Global Search</h3>
            <p
              style={{
                color: 'var(--text-muted)',
                maxWidth: '480px',
                margin: 'var(--space-2) auto var(--space-6)',
                lineHeight: 1.6,
                fontSize: '0.9rem',
              }}
            >
              Instant fuzzy and relevance-ranked search across all your streaming addons, movies, TV shows, and anime.
            </p>
            <div
              style={{
                display: 'flex',
                gap: '0.6rem',
                justifyContent: 'center',
                flexWrap: 'wrap',
                maxWidth: '720px',
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
                    padding: '0.45rem 1.1rem',
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
        </div>
      )}
    </div>
  )
}
