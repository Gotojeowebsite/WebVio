/**
 * Resilient CORS Proxy Utility
 * Provides multi-tier fallback proxies (custom user proxy, worker proxies, and direct fetch fallback)
 * to completely eliminate browser CORS restrictions when contacting Stremio addons, Simkl, and Debrid APIs.
 */

let customProxyUrl = ''

// Resilient public and Cloudflare Worker CORS proxies pool
const DEFAULT_FALLBACK_PROXIES = [
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/raw?url=',
]

let fallbackProxies: string[] = [...DEFAULT_FALLBACK_PROXIES]

/**
 * Configure the user's preferred custom CORS proxy
 */
export function setCorsProxy(url: string): void {
  customProxyUrl = url ? url.trim() : ''
}

/**
 * Get the currently configured custom CORS proxy
 */
export function getCorsProxy(): string {
  return customProxyUrl
}

/**
 * Get all available fallback proxies
 */
export function getFallbackProxies(): string[] {
  return [...fallbackProxies]
}

/**
 * Add or update the fallback proxies list
 */
export function setFallbackProxies(proxies: string[]): void {
  fallbackProxies = [...proxies]
}

/**
 * Reset fallback proxies to defaults
 */
export function resetFallbackProxies(): void {
  fallbackProxies = [...DEFAULT_FALLBACK_PROXIES]
}

/**
 * Formats a target URL using a given CORS proxy base
 */
export function proxyUrl(url: string, proxyBase?: string): string {
  const base = proxyBase !== undefined ? proxyBase : customProxyUrl
  if (!base) return url

  // Handle URL templates like https://proxy.example.com/?url=%s or https://proxy.example.com/?url=
  if (base.includes('%s')) {
    return base.replace('%s', encodeURIComponent(url))
  }
  if (base.endsWith('=') || base.endsWith('/')) {
    return `${base}${encodeURIComponent(url)}`
  }
  if (base.includes('?')) {
    return `${base}&url=${encodeURIComponent(url)}`
  }
  return `${base}?url=${encodeURIComponent(url)}`
}

/**
 * Resilient multi-tier fetch with automatic fallback across:
 * 1. User custom proxy (if configured)
 * 2. Direct fetch (if no proxy or as initial fast path)
 * 3. Public / Worker CORS fallback proxies
 */
export async function fetchWithProxy(
  url: string,
  options?: RequestInit,
  timeoutMs = 8000
): Promise<Response> {
  // Build ordered candidate sequence
  const candidates: { name: string; url: string }[] = []

  if (customProxyUrl) {
    candidates.push({ name: 'custom-proxy', url: proxyUrl(url, customProxyUrl) })
  }

  // Always include direct fetch candidate
  candidates.push({ name: 'direct', url })

  // Include fallback worker proxies
  for (let i = 0; i < fallbackProxies.length; i++) {
    const proxyBase = fallbackProxies[i]
    if (proxyBase !== customProxyUrl) {
      candidates.push({
        name: `fallback-proxy-${i + 1}`,
        url: proxyUrl(url, proxyBase),
      })
    }
  }

  let lastError: Error | null = null

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    // Chain caller's abort signal if provided
    let abortListener: (() => void) | null = null
    if (options?.signal) {
      abortListener = () => controller.abort()
      options.signal.addEventListener('abort', abortListener)
    }

    try {
      const fetchOptions: RequestInit = {
        ...options,
        signal: controller.signal,
      }

      const response = await fetch(candidate.url, fetchOptions)
      clearTimeout(timeoutId)
      if (options?.signal && abortListener) {
        options.signal.removeEventListener('abort', abortListener)
      }

      // If response is successful or a valid application-level HTTP status (400, 401, 403, 404),
      // we consider the proxy connection successful.
      // 502/503/504 Bad Gateway usually indicates proxy failure, so we retry next candidate if available.
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        if (i < candidates.length - 1) {
          continue
        }
      }

      return response
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (options?.signal && abortListener) {
        options.signal.removeEventListener('abort', abortListener)
      }

      lastError = err

      // If caller manually aborted, propagate immediately
      if (options?.signal?.aborted) {
        throw err
      }

      // Otherwise continue to next fallback candidate
      continue
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} through all CORS proxy fallbacks`)
}
