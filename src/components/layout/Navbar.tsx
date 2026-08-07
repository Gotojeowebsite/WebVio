import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth-store'

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const { torboxConnected, simklConnected } = useAuthStore()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <a href="/" className="navbar-brand" onClick={(e) => { e.preventDefault(); navigate('/') }}>
        ⚡ TorNode
      </a>

      <form className="navbar-search" onSubmit={handleSearch}>
        <span className="navbar-search-icon">🔍</span>
        <input
          type="text"
          className="navbar-search-input"
          placeholder="Search movies, shows..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
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
