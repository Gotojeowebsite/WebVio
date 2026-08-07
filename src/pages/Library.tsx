import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/auth-store'
import { useNavigate } from 'react-router-dom'
import MediaCard from '../components/catalog/MediaCard'
import { MetaPreview } from '../api/addon-client'

type SimklStatus = 'watching' | 'plantowatch' | 'completed' | 'hold' | 'dropped'

const STATUS_TABS: { key: SimklStatus | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '📚' },
  { key: 'watching', label: 'Watching', icon: '▶️' },
  { key: 'plantowatch', label: 'Plan to Watch', icon: '📋' },
  { key: 'completed', label: 'Completed', icon: '✅' },
  { key: 'hold', label: 'On Hold', icon: '⏸️' },
  { key: 'dropped', label: 'Dropped', icon: '❌' },
]

const TYPE_TABS = [
  { key: 'shows', label: 'TV Shows' },
  { key: 'movies', label: 'Movies' },
  { key: 'anime', label: 'Anime' },
]

export default function Library() {
  const { simklConnected, simklAccessToken, simklClientId } = useAuthStore()
  const navigate = useNavigate()
  const [activeStatus, setActiveStatus] = useState<SimklStatus | 'all'>('watching')
  const [activeType, setActiveType] = useState('shows')
  const [items, setItems] = useState<MetaPreview[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!simklConnected) return

    const fetchLibrary = async () => {
      setLoading(true)
      try {
        const { getAllItems } = await import('../api/simkl')
        const statusParam = activeStatus === 'all' ? undefined : activeStatus
        const data = await getAllItems(
          simklClientId,
          simklAccessToken!,
          activeType,
          undefined
        )

        // Convert Simkl items to MetaPreview format
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
  }, [simklConnected, simklAccessToken, simklClientId, activeStatus, activeType])

  if (!simklConnected) {
    return (
      <div className="page library-page">
        <div className="empty-state">
          <p className="empty-state-icon">📊</p>
          <h2>Connect Simkl to view your library</h2>
          <p>Track your movies and shows across all your devices</p>
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
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            className={`tab-btn tab-btn-small ${activeStatus === tab.key ? 'tab-active' : ''}`}
            onClick={() => setActiveStatus(tab.key)}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="media-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="media-card skeleton" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-icon">📭</p>
          <h3>Nothing here yet</h3>
          <p>Start watching something to build your library</p>
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
