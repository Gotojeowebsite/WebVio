import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useDownloadStore,
  formatBytes,
  formatSpeed,
  formatEta,
  estimateStreamSize,
  parseSizeStringToBytes,
} from '../store/download-store'

describe('Download Store & Calculations', () => {
  beforeEach(() => {
    localStorage.clear()
    useDownloadStore.setState({
      items: [],
      activeTab: 'all',
      searchQuery: '',
    })
  })

  describe('Formatting Utilities', () => {
    it('formats bytes into appropriate units', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1024 * 1024 * 50)).toBe('50 MB')
      expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB')
    })

    it('formats speeds in KB/s and MB/s', () => {
      expect(formatSpeed(0)).toBe('0 MB/s')
      expect(formatSpeed(50 * 1024)).toBe('50.0 KB/s')
      expect(formatSpeed(25 * 1024 * 1024)).toBe('25.0 MB/s')
    })

    it('formats remaining ETA cleanly', () => {
      expect(formatEta(0)).toBe('0s')
      expect(formatEta(45)).toBe('45s')
      expect(formatEta(90)).toBe('1m 30s')
      expect(formatEta(3665)).toBe('1h 1m')
    })

    it('parses size strings to exact byte values', () => {
      expect(parseSizeStringToBytes('2.5 GB')).toBe(2.5 * 1024 * 1024 * 1024)
      expect(parseSizeStringToBytes('700 MB')).toBe(700 * 1024 * 1024)
      expect(parseSizeStringToBytes('1.2 TB')).toBe(1.2 * 1024 * 1024 * 1024 * 1024)
      expect(parseSizeStringToBytes('')).toBe(0)
    })

    it('estimates stream size accurately based on resolution if missing', () => {
      expect(estimateStreamSize({ quality: '4K' })).toBeGreaterThan(5 * 1024 * 1024 * 1024)
      expect(estimateStreamSize({ quality: '1080p' })).toBeGreaterThan(1.5 * 1024 * 1024 * 1024)
      expect(estimateStreamSize({ sizeBytes: 123456789 })).toBe(123456789)
    })
  })

  describe('Store Actions & Lifecycle', () => {
    const mockMeta = {
      id: 'tt1234567',
      name: 'Cyberpunk 2077: Edgerunners',
      type: 'series',
      poster: 'https://example.com/poster.jpg',
    }

    const mockVideo = {
      id: 'tt1234567:1:1',
      title: 'Episode 1',
      season: 1,
      episode: 1,
    }

    const mockStream = {
      url: 'https://example.com/stream.mp4',
      quality: '1080p',
      addonName: 'Torrentio',
      size: '1.8 GB',
    }

    it('adds a new download to queue and saves to localStorage', () => {
      const { addDownload } = useDownloadStore.getState()
      const id = addDownload(mockStream, mockMeta as any, mockVideo as any)

      expect(id).toBeDefined()
      const items = useDownloadStore.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('Cyberpunk 2077: Edgerunners')
      expect(items[0].subtitle).toContain('S1E1')
      expect(items[0].status).toBe('downloading')

      const saved = JSON.parse(localStorage.getItem('webvio_downloads') || '[]')
      expect(saved).toHaveLength(1)
      expect(saved[0].id).toBe(id)
    })

    it('pauses and resumes downloads', () => {
      const { addDownload, pauseDownload, resumeDownload } = useDownloadStore.getState()
      const id = addDownload(mockStream, mockMeta as any)

      pauseDownload(id)
      let item = useDownloadStore.getState().items.find((i) => i.id === id)
      expect(item?.status).toBe('paused')
      expect(item?.speedFormatted).toBe('0 MB/s')

      resumeDownload(id)
      item = useDownloadStore.getState().items.find((i) => i.id === id)
      expect(item?.status).toBe('downloading')
    })

    it('cancels, retries, and deletes downloads', () => {
      const { addDownload, cancelDownload, retryDownload, deleteDownload } =
        useDownloadStore.getState()
      const id = addDownload(mockStream, mockMeta as any)

      cancelDownload(id)
      let item = useDownloadStore.getState().items.find((i) => i.id === id)
      expect(item?.status).toBe('cancelled')

      retryDownload(id)
      item = useDownloadStore.getState().items.find((i) => i.id === id)
      expect(item?.status).toBe('downloading')
      expect(item?.progress).toBe(0)

      deleteDownload(id)
      expect(useDownloadStore.getState().items).toHaveLength(0)
    })

    it('clears completed downloads', () => {
      const { addDownload, clearCompleted } = useDownloadStore.getState()
      const id1 = addDownload(mockStream, mockMeta as any)
      const id2 = addDownload({ ...mockStream, url: 'https://example.com/other.mp4' }, {
        ...mockMeta,
        id: 'tt9999999',
        name: 'Dune',
      } as any)

      // Manually set item1 to completed
      useDownloadStore.setState((s) => ({
        items: s.items.map((i) => (i.id === id1 ? { ...i, status: 'completed' as const } : i)),
      }))

      clearCompleted()
      const items = useDownloadStore.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe(id2)
    })

    it('handles pauseAll and resumeAll', () => {
      const { addDownload, pauseAll, resumeAll } = useDownloadStore.getState()
      addDownload(mockStream, mockMeta as any)
      addDownload({ ...mockStream, url: 'https://example.com/other.mp4' }, {
        ...mockMeta,
        id: 'tt9999999',
        name: 'Dune',
      } as any)

      pauseAll()
      expect(useDownloadStore.getState().items.every((i) => i.status === 'paused')).toBe(true)

      resumeAll()
      expect(useDownloadStore.getState().items.every((i) => i.status === 'downloading')).toBe(true)
    })

    it('prevents duplicate downloads and resumes existing item if paused', () => {
      const { addDownload, pauseDownload } = useDownloadStore.getState()
      const id1 = addDownload(mockStream, mockMeta as any, mockVideo as any)
      pauseDownload(id1)
      expect(useDownloadStore.getState().items[0].status).toBe('paused')

      // Adding the exact same stream and video should return the existing ID and resume
      const id2 = addDownload(mockStream, mockMeta as any, mockVideo as any)
      expect(id2).toBe(id1)
      expect(useDownloadStore.getState().items).toHaveLength(1)
      expect(useDownloadStore.getState().items[0].status).toBe('downloading')
    })

    it('updates active tabs, search query, and retrieves items by ID', () => {
      const { addDownload, setActiveTab, setSearchQuery, getItem } = useDownloadStore.getState()
      const id = addDownload(mockStream, mockMeta as any)

      setActiveTab('active')
      expect(useDownloadStore.getState().activeTab).toBe('active')

      setSearchQuery('Cyberpunk')
      expect(useDownloadStore.getState().searchQuery).toBe('Cyberpunk')

      const found = getItem(id)
      expect(found).toBeDefined()
      expect(found?.title).toBe('Cyberpunk 2077: Edgerunners')
    })

    it('triggers saveToDisk anchor click safely', () => {
      const { addDownload, saveToDisk } = useDownloadStore.getState()
      const id = addDownload(mockStream, mockMeta as any)

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      saveToDisk(id)
      expect(clickSpy).toHaveBeenCalled()
      clickSpy.mockRestore()
    })
  })
})

