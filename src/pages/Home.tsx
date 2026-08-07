import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAddonStore } from '../store/addon-store'
import { useAuthStore } from '../store/auth-store'
import { AddonClient, MetaPreview } from '../api/addon-client'
import CatalogRow from '../components/catalog/CatalogRow'
import './home.css'

interface CatalogData {
  key: string
  title: string
  items: MetaPreview[]
  loading: boolean
}

export default function Home() {
  const { addons, loadFromStorage, loadAddonsFromNuvio } = useAddonStore()
  const { nuvioAccessToken, nuvioUserId, simklConnected, simklAccessToken, simklClientId } = useAuthStore()
  const [catalogs, setCatalogs] = useState<CatalogData[]>([])
  const [hero, setHero] = useState<MetaPreview | null>(null)
  const [continueWatching, setContinueWatching] = useState<MetaPreview[]>([])
  const [continueLoading, setContinueLoading] = useState(false)
  const navigate = useNavigate()
  const heroVideoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroItems, setHeroItems] = useState<MetaPreview[]>([])

  // Load addons on mount
  useEffect(() => {
    const init = async () => {
      await loadFromStorage()
      if (useAddonStore.getState().addons.length === 0 && nuvioAccessToken && nuvioUserId) {
        await loadAddonsFromNuvio(nuvioAccessToken, nuvioUserId)
      }
    }
    init()
  }, [nuvioAccessToken, nuvioUserId, loadFromStorage, loadAddonsFromNuvio])

  // Load Continue Watching: Simkl "watching" list + local progress fallback
  useEffect(() => {
    const loadContinueWatching = async () => {
      setContinueLoading(true)
      try {
        if (simklConnected && simklAccessToken && simklClientId) {
          // Fetch from Simkl — both shows and movies with "watching" status
          const { getAllItems } = await import('../api/simkl')

          const [showsData, moviesData] = await Promise.allSettled([
            getAllItems(simklClientId, simklAccessToken, 'shows'),
            getAllItems(simklClientId, simklAccessToken, 'movies'),
          ])

          const watching: MetaPreview[] = []

          if (showsData.status === 'fulfilled') {
            showsData.value
              .filter((item: any) => item.status === 'watching')
              .forEach((item: any) => {
                watching.push({
                  id: item.show?.ids?.imdb || `simkl-${item.show?.ids?.simkl}`,
                  type: 'series',
                  name: item.show?.title || 'Unknown',
                  poster: item.show?.poster
                    ? `https://simkl.in/posters/${item.show.poster}_m.webp`
                    : undefined,
                  year: item.show?.year,
                })
              })
          }

          if (moviesData.status === 'fulfilled') {
            moviesData.value
              .filter((item: any) => item.status === 'watching')
              .forEach((item: any) => {
                watching.push({
                  id: item.movie?.ids?.imdb || `simkl-${item.movie?.ids?.simkl}`,
                  type: 'movie',
                  name: item.movie?.title || 'Unknown',
                  poster: item.movie?.poster
                    ? `https://simkl.in/posters/${item.movie.poster}_m.webp`
                    : undefined,
                  year: item.movie?.year,
                })
              })
          }

          // Merge with local progress (local takes priority / appears first)
          const localProgress = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
          const localItems: MetaPreview[] = Object.values(localProgress)
            .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
            .slice(0, 10)
            .map((p: any) => ({
              id: p.meta.id,
              type: p.meta.type,
              name: p.meta.name,
              poster: p.meta.poster,
            }))

          // Merge: local first, then Simkl, deduplicate by id
          const seen = new Set<string>()
          const merged: MetaPreview[] = []
          for (const item of [...localItems, ...watching]) {
            if (item.id && !seen.has(item.id)) {
              seen.add(item.id)
              merged.push(item)
            }
          }

          setContinueWatching(merged)
        } else {
          // No Simkl — fall back to local progress only
          const progress = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
          const items: MetaPreview[] = Object.values(progress)
            .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
            .slice(0, 20)
            .map((p: any) => ({
              id: p.meta.id,
              type: p.meta.type,
              name: p.meta.name,
              poster: p.meta.poster,
            }))
          setContinueWatching(items)
        }
      } catch (err) {
        console.error('Failed to load continue watching:', err)
        // Graceful fallback to local
        const progress = JSON.parse(localStorage.getItem('webvio_progress') || '{}')
        const items: MetaPreview[] = Object.values(progress)
          .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
          .slice(0, 20)
          .map((p: any) => ({
            id: p.meta.id,
            type: p.meta.type,
            name: p.meta.name,
            poster: p.meta.poster,
          }))
        setContinueWatching(items)
      } finally {
        setContinueLoading(false)
      }
    }

    loadContinueWatching()
  }, [simklConnected, simklAccessToken, simklClientId])

  // Fetch catalogs from addons
  useEffect(() => {
    const enabledAddons = addons.filter(a => a.enabled)
    if (enabledAddons.length === 0) return

    const catalogEntries: CatalogData[] = []

    enabledAddons.forEach(addon => {
      const catalogsToFetch = (addon.manifest.catalogs || []).slice(0, 3)
      catalogsToFetch.forEach(cat => {
        const key = `${addon.manifest.id}:${cat.type}:${cat.id}`
        const title = cat.name || `${cat.type} - ${cat.id}`
        catalogEntries.push({ key, title: `${title} • ${addon.manifest.name}`, items: [], loading: true })
      })
    })

    setCatalogs(catalogEntries)

    const collected: MetaPreview[] = []

    enabledAddons.forEach(addon => {
      const client = new AddonClient(addon.manifestUrl)
      client.manifest = addon.manifest

      const catalogsToFetch = (addon.manifest.catalogs || []).slice(0, 3)
      catalogsToFetch.forEach(async (cat) => {
        const key = `${addon.manifest.id}:${cat.type}:${cat.id}`
        try {
          const result = await client.getCatalog(cat.type, cat.id)
          setCatalogs(prev => prev.map(c =>
            c.key === key ? { ...c, items: result.metas || [], loading: false } : c
          ))
          if (result.metas?.length > 0) {
            collected.push(...result.metas.slice(0, 5))
            setHeroItems(prev => {
              const next = [...prev, ...result.metas.slice(0, 5)]
              return next
            })
            setHero(prev => prev || result.metas[0])
          }
        } catch {
          setCatalogs(prev => prev.map(c =>
            c.key === key ? { ...c, loading: false } : c
          ))
        }
      })
    })
  }, [addons])

  // Auto-rotate hero every 8 seconds
  useEffect(() => {
    if (heroItems.length < 2) return
    if (heroVideoRef.current) clearInterval(heroVideoRef.current)
    heroVideoRef.current = setInterval(() => {
      setHeroIndex(prev => {
        const next = (prev + 1) % heroItems.length
        setHero(heroItems[next])
        return next
      })
    }, 8000)
    return () => {
      if (heroVideoRef.current) clearInterval(heroVideoRef.current)
    }
  }, [heroItems])

  const continueLabel = simklConnected
    ? '▶ Continue Watching  •  📊 Simkl'
    : '▶ Continue Watching'

  return (
    <div className="home-page">
      {/* Continue Watching — always at the very top */}
      {(continueWatching.length > 0 || continueLoading) && (
        <div className="continue-watching-section">
          <CatalogRow
            title={continueLabel}
            items={continueWatching}
            loading={continueLoading}
          />
        </div>
      )}

      {/* Hero Section */}
      {hero && (
        <div className="hero-section" style={{
          backgroundImage: hero.background ? `url(${hero.background})` : hero.poster ? `url(${hero.poster})` : 'none'
        }}>
          <div className="hero-gradient" />
          <div className="hero-content">
            <h1 className="hero-title">{hero.name}</h1>
            {hero.description && (
              <p className="hero-description">{hero.description.substring(0, 200)}...</p>
            )}
            <div className="hero-meta">
              {hero.year && <span>{hero.year}</span>}
              {hero.imdbRating && <span>⭐ {hero.imdbRating}</span>}
              {hero.genres?.slice(0, 3).map(g => (
                <span key={g} className="badge">{g}</span>
              ))}
            </div>
            <div className="hero-actions">
              <button className="btn btn-primary btn-lg" onClick={() => navigate(`/detail/${hero.type}/${encodeURIComponent(hero.id)}`)}>
                ▶ Play
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => navigate(`/detail/${hero.type}/${encodeURIComponent(hero.id)}`)}>
                ℹ️ More Info
              </button>
            </div>
          </div>
          {/* Hero dot indicators */}
          {heroItems.length > 1 && (
            <div className="hero-dots">
              {heroItems.slice(0, 8).map((_, i) => (
                <button
                  key={i}
                  className={`hero-dot ${i === heroIndex ? 'hero-dot-active' : ''}`}
                  onClick={() => {
                    setHeroIndex(i)
                    setHero(heroItems[i])
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="home-catalogs">
        {catalogs.map(cat => (
          <CatalogRow
            key={cat.key}
            title={cat.title}
            items={cat.items}
            loading={cat.loading}
          />
        ))}

        {addons.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-icon">🧩</p>
            <h2>No addons installed</h2>
            <p>Go to Settings to login with Nuvio and load your addons</p>
            <button className="btn btn-primary" onClick={() => navigate('/settings')}>
              Go to Settings
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
