import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link, Zap, Magnet, Globe, Users, X, Inbox } from 'lucide-react'
import { Meta, Stream, AddonClient } from '../../api/addon-client'
import { useAddonStore } from '../../store/addon-store'
import { useAuthStore } from '../../store/auth-store'
import { usePlayerStore, EnrichedStream } from '../../store/player-store'
import { parseStreamInfo, resolveStreamUrl, batchCheckCached } from '../../utils/stream-resolver'
import './stream-picker.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  type: string
  videoId: string
  meta: Meta
}

type FilterTab = 'all' | 'cached' | 'direct'

// Default high-performance stream providers
const DEFAULT_STREAM_PROVIDERS = [
  'https://torrentio.strem.fun/manifest.json',
  'https://mediafusion.elfhosted.com/manifest.json',
]

export default function StreamPicker({ isOpen, onClose, type, videoId, meta }: Props) {
  const navigate = useNavigate()
  const modalRef = useRef<HTMLDivElement>(null)
  const { addons } = useAddonStore()
  const { torboxApiKey, torboxConnected } = useAuthStore()
  const { setStream, setMeta, setVideo } = usePlayerStore()
  const [streams, setStreams] = useState<EnrichedStream[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<FilterTab>('all')

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
                    size: info.size || undefined,
                    codec: info.codec || undefined,
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
              stream.isCached = cached[stream.infoHash.toLowerCase()] || false
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
      const key = s.infoHash || s.url || s.title || JSON.stringify(s)
      if (!seen.has(key)) {
        seen.add(key)
        uniqueStreams.push(s)
      }
    }

    // Sort: Direct/Free & Cached first, then by resolution (4K > 1080p > 720p)
    const qualityOrder: Record<string, number> = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1 }
    uniqueStreams.sort((a, b) => {
      // Direct URLs first
      if (a.url && !b.url) return -1
      if (!a.url && b.url) return 1
      // Then cached torrents
      if (a.isCached && !b.isCached) return -1
      if (!a.isCached && b.isCached) return 1
      // Then quality
      const qa = qualityOrder[a.quality || ''] || 0
      const qb = qualityOrder[b.quality || ''] || 0
      if (qb !== qa) return qb - qa
      
      const infoA = parseStreamInfo(a)
      const infoB = parseStreamInfo(b)
      
      // Then file size (largest first)
      const sizeA = infoA.sizeBytes || 0
      const sizeB = infoB.sizeBytes || 0
      if (sizeB !== sizeA) return sizeB - sizeA
      
      // Then seeders
      const sa = infoA.seeders || 0
      const sb = infoB.seeders || 0
      return sb - sa
    })

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

    setResolving(stream.infoHash || stream.url || 'resolving')
    setError('')

    try {
      const url = await resolveStreamUrl(stream, torboxApiKey || undefined)
      
      if (!url) {
        if (stream.infoHash && !torboxConnected) {
          setError('Connect TorBox in Settings to instantly stream torrents, or pick a direct stream')
        } else {
          setError('Could not resolve stream URL. Try another stream.')
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

      const info = parseStreamInfo(stream)
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
        quality: info.quality || undefined,
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

  const filteredStreams = streams.filter(s => {
    if (filter === 'cached') return s.isCached === true
    if (filter === 'direct') return !!s.url
    return true
  })

  const cachedCount = streams.filter(s => s.isCached).length
  const directCount = streams.filter(s => s.url).length

  if (!isOpen) return null

  // Format episode title in header if videoId has episode info
  const matchingVideo = meta.videos?.find(v => v.id === videoId)
  const episodeHeader = matchingVideo?.season && matchingVideo?.episode
    ? `Season ${matchingVideo.season} • Episode ${matchingVideo.episode}${matchingVideo.title ? ` - ${matchingVideo.title}` : ''}`
    : videoId.includes(':')
    ? `Season ${videoId.split(':')[1] || 1} • Episode ${videoId.split(':')[2] || 1}`
    : meta.name

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="stream-picker-modal modal-content" ref={modalRef} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="stream-picker-title">
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 id="stream-picker-title" className="stream-picker-title">Select a Stream</h3>
            <p className="stream-picker-subtitle" style={{ color: 'var(--accent-magenta)', fontWeight: 600 }}>
              {episodeHeader}
            </p>
          </div>
          <button className="modal-close btn-ghost" onClick={onClose} aria-label="Close stream selector">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="stream-filter-bar">
          <button
            className={`stream-filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Streams ({streams.length})
          </button>
          <button
            className={`stream-filter-tab ${filter === 'cached' ? 'active' : ''}`}
            onClick={() => setFilter('cached')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Zap size={14} aria-hidden="true" /> Cached ({cachedCount})
          </button>
          <button
            className={`stream-filter-tab ${filter === 'direct' ? 'active' : ''}`}
            onClick={() => setFilter('direct')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Link size={14} aria-hidden="true" /> Direct / Free ({directCount})
          </button>
        </div>

        {/* Stream list */}
        <div className="modal-body stream-list-container">
          {loading && (
            <div className="stream-list">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="stream-item-skeleton skeleton" />
              ))}
            </div>
          )}

          {error && (
            <div className="stream-error">
              <p>{error}</p>
            </div>
          )}

          {!loading && filteredStreams.length === 0 && (
            <div className="stream-empty">
              <Inbox size={40} aria-hidden="true" style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p>No streams found for this episode</p>
              <p className="text-sm text-muted">Try connecting TorBox in Settings for instant debrid streaming</p>
            </div>
          )}

          {!loading && (
            <div className="stream-list">
              {filteredStreams.map((stream, index) => {
                const info = parseStreamInfo(stream)
                const isResolving = resolving === (stream.infoHash || stream.url || 'resolving')
                const streamType = stream.url ? 'direct' : stream.infoHash ? 'torrent' : 'external'

                return (
                  <div
                    key={`${stream.infoHash || stream.url || index}-${index}`}
                    className={`stream-item ${isResolving ? 'resolving' : ''}`}
                    onClick={() => !resolving && handleStreamSelect(stream)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Play stream ${info.cleanTitle}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (!resolving) handleStreamSelect(stream)
                      }
                    }}
                  >
                    <div className="stream-item-header">
                      <div className="stream-item-left">
                        <span className="stream-type-icon" aria-hidden="true">
                          {streamType === 'direct' && <Link size={18} />}
                          {streamType === 'torrent' && (stream.isCached ? <Zap size={18} /> : <Magnet size={18} />)}
                          {streamType === 'external' && <Globe size={18} />}
                        </span>
                        <div className="stream-item-info">
                          <p className="stream-item-title">
                            {info.cleanTitle}
                          </p>
                          <div className="stream-badges-left">
                            {info.quality && (
                              <span className={`badge ${info.quality === '4K' ? 'badge-4k' : 'badge-hd'}`}>
                                {info.quality}
                              </span>
                            )}
                            {stream.isCached && (
                              <span className="badge badge-cached" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <Zap size={12} aria-hidden="true" /> CACHED
                              </span>
                            )}
                            {stream.isCached === false && stream.infoHash && (
                              <span className="badge badge-uncached">UNCACHED</span>
                            )}
                            {streamType === 'direct' && (
                              <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                                FREE DIRECT
                              </span>
                            )}
                            {info.codec && <span className="badge">{info.codec}</span>}
                            {info.hdr && <span className="badge badge-4k">HDR</span>}
                            {info.audio && <span className="badge">{info.audio}</span>}
                            <span className="stream-addon-source">{info.source || stream.addonName}</span>
                          </div>
                        </div>
                      </div>

                      <div className="stream-meta-right">
                        {info.size && <span className="stream-size">{info.size}</span>}
                        {info.seeders !== null && (
                          <span className={`stream-peers ${
                            info.seeders > 50 ? 'healthy' : info.seeders > 10 ? 'average' : 'poor'
                          }`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Users size={14} aria-hidden="true" /> {info.seeders}
                          </span>
                        )}
                        {isResolving && <div className="loading-spinner stream-spinner" />}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="stream-picker-footer" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {!torboxConnected && streams.some(s => s.infoHash) && (
            <p className="text-xs text-muted">
              Connect your TorBox account in Settings to unlock high-speed torrent streams. Direct streams play for free!
            </p>
          )}
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%', border: '1px dashed #9c27b0', color: '#e879f9' }}
            onClick={() => {
              onClose()
              navigate('/wasm-player')
            }}
          >
            Got an unsupported local file? Decode it with our WASM Engine
          </button>
        </div>
      </div>
    </div>
  )
}
