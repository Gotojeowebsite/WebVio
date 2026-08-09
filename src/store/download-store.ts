import { create } from 'zustand'
import { Meta, MetaPreview, Video, Stream } from '../api/addon-client'
import { EnrichedStream, ResolvedStream } from './player-store'

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled'

export interface DownloadItem {
  id: string
  title: string
  subtitle?: string
  meta: Meta | MetaPreview
  video?: Video | null
  stream: EnrichedStream | Stream | ResolvedStream | Record<string, any>
  url: string
  quality?: string
  addonName?: string
  totalBytes: number
  downloadedBytes: number
  progress: number // 0 to 100
  speed: number // bytes per second
  speedFormatted: string // e.g. "24.5 MB/s"
  eta: number // remaining seconds
  etaFormatted: string // e.g. "1m 30s"
  status: DownloadStatus
  createdAt: number
  completedAt?: number
  error?: string
  poster?: string
  backdrop?: string
}

export interface DownloadStoreState {
  items: DownloadItem[]
  activeTab: 'all' | 'active' | 'completed' | 'paused'
  searchQuery: string
  setActiveTab: (tab: 'all' | 'active' | 'completed' | 'paused') => void
  setSearchQuery: (query: string) => void

  // Actions
  addDownload: (
    stream: EnrichedStream | Stream | ResolvedStream | Record<string, any>,
    meta: Meta | MetaPreview,
    video?: Video | null
  ) => string
  pauseDownload: (id: string) => void
  resumeDownload: (id: string) => void
  cancelDownload: (id: string) => void
  retryDownload: (id: string) => void
  deleteDownload: (id: string) => void
  clearCompleted: () => void
  pauseAll: () => void
  resumeAll: () => void
  saveToDisk: (id: string) => void
  getItem: (id: string) => DownloadItem | undefined
}

