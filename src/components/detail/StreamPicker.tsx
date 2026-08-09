import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Link,
  Zap,
  Magnet,
  Globe,
  Users,
  X,
  Inbox,
  Search,
  Play,
  Star,
  ArrowUpDown,
  Sparkles,
  Tv,
  Film,
  AlertCircle,
  Download,
  CheckCircle2,
  Loader2
} from 'lucide-react'
import { Meta, Stream, AddonClient } from '../../api/addon-client'
import { useAddonStore } from '../../store/addon-store'
import { useAuthStore } from '../../store/auth-store'
import { usePlayerStore, EnrichedStream } from '../../store/player-store'
import { useDownloadStore } from '../../store/download-store'
import { parseStreamInfo, resolveStreamUrl, batchCheckCached } from '../../utils/stream-resolver'
import './stream-picker.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  type: string
  videoId: string
  meta: Meta
}

type FilterTab = 'all' | '4k' | '1080p' | '720p' | 'sd' | 'cached' | 'direct'
type SortOption = 'best' | 'quality' | 'size' | 'seeders'

// Default high-performance stream providers
const DEFAULT_STREAM_PROVIDERS = [
  'https://torrentio.strem.fun/manifest.json',
  'https://mediafusion.elfhosted.com/manifest.json',
]

const QUALITY_ORDER: Record<string, number> = {
  '4K': 4,
  '1080p': 3,
  '720p': 2,
  '480p': 1,
  'SD': 1,
}

