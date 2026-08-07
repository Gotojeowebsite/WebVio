import { useNavigate } from 'react-router-dom'
import { MetaPreview } from '../../api/addon-client'

interface Props {
  item: MetaPreview
}

export default function MediaCard({ item }: Props) {
  const navigate = useNavigate()

  return (
    <div
      className="media-card"
      onClick={() => navigate(`/detail/${item.type}/${encodeURIComponent(item.id)}`)}
    >
      {item.poster ? (
        <img
          className="media-poster"
          src={item.poster}
          alt={item.name}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="media-poster-fallback">
          <span>{item.name}</span>
        </div>
      )}
      <div className="media-card-overlay">
        <p className="media-title">{item.name}</p>
        <div className="media-meta">
          {item.year && <span>{item.year}</span>}
          {item.imdbRating && <span>⭐ {item.imdbRating}</span>}
          {item.type && <span className="badge badge-small">{item.type}</span>}
        </div>
      </div>
    </div>
  )
}
