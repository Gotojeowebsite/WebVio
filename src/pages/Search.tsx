import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAddonStore } from '../store/addon-store'
import { AddonClient, MetaPreview } from '../api/addon-client'
import MediaCard from '../components/catalog/MediaCard'

const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json'
const ANIME_KITSU_URL = 'https://anime-kitsu.strem.fun/manifest.json'

const POPULAR_SUGGESTIONS = [
  'Inception',
  'Breaking Bad',
  'Stranger Things',
  'Interstellar',
  'The Dark Knight',
  'The Last of Us',
  'One Piece',
  'Demon Slayer',
  'Attack on Titan',
  'Avatar',
  'Dune',
  'Oppenheimer',
]

type CategoryFilter = 'all' | 'movie' | 'series' | 'anime'

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const [inputValue, setInputValue] = useState(query)
  const [results, setResults] = useState<MetaPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const { addons, loadFromStorage } = useAddonStore()
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

    const currentQueryId = ++queryCounterRef.current
    setLoading(true)

    try {
      let currentAddons = useAddonStore.getState().addons
      if (currentAddons.length === 0) {
        await loadFromStorage()
        currentAddons = useAddonStore.getState().addons
      }

      const allResults: MetaPreview[] = []
      const enabledAddons = currentAddons.filter(a => a.enabled)

      // Always include universal primary providers (Cinemeta + Anime Kitsu)
      // along with any custom installed addons
      const addonUrlsToSearch = new Set<string>([
        CINEMETA_URL,
        ANIME_KITSU_URL,
        ...enabledAddons.map(a => a.manifestUrl),
      ])

      const searchPromises = Array.from(addonUrlsToSearch).map(async (url) => {
        try {
          const client = new AddonClient(url)
          const installed = enabledAddons.find(a => a.manifestUrl === url)
          let manifest = installed?.manifest

          if (!manifest) {
            try {
              manifest = await client.loadManifest()
            } catch {
              // Ignore manifest load failure
            }
          } else {
            client.manifest = manifest
          }

          if (manifest) {
            const catalogs = manifest.catalogs || []

            for (const catalog of catalogs) {
              const hasExtraSearch = catalog.extra?.some(e => e.name === 'search') ?? false
              const hasCatalogExtraSupported = (catalog as any).extraSupported?.includes('search') ?? false
              const hasManifestSearch = (manifest as any)?.extraSupported?.includes('search') ?? false
              const isSearchId = catalog.id === 'search' || catalog.id === 'top' || catalog.id === 'popular' || catalog.id.includes('search') || catalog.id.includes('list')

              const supportsSearch = hasExtraSearch || hasCatalogExtraSupported || hasManifestSearch || isSearchId

              if (supportsSearch) {
                try {
                  const res = await client.getCatalog(catalog.type, catalog.id, { search: trimmed })
                  if (res && Array.isArray(res.metas)) {
                    allResults.push(...res.metas)
                  }
                } catch {
                  // Ignore catalog error
                }
              }
            }

            // If catalogs is empty but manifest has types, try standard search
            if (catalogs.length === 0 && manifest.types) {
              for (const type of manifest.types) {
                try {
                  const res = await client.getCatalog(type, 'top', { search: trimmed })
                  if (res && Array.isArray(res.metas)) {
                    allResults.push(...res.metas)
                  }
                } catch {
                  // Ignore
                }
              }
            }
          } else {
            // Direct fallback endpoints if manifest was not accessible
            if (url === CINEMETA_URL) {
              const [mRes, sRes] = await Promise.allSettled([
                client.getCatalog('movie', 'top', { search: trimmed }),
                client.getCatalog('series', 'top', { search: trimmed }),
              ])
              if (mRes.status === 'fulfilled' && mRes.value?.metas) allResults.push(...mRes.value.metas)
              if (sRes.status === 'fulfilled' && sRes.value?.metas) allResults.push(...sRes.value.metas)
            } else if (url === ANIME_KITSU_URL) {
              const aRes = await client.getCatalog('anime', 'kitsu-anime-list', { search: trimmed }).catch(() => null)
              if (aRes?.metas) allResults.push(...aRes.metas)
            }
          }
        } catch {
          // Ignore individual addon search errors
        }
      })

      await Promise.allSettled(searchPromises)

      // Ignore results if a newer search query was dispatched
      if (currentQueryId !== queryCounterRef.current) return

      // Deduplicate by ID and normalize items
      const seenIds = new Set<string>()
      const deduped: MetaPreview[] = []

      for (const item of allResults) {
        if (!item || !item.id || !item.name) continue
        if (seenIds.has(item.id)) continue
        seenIds.add(item.id)
        deduped.push(item)
      }

      setResults(deduped)
    } catch (err) {
      console.error('Search execution error:', err)
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
    }, 250)

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
  const animeCount = results.filter(i => i.type === 'anime' || i.genres?.includes('Animation') || i.genres?.includes('Anime')).length

  const filteredResults = results.filter((item) => {
    if (activeCategory === 'all') return true
    if (activeCategory === 'movie') return item.type === 'movie'
    if (activeCategory === 'series') return item.type === 'series' || item.type === 'tv'
    if (activeCategory === 'anime') return item.type === 'anime' || item.genres?.includes('Animation') || item.genres?.includes('Anime')
    return true
  })

  return (
    <div className="page search-page">
      <form className="search-form" onSubmit={handleSubmit}>
        <div className="search-input-wrapper">
          <button type="submit" className="search-icon-btn" title="Search">
            🔍
          </button>
          <input
            type="text"
            className="input search-input-large"
            placeholder="Search movies, series, anime, documentaries..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
          />
          {inputValue && (
            <button
              type="button"
              className="btn-ghost search-clear"
              onClick={() => {
                setInputValue('')
                setResults([])
                setSearchParams({})
              }}
            >
              ✕
            </button>
          )}
        </div>
      </form>

      {/* Category Filter Tabs */}
      {results.length > 0 && !loading && (
        <div className="search-categories" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: `All Results (${results.length})` },
            { key: 'movie', label: `🎬 Movies (${movieCount})` },
            { key: 'series', label: `📺 Series (${seriesCount})` },
            { key: 'anime', label: `🎌 Anime (${animeCount})` },
          ].map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`btn-ghost ${activeCategory === cat.key ? 'active' : ''}`}
              style={{
                borderRadius: '9999px',
                padding: '0.4rem 1.1rem',
                fontSize: '0.85rem',
                fontWeight: activeCategory === cat.key ? '600' : '400',
                border: activeCategory === cat.key ? '1px solid var(--neon-violet, #a855f7)' : '1px solid rgba(255,255,255,0.1)',
                background: activeCategory === cat.key ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.04)',
                color: activeCategory === cat.key ? '#fff' : 'var(--color-text-muted, #94a3b8)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onClick={() => setActiveCategory(cat.key as CategoryFilter)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="search-loading">
          <div className="loading-spinner" />
          <p>Searching across all catalogs & addons...</p>
        </div>
      )}

      {!loading && query && filteredResults.length === 0 && (
        <div className="search-empty">
          <p className="search-empty-icon">🔍</p>
          <h3>No results found for "{query}"</h3>
          <p style={{ marginTop: '0.5rem', color: 'var(--color-text-muted, #94a3b8)' }}>
            Try searching for another title, actor, or check your category filter.
          </p>
        </div>
      )}

      {!loading && filteredResults.length > 0 && (
        <>
          <p className="search-result-count">
            Showing {filteredResults.length} title{filteredResults.length !== 1 ? 's' : ''} for "{query}"
          </p>
          <div className="media-grid">
            {filteredResults.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {!query && !loading && (
        <div className="search-empty" style={{ textAlign: 'center' }}>
          <p className="search-empty-icon">🎬</p>
          <h3>Search for anything</h3>
          <p style={{ color: 'var(--color-text-muted, #94a3b8)', maxWidth: '420px', margin: '0.5rem auto 1.5rem' }}>
            Instant search across movies, TV series, anime, documentaries, and all installed addons.
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '650px', margin: '0 auto' }}>
            {POPULAR_SUGGESTIONS.map((title) => (
              <button
                key={title}
                type="button"
                className="btn-ghost"
                style={{
                  borderRadius: '9999px',
                  padding: '0.45rem 1rem',
                  fontSize: '0.85rem',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  color: 'var(--color-text-primary, #f8fafc)',
                  transition: 'all 0.2s ease',
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
