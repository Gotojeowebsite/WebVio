import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Info, Star, Cpu, Blocks } from 'lucide-react'
import { useAddonStore } from '../store/addon-store'
import { useAuthStore } from '../store/auth-store'
import { AddonClient, MetaPreview } from '../api/addon-client'
import CatalogRow from '../components/catalog/CatalogRow'
import './home.css'

interface CatalogData {
  key: string
  title: string
  items: MetaPreview[]
  loading: boolean
}

const DEFAULT_PROVIDERS = [
  {
    manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
    manifest: {
      id: 'com.linvo.cinemeta',
      name: 'Cinemeta',
      catalogs: [
        { type: 'movie', id: 'top', name: 'Popular Movies' },
        { type: 'series', id: 'top', name: 'Popular Series' },
        { type: 'movie', id: 'imdbRating', name: 'Top Rated Movies' },
        { type: 'series', id: 'imdbRating', name: 'Top Rated Series' },
      ],
    },
  },
  {
    manifestUrl: 'https://anime-kitsu.strem.fun/manifest.json',
    manifest: {
      id: 'community.anime.kitsu',
      name: 'Anime Kitsu',
      catalogs: [
        { type: 'anime', id: 'kitsu-anime-trending', name: 'Trending Anime' },
        { type: 'anime', id: 'kitsu-anime-popular', name: 'Popular Anime' },
      ],
    },
  },
]

