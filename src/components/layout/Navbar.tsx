import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useAuthStore } from '../../store/auth-store'
import { AddonClient, MetaPreview } from '../../api/addon-client'
import { calculateRelevanceScore } from '../../pages/Search'

const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json'
const ANIME_KITSU_URL = 'https://anime-kitsu.strem.fun/manifest.json'

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [liveSuggestions, setLiveSuggestions] = useState<MetaPreview[]>([])
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchBoxRef = useRef<HTMLFormElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const { ref: brandRef, focused: brandFocused } = useFocusable({
    onEnterPress: () => navigate('/')
  })

  const { ref: searchRef, focused: searchFocused } = useFocusable({
    onEnterPress: () => {
      if (searchQuery.trim()) {
        setShowSearchSuggestions(false)
        navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      }
    }
  })
  const { torboxConnected, simklConnected } = useAuthStore()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowSearchSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (location.pathname === '/search') {
      const q = searchParams.get('q') || ''
      setSearchQuery(q)
    } else {
      setSearchQuery('')
    }
  }, [location.pathname, searchParams])

  // Fast live query suggestions for the navbar dropdown (150ms debounce)
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed || location.pathname === '/search') {
      setLiveSuggestions([])
      setShowSearchSuggestions(false)
      return
    }

    const timer = setTimeout(async () => {
      try {
        const cinemeta = new AddonClient(CINEMETA_URL)
        const kitsu = new AddonClient(ANIME_KITSU_URL)

        const [mRes, sRes, aRes] = await Promise.allSettled([
          cinemeta.getCatalog('movie', 'top', { search: trimmed }),
          cinemeta.getCatalog('series', 'top', { search: trimmed }),
          kitsu.getCatalog('anime', 'kitsu-anime-list', { search: trimmed }),
        ])

        const combined: MetaPreview[] = []
        if (mRes.status === 'fulfilled' && mRes.value?.metas) combined.push(...mRes.value.metas)
        if (sRes.status === 'fulfilled' && sRes.value?.metas) combined.push(...sRes.value.metas)
        if (aRes.status === 'fulfilled' && aRes.value?.metas) combined.push(...aRes.value.metas)

        const scored = combined
          .map(item => ({ item, score: calculateRelevanceScore(item, trimmed) }))
          .filter(s => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map(s => s.item)

        setLiveSuggestions(scored)
        setShowSearchSuggestions(scored.length > 0)
      } catch {
        // Ignore live fetch error
      }
    }, 150)

    return () => clearTimeout(timer)
  }, [searchQuery, location.pathname])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setShowSearchSuggestions(false)
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    } else if (location.pathname === '/search') {
      navigate('/search')
    }
  }

  const handleSelectSuggestion = (item: MetaPreview) => {
    setShowSearchSuggestions(false)
    setSearchQuery('')
    navigate(`/detail/${item.type || 'movie'}/${encodeURIComponent(item.id)}`)
  }

  return (
    <nav 
      className={`navbar ${scrolled ? 'scrolled' : ''}`}
      style={{
        position: 'fixed',
        top: 0,
        width: '100%',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 40px',
        background: scrolled ? 'rgba(10, 10, 15, 0.75)' : 'linear-gradient(to bottom, rgba(10,10,15,0.9), transparent)',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid transparent',
        transition: 'all 0.4s ease-in-out'
      }}
    >
      <a 
        href="/" 
        ref={brandRef}
        className={`navbar-brand ${brandFocused ? 'focused' : ''}`} 
        onClick={(e) => { e.preventDefault(); navigate('/') }}
        style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          color: '#fff',
          textDecoration: 'none',
          letterSpacing: '-0.5px',
          background: 'linear-gradient(90deg, #fff, #a5a5a5)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          transition: 'transform 0.2s ease'
        }}
      >
        Nuvio
      </a>

      <div style={{ position: 'relative' }}>
        <form 
          className={`navbar-search ${searchFocused ? 'focused' : ''}`} 
          onSubmit={handleSearch} 
          ref={searchBoxRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '30px',
            padding: '6px 16px',
            width: '420px',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <button type="submit" style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '1.1rem' }} title="Search">
            🔍
          </button>
          <input
            type="text"
            placeholder="Search movies, shows, anime..."
            value={searchQuery}
            onFocus={() => {
              if (liveSuggestions.length > 0 && location.pathname !== '/search') {
                setShowSearchSuggestions(true)
              }
            }}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              outline: 'none',
              padding: '8px 12px',
              width: '100%',
              fontSize: '0.95rem'
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setShowSearchSuggestions(false)
                if (location.pathname === '/search') navigate('/search')
              }}
              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '1.2rem' }}
            >
              ✕
            </button>
          )}
        </form>

        {/* Live Search Suggestions Dropdown */}
        {showSearchSuggestions && liveSuggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '52px',
              left: 0,
              width: '100%',
              background: 'rgba(15, 15, 22, 0.95)',
              backdropFilter: 'blur(25px)',
              WebkitBackdropFilter: 'blur(25px)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '16px',
              boxShadow: '0 15px 50px rgba(0,0,0,0.8), 0 0 25px rgba(168, 85, 247, 0.2)',
              overflow: 'hidden',
              zIndex: 1100,
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <div style={{ padding: '8px 16px', fontSize: '0.75rem', color: 'var(--color-accent-primary, #a855f7)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              ⚡ INSTANT MATCHES
            </div>
            {liveSuggestions.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelectSuggestion(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(168, 85, 247, 0.15)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {item.poster ? (
                  <img
                    src={item.poster}
                    alt={item.name}
                    style={{ width: '32px', height: '46px', objectFit: 'cover', borderRadius: '4px' }}
                  />
                ) : (
                  <div style={{ width: '32px', height: '46px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                    🎬
                  </div>
                )}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name}
                  </p>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: '#aaa', marginTop: '2px' }}>
                    {item.year && <span>{item.year}</span>}
                    {item.type && <span style={{ textTransform: 'capitalize', color: 'var(--color-accent-secondary, #f472b6)' }}>{item.type}</span>}
                    {item.imdbRating && <span>⭐ {item.imdbRating}</span>}
                  </div>
                </div>
              </div>
            ))}
            <div
              onClick={handleSearch}
              style={{
                padding: '10px 16px',
                textAlign: 'center',
                fontSize: '0.8rem',
                color: 'var(--color-accent-primary, #a855f7)',
                fontWeight: 600,
                cursor: 'pointer',
                background: 'rgba(168, 85, 247, 0.08)',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(168, 85, 247, 0.2)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(168, 85, 247, 0.08)')}
            >
              View all results for "{searchQuery}" →
            </div>
          </div>
        )}
      </div>

      <div className="navbar-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div className="status-indicators" style={{ display: 'flex', gap: '10px' }}>
          <span 
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: torboxConnected ? 'rgba(46, 213, 115, 0.15)' : 'rgba(255, 71, 87, 0.15)',
              color: torboxConnected ? '#2ed573' : '#ff4757',
              border: `1px solid ${torboxConnected ? 'rgba(46, 213, 115, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`
            }}
            title={torboxConnected ? 'TorBox Connected' : 'TorBox Not Connected'}
          >
            📦 TorBox
          </span>
          <span 
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: simklConnected ? 'rgba(46, 213, 115, 0.15)' : 'rgba(255, 71, 87, 0.15)',
              color: simklConnected ? '#2ed573' : '#ff4757',
              border: `1px solid ${simklConnected ? 'rgba(46, 213, 115, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`
            }}
            title={simklConnected ? 'Simkl Connected' : 'Simkl Not Connected'}
          >
            📊 Simkl
          </span>
        </div>

        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
              background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
              border: '2px solid rgba(255,255,255,0.2)',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              cursor: 'pointer',
              color: '#fff',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 15px rgba(108, 92, 231, 0.4)',
              transition: 'transform 0.2s'
            }}
            onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            U
          </button>
          
          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '55px',
              right: '0',
              background: 'rgba(20, 20, 25, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '8px 0',
              width: '200px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              zIndex: 1001,
              animation: 'fadeIn 0.2s ease'
            }}>
              <style>
                {`
                  @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                  .dropdown-item {
                    padding: 12px 20px;
                    color: #e0e0e0;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    alignItems: center;
                    gap: 10px;
                  }
                  .dropdown-item:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                  }
                `}
              </style>
              <div className="dropdown-item" onClick={() => { navigate('/settings'); setShowDropdown(false); }}>
                ⚙️ Settings
              </div>
              <div className="dropdown-item" onClick={() => { navigate('/library'); setShowDropdown(false); }}>
                📚 Library
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '4px 0' }}></div>
              <div className="dropdown-item" style={{ color: '#ff4757' }} onClick={() => setShowDropdown(false)}>
                🚪 Logout
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
