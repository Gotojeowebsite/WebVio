import { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { MetaPreview } from '../../api/addon-client'
import MediaCard from './MediaCard'

interface Props {
  title: string
  items: (MetaPreview & { video?: any; progressPercent?: number })[]
  loading?: boolean
}

export default function CatalogRow({ title, items, loading }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const isMouseDownRef = useRef(false)
  const startXRef = useRef(0)
  const scrollLeftRef = useRef(0)
  const hasMovedRef = useRef(false)

  const checkScrollBounds = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 10)
    setCanScrollRight(scrollWidth > clientWidth + 20 ? scrollLeft + clientWidth < scrollWidth - 15 : items.length > 4)
  }, [items.length])

  // Setup scroll bounds listeners, ResizeObserver, and periodic checks
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    checkScrollBounds()

    el.addEventListener('scroll', checkScrollBounds, { passive: true })
    window.addEventListener('resize', checkScrollBounds)

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        checkScrollBounds()
      })
      observer.observe(el)
    }

    const t1 = setTimeout(checkScrollBounds, 50)
    const t2 = setTimeout(checkScrollBounds, 250)
    const t3 = setTimeout(checkScrollBounds, 750)
    const t4 = setTimeout(checkScrollBounds, 1500)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      el.removeEventListener('scroll', checkScrollBounds)
      window.removeEventListener('resize', checkScrollBounds)
      if (observer) observer.disconnect()
    }
  }, [items, loading, checkScrollBounds])

  // Global mousemove and mouseup listeners for uninterrupted drag-to-scroll
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isMouseDownRef.current || !scrollRef.current) return
      const x = e.pageX - scrollRef.current.offsetLeft
      const walk = (x - startXRef.current) * 1.5

      // Only enter dragging mode if the cursor actually moved more than 6px
      if (Math.abs(walk) > 6) {
        hasMovedRef.current = true
        setIsDragging(true)
        e.preventDefault()
        scrollRef.current.scrollLeft = scrollLeftRef.current - walk
        checkScrollBounds()
      }
    }

    const handleGlobalMouseUp = () => {
      isMouseDownRef.current = false
      setIsDragging(false)
      // Reset move threshold after a tiny delay so click fires cleanly
      setTimeout(() => {
        hasMovedRef.current = false
      }, 50)
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [checkScrollBounds])

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return
    isMouseDownRef.current = true
    hasMovedRef.current = false
    startXRef.current = e.pageX - scrollRef.current.offsetLeft
    scrollLeftRef.current = scrollRef.current.scrollLeft
  }

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = Math.max(320, scrollRef.current.clientWidth * 0.75)
    scrollRef.current.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    })
    setTimeout(checkScrollBounds, 350)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      scroll('left')
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      scroll('right')
    }
  }

  if (!loading && items.length === 0) {
    return (
      <div className="catalog-row">
        <div className="catalog-header">
          <h3 className="catalog-title">
            <span className="catalog-title-accent"></span>
            {title}
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 24px', color: 'var(--text-muted)' }}>
          <Inbox size={20} aria-hidden="true" />
          <span>No results from this catalog</span>
        </div>
      </div>
    )
  }

  return (
    <div className="catalog-row">
      <div className="catalog-header">
        <h3 className="catalog-title">
          <span className="catalog-title-accent"></span>
          {title}
        </h3>
        <div className="catalog-arrows">
          <button
            type="button"
            className="btn-ghost btn-icon catalog-arrow"
            onClick={() => scroll('left')}
            style={{ opacity: canScrollLeft ? 1 : 0.4 }}
            aria-label="Scroll left"
            title="Scroll left"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn-ghost btn-icon catalog-arrow"
            onClick={() => scroll('right')}
            style={{ opacity: canScrollRight ? 1 : 0.4 }}
            aria-label="Scroll right"
            title="Scroll right"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="catalog-scroll-wrapper">
        {/* Floating Left Hover Chevron */}
        <button
          type="button"
          className={`catalog-floating-arrow catalog-floating-left ${canScrollLeft ? 'visible' : ''}`}
          onClick={() => scroll('left')}
          aria-label="Scroll left"
          title="Scroll left"
        >
          <ChevronLeft size={28} aria-hidden="true" />
        </button>

        <div
          className={`catalog-scroll-container ${isDragging ? 'dragging' : ''}`}
          ref={scrollRef}
          tabIndex={0}
          aria-label={`${title} carousel`}
          onKeyDown={handleKeyDown}
          onMouseDown={handleMouseDown}
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="catalog-card-item">
                  <div className="media-card skeleton" />
                </div>
              ))
            : items.map((item) => (
                <div
                  key={item.id}
                  className="catalog-card-item"
                >
                  <MediaCard item={item} />
                </div>
              ))}
        </div>

        {/* Floating Right Hover Chevron */}
        <button
          type="button"
          className={`catalog-floating-arrow catalog-floating-right ${canScrollRight ? 'visible' : ''}`}
          onClick={() => scroll('right')}
          aria-label="Scroll right"
          title="Scroll right"
        >
          <ChevronRight size={28} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
