import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Film } from 'lucide-react'
import { MetaPreview } from '../../api/addon-client'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'

interface Props {
  item: MetaPreview & {
    progressPercent?: number
    video?: { id?: string; season?: number; episode?: number; title?: string } | null
  }
}

export default function MediaCard({ item }: Props) {
  const navigate = useNavigate()
  const [imgError, setImgError] = useState(false)
  
  const handleClick = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }
    const targetType = item.type || 'movie'
    const targetId = encodeURIComponent(item.id)

    // If this card is from Continue Watching or has an active episode, pass it directly in the URL
    if (item.video && (item.video.id || (item.video.season !== undefined && item.video.episode !== undefined))) {
      const epId = item.video.id || `${item.id}:${item.video.season || 1}:${item.video.episode || 1}`
      const season = item.video.season || 1
      navigate(`/detail/${targetType}/${targetId}?episode=${encodeURIComponent(epId)}&season=${season}`)
    } else {
      navigate(`/detail/${targetType}/${targetId}`)
    }
  }

  const { ref, focused } = useFocusable({
    onEnterPress: () => handleClick()
  })

  const episodeBadge = item.video?.season && item.video?.episode
    ? `S${item.video.season}:E${item.video.episode}`
    : item.video?.episode
    ? `EP ${item.video.episode}`
    : null

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={item.name}
      className={`media-card ${focused ? 'focused' : ''}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      {/* Top Episode or Type Badge */}
      {episodeBadge && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))',
            color: '#fff',
            fontSize: '0.72rem',
            fontWeight: 800,
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            zIndex: 5,
            boxShadow: 'var(--shadow-sm)',
            letterSpacing: '0.02em',
          }}
        >
          {episodeBadge}
        </div>
      )}

      {item.poster && !imgError ? (
        <img
          className="media-poster"
          src={item.poster}
          alt={item.name}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s ease', pointerEvents: 'none', background: 'var(--color-bg-elevated)' }}
        />
      ) : (
        <div className="media-poster-fallback" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', pointerEvents: 'none', background: 'var(--color-bg-elevated)' }}>
          <Film size={36} aria-hidden="true" style={{ marginBottom: '0.8rem', opacity: 0.5 }} />
          <span style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: '1.4', padding: '0 12px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            {item.name}
          </span>
        </div>
      )}

      {/* Playback Progress Fill */}
      {typeof item.progressPercent === 'number' && item.progressPercent > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'rgba(255,255,255,0.15)',
            zIndex: 6,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, item.progressPercent))}%`,
              background: 'linear-gradient(90deg, #a855f7, #f472b6)',
              boxShadow: '0 0 8px rgba(168, 85, 247, 0.8)',
            }}
          />
        </div>
      )}

      <div className="media-card-overlay">
        <p className="media-title">
          {item.name}
        </p>
        <div className="media-meta">
          {item.year && <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{item.year}</span>}
          {item.imdbRating && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 197, 24, 0.1)', color: '#f5c518', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}><span aria-hidden="true">⭐</span><span>{item.imdbRating}</span></span>}
          {item.type && <span className="badge badge-small" style={{ textTransform: 'capitalize', background: 'rgba(108, 92, 231, 0.2)', color: '#a29bfe', padding: '2px 6px', borderRadius: '4px' }}>{item.type}</span>}
        </div>
      </div>
    </div>
  )
}
