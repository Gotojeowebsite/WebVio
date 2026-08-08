import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAddonStore } from '../store/addon-store'
import { AddonClient, MetaPreview } from '../api/addon-client'
import MediaCard from '../components/catalog/MediaCard'

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

// Common acronyms & alternative titles mapping
const POPULAR_ALIASES: Record<string, string[]> = {
  'aot': ['attack on titan', 'shingeki no kyojin'],
  'snk': ['attack on titan', 'shingeki no kyojin'],
  'ds': ['demon slayer', 'kimetsu no yaiba'],
  'kny': ['demon slayer', 'kimetsu no yaiba'],
  'jjk': ['jujutsu kaisen'],
  'mha': ['my hero academia', 'boku no hero academia'],
  'bnha': ['my hero academia', 'boku no hero academia'],
  'fma': ['fullmetal alchemist'],
  'fmab': ['fullmetal alchemist brotherhood'],
  'csm': ['chainsaw man'],
  'op': ['one piece'],
  'naruto': ['naruto shippuden', 'boruto'],
  'hxh': ['hunter x hunter'],
  'got': ['game of thrones', 'house of the dragon'],
  'hotd': ['house of the dragon'],
  'lotr': ['the lord of the rings', 'the rings of power'],
  'bb': ['breaking bad', 'better call saul'],
  'bcs': ['better call saul'],
  'tlou': ['the last of us'],
  'st': ['stranger things'],
  'sw': ['star wars', 'the mandalorian', 'andor'],
  'mcu': ['marvel', 'avengers', 'loki'],
}

type CategoryFilter = 'all' | 'movie' | 'series' | 'anime'

// In-memory cache for instantaneous back/forth searches
const searchMemoryCache = new Map<string, MetaPreview[]>()

/**
 * Levenshtein Distance for typo tolerance
 */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

/**
 * Smart Title & Relevance Scorer
 */
