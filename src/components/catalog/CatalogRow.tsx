import { useRef, useState, useEffect } from 'react'
import { MetaPreview } from '../../api/addon-client'
import MediaCard from './MediaCard'

interface Props {
  title: string
  items: MetaPreview[]
  loading?: boolean
}

export default function CatalogRow({ title, items, loading }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const scrollLeftRef = useRef(0)
  const hasMovedRef = useRef(false)

  const checkScrollBounds = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 10)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10)
  }

  useEffect(() => {
    checkScrollBounds()
    const el = scrollRef.current
    if (!el) return

    el.addEventListener('scroll', checkScrollBounds, { passive: true })
    window.addEventListener('resize', checkScrollBounds)

    return () => {
      el.removeEventListener('scroll', checkScrollBounds)
      window.removeEventListener('resize', checkScrollBounds)
    }
  }, [items, loading])

  // Mouse wheel listener for smooth horizontal scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return
    // If scrolling vertically with mouse wheel, translate to horizontal scroll
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && Math.abs(e.deltaY) > 4) {
      const isAtLeft = scrollRef.current.scrollLeft <= 0 && e.deltaY < 0
      const isAtRight =
        scrollRef.current.scrollLeft + scrollRef.current.clientWidth >=
          scrollRef.current.scrollWidth - 2 && e.deltaY > 0

      // Only prevent default if we can scroll within this container
      if (!isAtLeft && !isAtRight) {
        scrollRef.current.scrollLeft += e.deltaY * 1.5
      }
    }
  }

  // Mouse drag-to-scroll handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return
    setIsDragging(true)
    hasMovedRef.current = false
    startXRef.current = e.pageX - scrollRef.current.offsetLeft
    scrollLeftRef.current = scrollRef.current.scrollLeft
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !scrollRef.current) return
    e.preventDefault()
    const x = e.pageX - scrollRef.current.offsetLeft
    const walk = (x - startXRef.current) * 1.4
    if (Math.abs(walk) > 5) {
      hasMovedRef.current = true
    }
    scrollRef.current.scrollLeft = scrollLeftRef.current - walk
  }

  const handleMouseUpOrLeave = () => {
    setIsDragging(false)
  }

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    })
  }

  if (!loading && items.length === 0) return null

  return (
    <div className="catalog-row" style={{ position: 'relative' }}>
      <div className="catalog-header">
        <h3 className="catalog-title">{title}</h3>
        <div className="catalog-arrows">
          <button
            type="button"
            className="btn-ghost btn-icon catalog-arrow"
            onClick={() => scroll('left')}
            disabled={!canScrollLeft && !loading}
            style={{ opacity: canScrollLeft || loading ? 1 : 0.35 }}
            title="Scroll left"
          >
            ◀
          </button>
          <button
            type="button"
            className="btn-ghost btn-icon catalog-arrow"
            onClick={() => scroll('right')}
            disabled={!canScrollRight && !loading}
            style={{ opacity: canScrollRight || loading ? 1 : 0.35 }}
            title="Scroll right"
          >
            ▶
          </button>
        </div>
      </div>

      <div className="catalog-scroll-wrapper" style={{ position: 'relative' }}>
        {/* Floating Left Scroll Chevron */}
        {canScrollLeft && (
          <button
            type="button"
            className="catalog-floating-arrow catalog-floating-left"
            onClick={() => scroll('left')}
            title="Scroll left"
          >
            ‹
          </button>
        )}

        <div
          className={`catalog-scroll-container ${isDragging ? 'dragging' : ''}`}
          ref={scrollRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: isDragging ? 'none' : 'auto',
          }}
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="media-card skeleton" />
              ))
            : items.map((item) => (
                <div
                  key={item.id}
                  onClickCapture={(e) => {
                    // Prevent accidental navigation if the user was dragging
                    if (hasMovedRef.current) {
                      e.stopPropagation()
                    }
                  }}
                >
                  <MediaCard item={item} />
                </div>
              ))}
        </div>

        {/* Floating Right Scroll Chevron */}
        {canScrollRight && (
          <button
            type="button"
            className="catalog-floating-arrow catalog-floating-right"
            onClick={() => scroll('right')}
            title="Scroll right"
          >
            ›
          </button>
        )}
      </div>
    </div>
  )
}
