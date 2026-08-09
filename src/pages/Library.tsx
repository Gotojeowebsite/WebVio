import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Library as LibraryIcon,
  Play,
  ListPlus,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Inbox,
  RefreshCw,
  Clock,
  Search,
  X,
  SlidersHorizontal,
  Layers,
  Film,
  Tv,
  Sparkles,
} from 'lucide-react'
import { useAuthStore } from '../store/auth-store'
import MediaCard from '../components/catalog/MediaCard'
import { MetaPreview } from '../api/addon-client'
import { pullCollectionsFromNuvio } from '../api/nuvio-auth'
import { getLocalLibrary, LibraryItem, LibraryStatus } from '../utils/library'

type LibraryTabStatus = LibraryStatus | 'all'
type LibraryTypeFilter = 'all' | 'shows' | 'movies' | 'anime'
type LibrarySortOption = 'recent' | 'title' | 'year' | 'rating'

const STATUS_TABS: { key: LibraryTabStatus; label: string; icon: any }[] = [
  { key: 'all', label: 'All Items', icon: LibraryIcon },
  { key: 'watching', label: 'Watching', icon: Play },
  { key: 'plantowatch', label: 'Plan to Watch', icon: ListPlus },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
  { key: 'hold', label: 'On Hold', icon: PauseCircle },
  { key: 'dropped', label: 'Dropped', icon: XCircle },
]

const TYPE_TABS: { key: LibraryTypeFilter; label: string; icon: any }[] = [
  { key: 'all', label: 'All Types', icon: Layers },
  { key: 'shows', label: 'TV Shows', icon: Tv },
  { key: 'movies', label: 'Movies', icon: Film },
  { key: 'anime', label: 'Anime', icon: Sparkles },
]

interface EnrichedLibraryItem extends MetaPreview {
  status: LibraryStatus
  progressPercent?: number
  video?: { id?: string; season?: number; episode?: number; title?: string } | null
  updatedAt?: number
  addedAt?: number
  source?: 'local' | 'simkl' | 'nuvio'
}