export default function StreamPicker({ isOpen, onClose, type, videoId, meta }: Props) {
  const navigate = useNavigate()
  const modalRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { addons } = useAddonStore()
  const { torboxApiKey, torboxConnected } = useAuthStore()
  const { setStream, setMeta, setVideo } = usePlayerStore()
  const { addDownload } = useDownloadStore()
  const [downloadSuccess, setDownloadSuccess] = useState('')
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)

  const [streams, setStreams] = useState<EnrichedStream[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('best')

  // Focus trap & Escape key listener
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusableElements.length === 0) return
        const first = focusableElements[0]
        const last = focusableElements[focusableElements.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Auto-focus search bar when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setFilter('all')
      setSortBy('best')
      setDownloadSuccess('')
      setDownloadingKey(null)
    }
  }, [isOpen])

  const fetchStreams = useCallback(async () => {
    setLoading(true)
    setStreams([])
    setError('')

    const allStreams: EnrichedStream[] = []
    const enabledAddons = addons.filter(a => a.enabled)

    // Combine user-installed addons with stream providers
    const targetAddons = Array.from(
      new Set([
        ...enabledAddons.map(a => a.manifestUrl),
        ...DEFAULT_STREAM_PROVIDERS,
      ])
    )

    const normalizedTypes = [type, 'series', 'movie', 'anime', 'tv'].filter(Boolean) as string[]

    // Fetch streams from all addons in parallel with 5s timeout
    const fetchWithTimeout = async (promise: Promise<any>, ms = 5000) => {
      let timer: any
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms)
      })
      try {
        const res = await Promise.race([promise, timeout])
        clearTimeout(timer)
        return res
      } catch {
        clearTimeout(timer)
        return null
      }
    }

    const results = await Promise.allSettled(
      targetAddons.map(async (url) => {
        try {
          const client = new AddonClient(url)
          const installed = enabledAddons.find(a => a.manifestUrl === url)
          let manifest = installed?.manifest

          if (!manifest) {
            try {
              manifest = await client.loadManifest()
            } catch {
              // Ignore
            }
          } else {
            client.manifest = manifest
          }

          const addonName = manifest?.name || (url.includes('torrentio') ? 'Torrentio' : url.includes('mediafusion') ? 'MediaFusion' : 'Stream Provider')
          const addonId = manifest?.id || url

          // Try primary type, then fallback
          for (const tryType of normalizedTypes) {
            try {
              const res = await fetchWithTimeout(client.getStreams(tryType, videoId))
              if (res && Array.isArray(res.streams) && res.streams.length > 0) {
                return res.streams.map((s: Stream) => {
                  const info = parseStreamInfo(s)
                  return {
                    ...s,
                    addonName,
                    addonId,
                    quality: info.quality || undefined,
                    source: info.source || undefined,
                    codec: info.codec || undefined,
                    audio: info.audio || undefined,
                    size: info.size || undefined,
                    sizeBytes: info.sizeBytes || undefined,
                    bitrate: info.bitrate || undefined,
                    releaseGroup: info.releaseGroup || undefined,
                    cleanTitle: info.cleanTitle,
                    starRating: info.starRating,
                    health: info.health,
                    hdr: info.hdr,
                    seeders: info.seeders,
                    isCached: undefined,
                  } as EnrichedStream
                })
              }
            } catch {
              // Try next type
            }
          }
          return []
        } catch {
          return []
        }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        allStreams.push(...result.value)
      }
    }

    // Check TorBox cache for torrent streams
    if (torboxConnected && torboxApiKey) {
      const hashes = allStreams
        .filter(s => s.infoHash)
        .map(s => s.infoHash!)

      if (hashes.length > 0) {
        try {
          const cached = await batchCheckCached(hashes, torboxApiKey)
          for (const stream of allStreams) {
            if (stream.infoHash) {
              const isCached = cached[stream.infoHash.toLowerCase()] || false
              stream.isCached = isCached
              if (isCached) {
                stream.health = 'healthy'
                stream.starRating = Math.min(5.0, (stream.starRating || 3.5) + 0.4)
              }
            }
          }
        } catch {
          // Ignore cache check error
        }
      }
    }

    // Deduplicate streams by infoHash / URL
    const seen = new Set<string>()
    const uniqueStreams: EnrichedStream[] = []
    for (const s of allStreams) {
      const key = s.infoHash ? s.infoHash.toLowerCase() : s.url ? s.url : s.title || JSON.stringify(s)
      if (!seen.has(key)) {
        seen.add(key)
        uniqueStreams.push(s)
      }
    }

    setStreams(uniqueStreams)
    setLoading(false)
  }, [addons, type, videoId, torboxApiKey, torboxConnected])

  useEffect(() => {
    if (isOpen) {
      fetchStreams()
    }
  }, [isOpen, fetchStreams])

  const handleStreamSelect = async (stream: EnrichedStream) => {
    if (stream.externalUrl) {
      window.open(stream.externalUrl, '_blank')
      return
    }

    const streamKey = stream.infoHash || stream.url || 'resolving'
    setResolving(streamKey)
    setError('')

    try {
      const url = await resolveStreamUrl(stream, torboxApiKey || undefined)

      if (!url) {
        if (stream.infoHash && !torboxConnected) {
          setError('Connect your TorBox account in Settings to stream torrents instantly, or select a Direct stream.')
        } else {
          setError('Could not resolve stream URL. Please try another stream provider.')
        }
        setResolving(null)
        return
      }

      // Find or construct the exact Video / Episode metadata
      const matchingVideo = meta.videos?.find(v => v.id === videoId) || (
        videoId.includes(':') ? {
          id: videoId,
          title: `Episode ${videoId.split(':')[2] || videoId}`,
          season: Number(videoId.split(':')[1]) || 1,
          episode: Number(videoId.split(':')[2]) || 1,
        } : null
      )

      setMeta(meta)
      setVideo(matchingVideo)

      const episodeLabel = matchingVideo?.season && matchingVideo?.episode
        ? `S${matchingVideo.season}E${matchingVideo.episode}`
        : matchingVideo?.episode
        ? `Episode ${matchingVideo.episode}`
        : ''

      setStream({
        url,
        title: `${meta.name}${episodeLabel ? ` • ${episodeLabel}` : ''}`,
        quality: stream.quality,
        source: stream.addonName,
      })

      onClose()
      navigate('/player')
    } catch (err: any) {
      setError(err.message || 'Failed to resolve stream')
    } finally {
      setResolving(null)
    }
  }

  const handleDownloadStream = async (e: React.MouseEvent, stream: EnrichedStream) => {
    e.stopPropagation()
    const streamKey = stream.infoHash || stream.url || `stream-dl`
    setDownloadingKey(streamKey)
    setError('')

    try {
      const url = await resolveStreamUrl(stream, torboxApiKey || undefined)
      if (!url) {
        if (stream.infoHash && !torboxConnected) {
          setError('Connect TorBox in Settings to download torrent streams, or select a direct stream.')
        } else {
          setError('Could not resolve stream download link. Please try another stream.')
        }
        setDownloadingKey(null)
        return
      }

      const matchingVideo = meta.videos?.find((v) => v.id === videoId) || (
        videoId.includes(':') ? {
          id: videoId,
          title: `Episode ${videoId.split(':')[2] || videoId}`,
          season: Number(videoId.split(':')[1]) || 1,
          episode: Number(videoId.split(':')[2]) || 1,
        } : null
      )

      addDownload({ ...stream, url }, meta, matchingVideo)
      const label = matchingVideo?.season && matchingVideo?.episode
        ? `${meta.name} S${matchingVideo.season}E${matchingVideo.episode}`
        : meta.name
      setDownloadSuccess(`Added "${label}" to Download Manager`)
      setTimeout(() => setDownloadSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message || 'Failed to start download')
    } finally {
      setDownloadingKey(null)
    }
  }

  // Count metrics for tabs
  const count4K = useMemo(() => streams.filter(s => s.quality === '4K').length, [streams])
  const count1080p = useMemo(() => streams.filter(s => s.quality === '1080p').length, [streams])
  const count720p = useMemo(() => streams.filter(s => s.quality === '720p').length, [streams])
  const countSD = useMemo(() => streams.filter(s => s.quality === '480p' || s.quality === 'SD').length, [streams])
  const countCached = useMemo(() => streams.filter(s => s.isCached === true).length, [streams])
  const countDirect = useMemo(() => streams.filter(s => !!s.url).length, [streams])

  // Filtered & Sorted Stream Pipeline
  const filteredStreams = useMemo(() => {
    return streams.filter(s => {
      // 1. Category Tab Filter
      if (filter === '4k' && s.quality !== '4K') return false
      if (filter === '1080p' && s.quality !== '1080p') return false
      if (filter === '720p' && s.quality !== '720p') return false
      if (filter === 'sd' && s.quality !== '480p' && s.quality !== 'SD') return false
      if (filter === 'cached' && s.isCached !== true) return false
      if (filter === 'direct' && !s.url) return false

      // 2. Search Query Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const searchable = [
          s.cleanTitle,
          s.title,
          s.name,
          s.addonName,
          s.quality,
          s.source,
          s.codec,
          s.audio,
          s.releaseGroup,
          s.bitrate,
          s.size,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!searchable.includes(query)) return false
      }

      return true
    }).sort((a, b) => {
      if (sortBy === 'quality') {
        const qa = QUALITY_ORDER[a.quality || ''] || 0
        const qb = QUALITY_ORDER[b.quality || ''] || 0
        if (qb !== qa) return qb - qa
        return (b.starRating || 0) - (a.starRating || 0)
      }

      if (sortBy === 'size') {
        const sizeA = a.sizeBytes || 0
        const sizeB = b.sizeBytes || 0
        if (sizeB !== sizeA) return sizeB - sizeA
        return (b.starRating || 0) - (a.starRating || 0)
      }

      if (sortBy === 'seeders') {
        const sa = a.url ? 9999 : a.isCached ? 8888 : a.seeders || 0
        const sb = b.url ? 9999 : b.isCached ? 8888 : b.seeders || 0
        return sb - sa
      }

      // Default: 'best'
      // 1. Direct URLs & Cached streams highest priority
      const scoreA = (a.url ? 200 : a.isCached ? 100 : 0) + (QUALITY_ORDER[a.quality || ''] || 0) * 10 + (a.starRating || 0) * 5
      const scoreB = (b.url ? 200 : b.isCached ? 100 : 0) + (QUALITY_ORDER[b.quality || ''] || 0) * 10 + (b.starRating || 0) * 5
      if (scoreB !== scoreA) return scoreB - scoreA

      // Fallback: seeders & size
      const seedersA = a.seeders || 0
      const seedersB = b.seeders || 0
      if (seedersB !== seedersA) return seedersB - seedersA

      return (b.sizeBytes || 0) - (a.sizeBytes || 0)
    })
  }, [streams, filter, searchQuery, sortBy])

  if (!isOpen) return null

  // Format header episode context
  const matchingVideo = meta.videos?.find(v => v.id === videoId)
  const isSeries = type === 'series' || type === 'tv' || type === 'anime' || (meta.videos && meta.videos.length > 0)
  
  let episodeHeader = ''
  let episodeSubhead = ''

  if (matchingVideo?.season && matchingVideo?.episode) {
    episodeHeader = `S${matchingVideo.season} E${matchingVideo.episode}`
    episodeSubhead = matchingVideo.title ? `${matchingVideo.title} • ${meta.name}` : meta.name
  } else if (videoId.includes(':')) {
    const parts = videoId.split(':')
    const season = parts[1] || '1'
    const episode = parts[2] || '1'
    episodeHeader = `S${season} E${episode}`
    episodeSubhead = meta.name
  } else {
    episodeHeader = meta.name
    episodeSubhead = meta.releaseInfo ? `${meta.releaseInfo} • ${meta.genres?.join(', ') || type}` : (meta.genres?.join(', ') || type)
  }

  return (
    <div className="stream-modal-overlay" onClick={onClose}>
      <div
        className="stream-picker-modal card-glass"
        ref={modalRef}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stream-picker-title"
        aria-describedby="stream-picker-context"
      >
        {/* Top Header Bar */}
        <div className="stream-modal-header">
          <div className="stream-header-left">
            <div className="stream-header-icon-box" aria-hidden="true">
              {isSeries ? <Tv size={22} className="stream-header-icon" /> : <Film size={22} className="stream-header-icon" />}
            </div>
            <div className="stream-header-text">
              <div className="stream-header-title-row">
                <h3 id="stream-picker-title" className="stream-picker-title">
                  Select a Stream
                </h3>
                <span className="stream-badge-count">
                  {filteredStreams.length} {filteredStreams.length === 1 ? 'stream' : 'streams'}
                </span>
              </div>
              <p id="stream-picker-context" className="stream-picker-subtitle">
                <span className="stream-context-tag">{episodeHeader}</span>
                <span className="stream-context-dot">•</span>
                <span className="stream-context-name">{episodeSubhead}</span>
              </p>
            </div>
          </div>

          <button
            className="stream-modal-close-btn"
            onClick={onClose}
            aria-label="Close stream selector modal"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Controls Toolbar: Search & Sort */}
        <div className="stream-controls-toolbar">
          <div className="stream-search-container">
            <Search size={16} className="stream-search-icon" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              className="stream-search-input"
              placeholder="Search streams (e.g. 4K, Atmos, Remux, FLUX)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search streams"
            />
            {searchQuery && (
              <button
                className="stream-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search query"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="stream-sort-container">
            <label htmlFor="stream-sort-select" className="stream-sort-label">
              <ArrowUpDown size={14} aria-hidden="true" />
              <span>Sort:</span>
            </label>
            <select
              id="stream-sort-select"
              className="stream-sort-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              aria-label="Sort streams by"
            >
              <option value="best">Best Match</option>
              <option value="quality">Quality (High to Low)</option>
              <option value="size">Size / Bitrate</option>
              <option value="seeders">Seeders / Speed</option>
            </select>
          </div>
        </div>

        {/* Filter Tabs Bar */}
        <div className="stream-filter-bar">
          <button
            className={`stream-filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All <span className="tab-count">{streams.length}</span>
          </button>
          <button
            className={`stream-filter-tab tab-4k ${filter === '4k' ? 'active' : ''}`}
            onClick={() => setFilter('4k')}
          >
            4K <span className="tab-count">{count4K}</span>
          </button>
          <button
            className={`stream-filter-tab tab-1080p ${filter === '1080p' ? 'active' : ''}`}
            onClick={() => setFilter('1080p')}
          >
            1080p <span className="tab-count">{count1080p}</span>
          </button>
          <button
            className={`stream-filter-tab tab-720p ${filter === '720p' ? 'active' : ''}`}
            onClick={() => setFilter('720p')}
          >
            720p <span className="tab-count">{count720p}</span>
          </button>
          {countSD > 0 && (
            <button
              className={`stream-filter-tab tab-sd ${filter === 'sd' ? 'active' : ''}`}
              onClick={() => setFilter('sd')}
            >
              SD <span className="tab-count">{countSD}</span>
            </button>
          )}
          <button
            className={`stream-filter-tab tab-cached ${filter === 'cached' ? 'active' : ''}`}
            onClick={() => setFilter('cached')}
          >
            <Zap size={13} className="tab-icon" aria-hidden="true" />
            <span>Cached</span>
            <span className="tab-count">{countCached}</span>
          </button>
          <button
            className={`stream-filter-tab tab-direct ${filter === 'direct' ? 'active' : ''}`}
            onClick={() => setFilter('direct')}
          >
            <Link size={13} className="tab-icon" aria-hidden="true" />
            <span>Direct / Free</span>
            <span className="tab-count">{countDirect}</span>
          </button>
        </div>

        {/* Stream List / Grid Container */}
        <div className="stream-list-container">
          {downloadSuccess && (
            <div className="stream-download-toast" role="status">
              <CheckCircle2 size={18} className="toast-icon" aria-hidden="true" />
              <span>{downloadSuccess}</span>
              <button
                className="toast-dismiss"
                onClick={() => setDownloadSuccess('')}
                aria-label="Dismiss toast"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}

          {error && (
            <div className="stream-error-banner" role="alert">
              <AlertCircle size={18} className="stream-error-icon" aria-hidden="true" />
              <div className="stream-error-content">
                <p className="stream-error-title">Stream Resolution Notice</p>
                <p className="stream-error-desc">{error}</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="stream-cards-grid">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="stream-card-skeleton skeleton" />
              ))}
            </div>
          )}

          {!loading && filteredStreams.length === 0 && (
            <div className="stream-empty-state">
              <Inbox size={48} aria-hidden="true" className="stream-empty-icon" />
              <h4>No matching streams found</h4>
              <p className="stream-empty-hint">
                {searchQuery
                  ? `No streams matched "${searchQuery}". Try clearing search or selecting another filter tab.`
                  : filter !== 'all'
                  ? 'No streams available in this category. Switch to "All" tab to view all sources.'
                  : 'No stream providers returned results for this video.'}
              </p>
              {searchQuery && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSearchQuery('')}
                  style={{ marginTop: '12px' }}
                >
                  Clear Search Filter
                </button>
              )}
            </div>
          )}

          {!loading && filteredStreams.length > 0 && (
            <div className="stream-cards-grid">
              {filteredStreams.map((stream, index) => {
                const streamKey = stream.infoHash ? stream.infoHash.toLowerCase() : stream.url ? stream.url : `stream-${index}`
                const isResolving = resolving === (stream.infoHash || stream.url || 'resolving')
                const isDownloadingThis = downloadingKey === streamKey
                const streamType = stream.url ? 'direct' : stream.infoHash ? 'torrent' : 'external'

                return (
                  <div
                    key={`${streamKey}-${index}`}
                    className={`stream-card ${isResolving ? 'resolving' : ''}`}
                    onClick={() => !resolving && !isDownloadingThis && handleStreamSelect(stream)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Play stream ${stream.cleanTitle || stream.title}, quality ${stream.quality || 'HD'}`}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (!resolving && !isDownloadingThis) handleStreamSelect(stream)
                      }
                    }}
                  >
                    {/* Card Top Row: Type Pill, Health Dot & Rating */}
                    <div className="stream-card-top-row">
                      <div className="stream-type-pill-group">
                        {stream.isCached && (
                          <span className="stream-type-pill pill-cached">
                            <Zap size={11} aria-hidden="true" />
                            <span>CACHED</span>
                          </span>
                        )}
                        {streamType === 'direct' && (
                          <span className="stream-type-pill pill-direct">
                            <Link size={11} aria-hidden="true" />
                            <span>FREE DIRECT</span>
                          </span>
                        )}
                        {stream.isCached === false && stream.infoHash && (
                          <span className="stream-type-pill pill-uncached">
                            <Magnet size={11} aria-hidden="true" />
                            <span>P2P TORRENT</span>
                          </span>
                        )}
                        {streamType === 'external' && (
                          <span className="stream-type-pill pill-external">
                            <Globe size={11} aria-hidden="true" />
                            <span>EXTERNAL</span>
                          </span>
                        )}
                      </div>

                      <div className="stream-card-indicators">
                        <div className="stream-rating-pill" title={`Rating: ${stream.starRating?.toFixed(1) || '4.5'} / 5.0`}>
                          <Star size={11} fill="#FF6B00" color="#FF6B00" aria-hidden="true" />
                          <span>{stream.starRating?.toFixed(1) || '4.5'}</span>
                        </div>
                        <span
                          className={`stream-health-dot health-${stream.health || 'healthy'}`}
                          title={`Stream health: ${stream.health || 'healthy'}`}
                          aria-label={`Health: ${stream.health || 'healthy'}`}
                        />
                      </div>
                    </div>

                    {/* Card Title & Release Group */}
                    <div className="stream-card-content">
                      <div className="stream-card-title-row">
                        <h4 className="stream-card-title" title={stream.cleanTitle || stream.title}>
                          {stream.cleanTitle || stream.title || 'Standard Stream'}
                        </h4>
                      </div>

                      {stream.releaseGroup && (
                        <div className="stream-card-group-row">
                          <span className="stream-release-pill">{stream.releaseGroup}</span>
                        </div>
                      )}

                      {/* Vibrant Badges Row */}
                      <div className="stream-badges-grid">
                        {stream.quality && (
                          <span
                            className={`badge-item ${
                              stream.quality === '4K'
                                ? 'badge-quality-4k'
                                : stream.quality === '1080p'
                                ? 'badge-quality-1080p'
                                : stream.quality === '720p'
                                ? 'badge-quality-720p'
                                : 'badge-quality-sd'
                            }`}
                          >
                            {stream.quality} {stream.hdr ? 'HDR' : ''}
                          </span>
                        )}

                        {stream.source && (
                          <span className="badge-item badge-source">
                            {stream.source}
                          </span>
                        )}

                        {stream.codec && (
                          <span className="badge-item badge-codec">
                            {stream.codec}
                          </span>
                        )}

                        {stream.audio && (
                          <span className="badge-item badge-audio">
                            {stream.audio}
                          </span>
                        )}

                        {stream.size && (
                          <span className="badge-item badge-metrics">
                            {stream.size}{stream.bitrate ? ` · ${stream.bitrate}` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Bottom: Provider, Seeders, Play & Download CTAs */}
                    <div className="stream-card-footer">
                      <div className="stream-card-meta-left">
                        <span className="stream-addon-source-pill">
                          {stream.addonName}
                        </span>

                        {stream.seeders !== null && stream.seeders !== undefined && (
                          <span
                            className={`stream-peers-pill ${
                              stream.seeders > 50
                                ? 'peers-healthy'
                                : stream.seeders > 10
                                ? 'peers-average'
                                : 'peers-poor'
                            }`}
                            title={`${stream.seeders} active seeders`}
                          >
                            <Users size={12} aria-hidden="true" />
                            <span>{stream.seeders}</span>
                          </span>
                        )}
                      </div>

                      <div className="stream-card-action">
                        {isResolving ? (
                          <div className="stream-spinner-box">
                            <Loader2 size={16} className="stream-loading-spin" />
                            <span>Resolving...</span>
                          </div>
                        ) : (
                          <div className="stream-card-btns">
                            <button
                              type="button"
                              className="stream-card-play-btn"
                              aria-label={`Play stream ${stream.cleanTitle || stream.title}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleStreamSelect(stream)
                              }}
                            >
                              <Play size={12} fill="currentColor" />
                              <span>Play</span>
                            </button>

                            <button
                              type="button"
                              className={`stream-card-download-btn ${isDownloadingThis ? 'loading' : ''}`}
                              onClick={(e) => handleDownloadStream(e, stream)}
                              title="Download stream for offline watching"
                              aria-label={`Download ${stream.cleanTitle || stream.title}`}
                              disabled={isDownloadingThis}
                            >
                              {isDownloadingThis ? (
                                <Loader2 size={13} className="stream-download-spin" aria-hidden="true" />
                              ) : (
                                <Download size={13} aria-hidden="true" />
                              )}
                              <span className="stream-download-btn-label">Download</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="stream-modal-footer">
          {!torboxConnected && streams.some(s => s.infoHash) && (
            <div className="stream-torbox-notice">
              <Sparkles size={14} className="notice-icon" aria-hidden="true" />
              <span>
                Want instant 4K debrid streaming & high-speed downloads? Connect TorBox in Settings to unlock lightning fast cache speeds.
              </span>
            </div>
          )}

          <div className="stream-footer-actions">
            <button
              type="button"
              className="stream-wasm-btn"
              onClick={() => {
                onClose()
                navigate('/wasm-player')
              }}
            >
              Have a local video or custom file? Launch WASM Hardware Decoder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