export function calculateRelevanceScore(item: MetaPreview, rawQuery: string): number {
  if (!item || !item.name) return 0

  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[:\-–—.,'"!@#$%^&*()_+=[\]{};/\\|<>?`~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const cleanQuery = normalize(rawQuery)
  const cleanTitle = normalize(item.name)

  if (!cleanQuery || !cleanTitle) return 0

  // Check alias expansion (e.g. "aot" -> "attack on titan")
  const aliasExpansions = POPULAR_ALIASES[cleanQuery] || []
  for (const alias of aliasExpansions) {
    if (cleanTitle === alias || cleanTitle.startsWith(alias)) return 9500
    if (cleanTitle.includes(alias)) return 7000
  }

  // 1. Exact full title match (e.g. "Demon Slayer" === "Demon Slayer")
  if (cleanTitle === cleanQuery) {
    return 10000
  }

  // 2. Title starts with exact query phrase (e.g. "Demon Slayer: Kimetsu no Yaiba")
  if (cleanTitle.startsWith(cleanQuery)) {
    return 8000 + Math.max(0, 100 - cleanTitle.length)
  }

  // 3. Title contains exact query phrase
  if (cleanTitle.includes(cleanQuery)) {
    return 5500 + Math.max(0, 100 - cleanTitle.length)
  }

  // 4. Tokenized word matching
  const queryTokens = cleanQuery.split(' ').filter(t => t.length > 0)
  const titleTokens = cleanTitle.split(' ').filter(t => t.length > 0)

  let matchedTokens = 0
  let exactTokenMatches = 0
  let typoMatches = 0

  for (const qToken of queryTokens) {
    let matched = false
    for (const tToken of titleTokens) {
      if (tToken === qToken) {
        matched = true
        exactTokenMatches++
        break
      }
      if (qToken.length >= 3 && tToken.startsWith(qToken)) {
        matched = true
        break
      }
      if (tToken.length >= 4 && tToken.includes(qToken)) {
        matched = true
        break
      }
      // Typo tolerance: if word length >= 4 and edit distance <= 1 (or >= 7 and dist <= 2)
      if (qToken.length >= 4 && tToken.length >= 4) {
        const dist = levenshtein(qToken, tToken)
        if (dist <= 1 || (qToken.length >= 7 && dist <= 2)) {
          matched = true
          typoMatches++
          break
        }
      }
    }
    if (matched) matchedTokens++
  }

  // If all query tokens matched
  if (matchedTokens === queryTokens.length) {
    return 4000 + exactTokenMatches * 200 - typoMatches * 100
  }

  // For multi-word queries: majority match (>= 60%)
  if (queryTokens.length > 1) {
    const ratio = matchedTokens / queryTokens.length
    if (ratio >= 0.6) {
      return 2500 * ratio
    }

    // Check item aliases (e.g. Kitsu Japanese titles)
    const aliases = (item as any).aliases as string[] | undefined
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        const cleanAlias = normalize(alias)
        if (cleanAlias.startsWith(cleanQuery)) return 7500
        if (cleanAlias.includes(cleanQuery)) return 5000
        const aliasTokens = cleanAlias.split(' ')
        const aMatched = queryTokens.filter(qT => aliasTokens.some(aT => aT === qT || aT.startsWith(qT))).length
        if (aMatched >= queryTokens.length * 0.6) return 3000
      }
    }

    return 0
  }

  // For single-word query: check startsWith, token overlap or typo
  if (queryTokens.length === 1) {
    const singleToken = queryTokens[0]
    if (titleTokens.some(t => t.startsWith(singleToken))) {
      return 3000
    }
    if (titleTokens.some(t => t.includes(singleToken) && singleToken.length >= 3)) {
      return 1800
    }
    // Typo match for single word
    if (singleToken.length >= 4) {
      for (const tToken of titleTokens) {
        if (levenshtein(singleToken, tToken) <= (singleToken.length > 6 ? 2 : 1)) {
          return 1500
        }
      }
    }
  }

  return 0
}

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
          <button type="submit" className="search-icon-btn" title="Search">
            🔍
          </button>
          <input
            type="text"
            className="input search-input-large"
            placeholder="Search movies, series, anime (e.g. Demon Slayer, Attack on Titan, One Piece)..."
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
        <div
          className="search-categories"
          style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}
        >
          {[
            { key: 'all', label: `All Matches (${results.length})` },
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
                border:
                  activeCategory === cat.key
                    ? '1px solid var(--color-accent-primary, #a855f7)'
                    : '1px solid rgba(255,255,255,0.1)',
                background:
                  activeCategory === cat.key
                    ? 'rgba(168, 85, 247, 0.2)'
                    : 'rgba(255,255,255,0.04)',
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

      {loading && results.length === 0 && (
        <div className="search-loading">
          <div className="loading-spinner" />
          <p>Searching smart across all catalogs...</p>
        </div>
      )}

      {!loading && query && filteredResults.length === 0 && (
        <div className="search-empty">
          <p className="search-empty-icon">🔍</p>
          <h3>No relevant titles found for "{query}"</h3>
          <p style={{ marginTop: '0.5rem', color: 'var(--color-text-muted, #94a3b8)' }}>
            Try checking spelling or explore popular suggested searches below.
          </p>
        </div>
      )}

      {filteredResults.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p className="search-result-count" style={{ margin: 0 }}>
              Found {filteredResults.length} relevant match{filteredResults.length !== 1 ? 'es' : ''} for "{query}"
            </p>
            {loading && (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-accent-primary, #a855f7)' }}>
                ⚡ Scanning more catalogs...
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

      {(!query || (filteredResults.length === 0 && !loading)) && (
        <div className="search-empty" style={{ textAlign: 'center', marginTop: query ? '2rem' : '0' }}>
          {!query && <p className="search-empty-icon">🎬</p>}
          <h3>{!query ? 'Smart Instant Search' : 'Popular Suggestions'}</h3>
          <p
            style={{
              color: 'var(--color-text-muted, #94a3b8)',
              maxWidth: '440px',
              margin: '0.5rem auto 1.5rem',
            }}
          >
            Instant relevance-ranked search across movies, TV series, and anime with typo tolerance.
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