export default function Library() {
  const {
    simklConnected,
    simklAccessToken,
    simklClientId,
    simklHistory,
    isSyncingSimkl,
    syncSimklHistory,
    nuvioLoggedIn,
    nuvioAccessToken,
  } = useAuthStore()

  const navigate = useNavigate()
  const [source, _setSource] = useState<'all' | 'nuvio' | 'simkl' | 'local'>('all')
  const [activeStatus, setActiveStatus] = useState<LibraryTabStatus>('all')
  const [activeType, setActiveType] = useState<LibraryTypeFilter>('all')
  const [sortBy, setSortBy] = useState<LibrarySortOption>('recent')
  const [searchQuery, setSearchQuery] = useState('')

  const [localItems, setLocalItems] = useState<LibraryItem[]>([])
  const [nuvioItems, setNuvioItems] = useState<EnrichedLibraryItem[]>([])
  const [simklItems, setSimklItems] = useState<EnrichedLibraryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [continueWatchingList, setContinueWatchingList] = useState<EnrichedLibraryItem[]>([])

  // 1. Load Local Saved Items
  const reloadLocalItems = () => {
    setLocalItems(getLocalLibrary())
  }

  useEffect(() => {
    reloadLocalItems()
  }, [])

  // 2. Load Continue Watching from local progress & Simkl history
  useEffect(() => {
    const loadContinueWatching = () => {
      const list: EnrichedLibraryItem[] = []
      const seenIds = new Set<string>()

      try {
        const rawProgress: Record<string, any> = JSON.parse(
          localStorage.getItem('webvio_progress') || '{}'
        )
        const entries = Object.values(rawProgress)
          .filter((item: any) => item && item.meta && item.time > 10 && item.duration > 30)
          .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))

        for (const entry of entries) {
          const meta = entry.meta
          if (!meta?.id || seenIds.has(meta.id)) continue
          seenIds.add(meta.id)

          const percent = Math.min(100, Math.round((entry.time / entry.duration) * 100))
          if (percent < 95) {
            list.push({
              id: meta.id,
              type: meta.type || (entry.video ? 'series' : 'movie'),
              name: meta.name || 'Untitled',
              poster: meta.poster,
              progressPercent: percent,
              video: entry.video || null,
              updatedAt: entry.updatedAt,
              status: 'watching',
              source: 'local',
            })
          }
        }
      } catch {
        // Ignore
      }

      // Merge from Simkl 'watching' list
      if (simklHistory?.shows) {
        for (const s of simklHistory.shows) {
          if (s.status === 'watching' && s.show?.ids?.imdb) {
            const imdbId = s.show.ids.imdb
            if (!seenIds.has(imdbId)) {
              seenIds.add(imdbId)
              let latestSeason = 1
              let latestEpisode = 1
              if (s.seasons && s.seasons.length > 0) {
                const sn = s.seasons[s.seasons.length - 1]
                latestSeason = sn.number || 1
                if (sn.episodes && sn.episodes.length > 0) {
                  latestEpisode = sn.episodes[sn.episodes.length - 1].number || 1
                }
              }
              list.push({
                id: imdbId,
                type: 'series',
                name: s.show.title || 'Untitled Show',
                poster: s.show.poster
                  ? `https://simkl.in/posters/${s.show.poster}_m.webp`
                  : undefined,
                year: s.show.year,
                video: {
                  id: `${imdbId}:${latestSeason}:${latestEpisode}`,
                  season: latestSeason,
                  episode: latestEpisode,
                },
                progressPercent: 50,
                status: 'watching',
                source: 'simkl',
              })
            }
          }
        }
      }

      setContinueWatchingList(list.slice(0, 12))
    }

    loadContinueWatching()
  }, [simklHistory])

  // 3. Fetch Nuvio Collections
  useEffect(() => {
    if (!nuvioLoggedIn || !nuvioAccessToken) return

    const fetchNuvioCollections = async () => {
      try {
        const collections = await pullCollectionsFromNuvio(nuvioAccessToken)
        const allItems: EnrichedLibraryItem[] = []
        collections.forEach((col: any) => {
          if (Array.isArray(col.items)) {
            col.items.forEach((item: any) => {
              allItems.push({
                id: item.id || item.imdb || item.content_id,
                type: item.type || item.content_type || 'movie',
                name: item.name || item.title || 'Untitled',
                poster: item.poster || item.poster_path,
                year: item.year,
                status: 'plantowatch',
                source: 'nuvio',
              })
            })
          }
        })
        setNuvioItems(allItems)
      } catch (err) {
        console.error('Failed to pull Nuvio collections:', err)
      }
    }

    fetchNuvioCollections()
  }, [nuvioLoggedIn, nuvioAccessToken])

  // 4. Fetch Simkl Library Items
  useEffect(() => {
    if (!simklConnected || !simklAccessToken || !simklClientId) return

    const fetchSimklLibrary = async () => {
      setLoading(true)
      try {
        const { getAllItems } = await import('../api/simkl')
        const [shows, movies, anime] = await Promise.allSettled([
          getAllItems(simklClientId, simklAccessToken, 'shows'),
          getAllItems(simklClientId, simklAccessToken, 'movies'),
          getAllItems(simklClientId, simklAccessToken, 'anime'),
        ])

        const collected: EnrichedLibraryItem[] = []

        const mapSimklItem = (item: any, defaultType: string): EnrichedLibraryItem | null => {
          const obj = item.show || item.movie || item.anime || item
          if (!obj) return null
          const rawId =
            obj.ids?.imdb ||
            (obj.ids?.simkl ? `simkl-${obj.ids.simkl}` : null)
          if (!rawId) return null

          const poster = obj.poster
            ? `https://simkl.in/posters/${obj.poster}_m.webp`
            : obj.ids?.imdb
            ? `https://images.metahub.space/poster/small/${obj.ids.imdb}/img`
            : undefined

          let videoInfo = null
          if (item.seasons && item.seasons.length > 0) {
            const lastSeason = item.seasons[item.seasons.length - 1]
            const lastEp =
              lastSeason.episodes && lastSeason.episodes.length > 0
                ? lastSeason.episodes[lastSeason.episodes.length - 1]
                : null
            if (lastEp) {
              videoInfo = {
                id: `${rawId}:${lastSeason.number || 1}:${lastEp.number}`,
                season: lastSeason.number || 1,
                episode: lastEp.number,
              }
            }
          }

          let progressPercent: number | undefined
          if (item.watched_episodes_count && item.total_episodes_count) {
            progressPercent = Math.round(
              (item.watched_episodes_count / item.total_episodes_count) * 100
            )
          }

          const statusMap: Record<string, LibraryStatus> = {
            watching: 'watching',
            plantowatch: 'plantowatch',
            completed: 'completed',
            hold: 'hold',
            dropped: 'dropped',
          }

          return {
            id: rawId,
            type: defaultType,
            name: obj.title || obj.name || 'Unknown',
            poster,
            year: obj.year,
            video: videoInfo,
            progressPercent,
            status: statusMap[item.status] || 'plantowatch',
            updatedAt: item.last_watched_at ? new Date(item.last_watched_at).getTime() : 0,
            source: 'simkl',
          }
        }

        if (shows.status === 'fulfilled' && Array.isArray(shows.value)) {
          shows.value.forEach((i: any) => {
            const parsed = mapSimklItem(i, 'series')
            if (parsed) collected.push(parsed)
          })
        }

        if (movies.status === 'fulfilled' && Array.isArray(movies.value)) {
          movies.value.forEach((i: any) => {
            const parsed = mapSimklItem(i, 'movie')
            if (parsed) collected.push(parsed)
          })
        }

        if (anime.status === 'fulfilled' && Array.isArray(anime.value)) {
          anime.value.forEach((i: any) => {
            const parsed = mapSimklItem(i, 'anime')
            if (parsed) collected.push(parsed)
          })
        }

        setSimklItems(collected)
      } catch (err) {
        console.error('Failed to fetch Simkl library:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchSimklLibrary()
  }, [simklConnected, simklAccessToken, simklClientId])

  // Combine and deduplicate library items
  const allLibraryItems = useMemo(() => {
    const map = new Map<string, EnrichedLibraryItem>()

    // Local items
    localItems.forEach((item) => {
      map.set(item.id, { ...item, source: 'local' })
    })

    // Simkl items
    simklItems.forEach((item) => {
      if (!map.has(item.id)) {
        map.set(item.id, item)
      } else {
        // Upgrade with Simkl status
        const existing = map.get(item.id)!
        map.set(item.id, { ...existing, ...item, source: 'simkl' })
      }
    })

    // Nuvio items
    nuvioItems.forEach((item) => {
      if (!map.has(item.id)) {
        map.set(item.id, item)
      }
    })

    return Array.from(map.values())
  }, [localItems, simklItems, nuvioItems])

  // Filter and Sort Pipeline
  const filteredAndSortedItems = useMemo(() => {
    return allLibraryItems
      .filter((item) => {
        // 1. Source filter
        if (source !== 'all' && item.source !== source) return false

        // 2. Status filter
        if (activeStatus !== 'all' && item.status !== activeStatus) return false

        // 3. Type filter
        if (activeType === 'shows' && item.type !== 'series' && item.type !== 'tv') return false
        if (activeType === 'movies' && item.type !== 'movie') return false
        if (
          activeType === 'anime' &&
          item.type !== 'anime' &&
          !item.genres?.includes('Animation') &&
          !item.genres?.includes('Anime')
        )
          return false

        // 4. Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          if (!item.name.toLowerCase().includes(q)) return false
        }

        return true
      })
      .sort((a, b) => {
        if (sortBy === 'title') {
          return a.name.localeCompare(b.name)
        }
        if (sortBy === 'year') {
          const ya = parseInt(String(a.year || a.releaseInfo || '0'), 10) || 0
          const yb = parseInt(String(b.year || b.releaseInfo || '0'), 10) || 0
          return yb - ya
        }
        if (sortBy === 'rating') {
          const ra = parseFloat(a.imdbRating || '0')
          const rb = parseFloat(b.imdbRating || '0')
          return rb - ra
        }
        // Default: recent
        const timeA = a.updatedAt || a.addedAt || 0
        const timeB = b.updatedAt || b.addedAt || 0
        return timeB - timeA
      })
  }, [allLibraryItems, source, activeStatus, activeType, searchQuery, sortBy])

  // Stats count
  const statsWatching = useMemo(
    () => allLibraryItems.filter((i) => i.status === 'watching').length,
    [allLibraryItems]
  )
  const statsPlan = useMemo(
    () => allLibraryItems.filter((i) => i.status === 'plantowatch').length,
    [allLibraryItems]
  )
  const statsCompleted = useMemo(
    () => allLibraryItems.filter((i) => i.status === 'completed').length,
    [allLibraryItems]
  )

  const handleSyncSimkl = async () => {
    try {
      await syncSimklHistory(true)
    } catch {
      // Ignore
    }
  }

  return (
    <div className="page library-page">
      {/* ── Top Header & Stats Bar ────────────────────────────────────────── */}
      <div className="library-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            My Library
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Track your watching progress, bookmarks, and synced collections
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {simklConnected && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleSyncSimkl}
              disabled={isSyncingSimkl}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={isSyncingSimkl ? 'animate-spin' : ''} aria-hidden="true" />
              <span>{isSyncingSimkl ? 'Syncing...' : 'Sync Simkl'}</span>
            </button>
          )}

          <div className="library-search-wrapper" style={{ position: 'relative', width: '240px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-full)',
                padding: '6px 30px 6px 32px',
                fontSize: '0.8rem',
                color: '#fff',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats Metric Cards ────────────────────────────────────────────── */}
      <div className="library-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }}>
        <div className="card-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-violet)' }}>
            <LibraryIcon size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{allLibraryItems.length}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Saved Titles</div>
          </div>
        </div>

        <div className="card-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'rgba(236, 72, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ec4899' }}>
            <Play size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{statsWatching}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Currently Watching</div>
          </div>
        </div>

        <div className="card-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
            <ListPlus size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{statsPlan}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Plan to Watch</div>
          </div>
        </div>

        <div className="card-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{statsCompleted}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Completed</div>
          </div>
        </div>
      </div>

      {/* ── Continue Watching Row ─────────────────────────────────────────── */}
      {continueWatchingList.length > 0 && (
        <section style={{ marginBottom: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)' }}>
            <Clock size={20} color="var(--accent-violet)" aria-hidden="true" />
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, margin: 0 }}>
              Continue Watching
            </h2>
            <span className="badge badge-small">{continueWatchingList.length}</span>
          </div>

          <div className="media-grid media-grid-dense">
            {continueWatchingList.map((item) => (
              <MediaCard key={`cw-${item.id}`} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* ── Filter Controls & Sort Toolbar ────────────────────────────────── */}
      <div className="library-toolbar-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        {/* Status Tabs */}
        <div className="library-status-tabs" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: 0 }}>
          {STATUS_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                type="button"
                className={`tab-btn ${activeStatus === tab.key ? 'tab-active' : ''}`}
                style={{ borderRadius: 'var(--radius-full)', padding: '6px 14px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setActiveStatus(tab.key)}
              >
                <Icon size={13} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Type & Sort Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {/* Type Filter */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`btn-ghost ${activeType === tab.key ? 'active' : ''}`}
                style={{
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: activeType === tab.key ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                  color: activeType === tab.key ? '#fff' : 'var(--text-muted)',
                }}
                onClick={() => setActiveType(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <SlidersHorizontal size={14} color="var(--text-muted)" aria-hidden="true" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as LibrarySortOption)}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: '#fff',
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="recent">Recently Updated</option>
              <option value="title">Title (A - Z)</option>
              <option value="year">Year (Newest)</option>
              <option value="rating">Highest Rating</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Library Media Grid ────────────────────────────────────────────── */}
      {loading && (
        <div className="media-grid media-grid-dense">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="media-card skeleton" />
          ))}
        </div>
      )}

      {!loading && filteredAndSortedItems.length === 0 && (
        <div className="empty-state card-glass" style={{ borderRadius: 'var(--radius-xl)', padding: 'var(--space-12) var(--space-6)' }}>
          <Inbox size={48} aria-hidden="true" style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3>No Items in Library</h3>
          <p style={{ maxWidth: '440px', margin: '0 auto 16px', color: 'var(--text-muted)' }}>
            {searchQuery
              ? `No library items match "${searchQuery}".`
              : 'Add movies and series to your library or sync with Simkl to track your watched progress.'}
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/discover')}>
            Explore Discover Catalog
          </button>
        </div>
      )}

      {!loading && filteredAndSortedItems.length > 0 && (
        <div className="media-grid media-grid-dense">
          {filteredAndSortedItems.map((item) => (
            <MediaCard key={`${item.source || 'lib'}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
