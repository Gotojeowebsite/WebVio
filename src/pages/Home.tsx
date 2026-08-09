import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Play,
  Info,
  Star,
  Plus,
  Check,
  LayoutGrid,
  Rows,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Flame,
  Clock,
  Tv,
  Film,
  Blocks,
} from 'lucide-react'
import { useAddonStore } from '../store/addon-store'
import { useAuthStore } from '../store/auth-store'
import { AddonClient, MetaPreview, Meta } from '../api/addon-client'
import CatalogRow from '../components/catalog/CatalogRow'
import MediaCard from '../components/catalog/MediaCard'
import StreamPicker from '../components/detail/StreamPicker'
import { isInLibrary, toggleLibraryItem } from '../utils/library'
import './home.css'

interface CatalogData {
  key: string
  title: string
  items: MetaPreview[]
  loading: boolean
  icon?: any
}

const DEFAULT_PROVIDERS = [
  {
    manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
    manifest: {
      id: 'com.linvo.cinemeta',
      name: 'Cinemeta',
      catalogs: [
        { type: 'movie', id: 'top', name: 'Trending Movies' },
        { type: 'series', id: 'top', name: 'Popular TV Shows' },
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
  const navigate = useNavigate()

  const [catalogs, setCatalogs] = useState<CatalogData[]>([])
  const [heroItems, setHeroItems] = useState<MetaPreview[]>([])
  const [heroIndex, setHeroIndex] = useState(0)
  const [continueWatching, setContinueWatching] = useState<
    (MetaPreview & { video?: any; progressPercent?: number; lastWatchedAt?: number })[]
  >([])
  const [continueLoading, setContinueLoading] = useState(false)
  const [layoutMode, setLayoutMode] = useState<'rows' | 'grid'>(() => {
    return (localStorage.getItem('webvio_home_layout') as 'rows' | 'grid') || 'rows'
  })

  // StreamPicker Modal state for direct Hero play
  const [streamPickerOpen, setStreamPickerOpen] = useState(false)
  const [streamPickerMeta, setStreamPickerMeta] = useState<Meta | null>(null)
  const [streamPickerVideoId, setStreamPickerVideoId] = useState<string>('')
  const [streamPickerType, setStreamPickerType] = useState<string>('movie')
  const [libraryStateUpdated, setLibraryStateUpdated] = useState(0)

  const heroRotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Switch layout mode and persist
  const handleToggleLayout = (mode: 'rows' | 'grid') => {
    setLayoutMode(mode)
    localStorage.setItem('webvio_home_layout', mode)
  }

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
      // 1. Instant local progress load
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
            : imdbId
            ? `https://images.metahub.space/poster/small/${imdbId}/img`
            : undefined

          const watchedAtTime = item.last_watched_at
            ? new Date(item.last_watched_at).getTime()
            : item.updated_at
            ? new Date(item.updated_at).getTime()
            : 0

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

        // Merge local and Simkl progress
        const seen = new Set<string>()
        const merged: (MetaPreview & { video?: any; progressPercent?: number })[] = []
        const combinedList = [...initialLocalItems, ...simklWatching].sort(
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

    const enabledAddons = addons.filter((a) => a.enabled)
    const providersToLoad =
      enabledAddons.length > 0
        ? enabledAddons.map((a) => ({ manifestUrl: a.manifestUrl, manifest: a.manifest }))
        : DEFAULT_PROVIDERS

    const catalogEntries: CatalogData[] = []

    providersToLoad.forEach((provider) => {
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
          icon: cat.type === 'anime' ? Sparkles : cat.type === 'series' ? Tv : Film,
        })
      })
    })

    setCatalogs(catalogEntries)

    providersToLoad.forEach((provider) => {
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
            setCatalogs((prev) =>
              prev.map((c) => (c.key === key ? { ...c, items: result.metas, loading: false } : c))
            )
            setHeroItems((prev) => {
              const newItems = result.metas
                .filter((m) => m.background || m.poster)
                .slice(0, 8)
                .filter((m) => !prev.some((p) => p.id === m.id))
              return [...prev, ...newItems]
            })
          } else {
            setCatalogs((prev) => prev.filter((c) => c.key !== key))
          }
        } catch {
          if (!mounted) return
          setCatalogs((prev) => prev.filter((c) => c.key !== key))
        }
      })
    })

    return () => {
      mounted = false
    }
  }, [addons])

  // Auto-rotate hero every 8 seconds
  useEffect(() => {
    if (heroItems.length < 2) return
    if (heroRotateTimerRef.current) clearInterval(heroRotateTimerRef.current)

    heroRotateTimerRef.current = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % Math.min(heroItems.length, 8))
    }, 8000)

    return () => {
      if (heroRotateTimerRef.current) clearInterval(heroRotateTimerRef.current)
    }
  }, [heroItems.length])

  const currentHero = heroItems[heroIndex] || heroItems[0] || null

  const handleHeroPrev = () => {
    if (heroItems.length === 0) return
    setHeroIndex((prev) => (prev - 1 + Math.min(heroItems.length, 8)) % Math.min(heroItems.length, 8))
  }

  const handleHeroNext = () => {
    if (heroItems.length === 0) return
    setHeroIndex((prev) => (prev + 1) % Math.min(heroItems.length, 8))
  }

  // Quick Play / Launch StreamPicker from Hero
  const handleHeroPlay = async (hero: MetaPreview) => {
    try {
      // If series, navigate to Detail page for episode selection or fetch meta for stream picker
      if (hero.type === 'series' || hero.type === 'tv' || hero.type === 'anime') {
        navigate(`/detail/${hero.type}/${encodeURIComponent(hero.id)}?autoplay=true`)
        return
      }

      // If movie, launch StreamPicker directly
      setStreamPickerType(hero.type || 'movie')
      setStreamPickerVideoId(hero.id)
      setStreamPickerMeta({
        ...hero,
        videos: [],
      })
      setStreamPickerOpen(true)
    } catch {
      navigate(`/detail/${hero.type || 'movie'}/${encodeURIComponent(hero.id)}`)
    }
  }

  // Toggle Library item
  const handleToggleHeroLibrary = (hero: MetaPreview) => {
    toggleLibraryItem(hero, 'plantowatch')
    setLibraryStateUpdated((prev) => prev + 1)
  }

  const heroInLibrary = useMemo(() => {
    void libraryStateUpdated
    return currentHero ? isInLibrary(currentHero.id) : false
  }, [currentHero, libraryStateUpdated])

  const continueLabel = simklConnected ? 'Continue Watching • Simkl' : 'Continue Watching'

  return (
    <div className="home-page">
      {/* ── Windows Nuvio 16:9 Backdrop Hero Banner ───────────────────────── */}
      {currentHero ? (
        <section className="hero-section" aria-label="Featured content">
          <div
            className="hero-bg"
            style={{
              backgroundImage: currentHero.background
                ? `url(${currentHero.background})`
                : currentHero.poster
                ? `url(${currentHero.poster})`
                : 'none',
            }}
          />
          <div className="hero-gradient" />
          <div className="hero-gradient-cap" />

          {/* Left / Right Hero Carousel Controls */}
          {heroItems.length > 1 && (
            <>
              <button
                type="button"
                className="hero-arrow-btn hero-arrow-left"
                onClick={handleHeroPrev}
                aria-label="Previous featured title"
                title="Previous featured"
              >
                <ChevronLeft size={24} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="hero-arrow-btn hero-arrow-right"
                onClick={handleHeroNext}
                aria-label="Next featured title"
                title="Next featured"
              >
                <ChevronRight size={24} aria-hidden="true" />
              </button>
            </>
          )}

          <div className="hero-content">
            {/* Featured Badge */}
            <div className="hero-featured-tag">
              <Flame size={14} aria-hidden="true" />
              <span>FEATURED SPOTLIGHT</span>
            </div>

            <h1 className="hero-title">{currentHero.name}</h1>

            <div className="hero-meta">
              {currentHero.year && <span className="hero-pill">{currentHero.year}</span>}
              {currentHero.imdbRating && (
                <span className="hero-pill hero-pill-rating">
                  <Star size={13} fill="#f5c518" color="#f5c518" aria-hidden="true" />
                  <span>{currentHero.imdbRating}</span>
                </span>
              )}
              {currentHero.type && (
                <span className="hero-pill hero-pill-type">
                  {currentHero.type.toUpperCase()}
                </span>
              )}
              {currentHero.genres?.slice(0, 3).map((g) => (
                <span key={g} className="hero-pill">
                  {g}
                </span>
              ))}
            </div>

            {currentHero.description && (
              <p className="hero-description">
                {currentHero.description.length > 220
                  ? `${currentHero.description.substring(0, 220)}...`
                  : currentHero.description}
              </p>
            )}

            <div className="hero-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg hero-play-btn"
                onClick={() => handleHeroPlay(currentHero)}
              >
                <Play size={18} fill="currentColor" aria-hidden="true" />
                <span>Play Now</span>
              </button>

              <button
                type="button"
                className={`btn btn-secondary btn-lg ${heroInLibrary ? 'hero-library-active' : ''}`}
                onClick={() => handleToggleHeroLibrary(currentHero)}
                title={heroInLibrary ? 'In Your Library' : 'Add to Library'}
              >
                {heroInLibrary ? (
                  <>
                    <Check size={18} color="#10b981" aria-hidden="true" />
                    <span>In Library</span>
                  </>
                ) : (
                  <>
                    <Plus size={18} aria-hidden="true" />
                    <span>Add to Library</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-lg"
                onClick={() =>
                  navigate(`/detail/${currentHero.type || 'movie'}/${encodeURIComponent(currentHero.id)}`)
                }
              >
                <Info size={18} aria-hidden="true" />
                <span>More Info</span>
              </button>
            </div>
          </div>

          {/* Hero Indicator Dots */}
          {heroItems.length > 1 && (
            <div className="hero-dots" role="tablist" aria-label="Featured carousel navigation">
              {heroItems.slice(0, 8).map((item, i) => (
                <button
                  type="button"
                  key={item.id || i}
                  role="tab"
                  aria-selected={i === heroIndex}
                  aria-label={`Slide ${i + 1}: ${item.name}`}
                  className={`hero-dot ${i === heroIndex ? 'hero-dot-active' : ''}`}
                  onClick={() => setHeroIndex(i)}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="hero-skeleton">
          <div className="hero-gradient" />
          <div className="hero-gradient-cap" />
          <div className="hero-content">
            <div className="skeleton hero-skeleton-tag" />
            <div className="skeleton hero-skeleton-title" />
            <div className="skeleton hero-skeleton-meta" />
            <div className="skeleton hero-skeleton-desc" />
            <div className="hero-skeleton-actions">
              <div className="skeleton hero-skeleton-btn" />
              <div className="skeleton hero-skeleton-btn" />
            </div>
          </div>
        </div>
      )}

      {/* ── Main Feed Controls & Catalog Section ────────────────────────── */}
      <div className="home-feed-container">
        {/* Layout Mode Switcher Bar */}
        <div className="home-layout-toolbar">
          <div className="toolbar-left">
            <h2 className="toolbar-heading">Discover & Watch</h2>
            <span className="toolbar-subhead">Explore feeds from your installed addons</span>
          </div>

          <div className="layout-toggle-group" role="group" aria-label="Layout view mode">
            <button
              type="button"
              className={`layout-toggle-btn ${layoutMode === 'rows' ? 'active' : ''}`}
              onClick={() => handleToggleLayout('rows')}
              title="Cinematic Horizontal Rows"
              aria-pressed={layoutMode === 'rows'}
            >
              <Rows size={16} aria-hidden="true" />
              <span>Cinematic Rows</span>
            </button>
            <button
              type="button"
              className={`layout-toggle-btn ${layoutMode === 'grid' ? 'active' : ''}`}
              onClick={() => handleToggleLayout('grid')}
              title="Dense Poster Grid"
              aria-pressed={layoutMode === 'grid'}
            >
              <LayoutGrid size={16} aria-hidden="true" />
              <span>Dense Grid</span>
            </button>
          </div>
        </div>

        {/* ── Continue Watching Row ─────────────────────────────────────── */}
        {(continueWatching.length > 0 || continueLoading) && (
          <section className="continue-watching-section">
            {layoutMode === 'rows' ? (
              <CatalogRow
                title={continueLabel}
                items={continueWatching}
                loading={continueLoading}
              />
            ) : (
              <div className="grid-catalog-section">
                <div className="grid-catalog-header">
                  <h3 className="grid-catalog-title">
                    <span className="grid-catalog-title-accent" />
                    <Clock size={20} color="var(--accent-violet)" aria-hidden="true" />
                    {continueLabel}
                  </h3>
                </div>
                <div className="media-grid media-grid-dense">
                  {continueWatching.map((item) => (
                    <MediaCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Catalog Feeds (Cinematic Rows or Dense Poster Grids) ───────── */}
        <div className="home-catalogs">
          {layoutMode === 'rows' ? (
            // Mode 1: Cinematic Horizontal Rows with smooth dragging & chevrons
            catalogs.map((cat) => (
              <CatalogRow
                key={cat.key}
                title={cat.title}
                items={cat.items}
                loading={cat.loading}
              />
            ))
          ) : (
            // Mode 2: Dense Poster Grid Layout
            catalogs.map((cat) => {
              const Icon = cat.icon || Film
              return (
                <div key={cat.key} className="grid-catalog-section">
                  <div className="grid-catalog-header">
                    <h3 className="grid-catalog-title">
                      <span className="grid-catalog-title-accent" />
                      <Icon size={20} color="var(--accent-violet)" aria-hidden="true" />
                      {cat.title}
                    </h3>
                    <span className="grid-catalog-count">
                      {cat.items.length} {cat.items.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {cat.loading ? (
                    <div className="media-grid media-grid-dense">
                      {Array.from({ length: 8 }).map((_, idx) => (
                        <div key={idx} className="media-card skeleton" />
                      ))}
                    </div>
                  ) : cat.items.length > 0 ? (
                    <div className="media-grid media-grid-dense">
                      {cat.items.map((item) => (
                        <MediaCard key={item.id} item={item} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid-empty-notice">
                      <span>No items available from this catalog</span>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {catalogs.length === 0 && addons.length === 0 && (
            <div className="empty-state card-glass">
              <Blocks size={56} aria-hidden="true" style={{ marginBottom: '16px', opacity: 0.5 }} />
              <h2>No Addons Installed</h2>
              <p>Configure streaming providers or sign in with your Nuvio account to load catalogs.</p>
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/settings')}>
                Go to Settings & Addons
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── One-Click StreamPicker Modal ──────────────────────────────────── */}
      {streamPickerOpen && streamPickerMeta && (
        <StreamPicker
          isOpen={streamPickerOpen}
          onClose={() => setStreamPickerOpen(false)}
          type={streamPickerType}
          videoId={streamPickerVideoId}
          meta={streamPickerMeta}
        />
      )}
    </div>
  )
}