const STORAGE_KEY = 'webvio_downloads'

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const idx = Math.min(i, sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(dm))} ${sizes[idx]}`
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || isNaN(bytesPerSec)) return '0 MB/s'
  const mbps = bytesPerSec / (1024 * 1024)
  if (mbps < 0.1) {
    const kbps = bytesPerSec / 1024
    return `${kbps.toFixed(1)} KB/s`
  }
  return `${mbps.toFixed(1)} MB/s`
}

export function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return `${m}m ${s < 10 ? '0' : ''}${s}s`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export function parseSizeStringToBytes(sizeStr?: string): number {
  if (!sizeStr || typeof sizeStr !== 'string') return 0
  const match = sizeStr.trim().match(/^([\d.]+)\s*([KMGTP]?B?)$/i)
  if (!match) return 0
  const val = parseFloat(match[1])
  const unit = (match[2] || '').toUpperCase()
  if (unit.startsWith('T')) return val * 1024 * 1024 * 1024 * 1024
  if (unit.startsWith('G')) return val * 1024 * 1024 * 1024
  if (unit.startsWith('M')) return val * 1024 * 1024
  if (unit.startsWith('K')) return val * 1024
  return val
}

export function estimateStreamSize(stream: any, quality?: string): number {
  if (stream?.sizeBytes && typeof stream.sizeBytes === 'number' && stream.sizeBytes > 0) {
    return stream.sizeBytes
  }
  if (stream?.size && typeof stream.size === 'string') {
    const parsed = parseSizeStringToBytes(stream.size)
    if (parsed > 0) return parsed
  }

  const q = (quality || stream?.quality || '').toUpperCase()
  if (q.includes('4K') || q.includes('2160P') || q.includes('UHD')) {
    return 6.8 * 1024 * 1024 * 1024 // ~6.8 GB
  }
  if (q.includes('1080P') || q.includes('FHD')) {
    return 2.2 * 1024 * 1024 * 1024 // ~2.2 GB
  }
  if (q.includes('720P') || q.includes('HD')) {
    return 1.1 * 1024 * 1024 * 1024 // ~1.1 GB
  }
  if (q.includes('480P') || q.includes('SD')) {
    return 550 * 1024 * 1024 // ~550 MB
  }
  return 1.8 * 1024 * 1024 * 1024 // ~1.8 GB Default
}

function loadInitialDownloads(): DownloadItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        ...item,
        // Reset speed and eta if rehydrated
        speed: item.status === 'downloading' ? item.speed || 0 : 0,
        speedFormatted: item.status === 'downloading' ? item.speedFormatted || '0 MB/s' : '0 MB/s',
        etaFormatted: item.status === 'completed' ? 'Done' : item.etaFormatted || '--',
      }))
    }
  } catch (err) {
    console.warn('[download-store] Failed to read downloads from localStorage', err)
  }
  return []
}

function saveDownloadsToStorage(items: DownloadItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch (err) {
    console.warn('[download-store] Failed to save downloads to localStorage', err)
  }
}

// Background simulation ticker for realistic download progression
let tickerTimer: number | null = null

function ensureTickerRunning(
  get: () => DownloadStoreState,
  set: (partial: Partial<DownloadStoreState> | ((state: DownloadStoreState) => Partial<DownloadStoreState>)) => void
) {
  if (tickerTimer !== null) return

  tickerTimer = window.setInterval(() => {
    const { items } = get()
    const activeItems = items.filter((i) => i.status === 'downloading')

    if (activeItems.length === 0) {
      if (tickerTimer !== null) {
        clearInterval(tickerTimer)
        tickerTimer = null
      }
      return
    }

    let hasChanges = false
    const updated = items.map((item) => {
      if (item.status !== 'downloading') return item

      hasChanges = true
      // Realistic high-speed broadband simulation: 20 MB/s to 45 MB/s with random variance
      const baseSpeedMBps = 32 + (Math.sin(Date.now() / 3000) * 10) + ((Math.random() - 0.5) * 6)
      const currentSpeedBytes = Math.max(2 * 1024 * 1024, Math.round(baseSpeedMBps * 1024 * 1024))
      
      const newDownloaded = item.downloadedBytes + currentSpeedBytes
      if (newDownloaded >= item.totalBytes) {
        return {
          ...item,
          downloadedBytes: item.totalBytes,
          progress: 100,
          status: 'completed' as DownloadStatus,
          completedAt: Date.now(),
          speed: 0,
          speedFormatted: '0 MB/s',
          eta: 0,
          etaFormatted: 'Done',
        }
      }

      const progress = Math.min(99.9, Math.round((newDownloaded / item.totalBytes) * 1000) / 10)
      const remainingBytes = item.totalBytes - newDownloaded
      const eta = Math.max(1, Math.round(remainingBytes / currentSpeedBytes))

      return {
        ...item,
        downloadedBytes: newDownloaded,
        progress,
        speed: currentSpeedBytes,
        speedFormatted: formatSpeed(currentSpeedBytes),
        eta,
        etaFormatted: formatEta(eta),
      }
    })

    if (hasChanges) {
      set({ items: updated })
      saveDownloadsToStorage(updated)
    }
  }, 1000)
}

export const useDownloadStore = create<DownloadStoreState>((set, get) => {
  const initialItems = loadInitialDownloads()

  // Start ticker if any items were active
  setTimeout(() => {
    if (get().items.some((i) => i.status === 'downloading')) {
      ensureTickerRunning(get, set)
    }
  }, 100)

  return {
    items: initialItems,
    activeTab: 'all',
    searchQuery: '',
    setActiveTab: (tab) => set({ activeTab: tab }),
    setSearchQuery: (query) => set({ searchQuery: query }),

    addDownload: (stream, meta, video) => {
      const state = get()
      const streamUrl = (stream as any)?.url || (stream as any)?.externalUrl || ''
      const streamTitle = meta.name || (stream as any)?.title || (stream as any)?.name || 'Untitled Media'
      const quality = (stream as any)?.quality || 'HD'
      const totalBytes = estimateStreamSize(stream, quality)

      // Check if duplicate already exists
      const existing = state.items.find(
        (i) =>
          i.meta.id === meta.id &&
          (video ? i.video?.id === video.id : !i.video) &&
          (i.url === streamUrl || i.quality === quality)
      )

      if (existing) {
        if (existing.status === 'paused' || existing.status === 'cancelled' || existing.status === 'error') {
          get().resumeDownload(existing.id)
        }
        return existing.id
      }

      const id = `dl_${meta.id}_${video?.id || 'movie'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const episodeSubtitle = video?.season && video?.episode
        ? `S${video.season}E${video.episode} • ${video.title || 'Episode ' + video.episode}`
        : video?.title
        ? video.title
        : undefined

      const newItem: DownloadItem = {
        id,
        title: streamTitle,
        subtitle: episodeSubtitle,
        meta,
        video: video || null,
        stream,
        url: streamUrl,
        quality,
        addonName: (stream as any)?.addonName || 'WebStream',
        totalBytes,
        downloadedBytes: 0,
        progress: 0,
        speed: 25 * 1024 * 1024,
        speedFormatted: '25.0 MB/s',
        eta: Math.round(totalBytes / (25 * 1024 * 1024)),
        etaFormatted: formatEta(Math.round(totalBytes / (25 * 1024 * 1024))),
        status: 'downloading',
        createdAt: Date.now(),
        poster: meta.poster,
        backdrop: meta.background,
      }

      const nextItems = [newItem, ...state.items]
      set({ items: nextItems })
      saveDownloadsToStorage(nextItems)
      ensureTickerRunning(get, set)

      return id
    },

    pauseDownload: (id) => {
      const updated = get().items.map((i) =>
        i.id === id && i.status === 'downloading'
          ? { ...i, status: 'paused' as DownloadStatus, speed: 0, speedFormatted: '0 MB/s', etaFormatted: 'Paused' }
          : i
      )
      set({ items: updated })
      saveDownloadsToStorage(updated)
    },

    resumeDownload: (id) => {
      const updated = get().items.map((i) =>
        i.id === id && (i.status === 'paused' || i.status === 'queued' || i.status === 'error' || i.status === 'cancelled')
          ? {
              ...i,
              status: 'downloading' as DownloadStatus,
              speed: 20 * 1024 * 1024,
              speedFormatted: '20.0 MB/s',
              etaFormatted: formatEta(Math.round((i.totalBytes - i.downloadedBytes) / (20 * 1024 * 1024))),
            }
          : i
      )
      set({ items: updated })
      saveDownloadsToStorage(updated)
      ensureTickerRunning(get, set)
    },

    cancelDownload: (id) => {
      const updated = get().items.map((i) =>
        i.id === id
          ? {
              ...i,
              status: 'cancelled' as DownloadStatus,
              speed: 0,
              speedFormatted: '0 MB/s',
              etaFormatted: 'Cancelled',
            }
          : i
      )
      set({ items: updated })
      saveDownloadsToStorage(updated)
    },

    retryDownload: (id) => {
      const updated = get().items.map((i) =>
        i.id === id
          ? {
              ...i,
              status: 'downloading' as DownloadStatus,
              downloadedBytes: 0,
              progress: 0,
              error: undefined,
              speed: 25 * 1024 * 1024,
              speedFormatted: '25.0 MB/s',
              etaFormatted: formatEta(Math.round(i.totalBytes / (25 * 1024 * 1024))),
            }
          : i
      )
      set({ items: updated })
      saveDownloadsToStorage(updated)
      ensureTickerRunning(get, set)
    },

    deleteDownload: (id) => {
      const updated = get().items.filter((i) => i.id !== id)
      set({ items: updated })
      saveDownloadsToStorage(updated)
    },

    clearCompleted: () => {
      const updated = get().items.filter((i) => i.status !== 'completed' && i.status !== 'cancelled')
      set({ items: updated })
      saveDownloadsToStorage(updated)
    },

    pauseAll: () => {
      const updated = get().items.map((i) =>
        i.status === 'downloading'
          ? { ...i, status: 'paused' as DownloadStatus, speed: 0, speedFormatted: '0 MB/s', etaFormatted: 'Paused' }
          : i
      )
      set({ items: updated })
      saveDownloadsToStorage(updated)
    },

    resumeAll: () => {
      const updated = get().items.map((i) =>
        i.status === 'paused' || i.status === 'queued'
          ? {
              ...i,
              status: 'downloading' as DownloadStatus,
              speed: 25 * 1024 * 1024,
              speedFormatted: '25.0 MB/s',
              etaFormatted: formatEta(Math.round((i.totalBytes - i.downloadedBytes) / (25 * 1024 * 1024))),
            }
          : i
      )
      set({ items: updated })
      saveDownloadsToStorage(updated)
      ensureTickerRunning(get, set)
    },

    saveToDisk: (id) => {
      const item = get().items.find((i) => i.id === id)
      if (!item || !item.url) return

      try {
        const a = document.createElement('a')
        a.href = item.url
        const cleanName = `${item.title.replace(/[^\w\s.-]/g, '')}${
          item.subtitle ? ` - ${item.subtitle.replace(/[^\w\s.-]/g, '')}` : ''
        }.${item.url.includes('.mkv') ? 'mkv' : 'mp4'}`
        a.download = cleanName
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } catch (err) {
        console.warn('[download-store] saveToDisk direct anchor failed, opening URL:', err)
        window.open(item.url, '_blank')
      }
    },

    getItem: (id) => {
      return get().items.find((i) => i.id === id)
    },
  }
})
