import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  setCorsProxy,
  getCorsProxy,
  proxyUrl,
  fetchWithProxy,
  getFallbackProxies,
  setFallbackProxies,
  resetFallbackProxies,
} from '../utils/cors-proxy'

describe('CORS Proxy Resilience & Fallbacks (cors-proxy.ts)', () => {
  beforeEach(() => {
    setCorsProxy('')
    resetFallbackProxies()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Configuration & URL Formatting', () => {
    it('sets and gets custom CORS proxy URL', () => {
      expect(getCorsProxy()).toBe('')
      setCorsProxy('https://my-proxy.workers.dev/?url=')
      expect(getCorsProxy()).toBe('https://my-proxy.workers.dev/?url=')
    })

    it('formats proxy URLs with ?url= parameter correctly', () => {
      setCorsProxy('https://my-proxy.workers.dev/?url=')
      const target = 'https://vidsrc.xyz/movies/test.json'
      const proxied = proxyUrl(target)
      expect(proxied).toBe(`https://my-proxy.workers.dev/?url=${encodeURIComponent(target)}`)
    })

    it('formats proxy URLs with template placeholder %s', () => {
      const template = 'https://custom-proxy.io/fetch/%s'
      const target = 'https://api.simkl.com/sync/history'
      const proxied = proxyUrl(target, template)
      expect(proxied).toBe(`https://custom-proxy.io/fetch/${encodeURIComponent(target)}`)
    })

    it('formats proxy URLs with trailing slash', () => {
      const proxy = 'https://proxy.example.com/'
      const target = 'https://torrentio.strem.fun/manifest.json'
      const proxied = proxyUrl(target, proxy)
      expect(proxied).toBe(`https://proxy.example.com/${encodeURIComponent(target)}`)
    })

    it('returns raw target URL if no proxy is configured', () => {
      setCorsProxy('')
      const target = 'https://api.trakt.tv/shows'
      expect(proxyUrl(target)).toBe(target)
    })

    it('allows customizing fallback proxies list', () => {
      const initial = getFallbackProxies()
      expect(initial.length).toBeGreaterThan(0)

      setFallbackProxies(['https://fallback-1.com/?url=', 'https://fallback-2.com/?url='])
      expect(getFallbackProxies()).toEqual([
        'https://fallback-1.com/?url=',
        'https://fallback-2.com/?url=',
      ])

      resetFallbackProxies()
      expect(getFallbackProxies()).toEqual(initial)
    })
  })

  describe('Resilient fetchWithProxy Failover', () => {
    it('executes direct fetch successfully when no custom proxy is set', async () => {
      const mockResponse = new Response(JSON.stringify({ success: true }), { status: 200 })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse)

      const targetUrl = 'https://api.example.com/data'
      const response = await fetchWithProxy(targetUrl)

      expect(fetchSpy).toHaveBeenCalledWith(targetUrl, expect.any(Object))
      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.success).toBe(true)
    })

    it('uses custom proxy when configured', async () => {
      setCorsProxy('https://worker-proxy.dev/?url=')
      const mockResponse = new Response(JSON.stringify({ proxied: true }), { status: 200 })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse)

      const targetUrl = 'https://api.example.com/data'
      const response = await fetchWithProxy(targetUrl)

      expect(fetchSpy).toHaveBeenCalledWith(
        `https://worker-proxy.dev/?url=${encodeURIComponent(targetUrl)}`,
        expect.any(Object)
      )
      expect(response.status).toBe(200)
    })

    it('falls back to direct fetch if custom proxy throws a network error', async () => {
      setCorsProxy('https://failing-proxy.dev/?url=')
      const mockSuccess = new Response(JSON.stringify({ direct: true }), { status: 200 })

      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new TypeError('Failed to fetch')) // Proxy network failure
        .mockResolvedValueOnce(mockSuccess) // Direct fetch success

      const targetUrl = 'https://api.example.com/data'
      const response = await fetchWithProxy(targetUrl)

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.direct).toBe(true)
    })

    it('falls back to public worker proxy if both custom proxy and direct fetch fail', async () => {
      setCorsProxy('https://broken-proxy.dev/?url=')
      setFallbackProxies(['https://working-worker-proxy.dev/?url='])

      const mockWorkerSuccess = new Response(JSON.stringify({ worker: true }), { status: 200 })

      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new TypeError('CORS Error 1')) // custom proxy fails
        .mockRejectedValueOnce(new TypeError('CORS Error 2')) // direct fetch fails
        .mockResolvedValueOnce(mockWorkerSuccess) // fallback worker proxy succeeds

      const targetUrl = 'https://api.example.com/data'
      const response = await fetchWithProxy(targetUrl)

      expect(fetchSpy).toHaveBeenCalledTimes(3)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.worker).toBe(true)
    })

    it('falls back to next proxy candidate when encountering 502/503/504 Bad Gateway', async () => {
      setCorsProxy('https://bad-gateway-proxy.dev/?url=')
      setFallbackProxies(['https://healthy-worker-proxy.dev/?url='])

      const badGatewayResponse = new Response('Bad Gateway', { status: 502 })
      const directError = new TypeError('Direct CORS error')
      const healthyResponse = new Response(JSON.stringify({ healthy: true }), { status: 200 })

      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(badGatewayResponse) // custom proxy returns 502
        .mockRejectedValueOnce(directError) // direct fetch throws CORS error
        .mockResolvedValueOnce(healthyResponse) // healthy worker proxy succeeds

      const targetUrl = 'https://api.example.com/data'
      const response = await fetchWithProxy(targetUrl)

      expect(fetchSpy).toHaveBeenCalledTimes(3)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.healthy).toBe(true)
    })

    it('propagates abort signal immediately if caller cancels request', async () => {
      const abortController = new AbortController()
      abortController.abort()

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        return Promise.reject(error)
      })

      await expect(
        fetchWithProxy('https://example.com', { signal: abortController.signal })
      ).rejects.toThrow()

      // Should abort immediately without cycling all candidates
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })
})
