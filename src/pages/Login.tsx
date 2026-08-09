import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Package, Check, Play } from 'lucide-react'
import { useAuthStore } from '../store/auth-store'
import { useAddonStore } from '../store/addon-store'
import './login.css'

export default function Login() {
  const navigate = useNavigate()
  const { setNuvioAuth, setTorboxAuth, setCorsProxyUrl } = useAuthStore()
  const { loadAddonsFromNuvio } = useAddonStore()

  const [step, setStep] = useState<'nuvio' | 'extras'>('nuvio')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [torboxKey, setTorboxKey] = useState('')
  const [corsProxy, setCorsProxyInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addonStatus, setAddonStatus] = useState('')

  const handleNuvioLogin = async () => {
    setLoading(true)
    setError('')
    try {
      if (!email || !password) throw new Error('Email and password required')

      if (corsProxy.trim()) {
        setCorsProxyUrl(corsProxy.trim())
      }

      const { login } = await import('../api/nuvio-auth')
      const result = await login(email, password)

      setNuvioAuth(result.accessToken, result.refreshToken, result.userId, result.email)
      setAddonStatus('Loading your Nuvio addons...')

      try {
        await loadAddonsFromNuvio(result.accessToken, result.userId)
        setAddonStatus(`Loaded ${useAddonStore.getState().addons.length} addons from your Nuvio account!`)
      } catch (err: any) {
        setAddonStatus('Could not load addons: ' + (err.message || 'Unknown error'))
      }

      setStep('extras')
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleContinue = async () => {
    if (torboxKey.trim()) {
      try {
        const { validateApiKey } = await import('../api/torbox')
        const user = await validateApiKey(torboxKey.trim())
        setTorboxAuth(torboxKey.trim(), user)
      } catch {
        // Ignore TorBox errors, it's optional
      }
    }
    navigate('/')
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-container">
        <div className="login-card card-glass">
          <div className="login-header">
            <h1 className="login-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Zap size={28} aria-hidden="true" /> Webvio
            </h1>
            <p className="login-tagline">Stream anything. Track everything.</p>
          </div>

          {step === 'nuvio' && (
            <div className="login-body">
              <h2 className="login-step-title">Connect Nuvio</h2>
              <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>
                Login with your Nuvio account to load all your plugins and addons
              </p>

              <div className="input-group">
                <label className="input-label">Email</label>
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
              </div>
              <div className="input-group">
                <label className="input-label">Password</label>
                <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && handleNuvioLogin()} />
              </div>

              <div className="input-group">
                <label className="input-label">CORS Proxy URL (optional)</label>
                <input className="input" type="text" value={corsProxy} onChange={e => setCorsProxyInput(e.target.value)} placeholder="https://your-proxy.workers.dev/?url=" />
              </div>

              {error && <p className="login-error">{error}</p>}
              {addonStatus && <p className="login-status">{addonStatus}</p>}

              <button
                className="btn btn-primary btn-lg w-full"
                onClick={handleNuvioLogin}
                disabled={loading}
                style={{ marginTop: '0.5rem' }}
              >
                {loading ? 'Connecting...' : 'Connect Nuvio'}
              </button>
            </div>
          )}

          {step === 'extras' && (
            <div className="login-body">
              <h2 className="login-step-title">Optional Services</h2>
              <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>
                These are optional. You can set them up later in Settings.
              </p>

              {addonStatus && (
                <p className="login-status" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={16} aria-hidden="true" /> {addonStatus}
                </p>
              )}

              <div className="login-optional-section">
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Package size={18} aria-hidden="true" /> TorBox <span className="badge">Optional</span>
                </h4>
                <p className="text-xs text-muted">Needed for torrent-based streams. Direct HTTP streams work without it.</p>
                <input className="input" type="password" value={torboxKey} onChange={e => setTorboxKey(e.target.value)} placeholder="TorBox API Key" style={{ marginTop: '0.5rem' }} />
              </div>

              <button
                className="btn btn-primary btn-lg w-full"
                onClick={handleContinue}
                style={{ marginTop: '1.5rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Play size={18} fill="currentColor" aria-hidden="true" /> Start Streaming
              </button>

              <button
                className="btn btn-ghost w-full"
                onClick={handleContinue}
                style={{ marginTop: '0.5rem' }}
              >
                Skip for now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
