import { useRef } from 'react'
import { MetaPreview } from '../../api/addon-client'
import MediaCard from './MediaCard'

interface Props {
  title: string
  items: MetaPreview[]
  loading?: boolean
}

export default function CatalogRow({ title, items, loading }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  if (!loading && items.length === 0) return null

  return (
    <div className="catalog-row">
      <div className="catalog-header">
        <h3 className="catalog-title">{title}</h3>
        <div className="catalog-arrows">
          <button className="btn-ghost btn-icon catalog-arrow" onClick={() => scroll('left')}>◀</button>
          <button className="btn-ghost btn-icon catalog-arrow" onClick={() => scroll('right')}>▶</button>
        </div>
      </div>
      <div className="catalog-scroll-container" ref={scrollRef}>
        {loading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="media-card skeleton" />
            ))
          : items.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))
        }
      </div>
    </div>
  )
}
