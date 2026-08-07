import { useState, useEffect } from 'react'
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
  const { nuvioAccessToken, nuvioUserId } = useAuthStore()
  const [catalogs, setCatalogs] = useState<CatalogData[]>([])
  const [hero, setHero] = useState<MetaPreview | null>(null)
  const [continueWatching, setContinueWatching] = useState<MetaPreview[]>([])
  const navigate = useNavigate()

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

  // Load continue watching from localStorage
  useEffect(() => {
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
  }, [])

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

  return (
    <div className="home-page">
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
        </div>
      )}

      <div className="home-catalogs">
        {continueWatching.length > 0 && (
          <CatalogRow title="Continue Watching" items={continueWatching} />
        )}

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
