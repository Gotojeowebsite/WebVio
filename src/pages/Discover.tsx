import { useState, useEffect, useCallback } from 'react'
import { Film, Tv, Sparkles, Compass } from 'lucide-react'
import { AddonClient, MetaPreview } from '../api/addon-client'
import MediaCard from '../components/catalog/MediaCard'
import './discover.css'

const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json'
const ANIME_KITSU_URL = 'https://anime-kitsu.strem.fun/manifest.json'

const GENRES = [
  'All',
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
]

export default function Discover() {
  const [selectedType, setSelectedType] = useState<'movie' | 'series' | 'anime'>('movie')
  const [selectedGenre, setSelectedGenre] = useState<string>('All')
  const [items, setItems] = useState<MetaPreview[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDiscoverCatalog = useCallback(async () => {
    setLoading(true)
    try {
      if (selectedType === 'anime') {
        const client = new AddonClient(ANIME_KITSU_URL)
        const extra: Record<string, string> = {}
        if (selectedGenre !== 'All') {
          extra.genre = selectedGenre
        }
        const res = await client.getCatalog('anime', 'kitsu-anime-list', Object.keys(extra).length ? extra : undefined)
        setItems(res.metas || [])
      } else {
        const client = new AddonClient(CINEMETA_URL)
        const extra: Record<string, string> = {}
        if (selectedGenre !== 'All') {
          extra.genre = selectedGenre
        }
        const res = await client.getCatalog(selectedType, 'top', Object.keys(extra).length ? extra : undefined)
        setItems(res.metas || [])
      }
    } catch (err) {
      console.warn('[Discover] Failed to fetch catalog:', err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [selectedType, selectedGenre])

  useEffect(() => {
    fetchDiscoverCatalog()
  }, [fetchDiscoverCatalog])

  return (
    <div className="discover-page">
      <header className="discover-header">
        <div className="discover-title-row">
          <h1 className="discover-title">Discover</h1>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            background: 'rgba(168, 85, 247, 0.15)',
            border: '1px solid rgba(168, 85, 247, 0.4)',
            borderRadius: '20px',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#d8b4fe'
          }}>
            <Compass size={14} aria-hidden="true" /> Explore
          </span>
        </div>
        <p className="discover-subtitle">
          Explore top-rated movies, trending series, and popular anime across all Stremio scrapers.
        </p>
      </header>

      <div className="discover-filters">
        <div className="type-tabs">
          <button
            className={`type-tab-btn ${selectedType === 'movie' ? 'active' : ''}`}
            onClick={() => setSelectedType('movie')}
          >
            <Film size={16} aria-hidden="true" /> Movies
          </button>
          <button
            className={`type-tab-btn ${selectedType === 'series' ? 'active' : ''}`}
            onClick={() => setSelectedType('series')}
          >
            <Tv size={16} aria-hidden="true" /> TV Shows
          </button>
          <button
            className={`type-tab-btn ${selectedType === 'anime' ? 'active' : ''}`}
            onClick={() => setSelectedType('anime')}
          >
            <Sparkles size={16} aria-hidden="true" /> Anime
          </button>
        </div>

        <div className="genre-chips-scroll">
          {GENRES.map((genre) => (
            <button
              key={genre}
              className={`genre-chip ${selectedGenre === genre ? 'active' : ''}`}
              onClick={() => setSelectedGenre(genre)}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="discover-loader">
          <div className="animate-spin" style={{ width: 36, height: 36, border: '3px solid rgba(168, 85, 247, 0.3)', borderTopColor: '#a855f7', borderRadius: '50%' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="discover-empty">
          <p>No media found for the selected filter.</p>
        </div>
      ) : (
        <div className="discover-grid" role="list">
          {items.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
