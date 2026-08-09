import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Zap,
  Package,
  BarChart2,
  Link as LinkIcon,
  Blocks,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  Trash2,
  GripVertical,
  Loader2,
  RefreshCw,
  Clock,
  Cloud,
  Info,
  ShieldCheck,
  Palette,
  MonitorPlay,
  RotateCcw,
} from 'lucide-react'
import { useAuthStore } from '../store/auth-store'
import { useAddonStore } from '../store/addon-store'
import { Toast } from '../components/ui/Toast'

const QUICK_ADDON_PRESETS = [
  { name: 'Cinemeta Catalog', url: 'https://v3-cinemeta.strem.io/manifest.json', desc: 'Movies & TV shows metadata' },
  { name: 'Anime Kitsu', url: 'https://anime-kitsu.strem.fun/manifest.json', desc: 'Anime library & trending catalogs' },
  { name: 'OpenSubtitles v3', url: 'https://opensubtitles-v3.strem.io/manifest.json', desc: 'Multi-language subtitles' },
  { name: 'Torrentio Streams', url: 'https://torrentio.strem.fun/manifest.json', desc: 'Torrent & debrid streams provider' },
  { name: 'MediaFusion', url: 'https://mediafusion.elfhosted.com/manifest.json', desc: 'High-speed live & VOD streams' },
]

