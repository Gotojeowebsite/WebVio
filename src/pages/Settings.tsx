import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/auth-store'
import { useAddonStore } from '../store/addon-store'

export default function Settings() {
  const {
    nuvioEmail, nuvioLoggedIn, nuvioAccessToken,
    torboxApiKey, torboxConnected, torboxUser,
    simklAccessToken, simklConnected, simklUser, simklClientId, simklClientSecret,
    traktAccessToken, traktConnected, traktUser, traktClientId,
    corsProxyUrl,
    clearNuvioAuth, setTorboxAuth, clearTorboxAuth,
    setSimklAuth, clearSimklAuth, setSimklClientId, setSimklClientSecret,
    setTraktAuth, clearTraktAuth,
    setCorsProxyUrl, setTraktClientId,
  } = useAuthStore()

  const { addons, removeAddon, toggleAddon, addAddonByUrl, moveAddonUp, moveAddonDown, reorderAddons } = useAddonStore()

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [torboxKeyInput, setTorboxKeyInput] = useState(torboxApiKey || '')
  const [corsInput, setCorsInput] = useState(corsProxyUrl)
  const [simklIdInput, setSimklIdInput] = useState(simklClientId)
  const [simklSecretInput, setSimklSecretInput] = useState(simklClientSecret)
  const [traktIdInput, setTraktIdInput] = useState(traktClientId)
  const [addonUrlInput, setAddonUrlInput] = useState('')
  const [addonLoading, setAddonLoading] = useState(false)
  const [torboxLoading, setTorboxLoading] = useState(false)
  const [simklLoading, setSimklLoading] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [message])

  // Handle Simkl OAuth callback: ?code=...
  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    // Only handle if it looks like a Simkl callback (not Trakt)
    if (!code || state) return
    if (simklConnected) return

    const storedClientId = useAuthStore.getState().simklClientId
    const storedSecret = useAuthStore.getState().simklClientSecret
    if (!storedClientId || !storedSecret) return

    setSimklLoading(true)
    ;(async () => {
      try {
        const { exchangeCode, getUser } = await import('../api/simkl')
        const redirectUri = window.location.origin + '/settings'
        const token = await exchangeCode(storedClientId, storedSecret, code, redirectUri)
        const user = await getUser(storedClientId, token)
        setSimklAuth(token, user)
        setMessage({ text: '✅ Simkl connected!', type: 'success' })
      } catch (err) {
        console.error('Simkl OAuth error:', err)
        setMessage({ text: 'Simkl connection failed. Check your Client Secret.', type: 'error' })
      } finally {
        setSimklLoading(false)
        // Clean the code out of the URL
        navigate('/settings', { replace: true })
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTorboxConnect = async () => {
    if (!torboxKeyInput.trim()) return
    setTorboxLoading(true)
    try {
      const { validateApiKey } = await import('../api/torbox')
      const user = await validateApiKey(torboxKeyInput.trim())
      setTorboxAuth(torboxKeyInput.trim(), user)
      setMessage({ text: 'TorBox connected!', type: 'success' })
    } catch (err) {
      setMessage({ text: 'Invalid TorBox API key', type: 'error' })
    } finally {
      setTorboxLoading(false)
    }
  }

  const handleAddAddon = async () => {
    if (!addonUrlInput.trim()) return
    setAddonLoading(true)
    try {
      await addAddonByUrl(addonUrlInput.trim())
      setAddonUrlInput('')
      setMessage({ text: 'Addon added!', type: 'success' })
    } catch (err) {
      setMessage({ text: 'Failed to add addon. Check the URL.', type: 'error' })
    } finally {
      setAddonLoading(false)
    }
  }

  const handleLogout = () => {
    clearNuvioAuth()
    window.location.href = '/login'
  }

  return (
    <div className="page settings-page">
      <h1 className="page-title">Settings</h1>

      {message && (
        <div className={`toast toast-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Nuvio Account */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">⚡</span>
          Nuvio Account
        </h2>
        <div className="card-glass settings-card">
          <div className="settings-row">
            <div>
              <p className="settings-label">Logged in as</p>
              <p className="settings-value">{nuvioEmail || 'Not logged in'}</p>
            </div>
            {nuvioLoggedIn && (
              <button className="btn-secondary" onClick={handleLogout}>
                Logout
              </button>
            )}
          </div>
          {nuvioAccessToken && (
            <div className="settings-row">
              <div>
                <p className="settings-label">Access Token</p>
                <p className="settings-value mono" style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                  {nuvioAccessToken.substring(0, 12)}...
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* TorBox */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">📦</span>
          TorBox
          {torboxConnected && <span className="badge badge-success">Connected</span>}
          <span className="settings-subtitle">Optional — needed for torrent streams</span>
        </h2>
        <div className="card-glass settings-card">
          <div className="settings-row">
            <input
              type="password"
              className="input"
              placeholder="TorBox API Key"
              value={torboxKeyInput}
              onChange={(e) => setTorboxKeyInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn-primary"
              onClick={handleTorboxConnect}
              disabled={torboxLoading}
            >
              {torboxLoading ? 'Connecting...' : torboxConnected ? 'Update' : 'Connect'}
            </button>
            {torboxConnected && (
              <button className="btn-ghost" onClick={clearTorboxAuth}>
                Disconnect
              </button>
            )}
          </div>
          {torboxUser && (
            <div className="settings-row">
              <p className="settings-value">
                Plan: {torboxUser.plan || 'Free'} • 
                Email: {torboxUser.email || 'N/A'}
              </p>
            </div>
          )}
          <p className="settings-help">
            Get your API key from{' '}
            <a href="https://torbox.app/settings" target="_blank" rel="noopener noreferrer">
              torbox.app/settings → Integrations
            </a>
          </p>
        </div>
      </section>

      {/* Simkl */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">📊</span>
          Simkl Tracking
          {simklConnected && <span className="badge badge-success">Connected</span>}
          {simklLoading && <span className="badge">Connecting...</span>}
          <span className="settings-subtitle">Optional — for watch history tracking</span>
        </h2>
        <div className="card-glass settings-card">
          {!simklConnected && (
            <>
              <div className="settings-row">
                <input
                  type="text"
                  className="input"
                  placeholder="Simkl Client ID"
                  value={simklIdInput}
                  onChange={(e) => setSimklIdInput(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              <div className="settings-row">
                <input
                  type="password"
                  className="input"
                  placeholder="Simkl Client Secret"
                  value={simklSecretInput}
                  onChange={(e) => setSimklSecretInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-secondary"
                  onClick={() => {
                    if (!simklIdInput.trim() || !simklSecretInput.trim()) {
                      setMessage({ text: 'Enter both Client ID and Client Secret', type: 'error' })
                      return
                    }
                    setSimklClientId(simklIdInput.trim())
                    setSimklClientSecret(simklSecretInput.trim())
                    setMessage({ text: 'Simkl credentials saved', type: 'success' })
                  }}
                >
                  Save
                </button>
              </div>
              {simklClientId && simklClientSecret && (
                <div className="settings-row">
                  <button
                    className="btn-primary"
                    disabled={simklLoading}
                    onClick={async () => {
                      const { getAuthUrl } = await import('../api/simkl')
                      const url = getAuthUrl(
                        simklClientId,
                        window.location.origin + '/settings'
                      )
                      window.location.href = url
                    }}
                  >
                    {simklLoading ? 'Connecting...' : 'Connect with Simkl'}
                  </button>
                </div>
              )}
            </>
          )}
          {simklConnected && simklUser && (
            <div className="settings-row">
              <p className="settings-value">
                Connected as: {simklUser.username || simklUser.name || 'User'}
              </p>
              <button className="btn-ghost" onClick={clearSimklAuth}>
                Disconnect
              </button>
            </div>
          )}
          <p className="settings-help">
            Create an app at{' '}
            <a href="https://simkl.com/settings/developer/new/" target="_blank" rel="noopener noreferrer">
              simkl.com/settings/developer/new
            </a>
            {' '}and set the Redirect URI to{' '}
            <code style={{ fontSize: '0.8em', background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '4px' }}>
              {window.location.origin}/settings
            </code>
          </p>
        </div>
      </section>

      {/* Trakt */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">📺</span>
          Trakt Tracking
          {traktConnected && <span className="badge badge-success">Connected</span>}
          <span className="settings-subtitle">Optional — for watch history tracking</span>
        </h2>
        <div className="card-glass settings-card">
          <div className="settings-row">
            <input
              type="text"
              className="input"
              placeholder="Trakt Client ID"
              value={traktIdInput}
              onChange={(e) => setTraktIdInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn-secondary"
              onClick={() => {
                setTraktClientId(traktIdInput.trim())
                setMessage({ text: 'Trakt Client ID saved', type: 'success' })
              }}
            >
              Save
            </button>
          </div>
          {traktClientId && !traktConnected && (
            <div className="settings-row">
              <button
                className="btn-primary"
                onClick={async () => {
                  const { getTraktAuthUrl } = await import('../api/trakt')
                  const url = getTraktAuthUrl(
                    traktClientId,
                    window.location.origin + '/settings'
                  )
                  window.location.href = url
                }}
              >
                Connect with Trakt
              </button>
            </div>
          )}
          {traktConnected && traktUser && (
            <div className="settings-row">
              <p className="settings-value">
                Connected as: {traktUser.username || traktUser.name || 'User'}
              </p>
              <button className="btn-ghost" onClick={clearTraktAuth}>
                Disconnect
              </button>
            </div>
          )}
          <p className="settings-help">
            Get your Client ID from{' '}
            <a href="https://trakt.tv/oauth/applications" target="_blank" rel="noopener noreferrer">
              trakt.tv/oauth/applications
            </a>
          </p>
        </div>
      </section>

      {/* CORS Proxy */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">🔗</span>
          CORS Proxy
          <span className="settings-subtitle">Required if addons block browser requests</span>
        </h2>
        <div className="card-glass settings-card">
          <div className="settings-row">
            <input
              type="text"
              className="input"
              placeholder="https://your-cors-proxy.workers.dev/?url="
              value={corsInput}
              onChange={(e) => setCorsInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn-secondary"
              onClick={() => {
                setCorsProxyUrl(corsInput.trim())
                setMessage({ text: 'CORS proxy URL saved', type: 'success' })
              }}
            >
              Save
            </button>
          </div>
          <p className="settings-help">
            If addons fail to load, you may need a CORS proxy. You can deploy a free one on Cloudflare Workers.
          </p>
        </div>
      </section>

      {/* Addon Manager */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">🧩</span>
          Installed Addons
          <span className="badge">{addons.length}</span>
        </h2>
        <div className="card-glass settings-card">
          <div className="settings-row">
            <input
              type="text"
              className="input"
              placeholder="Addon manifest URL (https://...manifest.json)"
              value={addonUrlInput}
              onChange={(e) => setAddonUrlInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn-primary"
              onClick={handleAddAddon}
              disabled={addonLoading}
            >
              {addonLoading ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>

        <div className="addon-list">
          {addons.map((addon, index) => (
            <div
              key={addon.manifestUrl}
              draggable
              onDragStart={() => setDraggedIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggedIndex !== null && draggedIndex !== index) {
                  reorderAddons(draggedIndex, index)
                  setDraggedIndex(null)
                }
              }}
              className={`card-glass addon-item ${!addon.enabled ? 'addon-disabled' : ''} ${draggedIndex === index ? 'dragging' : ''}`}
            >
              <div className="drag-handle" title="Drag to reorder" style={{ cursor: 'grab', padding: '0 8px', opacity: 0.5, fontSize: '1.2rem' }}>
                ⋮⋮
              </div>
              <div className="addon-info">
                {addon.manifest.logo && (
                  <img
                    src={addon.manifest.logo}
                    alt={addon.manifest.name}
                    className="addon-logo"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <div>
                  <h4 className="addon-name">{addon.manifest.name}</h4>
                  <p className="addon-description">
                    {addon.manifest.description?.substring(0, 100)}
                  </p>
                  <div className="addon-badges">
                    {addon.manifest.types.map(t => (
                      <span key={t} className="badge badge-small">{t}</span>
                    ))}
                    <span className="badge badge-small">v{addon.manifest.version}</span>
                  </div>
                </div>
              </div>
              <div className="addon-actions">
                <button
                  className="btn-ghost"
                  onClick={() => moveAddonUp(index)}
                  disabled={index === 0}
                  title="Move Up"
                  style={{ opacity: index === 0 ? 0.3 : 1 }}
                >
                  ▲
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => moveAddonDown(index)}
                  disabled={index === addons.length - 1}
                  title="Move Down"
                  style={{ opacity: index === addons.length - 1 ? 0.3 : 1 }}
                >
                  ▼
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => toggleAddon(addon.manifestUrl)}
                >
                  {addon.enabled ? '✅' : '❌'}
                </button>
                <button
                  className="btn-ghost btn-danger"
                  onClick={() => removeAddon(addon.manifestUrl)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
          {addons.length === 0 && (
            <p className="settings-help" style={{ textAlign: 'center', padding: '2rem' }}>
              No addons installed. Login with Nuvio to load your addons, or add one manually above.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
