import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DownloadCloud,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  X,
  HardDrive,
  Activity,
  CheckCircle2,
  Clock,
  Film,
  Search,
  ArrowDownToLine,
  FolderDown,
  Layers,
  Sparkles,
} from 'lucide-react'
import {
  useDownloadStore,
  DownloadItem,
  formatBytes,
  formatSpeed,
} from '../store/download-store'
import { usePlayerStore } from '../store/player-store'
import './downloads.css'

export default function Downloads() {
  const navigate = useNavigate()
  const {
    items,
    activeTab,
    searchQuery,
    setActiveTab,
    setSearchQuery,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    deleteDownload,
    clearCompleted,
    pauseAll,
    resumeAll,
    saveToDisk,
  } = useDownloadStore()

  const { setStream, setMeta, setVideo } = usePlayerStore()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Compute aggregate statistics
  const stats = useMemo(() => {
    let activeCount = 0
    let completedCount = 0
    let pausedCount = 0
    let totalSpeedBytes = 0
    let totalDownloadedBytes = 0
    let totalQueueBytes = 0

    for (const item of items) {
      if (item.status === 'downloading') {
        activeCount++
        totalSpeedBytes += item.speed || 0
      } else if (item.status === 'completed') {
        completedCount++
      } else if (item.status === 'paused') {
        pausedCount++
      }
      totalDownloadedBytes += item.downloadedBytes || 0
      totalQueueBytes += item.totalBytes || 0
    }

    return {
      activeCount,
      completedCount,
      pausedCount,
      totalSpeedFormatted: formatSpeed(totalSpeedBytes),
      totalDownloadedFormatted: formatBytes(totalDownloadedBytes),
      totalQueueFormatted: formatBytes(totalQueueBytes),
      totalSpeedBytes,
    }
  }, [items])

  // Filter and search items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Tab filter
      if (activeTab === 'active' && item.status !== 'downloading' && item.status !== 'queued') {
        return false
      }
      if (activeTab === 'completed' && item.status !== 'completed') {
        return false
      }
      if (activeTab === 'paused' && item.status !== 'paused') {
        return false
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchSub = item.subtitle?.toLowerCase().includes(q)
        const matchQuality = item.quality?.toLowerCase().includes(q)
        const matchAddon = item.addonName?.toLowerCase().includes(q)
        if (!matchTitle && !matchSub && !matchQuality && !matchAddon) {
          return false
        }
      }

      return true
    })
  }, [items, activeTab, searchQuery])

  // Handle Play in WebVio
  const handlePlayInWebVio = (item: DownloadItem) => {
    if (!item.url) return

    setMeta(item.meta as any)
    setVideo(item.video || null)
    setStream({
      url: item.url,
      title: `${item.title}${item.subtitle ? ` • ${item.subtitle}` : ''}`,
      quality: item.quality,
      source: item.addonName || 'Downloaded Media',
    })

    navigate('/player')
  }

  return (
    <div className="downloads-page">
      {/* Header Area */}
      <header className="downloads-header">
        <div className="downloads-title-area">
          <div className="downloads-title-row">
            <h1 className="downloads-title">Downloads Manager</h1>
            {stats.activeCount > 0 && (
              <span className="downloads-badge-active">
                <Activity size={14} className="animate-spin" aria-hidden="true" />
                {stats.activeCount} Active ({stats.totalSpeedFormatted})
              </span>
            )}
          </div>
          <p className="downloads-subtitle">
            Manage your offline media queue, background caching, and direct high-speed downloads.
          </p>
        </div>

        <div className="downloads-header-actions">
          <button
            className="btn-fluent"
            disabled={stats.activeCount === 0}
            onClick={pauseAll}
            title="Pause all active downloads"
            aria-label="Pause all active downloads"
          >
            <Pause size={16} aria-hidden="true" /> Pause All
          </button>
          <button
            className="btn-fluent"
            disabled={stats.pausedCount === 0}
            onClick={resumeAll}
            title="Resume all paused downloads"
            aria-label="Resume all paused downloads"
          >
            <Play size={16} aria-hidden="true" /> Resume All
          </button>
          <button
            className="btn-fluent btn-fluent-danger"
            disabled={stats.completedCount === 0}
            onClick={clearCompleted}
            title="Clear completed downloads from history"
            aria-label="Clear completed downloads"
          >
            <Trash2 size={16} aria-hidden="true" /> Clear Completed
          </button>
        </div>
      </header>

      {/* System Overview Dashboard Cards */}
      <section className="downloads-overview-card" aria-label="Download statistics">
        <div className="overview-stat">
          <div className="overview-icon-box speed">
            <DownloadCloud size={22} aria-hidden="true" />
          </div>
          <div className="overview-stat-content">
            <span className="stat-label">Total Speed</span>
            <span className="stat-value">{stats.totalSpeedFormatted}</span>
          </div>
        </div>

        <div className="overview-stat">
          <div className="overview-icon-box">
            <Layers size={22} aria-hidden="true" />
          </div>
          <div className="overview-stat-content">
            <span className="stat-label">Active Downloads</span>
            <span className="stat-value">{stats.activeCount} Items</span>
          </div>
        </div>

        <div className="overview-stat">
          <div className="overview-icon-box completed">
            <CheckCircle2 size={22} aria-hidden="true" />
          </div>
          <div className="overview-stat-content">
            <span className="stat-label">Completed Files</span>
            <span className="stat-value">{stats.completedCount} Ready</span>
          </div>
        </div>

        <div className="overview-stat">
          <div className="overview-icon-box storage">
            <HardDrive size={22} aria-hidden="true" />
          </div>
          <div className="overview-stat-content">
            <span className="stat-label">Storage Used</span>
            <span className="stat-value">{stats.totalDownloadedFormatted}</span>
          </div>
        </div>
      </section>

      {/* Navigation Tabs and Search Toolbar */}
      <div className="downloads-toolbar">
        <div className="downloads-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All <span className="tab-counter">{items.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'active'}
            className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active <span className="tab-counter">{stats.activeCount}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'completed'}
            className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            Completed <span className="tab-counter">{stats.completedCount}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'paused'}
            className={`tab-btn ${activeTab === 'paused' ? 'active' : ''}`}
            onClick={() => setActiveTab('paused')}
          >
            Paused <span className="tab-counter">{stats.pausedCount}</span>
          </button>
        </div>

        <div className="downloads-search-box">
          <Search size={16} color="#94a3b8" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search downloads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter downloads"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}
              aria-label="Clear filter search"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Downloads List / Empty States */}
      {filteredItems.length === 0 ? (
        <div className="downloads-empty">
          <div className="empty-icon-wrap">
            <FolderDown size={36} aria-hidden="true" />
          </div>
          <h2 className="empty-title">
            {searchQuery
              ? 'No matching downloads found'
              : activeTab === 'all'
              ? 'Download Queue is Empty'
              : `No ${activeTab} downloads`}
          </h2>
          <p className="empty-desc">
            {searchQuery
              ? `No items match the search query "${searchQuery}". Try a different title or filter.`
              : 'Browse movies, series, or anime and select any stream to download for instant offline viewing.'}
          </p>
          <button className="btn-fluent btn-fluent-primary" onClick={() => navigate('/')}>
            <Sparkles size={16} aria-hidden="true" /> Browse Catalog
          </button>
        </div>
      ) : (
        <div className="downloads-list" role="list">
          {filteredItems.map((item) => {
            const isCompleted = item.status === 'completed'
            const isDownloading = item.status === 'downloading'
            const isPaused = item.status === 'paused'
            const isError = item.status === 'error'
            const isCancelled = item.status === 'cancelled'

            return (
              <div
                key={item.id}
                className={`download-card ${
                  isDownloading
                    ? 'is-active'
                    : isCompleted
                    ? 'is-completed'
                    : isPaused
                    ? 'is-paused'
                    : ''
                }`}
                role="listitem"
              >
                {/* Poster Thumbnail */}
                <div className="download-thumbnail-wrap">
                  {item.poster ? (
                    <img
                      src={item.poster}
                      alt={item.title}
                      className="download-poster"
                      loading="lazy"
                    />
                  ) : (
                    <div className="download-poster-fallback">
                      <Film size={24} aria-hidden="true" />
                    </div>
                  )}

                  {isCompleted && (
                    <div
                      className="download-play-overlay"
                      onClick={() => handlePlayInWebVio(item)}
                      title="Play in WebVio"
                    >
                      <Play size={24} fill="#fff" aria-hidden="true" />
                    </div>
                  )}
                </div>

                {/* Info & Progress */}
                <div className="download-info-area">
                  <div className="download-title-row">
                    <h3 className="download-item-title">{item.title}</h3>
                    {item.quality && <span className="download-badge-quality">{item.quality}</span>}
                    {item.addonName && <span className="download-badge-addon">{item.addonName}</span>}
                  </div>

                  {item.subtitle && <p className="download-item-subtitle">{item.subtitle}</p>}

                  {/* Progress Bar */}
                  <div
                    className="download-progress-container"
                    role="progressbar"
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`download-progress-fill ${
                        isCompleted
                          ? 'completed'
                          : isPaused
                          ? 'paused'
                          : isError || isCancelled
                          ? 'error'
                          : ''
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>

                  {/* Metrics and Status */}
                  <div className="download-metrics-row">
                    <div className="download-metrics-left">
                      <span className={`status-badge ${item.status}`}>
                        {item.status}
                      </span>
                      <span>
                        {formatBytes(item.downloadedBytes)} / {formatBytes(item.totalBytes)} ({item.progress.toFixed(1)}%)
                      </span>
                    </div>

                    <div className="download-metrics-right">
                      {isDownloading && (
                        <>
                          <span className="speed-text">⚡ {item.speedFormatted}</span>
                          <span className="eta-text">
                            <Clock size={12} style={{ display: 'inline', marginRight: 3 }} />
                            ETA: {item.etaFormatted}
                          </span>
                        </>
                      )}
                      {isCompleted && item.completedAt && (
                        <span style={{ color: '#4ade80' }}>
                          ✓ Completed {new Date(item.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {isPaused && <span style={{ color: '#fbbf24' }}>Paused</span>}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="download-actions-area">
                  {isDownloading && (
                    <button
                      className="action-icon-btn"
                      onClick={() => pauseDownload(item.id)}
                      title="Pause download"
                      aria-label={`Pause ${item.title}`}
                    >
                      <Pause size={18} aria-hidden="true" />
                    </button>
                  )}

                  {(isPaused || isCancelled) && (
                    <button
                      className="action-icon-btn primary"
                      onClick={() => resumeDownload(item.id)}
                      title="Resume download"
                      aria-label={`Resume ${item.title}`}
                    >
                      <Play size={18} fill="currentColor" aria-hidden="true" />
                    </button>
                  )}

                  {isError && (
                    <button
                      className="action-icon-btn primary"
                      onClick={() => retryDownload(item.id)}
                      title="Retry download"
                      aria-label={`Retry ${item.title}`}
                    >
                      <RotateCcw size={18} aria-hidden="true" />
                    </button>
                  )}

                  {isCompleted && (
                    <>
                      <button
                        className="action-icon-btn play"
                        onClick={() => handlePlayInWebVio(item)}
                        title="Play in WebVio"
                        aria-label={`Play ${item.title} in WebVio`}
                      >
                        <Play size={18} fill="currentColor" aria-hidden="true" />
                      </button>
                      <button
                        className="action-icon-btn"
                        onClick={() => saveToDisk(item.id)}
                        title="Save to local disk"
                        aria-label={`Save ${item.title} to disk`}
                      >
                        <ArrowDownToLine size={18} aria-hidden="true" />
                      </button>
                    </>
                  )}

                  {isDownloading && (
                    <button
                      className="action-icon-btn danger"
                      onClick={() => cancelDownload(item.id)}
                      title="Cancel download"
                      aria-label={`Cancel ${item.title}`}
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  )}

                  {confirmDeleteId === item.id ? (
                    <button
                      className="action-icon-btn danger"
                      style={{ background: '#ef4444', color: '#fff' }}
                      onClick={() => {
                        deleteDownload(item.id)
                        setConfirmDeleteId(null)
                      }}
                      title="Confirm delete"
                      aria-label={`Confirm delete ${item.title}`}
                    >
                      <CheckCircle2 size={18} aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      className="action-icon-btn danger"
                      onClick={() => setConfirmDeleteId(item.id)}
                      title="Delete download"
                      aria-label={`Delete ${item.title}`}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
