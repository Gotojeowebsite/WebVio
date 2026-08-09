import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StreamEngine, EngineMetricsTracker } from '../engine'

describe('StreamEngine & Metrics', () => {
  let videoEl: HTMLVideoElement

  beforeEach(() => {
    videoEl = document.createElement('video')
    vi.spyOn(videoEl, 'play').mockImplementation(async () => {})
    vi.spyOn(videoEl, 'pause').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('EngineMetricsTracker', () => {
    it('should track buffer health, bandwidth, and chunk downloads', () => {
      const tracker = new EngineMetricsTracker()
      tracker.attach(videoEl, 'native')
      tracker.onLoadStart()

      // Simulate chunk download: 1MB in 200ms
      tracker.recordChunkDownload(1024 * 1024, 200)

      const metrics = tracker.getMetrics()
      expect(metrics.activePipeline).toBe('native')
      expect(metrics.bufferHealthSeconds).toBe(0)
      expect(metrics.bandwidthBps).toBeGreaterThan(0)

      tracker.detach()
    })

    it('should calculate seek latency on seeked event', () => {
      const tracker = new EngineMetricsTracker()
      tracker.attach(videoEl, 'native')

      videoEl.dispatchEvent(new Event('seeking'))
      videoEl.dispatchEvent(new Event('seeked'))

      const metrics = tracker.getMetrics()
      expect(metrics.seekLatencyMs).toBeGreaterThanOrEqual(0)

      tracker.detach()
    })
  })

  describe('StreamEngine Master Orchestrator', () => {
    it('should mount native Turbo Mode for direct MP4 stream', async () => {
      const engine = new StreamEngine({ turboMode: true })
      engine.attach(videoEl)

      await engine.load({
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      })

      expect(engine.getActivePipeline()).toBe('native')
      expect(videoEl.src).toContain('BigBuckBunny.mp4')

      await engine.destroy()
    })

    it('should select HLS pipeline for .m3u8 URLs', async () => {
      const engine = new StreamEngine()
      engine.attach(videoEl)

      await engine.load({
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      })

      expect(engine.getActivePipeline()).toBe('hls')
      await engine.destroy()
    })

    it('should select DASH pipeline for .mpd URLs', async () => {
      const engine = new StreamEngine({ autoFallback: false })
      engine.attach(videoEl)

      const pipelineChanged = vi.fn()
      engine.on('pipelineChanged', pipelineChanged)

      try {
        await engine.load({
          url: 'https://dash.akamaized.net/envivio/EnvivioDash3/manifest.mpd',
          format: 'dash',
        })
      } catch {
        // Expected in JSDOM mock environment
      }

      expect(pipelineChanged).toHaveBeenCalledWith('dash')
      await engine.destroy()
    })

    it('should select WebTorrent pipeline for magnet URLs', async () => {
      const engine = new StreamEngine({ autoFallback: false })
      engine.attach(videoEl)

      const pipelineChanged = vi.fn()
      engine.on('pipelineChanged', pipelineChanged)

      try {
        await engine.load({
          url: 'magnet:?xt=urn:btih:08ada5a7a6183aae1e0902d1399',
        })
      } catch {
        // Expected in JSDOM mock
      }

      expect(pipelineChanged).toHaveBeenCalledWith('webtorrent')
      await engine.destroy()
    })

    it('should select FFmpeg fallback for unsupported MKV files', async () => {
      const engine = new StreamEngine({ autoFallback: false })
      engine.attach(videoEl)

      const pipelineChanged = vi.fn()
      engine.on('pipelineChanged', pipelineChanged)

      try {
        await engine.load({
          url: 'https://example.com/unsupported_video.mkv',
        })
      } catch {
        // Expected in JSDOM mock
      }

      expect(pipelineChanged).toHaveBeenCalledWith('ffmpeg-fallback')
      await engine.destroy()
    })

    it('should emit status changes during playback control', async () => {
      const engine = new StreamEngine()
      engine.attach(videoEl)

      const statuses: string[] = []
      engine.on('statusChange', (s) => statuses.push(s))

      await engine.load('https://example.com/test.mp4')
      expect(statuses).toContain('initializing')

      videoEl.dispatchEvent(new Event('play'))
      expect(statuses).toContain('playing')

      videoEl.dispatchEvent(new Event('pause'))
      expect(statuses).toContain('paused')

      await engine.destroy()
      expect(statuses).toContain('destroyed')
    })

    it('should handle play, pause, and seek lifecycle controls', async () => {
      const engine = new StreamEngine({ turboMode: true })
      engine.attach(videoEl)

      await engine.load('https://example.com/test.mp4')

      await engine.play()
      expect(videoEl.play).toHaveBeenCalled()

      engine.pause()
      expect(videoEl.pause).toHaveBeenCalled()

      engine.seek(120)
      expect(videoEl.currentTime).toBe(120)

      engine.detach()
      await engine.destroy()
      expect(engine.getActivePipeline()).toBeNull()
    })

    it('should support subscribing and unsubscribing from engine events', () => {
      const engine = new StreamEngine()
      const listener = vi.fn()

      engine.on('statusChange', listener)
      engine.emit('statusChange', 'playing')
      expect(listener).toHaveBeenCalledWith('playing')

      engine.off('statusChange', listener)
      engine.emit('statusChange', 'paused')
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })
})
