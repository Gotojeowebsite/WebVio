import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAddonStore } from '../store/addon-store'
import { AddonClient, Meta, Video } from '../api/addon-client'
import StreamPicker from '../components/detail/StreamPicker'
import './detail.css'

export default function Detail() {
  const { type, id } = useParams<{ type: string; id: string }>()
  const navigate = useNavigate()
  const { addons } = useAddonStore()
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [streamPickerOpen, setStreamPickerOpen] = useState(false)
  const [selectedVideoId, setSelectedVideoId] = useState<string>('')
  const [selectedSeason, setSelectedSeason] = useState<number>(1)

  useEffect(() => {
    if (!type || !id) return
    setLoading(true)

    const fetchMeta = async () => {
      const enabledAddons = addons.filter(a => a.enabled)

      for (const addon of enabledAddons) {
        try {
          const client = new AddonClient(addon.manifestUrl)
          client.manifest = addon.manifest
          if (!client.supportsResource('meta')) continue

          const result = await client.getMeta(type, id)
          if (result.meta) {
            setMeta(result.meta)
            setLoading(false)
            return
          }
        } catch {
          continue
        }
      }
      setLoading(false)
    }

    fetchMeta()
  }, [type, id, addons])

  const handlePlay = (videoId?: string) => {
    if (!meta || !type) return
    setSelectedVideoId(videoId || meta.id)
    setStreamPickerOpen(true)
  }

  // Get seasons from videos
  const seasons = meta?.videos
    ? [...new Set(meta.videos.filter(v => v.season !== undefined).map(v => v.season!))]
        .sort((a, b) => a - b)
    : []

  const episodesInSeason = meta?.videos?.filter(v => v.season === selectedSeason) || []

  if (loading) {
    return (
      <div className="detail-page">
        <div className="detail-loading">
          <div className="loading-spinner" />
          <p>Loading...</p>
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
      {/* Hero */}
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
            {type === 'movie' && (
              <button className="btn btn-primary btn-lg" onClick={() => handlePlay()}>
                ▶ Play
              </button>
            )}
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

        {/* Seasons & Episodes */}
        {type === 'series' && seasons.length > 0 && (
          <div className="detail-section">
            <h3>Episodes</h3>

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

            <div className="episode-list">
              {episodesInSeason
                .sort((a, b) => (a.episode || 0) - (b.episode || 0))
                .map(ep => (
                <div key={ep.id} className="episode-item" onClick={() => handlePlay(ep.id)}>
                  <div className="episode-number">
                    E{ep.episode}
                  </div>
                  <div className="episode-info">
                    <h4 className="episode-title">{ep.title || `Episode ${ep.episode}`}</h4>
                    {ep.overview && <p className="episode-overview">{ep.overview.substring(0, 120)}...</p>}
                    {ep.released && (
                      <span className="episode-date">
                        {new Date(ep.released).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <button className="btn btn-primary btn-icon episode-play">▶</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* For movies with no season/episode structure */}
        {type === 'series' && seasons.length === 0 && meta.videos && meta.videos.length > 0 && (
          <div className="detail-section">
            <h3>Episodes</h3>
            <div className="episode-list">
              {meta.videos.map(v => (
                <div key={v.id} className="episode-item" onClick={() => handlePlay(v.id)}>
                  <div className="episode-info">
                    <h4 className="episode-title">{v.title}</h4>
                  </div>
                  <button className="btn btn-primary btn-icon episode-play">▶</button>
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