export default function Home() {
  const { addons, loadFromStorage, loadAddonsFromNuvio } = useAddonStore()
  const { nuvioAccessToken, nuvioUserId, simklConnected, simklAccessToken, simklClientId } = useAuthStore()
  const [catalogs, setCatalogs] = useState<CatalogData[]>([])
  const [hero, setHero] = useState<MetaPreview | null>(null)
  const [continueWatching, setContinueWatching] = useState<MetaPreview[]>([])
  const [continueLoading, setContinueLoading] = useState(false)
  const navigate = useNavigate()
  const heroVideoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroItems, setHeroItems] = useState<MetaPreview[]>([])

  // Load addons on mount
  useEffect(() => {
    const init = async () => {
      await loadFromStorage()
      if (useAddonStore.getState().addons.length === 0 && nuvioAccessToken && nuvioUserId) {
        await loadAddonsFromNuvio(nuvioAccessToken, nuvioUserId)
      }
    }
    init()
  }, [nuvioAccessToken, nuvioUserId, loadFromStorage, loadAddonsFromNuvio])

  // Load Continue Watching: Simkl "watching" list + local progress fallback
  useEffect(() => {
    const loadContinueWatching = async () => {
      // Phase 1: Instant Load Local Cache
      const localProgress = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
      const initialLocalItems: (MetaPreview & { video?: any; progressPercent?: number; lastWatchedAt?: number })[] = Object.values(localProgress)
        .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 20)
        .map((p: any) => ({
          id: p.meta.id,
          type: p.meta.type,
          name: p.meta.name,
          poster: p.meta.poster,
          video: p.video || null,
          progressPercent: p.duration > 0 ? Math.round((p.time / p.duration) * 100) : undefined,
          lastWatchedAt: p.updatedAt || 0,
        }))
      
      setContinueWatching(initialLocalItems)

      if (!simklConnected || !simklAccessToken || !simklClientId) {
        setContinueLoading(false)
        return
      }

      setContinueLoading(true)
      try {
          // Fetch from Simkl — shows, movies, and anime
          const { getAllItems } = await import('../api/simkl')

          const [showsData, moviesData, animeData] = await Promise.allSettled([
            getAllItems(simklClientId, simklAccessToken, 'shows'),
            getAllItems(simklClientId, simklAccessToken, 'movies'),
            getAllItems(simklClientId, simklAccessToken, 'anime'),
          ])

          const simklWatching: (MetaPreview & { lastWatchedAt?: number; video?: any; progressPercent?: number })[] = []

          const parseItem = (item: any, defaultType: string) => {
            const obj = item.show || item.movie || item.anime || item
            if (!obj) return null
            const imdbId = obj.ids?.imdb
            const simklId = obj.ids?.simkl
            const id = imdbId || (simklId ? `simkl-${simklId}` : null)
            if (!id) return null

            const poster = obj.poster
              ? `https://simkl.in/posters/${obj.poster}_m.webp`
              : (imdbId ? `https://images.metahub.space/poster/small/${imdbId}/img` : undefined)

            const watchedAtTime = item.last_watched_at
              ? new Date(item.last_watched_at).getTime()
              : item.updated_at
              ? new Date(item.updated_at).getTime()
              : 0

            // Extract last watched episode / season if available from Simkl
            const season = item.season || item.last_watched_season || item.next_to_watch?.season
            const episode = item.episode || item.last_watched_episode || item.next_to_watch?.episode

            return {
              id,
              type: defaultType,
              name: obj.title || obj.name || 'Untitled',
              poster,
              year: obj.year,
              lastWatchedAt: watchedAtTime,
              video: season || episode ? { season, episode } : null,
              progressPercent: item.progress_percentage || (item.status === 'watching' ? 50 : undefined),
            }
          }

          if (showsData.status === 'fulfilled' && Array.isArray(showsData.value)) {
            showsData.value
              .filter((item: any) => item.status === 'watching' || item.last_watched_at)
              .forEach((item: any) => {
                const parsed = parseItem(item, 'series')
                if (parsed) simklWatching.push(parsed)
              })
          }

          if (moviesData.status === 'fulfilled' && Array.isArray(moviesData.value)) {
            moviesData.value
              .filter((item: any) => item.status === 'watching' || item.last_watched_at)
              .forEach((item: any) => {
                const parsed = parseItem(item, 'movie')
                if (parsed) simklWatching.push(parsed)
              })
          }

          if (animeData.status === 'fulfilled' && Array.isArray(animeData.value)) {
            animeData.value
              .filter((item: any) => item.status === 'watching' || item.last_watched_at)
              .forEach((item: any) => {
                const parsed = parseItem(item, 'anime')
                if (parsed) simklWatching.push(parsed)
              })
          }

          // Merge with local progress (most recent watch timestamp takes priority)
          const localProgress = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
          const localItems: (MetaPreview & { lastWatchedAt?: number; video?: any; progressPercent?: number })[] =
            Object.values(localProgress).map((p: any) => ({
              id: p.meta.id,
              type: p.meta.type,
              name: p.meta.name,
              poster: p.meta.poster,
              lastWatchedAt: p.updatedAt || 0,
              video: p.video || null,
              progressPercent: p.duration > 0 ? Math.round((p.time / p.duration) * 100) : undefined,
            }))

          // Merge and sort strictly by most recent watch first
          const seen = new Set<string>()
          const merged: (MetaPreview & { video?: any; progressPercent?: number })[] = []

          const combinedList = [...localItems, ...simklWatching].sort(
            (a, b) => (b.lastWatchedAt || 0) - (a.lastWatchedAt || 0)
          )

          for (const item of combinedList) {
            if (item.id && !seen.has(item.id)) {
              seen.add(item.id)
              merged.push(item)
            }
          }

          setContinueWatching(merged.slice(0, 20))
      } catch (err) {
        console.error('Failed to load continue watching:', err)
        const progress = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
        const items: MetaPreview[] = Object.values(progress)
          .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
          .slice(0, 20)
          .map((p: any) => ({
            id: p.meta.id,
            type: p.meta.type,
            name: p.meta.name,
            poster: p.meta.poster,
          }))
        setContinueWatching(items)
      } finally {
        setContinueLoading(false)
      }
    }

    loadContinueWatching()
  }, [simklConnected, simklAccessToken, simklClientId])

  // Fetch catalogs from addons + default providers
  useEffect(() => {
    let mounted = true
    setHeroItems([])
    setHero(null)

    const enabledAddons = addons.filter(a => a.enabled)
    const providersToLoad = enabledAddons.length > 0
      ? enabledAddons.map(a => ({ manifestUrl: a.manifestUrl, manifest: a.manifest }))
      : DEFAULT_PROVIDERS

    const catalogEntries: CatalogData[] = []

    providersToLoad.forEach(provider => {
      const catalogsToFetch = (provider.manifest.catalogs || [])
        .filter((cat: any) => !cat.extraRequired && !cat.extra?.some((e: any) => e.isRequired))
        .slice(0, 4)

      catalogsToFetch.forEach((cat: any) => {
        const key = `${provider.manifest.id || provider.manifestUrl}:${cat.type}:${cat.id}`
        const title = cat.name || `${cat.type.toUpperCase()} • ${cat.id}`
        catalogEntries.push({
          key,
          title: `${title} • ${provider.manifest.name}`,
          items: [],
          loading: true,
        })
      })
    })

    setCatalogs(catalogEntries)

    providersToLoad.forEach(provider => {
      const client = new AddonClient(provider.manifestUrl)
      if (provider.manifest) client.manifest = provider.manifest as any

      const catalogsToFetch = (provider.manifest.catalogs || [])
        .filter((cat: any) => !cat.extraRequired && !cat.extra?.some((e: any) => e.isRequired))
        .slice(0, 4)

      catalogsToFetch.forEach(async (cat: any) => {
        const key = `${provider.manifest.id || provider.manifestUrl}:${cat.type}:${cat.id}`
        try {
          const result = await client.getCatalog(cat.type, cat.id)
          if (!mounted) return
          
          if (result && Array.isArray(result.metas) && result.metas.length > 0) {
            setCatalogs(prev =>
              prev.map(c => (c.key === key ? { ...c, items: result.metas, loading: false } : c))
            )
            setHeroItems(prev => {
              const newItems = result.metas.slice(0, 6).filter(m => !prev.some(p => p.id === m.id))
              return [...prev, ...newItems]
            })
            setHero(prev => prev || result.metas[0])
          } else {
            setCatalogs(prev => prev.filter(c => c.key !== key))
          }
        } catch {
          if (!mounted) return
          setCatalogs(prev => prev.filter(c => c.key !== key))
        }
      })
    })

    return () => { mounted = false }
  }, [addons])

  // Auto-rotate hero every 8 seconds
  useEffect(() => {
    if (heroItems.length < 2) return
    if (heroVideoRef.current) clearInterval(heroVideoRef.current)
    heroVideoRef.current = setInterval(() => {
      setHeroIndex(prev => {
        const next = (prev + 1) % Math.min(heroItems.length, 10)
        setHero(heroItems[next])
        return next
      })
    }, 8000)
    return () => {
      if (heroVideoRef.current) clearInterval(heroVideoRef.current)
    }
  }, [heroItems])

  const continueLabel = simklConnected
    ? 'Continue Watching • Simkl'
    : 'Continue Watching'

  return (
    <div className="home-page">
      {/* Continue Watching — always at the very top */}
      {(continueWatching.length > 0 || continueLoading) && (
        <div className="continue-watching-section">
          <CatalogRow
            title={continueLabel}
            items={continueWatching}
            loading={continueLoading}
          />
        </div>
      )}

      {/* Hero Section or Skeleton */}
      {hero ? (
        <div className="hero-section">
          <div 
            className="hero-bg" 
            style={{
              backgroundImage: hero.background
                ? `url(${hero.background})`
                : hero.poster
                ? `url(${hero.poster})`
                : 'none',
            }}
          />
          <div className="hero-gradient" />
          <div className="hero-gradient-cap" />
          <div className="hero-content">
            <h1 className="hero-title">{hero.name}</h1>
            {hero.description && (
              <p className="hero-description">{hero.description.substring(0, 200)}...</p>
            )}
            <div className="hero-meta">
              {hero.year && <span>{hero.year}</span>}
              {hero.imdbRating && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Star size={14} fill="#f5c518" color="#f5c518" aria-hidden="true" /> {hero.imdbRating}
                </span>
              )}
              {hero.genres?.slice(0, 3).map(g => (
                <span key={g} className="badge">
                  {g}
                </span>
              ))}
            </div>
            <div className="hero-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => navigate(`/detail/${hero.type}/${encodeURIComponent(hero.id)}`)}
              >
                <Play size={18} fill="currentColor" aria-hidden="true" /> Play
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                onClick={() => navigate(`/detail/${hero.type}/${encodeURIComponent(hero.id)}`)}
              >
                <Info size={18} aria-hidden="true" /> More Info
              </button>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => navigate(`/wasm-player`)}
                style={{ marginLeft: '10px', background: '#9c27b0' }}
              >
                <Cpu size={18} aria-hidden="true" /> Test Wasm Decoder
              </button>
            </div>
          </div>
          {/* Hero dot indicators */}
          {heroItems.length > 1 && (
            <div className="hero-dots">
              {heroItems.slice(0, 8).map((_, i) => (
                <button
                  type="button"
                  key={i}
                  className={`hero-dot ${i === heroIndex ? 'hero-dot-active' : ''}`}
                  onClick={() => {
                    setHeroIndex(i)
                    setHero(heroItems[i])
                  }}
                  aria-label={`Go to slide ${i + 1}`}
                  title={`Slide ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="hero-skeleton">
          <div className="hero-gradient" />
          <div className="hero-gradient-cap" />
          <div className="hero-content">
            <div className="skeleton hero-skeleton-title" />
            <div className="skeleton hero-skeleton-desc" />
            <div className="skeleton hero-skeleton-meta" />
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="skeleton hero-skeleton-btn" />
              <div className="skeleton hero-skeleton-btn" />
            </div>
          </div>
        </div>
      )}

      <div className="home-catalogs">
        {catalogs.map(cat => (
          <CatalogRow
            key={cat.key}
            title={cat.title}
            items={cat.items}
            loading={cat.loading}
          />
        ))}

        {catalogs.length === 0 && addons.length === 0 && (
          <div className="empty-state">
            <Blocks size={48} aria-hidden="true" style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h2>No addons installed</h2>
            <p>Go to Settings to login with Nuvio and load your addons</p>
            <button className="btn btn-primary" onClick={() => navigate('/settings')}>
              Go to Settings
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
