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
  const navigate = useNavigate()
  const { addons } = useAddonStore()

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const allResults: MetaPreview[] = []
      const enabledAddons = addons.filter(a => a.enabled)

      const promises = enabledAddons.map(async (addon) => {
        const client = new AddonClient(addon.manifestUrl)
        client.manifest = addon.manifest

        if (!client.supportsSearch()) return

        for (const catalog of addon.manifest.catalogs) {
          const hasSearch = catalog.extra?.some(e => e.name === 'search')
          if (!hasSearch) continue

          try {
            const result = await client.getCatalog(
              catalog.type,
              catalog.id,
              { search: q }
            )
            if (result.metas) {
              allResults.push(...result.metas)
            }
          } catch {
            // Skip failed addon catalogs
          }
        }
      })

      await Promise.allSettled(promises)

      // Deduplicate by ID
      const seen = new Set<string>()
      const deduped = allResults.filter(item => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })

      setResults(deduped)
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setLoading(false)
    }
  }, [addons])

  useEffect(() => {
    if (query) {
      performSearch(query)
    }
  }, [query, performSearch])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      setSearchParams({ q: inputValue.trim() })
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
            placeholder="Search movies, series, anime..."
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
          <p>Searching across all addons...</p>
        </div>
      )}

      {!loading && query && results.length === 0 && (
        <div className="search-empty">
          <p className="search-empty-icon">🔍</p>
          <h3>No results found</h3>
          <p>Try a different search term or check your addons</p>
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
          <p>Find movies, TV shows, and anime across all your addons</p>
        </div>
      )}
    </div>
  )
}
