import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/auth-store'
import { useNavigate } from 'react-router-dom'
import { Library as LibraryIcon, Play, ListPlus, CheckCircle2, PauseCircle, XCircle, Zap, BarChart2, Inbox } from 'lucide-react'
import MediaCard from '../components/catalog/MediaCard'
import { MetaPreview } from '../api/addon-client'
import { pullCollectionsFromNuvio } from '../api/nuvio-auth'

type SimklStatus = 'watching' | 'plantowatch' | 'completed' | 'hold' | 'dropped'

const STATUS_TABS: { key: SimklStatus | 'all'; label: string; icon: any }[] = [
  { key: 'all', label: 'All', icon: LibraryIcon },
  { key: 'watching', label: 'Watching', icon: Play },
  { key: 'plantowatch', label: 'Plan to Watch', icon: ListPlus },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
  { key: 'hold', label: 'On Hold', icon: PauseCircle },
  { key: 'dropped', label: 'Dropped', icon: XCircle },
]

const TYPE_TABS = [
  { key: 'shows', label: 'TV Shows' },
  { key: 'movies', label: 'Movies' },
  { key: 'anime', label: 'Anime' },
]

export default function Library() {
  const { simklConnected, simklAccessToken, simklClientId, nuvioLoggedIn, nuvioAccessToken } = useAuthStore()
  const navigate = useNavigate()
  const [source, setSource] = useState<'nuvio' | 'simkl'>(nuvioLoggedIn ? 'nuvio' : 'simkl')
  const [activeStatus, setActiveStatus] = useState<SimklStatus | 'all'>('watching')
  const [activeType, setActiveType] = useState('shows')
  const [items, setItems] = useState<MetaPreview[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch Nuvio Collections
  useEffect(() => {
    if (!nuvioLoggedIn || !nuvioAccessToken || source !== 'nuvio') return

    const fetchNuvioCollections = async () => {
      setLoading(true)
      try {
        const collections = await pullCollectionsFromNuvio(nuvioAccessToken)

        const allItems: MetaPreview[] = []
        collections.forEach((col: any) => {
          if (Array.isArray(col.items)) {
            col.items.forEach((item: any) => {
              allItems.push({
                id: item.id || item.imdb || item.content_id,
                type: item.type || item.content_type || 'movie',
                name: item.name || item.title || 'Untitled',
                poster: item.poster || item.poster_path,
                year: item.year,
              })
            })
          }
        })
        setItems(allItems)
      } catch (err) {
        console.error('Failed to pull Nuvio collections:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchNuvioCollections()
  }, [nuvioLoggedIn, nuvioAccessToken, source])

  // Fetch Simkl Library
  useEffect(() => {
    if (!simklConnected || source !== 'simkl') return

    const fetchLibrary = async () => {
      setLoading(true)
      try {
        const { getAllItems } = await import('../api/simkl')
        const data = await getAllItems(
          simklClientId,
          simklAccessToken!,
          activeType,
          undefined
        )

        const mapped: MetaPreview[] = (data || [])
          .filter((item: any) => {
            if (activeStatus === 'all') return true
            return item.status === activeStatus
          })
          .map((item: any) => ({
            id: item.show?.ids?.imdb || item.movie?.ids?.imdb || `simkl-${item.show?.ids?.simkl || item.movie?.ids?.simkl}`,
            type: activeType === 'movies' ? 'movie' : 'series',
            name: item.show?.title || item.movie?.title || 'Unknown',
            poster: item.show?.poster ? `https://simkl.in/posters/${item.show.poster}_m.webp` : 
                    item.movie?.poster ? `https://simkl.in/posters/${item.movie.poster}_m.webp` : undefined,
            year: item.show?.year || item.movie?.year,
          }))

        setItems(mapped)
      } catch (err) {
        console.error('Failed to fetch Simkl library:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchLibrary()
  }, [simklConnected, simklAccessToken, simklClientId, activeStatus, activeType, source])

  if (!simklConnected && !nuvioLoggedIn) {
    return (
      <div className="page library-page">
        <div className="empty-state">
          <BarChart2 size={48} aria-hidden="true" style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h2>Connect Nuvio or Simkl to view your library</h2>
          <p>Sync your collection cards and track progress across all devices</p>
          <button className="btn-primary" onClick={() => navigate('/settings')}>
            Go to Settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page library-page">
      <h1 className="page-title">My Library</h1>

      {/* Source Toggle */}
      <div className="library-type-tabs" style={{ marginBottom: '1.5rem' }}>
        {nuvioLoggedIn && (
          <button
            className={`tab-btn ${source === 'nuvio' ? 'tab-active' : ''}`}
            onClick={() => setSource('nuvio')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Zap size={16} aria-hidden="true" /> Nuvio Saved Collections
          </button>
        )}
        {simklConnected && (
          <button
            className={`tab-btn ${source === 'simkl' ? 'tab-active' : ''}`}
            onClick={() => setSource('simkl')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <BarChart2 size={16} aria-hidden="true" /> Simkl History
          </button>
        )}
      </div>

      {source === 'simkl' && (
        <>
          <div className="library-type-tabs">
            {TYPE_TABS.map(tab => (
              <button
                key={tab.key}
                className={`tab-btn ${activeType === tab.key ? 'tab-active' : ''}`}
                onClick={() => setActiveType(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="library-status-tabs">
            {STATUS_TABS.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  className={`tab-btn tab-btn-small ${activeStatus === tab.key ? 'tab-active' : ''}`}
                  onClick={() => setActiveStatus(tab.key)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Icon size={14} aria-hidden="true" /> {tab.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {loading && (
        <div className="media-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="media-card skeleton" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="empty-state">
          <Inbox size={48} aria-hidden="true" style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3>Nothing here yet</h3>
          <p>Start saving cards or watching titles to build your library</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="media-grid">
          {items.map(item => (
            <MediaCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
