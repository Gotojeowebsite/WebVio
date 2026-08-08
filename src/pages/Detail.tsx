import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAddonStore } from '../store/addon-store'
import { AddonClient, Meta } from '../api/addon-client'
import StreamPicker from '../components/detail/StreamPicker'
import './detail.css'

export default function Detail() {
  const { type, id } = useParams<{ type: string; id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { addons, loadFromStorage } = useAddonStore()
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [streamPickerOpen, setStreamPickerOpen] = useState(false)
  const [selectedVideoId, setSelectedVideoId] = useState<string>('')
  const [selectedSeason, setSelectedSeason] = useState<number>(1)

  useEffect(() => {
    if (!type || !id) return
    setLoading(true)

    const fetchMeta = async () => {
      let currentAddons = addons
      if (currentAddons.length === 0) {
        await loadFromStorage()
        currentAddons = useAddonStore.getState().addons
      }

      const enabledAddons = currentAddons.filter(a => a.enabled)
      const providersToTry = [
        ...enabledAddons.map(a => ({ url: a.manifestUrl, manifest: a.manifest })),
        { url: 'https://v3-cinemeta.strem.io/manifest.json', manifest: null },
        { url: 'https://anime-kitsu.strem.fun/manifest.json', manifest: null },
      ]

      const typesToTry = [type, 'series', 'movie', 'anime', 'tv'].filter(Boolean) as string[]

      for (const provider of providersToTry) {
        try {
          const client = new AddonClient(provider.url)
          if (provider.manifest) {
            client.manifest = provider.manifest
          }

          for (const tryType of typesToTry) {
            try {
              const result = await client.getMeta(tryType, id)
              if (result && result.meta) {
                setMeta(result.meta)
                setLoading(false)

                // Check if an initial video was requested or default to first episode
                const epParam = searchParams.get('episode')
                if (epParam) {
                  setSelectedVideoId(epParam)
                  setStreamPickerOpen(true)
                }
                return
              }
            } catch {
              // Try next type
            }
          }
        } catch {
          continue
        }
      }
      setLoading(false)
    }

    fetchMeta()
  }, [type, id, addons, loadFromStorage, searchParams])

  const handlePlay = (videoId?: string) => {
    if (!meta || !type) return
    const targetVideoId = videoId || (meta.videos && meta.videos.length > 0 ? meta.videos[0].id : meta.id)
    setSelectedVideoId(targetVideoId)
    setStreamPickerOpen(true)
  }

  // Get seasons from videos
  const seasons = meta?.videos
    ? [...new Set(meta.videos.filter(v => v.season !== undefined && v.season > 0).map(v => v.season!))].sort((a, b) => a - b)
    : []

  const episodesInSeason = meta?.videos
    ? seasons.length > 0
      ? meta.videos.filter(v => v.season === selectedSeason)
      : meta.videos
    : []

  const isShow = type === 'series' || type === 'anime' || type === 'tv' || (meta?.videos && meta.videos.length > 0)

  if (loading) {
    return (
      <div className="detail-page">
        <div className="detail-loading">
          <div className="loading-spinner" />
          <p>Loading metadata & streams...</p>
        </div>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="detail-page">
        <div className="empty-state">
          <p className="empty-state-icon">😔</p>
          <h3>Content not found</h3>
          <button className="btn btn-primary" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="detail-page">
      {/* Hero Header */}
      <div className="detail-hero" style={{
        backgroundImage: meta.background ? `url(${meta.background})` : meta.poster ? `url(${meta.poster})` : 'none'
      }}>
        <div className="hero-gradient" />
        <div className="detail-hero-content">
          {meta.logo ? (
            <img src={meta.logo} alt={meta.name} className="detail-logo" />
          ) : (
            <h1 className="hero-title">{meta.name}</h1>
          )}

          <div className="detail-info">
            {meta.year && <span>{meta.year}</span>}
            {meta.runtime && <span>{meta.runtime}</span>}
            {meta.imdbRating && <span>⭐ {meta.imdbRating}</span>}
            {meta.genres?.slice(0, 4).map(g => (
              <span key={g} className="badge">{g}</span>
            ))}
          </div>

          {meta.description && (
            <p className="detail-description">{meta.description}</p>
          )}

          <div className="detail-actions">
            <button className="btn btn-primary btn-lg" onClick={() => handlePlay()}>
              ▶ {isShow ? (episodesInSeason.length > 0 ? `Play S${selectedSeason}E1` : 'Play Episodes') : 'Play Movie'}
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => navigate(-1)}>
              ← Back
            </button>
          </div>
        </div>
      </div>

      <div className="detail-body">
        {/* Cast */}
        {meta.cast && meta.cast.length > 0 && (
          <div className="detail-section">
            <h3>Cast</h3>
            <div className="detail-cast">
              {meta.cast.slice(0, 10).map(actor => (
                <span key={actor} className="detail-cast-item">{actor}</span>
              ))}
            </div>
          </div>
        )}

        {/* Seasons & Episodes Section for Series & Anime */}
        {isShow && (
          <div className="detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Episodes ({meta.videos?.length || 0})</h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-accent-primary, #a855f7)', fontWeight: 600 }}>
                ⚡ Click any episode to open stream list
              </span>
            </div>

            {seasons.length > 1 && (
              <div className="season-tabs">
                {seasons.map(s => (
                  <button
                    key={s}
                    className={`tab-btn ${selectedSeason === s ? 'tab-active' : ''}`}
                    onClick={() => setSelectedSeason(s)}
                  >
                    Season {s}
                  </button>
                ))}
              </div>
            )}

            <div className="episode-list">
              {episodesInSeason
                .sort((a, b) => (a.episode || 0) - (b.episode || 0))
                .map((ep, idx) => (
                <div
                  key={ep.id || idx}
                  className="episode-item"
                  onClick={() => handlePlay(ep.id)}
                  style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                >
                  <div className="episode-number">
                    {ep.season && ep.episode ? `S${ep.season} E${ep.episode}` : `E${ep.episode || idx + 1}`}
                  </div>
                  <div className="episode-info">
                    <h4 className="episode-title">{ep.title || `Episode ${ep.episode || idx + 1}`}</h4>
                    {ep.overview && <p className="episode-overview">{ep.overview.substring(0, 140)}...</p>}
                    {ep.released && (
                      <span className="episode-date">
                        {new Date(ep.released).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-icon episode-play"
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePlay(ep.id)
                    }}
                    title="Choose stream & play"
                  >
                    ▶
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stream Picker Modal */}
      {streamPickerOpen && meta && type && (
        <StreamPicker
          isOpen={streamPickerOpen}
          onClose={() => setStreamPickerOpen(false)}
          type={type}
          videoId={selectedVideoId}
          meta={meta}
        />
      )}
    </div>
  )
}