export default function Settings() {
  const {
    nuvioEmail,
    nuvioLoggedIn,
    nuvioAccessToken,
    torboxApiKey,
    torboxConnected,
    torboxUser,
    simklConnected,
    simklUser,
    simklClientId,
    simklClientSecret,
    lastSimklSync,
    isSyncingSimkl,
    simklSyncQueueLength,
    syncSimklHistory,
    processOfflineQueue,
    corsProxyUrl,
    clearNuvioAuth,
    setTorboxAuth,
    clearTorboxAuth,
    setSimklAuth,
    clearSimklAuth,
    setSimklClientId,
    setSimklClientSecret,
    setCorsProxyUrl,
  } = useAuthStore()

  const {
    addons,
    removeAddon,
    toggleAddon,
    addAddonByUrl,
    moveAddonUp,
    moveAddonDown,
    reorderAddons,
  } = useAddonStore()

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Form Inputs
  const [torboxKeyInput, setTorboxKeyInput] = useState(torboxApiKey || '')
  const [corsInput, setCorsInput] = useState(corsProxyUrl || '')
  const [simklIdInput, setSimklIdInput] = useState(simklClientId || '')
  const [simklSecretInput, setSimklSecretInput] = useState(simklClientSecret || '')
  const [addonUrlInput, setAddonUrlInput] = useState('')

  // Preference States
  const [homeLayout, setHomeLayout] = useState(() => localStorage.getItem('webvio_home_layout') || 'rows')
  const [accentTheme, setAccentTheme] = useState(() => localStorage.getItem('webvio_accent_theme') || 'violet')
  const [defaultQuality, setDefaultQuality] = useState(() => localStorage.getItem('webvio_default_quality') || 'auto')
  const [autoplayNext, setAutoplayNext] = useState(() => localStorage.getItem('webvio_autoplay_next') !== 'false')
  const [hwAcceleration, setHwAcceleration] = useState(() => localStorage.getItem('webvio_hw_accel') !== 'false')

  // Loading States
  const [addonLoading, setAddonLoading] = useState(false)
  const [torboxLoading, setTorboxLoading] = useState(false)
  const [simklLoading, setSimklLoading] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [addonAnnouncement, setAddonAnnouncement] = useState('')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)


  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3500)
      return () => clearTimeout(timer)
    }
  }, [message])

  // Handle Simkl OAuth callback
  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (!code || state || simklConnected) return

    const storedClientId =
      useAuthStore.getState().simklClientId ||
      localStorage.getItem('webvio_simkl_clientId') ||
      simklIdInput.trim()
    const storedSecret =
      useAuthStore.getState().simklClientSecret ||
      localStorage.getItem('webvio_simkl_clientSecret') ||
      simklSecretInput.trim()

    if (!storedClientId || !storedSecret) {
      setMessage({
        text: 'Simkl credentials missing. Please enter Client ID & Secret and click Connect.',
        type: 'error',
      })
      navigate('/settings', { replace: true })
      return
    }

    setSimklLoading(true)
    ;(async () => {
      try {
        const { exchangeCode, getUser } = await import('../api/simkl')
        const redirectUri = window.location.origin + '/settings'
        const token = await exchangeCode(storedClientId, storedSecret, code, redirectUri)
        if (!token) throw new Error('No access token received from Simkl')
        const user = await getUser(storedClientId, token)
        setSimklAuth(token, user)
        setMessage({ text: 'Simkl successfully connected & synchronized!', type: 'success' })
      } catch (err: any) {
        console.error('Simkl OAuth error:', err)
        setMessage({
          text: `Simkl error: ${err.message || 'Check Client Secret and Redirect URI'}`,
          type: 'error',
        })
      } finally {
        setSimklLoading(false)
        navigate('/settings', { replace: true })
      }
    })()
  }, [searchParams, simklConnected, simklIdInput, simklSecretInput, setSimklAuth, navigate])

  const handleTorboxConnect = async () => {
    if (!torboxKeyInput.trim()) return
    setTorboxLoading(true)
    try {
      const { validateApiKey } = await import('../api/torbox')
      const user = await validateApiKey(torboxKeyInput.trim())
      setTorboxAuth(torboxKeyInput.trim(), user)
      setMessage({ text: 'TorBox debrid successfully connected!', type: 'success' })
    } catch {
      setMessage({ text: 'Invalid TorBox API key. Check key and try again.', type: 'error' })
    } finally {
      setTorboxLoading(false)
    }
  }

  const handleAddAddon = async (urlToAdd?: string) => {
    const targetUrl = (urlToAdd || addonUrlInput).trim()
    if (!targetUrl) return
    setAddonLoading(true)
    try {
      await addAddonByUrl(targetUrl)
      if (!urlToAdd) setAddonUrlInput('')
      setMessage({ text: 'Addon successfully installed!', type: 'success' })
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to add addon. Check manifest URL.', type: 'error' })
    } finally {
      setAddonLoading(false)
    }
  }

  const handleSaveHomeLayout = (val: string) => {
    setHomeLayout(val)
    localStorage.setItem('webvio_home_layout', val)
    setMessage({ text: `Home layout updated to ${val === 'rows' ? 'Cinematic Rows' : 'Dense Poster Grid'}`, type: 'success' })
  }

  const handleSaveDefaultQuality = (val: string) => {
    setDefaultQuality(val)
    localStorage.setItem('webvio_default_quality', val)
    setMessage({ text: `Preferred quality set to ${val}`, type: 'success' })
  }

  const handleToggleAutoplay = () => {
    const next = !autoplayNext
    setAutoplayNext(next)
    localStorage.setItem('webvio_autoplay_next', String(next))
    setMessage({ text: `Autoplay next episode ${next ? 'enabled' : 'disabled'}`, type: 'success' })
  }

  const handleToggleHwAccel = () => {
    const next = !hwAcceleration
    setHwAcceleration(next)
    localStorage.setItem('webvio_hw_accel', String(next))
    setMessage({ text: `Hardware acceleration ${next ? 'enabled' : 'disabled'}`, type: 'success' })
  }

  const handleClearCache = () => {
    localStorage.removeItem('webvio_search_history')
    localStorage.removeItem('webvio_simkl_history_cache')
    setMessage({ text: 'Local query cache and search history cleared!', type: 'success' })
  }

  const handleLogout = () => {
    clearNuvioAuth()
    window.location.href = '/login'
  }

  return (
    <div className="page settings-page">
      <div className="settings-header-banner">
        <h1 className="page-title" style={{ margin: 0 }}>
          System Settings & Preferences
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Manage your Windows Nuvio desktop experience, player engine, debrid debrid services, and streaming addons
        </p>
      </div>

      {message && (
        <div className="toast-container">
          <Toast message={message.text} variant={message.type} onClose={() => setMessage(null)} />
        </div>
      )}

      {/* ── 1. Theme & Layout Preferences ─────────────────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">
            <Palette size={20} aria-hidden="true" />
          </span>
          <span>Theme & Feed Layout</span>
        </h2>
        <div className="card-glass settings-card">
          <div className="settings-row" style={{ justifyContent: 'space-between' }}>
            <div>
              <p className="settings-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Home Feed Layout
              </p>
              <p className="settings-help" style={{ margin: 0 }}>
                Choose between fluid horizontal carousels or dense multi-column poster grid
              </p>
            </div>
            <select
              className="input"
              style={{ width: '220px' }}
              value={homeLayout}
              onChange={(e) => handleSaveHomeLayout(e.target.value)}
              aria-label="Home feed layout preference"
            >
              <option value="rows">Cinematic Horizontal Rows</option>
              <option value="grid">Dense Multi-Column Grid</option>
            </select>
          </div>

          <div className="settings-row" style={{ justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <p className="settings-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Accent Color Theme
              </p>
              <p className="settings-help" style={{ margin: 0 }}>
                Customize the Windows Nuvio UI highlights and glowing badges
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { id: 'violet', label: 'Violet', color: '#8b5cf6' },
                { id: 'magenta', label: 'Magenta', color: '#ec4899' },
                { id: 'blue', label: 'Ocean Blue', color: '#3b82f6' },
                { id: 'emerald', label: 'Emerald', color: '#10b981' },
              ].map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => {
                    setAccentTheme(theme.id)
                    localStorage.setItem('webvio_accent_theme', theme.id)
                  }}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: theme.color,
                    border: accentTheme === theme.id ? '2px solid #fff' : '2px solid transparent',
                    cursor: 'pointer',
                    boxShadow: accentTheme === theme.id ? `0 0 12px ${theme.color}` : 'none',
                  }}
                  title={theme.label}
                  aria-label={theme.label}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Player Preferences ─────────────────────────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">
            <MonitorPlay size={20} aria-hidden="true" />
          </span>
          <span>Playback & Video Engine</span>
        </h2>
        <div className="card-glass settings-card">
          <div className="settings-row" style={{ justifyContent: 'space-between' }}>
            <div>
              <p className="settings-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Preferred Stream Quality
              </p>
              <p className="settings-help" style={{ margin: 0 }}>
                Default quality resolution chosen when launching streams
              </p>
            </div>
            <select
              className="input"
              style={{ width: '180px' }}
              value={defaultQuality}
              onChange={(e) => handleSaveDefaultQuality(e.target.value)}
              aria-label="Preferred stream quality"
            >
              <option value="auto">Auto (Best Match)</option>
              <option value="4K">4K UHD</option>
              <option value="1080p">1080p FHD</option>
              <option value="720p">720p HD</option>
            </select>
          </div>

          <div className="settings-row" style={{ justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <p className="settings-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Autoplay Next Episode
              </p>
              <p className="settings-help" style={{ margin: 0 }}>
                Automatically play the next episode when the current one finishes
              </p>
            </div>
            <button
              type="button"
              className={`btn ${autoplayNext ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleToggleAutoplay}
            >
              {autoplayNext ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div className="settings-row" style={{ justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <p className="settings-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Hardware Acceleration
              </p>
              <p className="settings-help" style={{ margin: 0 }}>
                Leverage GPU WebCodecs and MSE hardware decoding for high-bitrate video
              </p>
            </div>
            <button
              type="button"
              className={`btn ${hwAcceleration ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleToggleHwAccel}
            >
              {hwAcceleration ? 'Active' : 'Disabled'}
            </button>
          </div>
        </div>
      </section>

      {/* ── 3. Nuvio Account ──────────────────────────────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">
            <Zap size={20} aria-hidden="true" />
          </span>
          <span>Nuvio Account Sync</span>
          {nuvioLoggedIn ? (
            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span className="status-dot connected" /> Connected
            </span>
          ) : (
            <span className="badge">Disconnected</span>
          )}
        </h2>
        <div className={`card-glass settings-card ${nuvioLoggedIn ? 'state-connected' : 'state-disconnected'}`}>
          <div className="settings-row">
            <div style={{ flex: 1 }}>
              <p className="settings-label">Account Email</p>
              <p className="settings-value" style={{ fontWeight: 600 }}>{nuvioEmail || 'Not logged in'}</p>
            </div>
            {nuvioLoggedIn ? (
              <button className="btn-secondary" onClick={handleLogout}>
                Logout / Disconnect
              </button>
            ) : (
              <button className="btn-primary" onClick={() => navigate('/login')}>
                Connect Nuvio Account
              </button>
            )}
          </div>
          {nuvioAccessToken && (
            <div className="settings-row" style={{ paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
              <div>
                <p className="settings-label">Session Access Token</p>
                <p className="settings-value mono" style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                  {nuvioAccessToken.substring(0, 16)}...
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 4. TorBox Debrid ──────────────────────────────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">
            <Package size={20} aria-hidden="true" />
          </span>
          <span>TorBox Debrid</span>
          {torboxConnected ? (
            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span className="status-dot connected" /> Connected
            </span>
          ) : torboxLoading ? (
            <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span className="status-dot connecting" /> Connecting...
            </span>
          ) : (
            <span className="badge">Disconnected</span>
          )}
          <span className="settings-subtitle">Required for instant cached 4K torrent streaming</span>
        </h2>
        <div className={`card-glass settings-card ${torboxConnected ? 'state-connected' : 'state-disconnected'}`}>
          <div className="settings-row">
            <input
              type="password"
              className="input"
              placeholder="TorBox API Key"
              value={torboxKeyInput}
              aria-label="TorBox API Key"
              disabled={torboxLoading}
              onChange={(e) => setTorboxKeyInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn-primary"
              onClick={handleTorboxConnect}
              disabled={torboxLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {torboxLoading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {torboxLoading ? 'Validating...' : torboxConnected ? 'Update Key' : 'Connect TorBox'}
            </button>
            {torboxConnected && (
              <button className="btn-ghost" onClick={clearTorboxAuth}>
                Disconnect
              </button>
            )}
          </div>
          {torboxUser && (
            <div className="settings-row" style={{ paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
              <p className="settings-value" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={16} color="#10b981" />
                <span>Account Plan: <strong>{torboxUser.plan || 'Active'}</strong></span>
                <span>•</span>
                <span>User: <strong>{torboxUser.email || 'Verified'}</strong></span>
              </p>
            </div>
          )}
          <p className="settings-help">
            Obtain your API key from{' '}
            <a href="https://torbox.app/settings" target="_blank" rel="noopener noreferrer">
              torbox.app/settings → Integrations
            </a>
          </p>
        </div>
      </section>

      {/* ── 5. Simkl Tracking & Sync ──────────────────────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">
            <BarChart2 size={20} aria-hidden="true" />
          </span>
          <span>Simkl Watch Tracking</span>
          {simklConnected ? (
            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span className="status-dot connected" /> Connected
            </span>
          ) : simklLoading ? (
            <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span className="status-dot connecting" /> Connecting...
            </span>
          ) : (
            <span className="badge">Disconnected</span>
          )}
          <span className="settings-subtitle">Synchronize watch progress, episodes, and bookmarks</span>
        </h2>
        <div className={`card-glass settings-card ${simklConnected ? 'state-connected' : 'state-disconnected'}`}>
          {!simklConnected && (
            <>
              <div className="settings-row">
                <input
                  type="text"
                  className="input"
                  placeholder="Simkl Client ID"
                  value={simklIdInput}
                  aria-label="Simkl Client ID"
                  disabled={simklLoading}
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
                  aria-label="Simkl Client Secret"
                  disabled={simklLoading}
                  onChange={(e) => setSimklSecretInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-secondary"
                  disabled={simklLoading}
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
              <div className="settings-row">
                <button
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                  disabled={simklLoading}
                  onClick={async () => {
                    const id = simklIdInput.trim()
                    const secret = simklSecretInput.trim()
                    if (!id || !secret) {
                      setMessage({ text: 'Please enter both Client ID and Client Secret', type: 'error' })
                      return
                    }
                    setSimklClientId(id)
                    setSimklClientSecret(secret)
                    localStorage.setItem('webvio_simkl_clientId', id)
                    localStorage.setItem('webvio_simkl_clientSecret', secret)

                    setSimklLoading(true)
                    try {
                      const { getAuthUrl } = await import('../api/simkl')
                      const url = getAuthUrl(id, window.location.origin + '/settings')
                      window.location.href = url
                    } catch (err: any) {
                      setSimklLoading(false)
                      setMessage({ text: err.message || 'Failed to initialize Simkl login', type: 'error' })
                    }
                  }}
                >
                  {simklLoading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LinkIcon size={16} aria-hidden="true" />}
                  {simklLoading ? 'Connecting to Simkl...' : 'Connect with Simkl OAuth'}
                </button>
              </div>
            </>
          )}

          {simklConnected && (
            <>
              <div className="settings-row">
                <div>
                  <p className="settings-label">Connected Simkl Profile</p>
                  <p className="settings-value" style={{ fontWeight: 700, fontSize: '1rem' }}>
                    {simklUser?.username || simklUser?.name || 'Simkl Member'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    className="btn-primary"
                    disabled={isSyncingSimkl}
                    onClick={async () => {
                      try {
                        await syncSimklHistory(true)
                        setMessage({ text: 'Simkl watch history synced successfully!', type: 'success' })
                      } catch {
                        setMessage({ text: 'Failed to sync Simkl history', type: 'error' })
                      }
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <RefreshCw size={15} className={isSyncingSimkl ? 'animate-spin' : ''} aria-hidden="true" />
                    {isSyncingSimkl ? 'Syncing...' : 'Sync History Now'}
                  </button>
                  <button className="btn-ghost" onClick={clearSimklAuth}>
                    Disconnect
                  </button>
                </div>
              </div>

              <div className="settings-row" style={{ paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} color="var(--accent-violet)" aria-hidden="true" />
                  <div>
                    <p className="settings-label" style={{ fontSize: '0.75rem' }}>Last History Sync</p>
                    <p className="settings-value" style={{ fontSize: '0.85rem' }}>
                      {lastSimklSync ? new Date(lastSimklSync).toLocaleString() : 'Not synced yet'}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cloud size={16} color={simklSyncQueueLength > 0 ? '#f59e0b' : '#10b981'} aria-hidden="true" />
                  <div>
                    <p className="settings-label" style={{ fontSize: '0.75rem' }}>Offline Queue</p>
                    <p className="settings-value" style={{ fontSize: '0.85rem' }}>
                      {simklSyncQueueLength > 0 ? (
                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>{simklSyncQueueLength} pending items</span>
                      ) : (
                        <span style={{ color: '#10b981', fontWeight: 600 }}>All items synced</span>
                      )}
                    </p>
                  </div>
                </div>

                {simklSyncQueueLength > 0 && (
                  <button
                    className="btn-secondary btn-sm"
                    onClick={async () => {
                      const res = await processOfflineQueue()
                      setMessage({
                        text: `Processed offline queue: ${res.success} synced, ${res.failed} remaining`,
                        type: res.failed === 0 ? 'success' : 'error',
                      })
                    }}
                  >
                    Retry Offline Queue
                  </button>
                )}
              </div>
            </>
          )}

          <div className="settings-help" style={{ marginTop: '0.75rem', lineHeight: '1.6' }}>
            <p>
              1. Register an app on{' '}
              <a href="https://simkl.com/settings/developer/new/" target="_blank" rel="noopener noreferrer">
                simkl.com/settings/developer/new
              </a>
            </p>
            <p style={{ marginTop: '0.25rem' }}>
              2. Set <strong>Redirect URL</strong> to:
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              <code style={{ fontSize: '0.85em', background: 'rgba(255,255,255,0.08)', padding: '4px 8px', borderRadius: '4px' }}>
                {window.location.origin}/settings
              </code>
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/settings`)
                  setMessage({ text: 'Redirect URI copied to clipboard!', type: 'success' })
                }}
              >
                Copy URL
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Addon Manager ──────────────────────────────────────────────── */}
      <section className="settings-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <h2 className="settings-section-title" style={{ margin: 0 }}>
            <span className="settings-icon">
              <Blocks size={20} aria-hidden="true" />
            </span>
            <span>Installed Streaming Addons</span>
            <span className="badge">{addons.length}</span>
          </h2>
        </div>

        {/* Quick Presets */}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
            Quick Install Recommended Addons:
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {QUICK_ADDON_PRESETS.map((preset) => {
              const isInstalled = addons.some((a) => a.manifestUrl === preset.url)
              return (
                <button
                  key={preset.url}
                  type="button"
                  className="btn-ghost"
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: isInstalled ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-elevated)',
                    border: isInstalled ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-subtle)',
                    color: isInstalled ? '#34d399' : 'var(--text-primary)',
                  }}
                  disabled={isInstalled || addonLoading}
                  onClick={() => handleAddAddon(preset.url)}
                  title={preset.desc}
                >
                  {isInstalled ? <Check size={13} style={{ marginRight: '4px' }} /> : null}
                  {preset.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Add by Manifest URL */}
        <div className="card-glass settings-card" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="settings-row">
            <input
              type="text"
              className="input"
              placeholder="Paste addon manifest URL (e.g. https://.../manifest.json)"
              value={addonUrlInput}
              aria-label="Addon manifest URL"
              onChange={(e) => setAddonUrlInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn-primary" onClick={() => handleAddAddon()} disabled={addonLoading}>
              {addonLoading ? 'Installing...' : 'Install Addon'}
            </button>
          </div>
        </div>

        <div aria-live="polite" className="sr-only">
          {addonAnnouncement}
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
                  setAddonAnnouncement(`Reordered ${addon.manifest.name} to position ${index + 1}`)
                  setDraggedIndex(null)
                }
              }}
              className={`card-glass addon-item ${!addon.enabled ? 'addon-disabled' : ''} ${
                draggedIndex === index ? 'dragging' : ''
              }`}
            >
              <div
                className="drag-handle"
                title="Drag to reorder"
                aria-label="Drag handle"
                style={{ cursor: 'grab', padding: '0 8px', opacity: 0.5, display: 'flex', alignItems: 'center' }}
              >
                <GripVertical size={20} aria-hidden="true" />
              </div>
              <div className="addon-info">
                {addon.manifest.logo && (
                  <img
                    src={addon.manifest.logo}
                    alt={addon.manifest.name}
                    className="addon-logo"
                    loading="lazy"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
                <div>
                  <h4 className="addon-name">{addon.manifest.name}</h4>
                  <p className="addon-description">{addon.manifest.description?.substring(0, 100)}</p>
                  <div className="addon-badges">
                    {addon.manifest.types.map((t) => (
                      <span key={t} className="badge badge-small">
                        {t}
                      </span>
                    ))}
                    <span className="badge badge-small">v{addon.manifest.version}</span>
                  </div>
                </div>
              </div>
              <div className="addon-actions">
                <button
                  className="btn-ghost"
                  onClick={() => {
                    moveAddonUp(index)
                    setAddonAnnouncement(`Moved ${addon.manifest.name} up to position ${index}`)
                  }}
                  disabled={index === 0}
                  aria-label={`Move ${addon.manifest.name} up`}
                  title="Move Up"
                  style={{ opacity: index === 0 ? 0.3 : 1 }}
                >
                  <ChevronUp size={18} aria-hidden="true" />
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    moveAddonDown(index)
                    setAddonAnnouncement(`Moved ${addon.manifest.name} down to position ${index + 2}`)
                  }}
                  disabled={index === addons.length - 1}
                  aria-label={`Move ${addon.manifest.name} down`}
                  title="Move Down"
                  style={{ opacity: index === addons.length - 1 ? 0.3 : 1 }}
                >
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => toggleAddon(addon.manifestUrl)}
                  aria-label={addon.enabled ? `Disable ${addon.manifest.name}` : `Enable ${addon.manifest.name}`}
                  title={addon.enabled ? 'Disable addon' : 'Enable addon'}
                >
                  {addon.enabled ? <Check size={18} color="#34d399" aria-hidden="true" /> : <X size={18} color="#ef4444" aria-hidden="true" />}
                </button>
                <button
                  className="btn-ghost btn-danger"
                  onClick={() => {
                    removeAddon(addon.manifestUrl)
                    setAddonAnnouncement(`Removed ${addon.manifest.name}`)
                  }}
                  aria-label={`Remove addon ${addon.manifest.name}`}
                  title="Remove addon"
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
          {addons.length === 0 && (
            <p className="settings-help" style={{ textAlign: 'center', padding: '2rem' }}>
              No addons installed. Choose from the quick presets above or install custom manifests.
            </p>
          )}
        </div>
      </section>

      {/* ── 7. System, CORS & Cache Info ──────────────────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-icon">
            <Info size={20} aria-hidden="true" />
          </span>
          <span>System & Architecture Info</span>
        </h2>
        <div className="card-glass settings-card">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>App Platform</span>
              <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: '0.95rem' }}>WebVio Windows Edition</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Engine Version</span>
              <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: '0.95rem' }}>v2.4.0-stable</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Decoder Acceleration</span>
              <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: '0.95rem', color: '#10b981' }}>WASM & WebCodecs Ready</p>
            </div>
          </div>

          {/* CORS Proxy Input */}
          <div className="settings-row" style={{ paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ flex: 1 }}>
              <p className="settings-label" style={{ fontWeight: 600 }}>CORS Proxy Worker URL (Optional)</p>
              <input
                type="text"
                className="input"
                placeholder="https://your-cors-proxy.workers.dev/?url="
                value={corsInput}
                onChange={(e) => setCorsInput(e.target.value)}
                style={{ width: '100%', marginTop: '4px' }}
              />
            </div>
            <button
              className="btn-secondary"
              style={{ marginTop: '22px' }}
              onClick={() => {
                setCorsProxyUrl(corsInput.trim())
                setMessage({ text: 'CORS proxy URL saved successfully', type: 'success' })
              }}
            >
              Save Proxy
            </button>
          </div>

          <div className="settings-row" style={{ justifyContent: 'flex-end', gap: 'var(--space-2)', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
            <button type="button" className="btn-secondary" onClick={handleClearCache}>
              <RotateCcw size={15} style={{ marginRight: '6px' }} />
              Clear Local Query Cache
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
