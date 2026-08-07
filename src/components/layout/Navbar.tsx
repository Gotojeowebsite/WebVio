import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useAuthStore } from '../../store/auth-store'

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const { ref: brandRef, focused: brandFocused } = useFocusable({
    onEnterPress: () => navigate('/')
  })

  const { ref: searchRef, focused: searchFocused } = useFocusable({
    onEnterPress: () => {
      if (searchQuery.trim()) {
        navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      }
    }
  })
  const { torboxConnected, simklConnected } = useAuthStore()

  // Sync navbar search input with URL query param when on search page
  useEffect(() => {
    if (location.pathname === '/search') {
      const q = searchParams.get('q') || ''
      setSearchQuery(q)
    } else {
      // Clear search input when not on search page
      setSearchQuery('')
    }
  }, [location.pathname, searchParams])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    } else if (location.pathname === '/search') {
      navigate('/search')
    }
  }

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <a 
        href="/" 
        ref={brandRef}
        className={`navbar-brand ${brandFocused ? 'focused' : ''}`} 
        onClick={(e) => { e.preventDefault(); navigate('/') }}
      >
        ⚡ Webvio
      </a>

      <form className={`navbar-search ${searchFocused ? 'focused' : ''}`} onSubmit={handleSearch} ref={searchRef}>
        <span className="navbar-search-icon">🔍</span>
        <input
          type="text"
          className="navbar-search-input"
          placeholder="Search movies, shows..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="navbar-search-clear"
            onClick={() => {
              setSearchQuery('')
              if (location.pathname === '/search') navigate('/search')
            }}
          >
            ✕
          </button>
        )}
      </form>

      <div className="navbar-right">
        <div className="status-indicators">
          <span className={`status-dot ${torboxConnected ? 'connected' : 'disconnected'}`}
                title={torboxConnected ? 'TorBox Connected' : 'TorBox Not Connected'}>
            📦
          </span>
          <span className={`status-dot ${simklConnected ? 'connected' : 'disconnected'}`}
                title={simklConnected ? 'Simkl Connected' : 'Simkl Not Connected'}>
            📊
          </span>
        </div>
      </div>
    </nav>
  )
}
