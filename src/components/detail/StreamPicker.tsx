import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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

export default function StreamPicker({ isOpen, onClose, type, videoId, meta }: Props) {
  const navigate = useNavigate()
  const { addons } = useAddonStore()
  const { torboxApiKey, torboxConnected } = useAuthStore()
  const { setStream, setMeta, setVideo } = usePlayerStore()
  const [streams, setStreams] = useState<EnrichedStream[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<FilterTab>('all')

  const fetchStreams = useCallback(async () => {
    setLoading(true)
    setStreams([])
    setError('')

    const allStreams: EnrichedStream[] = []
    const enabledAddons = addons.filter(a => a.enabled)

    // Fetch streams from all addons in parallel
    const results = await Promise.allSettled(
      enabledAddons.map(async (addon) => {
        const client = new AddonClient(addon.manifestUrl)
        client.manifest = addon.manifest

        if (!client.supportsResource('stream')) return []

        try {
          const result = await client.getStreams(type, videoId)
          return (result.streams || []).map((s: Stream) => {
            const info = parseStreamInfo(s)
            return {
              ...s,
              addonName: addon.manifest.name,
              addonId: addon.manifest.id,
              quality: info.quality || undefined,
              size: info.size || undefined,
              codec: info.codec || undefined,
              isCached: undefined,
            } as EnrichedStream
          })
        } catch {
          return []
        }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allStreams.push(...result.value)
      }
    }

    // Check TorBox cache for torrent streams
    if (torboxConnected && torboxApiKey) {
      const hashes = allStreams
        .filter(s => s.infoHash)
        .map(s => s.infoHash!)

      if (hashes.length > 0) {
        const cached = await batchCheckCached(hashes, torboxApiKey)
        for (const stream of allStreams) {
          if (stream.infoHash) {
            stream.isCached = cached[stream.infoHash.toLowerCase()] || false
          }
        }
      }
    }

    // Sort: cached first, then by quality
    const qualityOrder: Record<string, number> = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1 }
    allStreams.sort((a, b) => {
      // Direct URLs first (free)
      if (a.url && !b.url) return -1
      if (!a.url && b.url) return 1
      // Then cached
      if (a.isCached && !b.isCached) return -1
      if (!a.isCached && b.isCached) return 1
      // Then quality
      const qa = qualityOrder[a.quality || ''] || 0
      const qb = qualityOrder[b.quality || ''] || 0
      return qb - qa
    })

    setStreams(allStreams)
    setLoading(false)
  }, [addons, type, videoId, torboxApiKey, torboxConnected])

  useEffect(() => {
    if (isOpen) {
      fetchStreams()
    }
  }, [isOpen, fetchStreams])

  const handleStreamSelect = async (stream: EnrichedStream) => {
    // External URL — open in new tab
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
          setError('Connect TorBox in Settings to play torrent streams, or pick a direct stream (🔗)')
        } else {
          setError('Could not resolve stream URL')
        }
        setResolving(null)
        return
      }

      const info = parseStreamInfo(stream)
      setMeta(meta)
      setStream({
        url,
        title: `${meta.name}${stream.behaviorHints?.filename ? ` - ${stream.behaviorHints.filename}` : ''}`,
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="stream-picker-modal modal-content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 className="stream-picker-title">Select a Stream</h3>
            <p className="stream-picker-subtitle">{meta.name}</p>
          </div>
          <button className="modal-close btn-ghost" onClick={onClose}>✕</button>
        </div>

        {/* Filter tabs */}
        <div className="stream-filter-bar">
          <button
            className={`stream-filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({streams.length})
          </button>
          <button
            className={`stream-filter-tab ${filter === 'cached' ? 'active' : ''}`}
            onClick={() => setFilter('cached')}
          >
            ⚡ Cached ({cachedCount})
          </button>
          <button
            className={`stream-filter-tab ${filter === 'direct' ? 'active' : ''}`}
            onClick={() => setFilter('direct')}
          >
            🔗 Direct ({directCount})
          </button>
        </div>

        {/* Stream list */}
        <div className="modal-body stream-list-container">
          {loading && (
            <div className="stream-loading">
              <div className="loading-spinner" />
              <p>Searching all addons for streams...</p>
            </div>
          )}

          {error && (
            <div className="stream-error">
              <p>{error}</p>
            </div>
          )}

          {!loading && filteredStreams.length === 0 && (
            <div className="stream-empty">
              <p>😔 No streams found</p>
              <p className="text-sm text-muted">Try different addons or check your addon settings</p>
            </div>
          )}

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
                >
                  <div className="stream-item-header">
                    <div className="stream-item-left">
                      {/* Cache/type indicator */}
                      <span className="stream-type-icon">
                        {streamType === 'direct' && '🔗'}
                        {streamType === 'torrent' && (stream.isCached ? '⚡' : '🧲')}
                        {streamType === 'external' && '🌐'}
                      </span>
                      <div className="stream-item-info">
                        <p className="stream-item-title">
                          {stream.behaviorHints?.filename || 
                           stream.title?.split('\n')[0] || 
                           stream.name?.split('\n')[0] || 
                           'Unknown Stream'}
                        </p>
                        <div className="stream-item-meta">
                          {/* Badges */}
                          {info.quality && (
                            <span className={`badge ${info.quality === '4K' ? 'badge-4k' : 'badge-hd'}`}>
                              {info.quality}
                            </span>
                          )}
                          {stream.isCached && (
                            <span className="badge badge-cached">CACHED</span>
                          )}
                          {stream.isCached === false && stream.infoHash && (
                            <span className="badge badge-uncached">UNCACHED</span>
                          )}
                          {streamType === 'direct' && (
                            <span className="badge" style={{background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.3)'}}>
                              FREE
                            </span>
                          )}
                          {info.codec && <span className="badge">{info.codec}</span>}
                          {info.hdr && <span className="badge badge-4k">HDR</span>}
                          {info.audio && <span className="badge">{info.audio}</span>}
                          {info.size && <span className="stream-size">{info.size}</span>}
                          {info.seeders !== null && (
                            <span className={`stream-peers ${
                              info.seeders > 50 ? 'healthy' : info.seeders > 10 ? 'average' : 'poor'
                            }`}>
                              👤 {info.seeders}
                            </span>
                          )}
                        </div>
                        <p className="stream-addon-source">{stream.addonName}</p>
                      </div>
                    </div>
                    {isResolving && <div className="loading-spinner stream-spinner" />}
                  </div>

                  {/* Secondary info line from stream.title (often has more metadata) */}
                  {stream.title && stream.title.includes('\n') && (
                    <p className="stream-item-detail">
                      {stream.title.split('\n').slice(1).join(' • ')}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        {!torboxConnected && streams.some(s => s.infoHash) && (
          <div className="stream-picker-footer">
            <p className="text-xs text-muted">
              💡 Connect TorBox in Settings to unlock torrent streams. Direct streams (🔗) work for free!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
