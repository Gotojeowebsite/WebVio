import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAddonStore } from '../store/addon-store'
import { AddonClient, MetaPreview } from '../api/addon-client'
import MediaCard from '../components/catalog/MediaCard'

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const [inputValue, setInputValue] = useState(query)
  const [results, setResults] = useState<MetaPreview[]>([])
  const [loading, setLoading] = useState(false)
  const { addons, loadFromStorage } = useAddonStore()

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

    setLoading(true)
    try {
      let currentAddons = useAddonStore.getState().addons
      if (currentAddons.length === 0) {
        await loadFromStorage()
        currentAddons = useAddonStore.getState().addons
      }

      const allResults: MetaPreview[] = []
      const enabledAddons = currentAddons.filter(a => a.enabled)

      const promises = enabledAddons.map(async (addon) => {
        const client = new AddonClient(addon.manifestUrl)
        client.manifest = addon.manifest

        const catalogs = addon.manifest.catalogs || []
        for (const catalog of catalogs) {
          // A catalog supports search if it declares 'search' in its extra field
          // OR if there's a manifest-level extraSupported hint
          const hasExtraSearch = catalog.extra?.some(e => e.name === 'search') ?? false
          const hasManifestSearch = (addon.manifest as any).extraSupported?.includes('search') ?? false
          const supportsSearch = hasExtraSearch || hasManifestSearch

          // Skip catalogs that explicitly have extras but don't include 'search'
          if (!supportsSearch) {
            continue
          }

          try {
            const result = await client.getCatalog(
              catalog.type,
              catalog.id,
              { search: trimmed }
            )
            if (result && Array.isArray(result.metas)) {
              allResults.push(...result.metas)
            }
          } catch (e) {
            // Silently skip failed catalogs
          }
        }
      })

      await Promise.allSettled(promises)

      // Deduplicate by ID
      const seen = new Set<string>()
      const deduped = allResults.filter(item => {
        if (!item || !item.id || seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })

      setResults(deduped)
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setLoading(false)
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
    }, 300)

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

  return (
    <div className="page search-page">
      <form className="search-form" onSubmit={handleSubmit}>
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
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

      {loading && (
        <div className="search-loading">
          <div className="loading-spinner" />
          <p>Searching across all installed addons...</p>
        </div>
      )}

      {!loading && query && results.length === 0 && (
        <div className="search-empty">
          <p className="search-empty-icon">🔍</p>
          <h3>No results found for "{query}"</h3>
          <p>Try searching for a title like "Inception", "Breaking Bad", or "Avatar"</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <p className="search-result-count">
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </p>
          <div className="media-grid">
            {results.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {!query && !loading && (
        <div className="search-empty">
          <p className="search-empty-icon">🎬</p>
          <h3>Search for anything</h3>
          <p>Discover movies, TV shows, and anime across all your addons</p>
        </div>
      )}
    </div>
  )
}

