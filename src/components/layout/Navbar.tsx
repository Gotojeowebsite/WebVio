import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import {
  Search,
  X,
  Zap,
  Film,
  Settings,
  Library,
  LogOut,
  Package,
  BarChart2,
  Bell,
  CheckCircle2,
  AlertCircle,
  Download,
  Compass,
  ChevronRight,
  Home,
  RefreshCw,
  Sparkles,
  Menu,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth-store'
import { AddonClient, MetaPreview } from '../../api/addon-client'
import { calculateRelevanceScore } from '../../utils/searchUtils'

const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json'
const ANIME_KITSU_URL = 'https://anime-kitsu.strem.fun/manifest.json'

interface NotificationItem {
  id: string
  title: string
  message: string
  time: string
  type: 'info' | 'success' | 'warning'
  read: boolean
}

interface NavbarProps {
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
}

export default function Navbar({ onToggleSidebar, sidebarCollapsed: _sidebarCollapsed }: NavbarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [liveSuggestions, setLiveSuggestions] = useState<MetaPreview[]>([])
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: '1',
      title: 'Windows Nuvio Overhaul',
      message: 'Fluent Windows layout and high-contrast design system active.',
      time: 'Just now',
      type: 'info',
      read: false,
    },
    {
      id: '2',
      title: 'Simkl Cloud Sync',
      message: 'Automatic watch progress sync initialized.',
      time: '5m ago',
      type: 'success',
      read: false,
    },
  ])

  const profileDropdownRef = useRef<HTMLDivElement>(null)
  const notificationDropdownRef = useRef<HTMLDivElement>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const {
    torboxConnected,
    simklConnected,
    isSyncingSimkl,
    simklUser,
    nuvioEmail,
    clearNuvioAuth,
    clearSimklAuth,
    clearTorboxAuth,
    syncSimklHistory,
  } = useAuthStore()

  const { ref: brandRef, focused: brandFocused } = useFocusable({
    onEnterPress: () => navigate('/'),
  })

  const { ref: searchRef, focused: searchFocused } = useFocusable({
    onEnterPress: () => {
      if (searchQuery.trim()) {
        setShowSearchSuggestions(false)
        navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      }
    },
  })

  // Detect scroll for mica background intensity
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close dropdowns on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(target)) {
        setShowProfileDropdown(false)
      }
      if (notificationDropdownRef.current && !notificationDropdownRef.current.contains(target)) {
        setShowNotifications(false)
      }
      if (searchBoxRef.current && !searchBoxRef.current.contains(target)) {
        setShowSearchSuggestions(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowProfileDropdown(false)
        setShowNotifications(false)
        setShowSearchSuggestions(false)
      }
      // Global shortcut: Ctrl+K or Cmd+K to focus search
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Sync searchQuery with URL on search page
  useEffect(() => {
    if (location.pathname === '/search') {
      const q = searchParams.get('q') || ''
      setSearchQuery(q)
    } else {
      setSearchQuery('')
    }
  }, [location.pathname, searchParams])

  // Fast live query suggestions for the navbar search (150ms debounce)
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
          .map((item) => ({ item, score: calculateRelevanceScore(item, trimmed) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map((s) => s.item)

        setLiveSuggestions(scored)
        setShowSearchSuggestions(scored.length > 0)
      } catch {
        // Ignore live search error
      }
    }, 150)

    return () => clearTimeout(timer)
  }, [searchQuery, location.pathname])

  const handleSearchSubmit = (e: React.FormEvent) => {
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

  const handleLogout = () => {
    setShowProfileDropdown(false)
    clearNuvioAuth()
    clearSimklAuth()
    clearTorboxAuth()
    navigate('/login')
  }

  const handleManualSimklSync = () => {
    if (simklConnected && !isSyncingSimkl) {
      syncSimklHistory(true).catch(() => {})
    }
  }

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length
  }, [notifications])

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  // Windows Breadcrumb / Page Title resolution
  const breadcrumb = useMemo(() => {
    const path = location.pathname
    if (path === '/') return { icon: Home, label: 'Home', section: 'Explore' }
    if (path.startsWith('/search')) return { icon: Search, label: 'Search', section: 'Explore' }
    if (path.startsWith('/discover')) return { icon: Compass, label: 'Discover', section: 'Explore' }
    if (path.startsWith('/library')) return { icon: Library, label: 'Library', section: 'Media' }
    if (path.startsWith('/downloads')) return { icon: Download, label: 'Downloads', section: 'Media' }
    if (path.startsWith('/settings')) return { icon: Settings, label: 'Settings', section: 'System' }
    if (path.startsWith('/detail')) return { icon: Film, label: 'Media Details', section: 'Catalog' }
    return { icon: Home, label: 'Nuvio', section: 'App' }
  }, [location.pathname])

  const BreadcrumbIcon = breadcrumb.icon
  const userDisplayName = simklUser?.name || simklUser?.username || (nuvioEmail ? nuvioEmail.split('@')[0] : 'User')
  const userInitial = userDisplayName ? userDisplayName.charAt(0).toUpperCase() : 'U'

  return (
    <header className={`navbar ${scrolled ? 'scrolled' : ''}`} role="banner">
      <div className="navbar-container">
        {/* Left Section: Mobile Toggle & Windows Explorer Breadcrumb */}
        <div className="navbar-left">
          {onToggleSidebar && (
            <button
              type="button"
              className="navbar-mobile-toggle"
              onClick={onToggleSidebar}
              aria-label="Toggle navigation menu"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          )}

          <a
            href="/"
            ref={brandRef}
            className={`navbar-brand ${brandFocused ? 'focused' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              navigate('/')
            }}
            aria-label="Nuvio Home"
          >
            <span className="navbar-brand-badge">NUVIO</span>
          </a>

          {/* Windows Breadcrumb */}
          <div className="navbar-breadcrumb" aria-label="Breadcrumb">
            <span className="breadcrumb-separator">
              <ChevronRight size={14} aria-hidden="true" />
            </span>
            <span className="breadcrumb-section">{breadcrumb.section}</span>
            <span className="breadcrumb-separator">
              <ChevronRight size={14} aria-hidden="true" />
            </span>
            <span className="breadcrumb-current">
              <BreadcrumbIcon size={15} className="breadcrumb-icon" aria-hidden="true" />
              <span>{breadcrumb.label}</span>
            </span>
          </div>
        </div>

        {/* Center Section: Global Autocomplete Search Bar */}
        <div className="navbar-center" ref={searchBoxRef}>
          <form
            className={`navbar-search ${searchFocused ? 'focused' : ''}`}
            onSubmit={handleSearchSubmit}
            ref={(node) => {
              if (searchRef) (searchRef as any).current = node
            }}
          >
            <button
              type="submit"
              className="navbar-search-btn"
              aria-label="Submit search"
              title="Search"
            >
              <Search size={16} aria-hidden="true" />
            </button>

            <input
              ref={searchInputRef}
              type="text"
              className="navbar-search-input"
              placeholder="Search movies, series, anime, torrents... (Ctrl+K)"
              value={searchQuery}
              aria-label="Search media catalog"
              aria-autocomplete="list"
              aria-expanded={showSearchSuggestions}
              onFocus={() => {
                if (liveSuggestions.length > 0 && location.pathname !== '/search') {
                  setShowSearchSuggestions(true)
                }
              }}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="navbar-search-actions">
              {searchQuery ? (
                <button
                  type="button"
                  className="navbar-search-clear"
                  aria-label="Clear search query"
                  onClick={() => {
                    setSearchQuery('')
                    setShowSearchSuggestions(false)
                    if (location.pathname === '/search') navigate('/search')
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : (
                <kbd className="navbar-search-shortcut" title="Press Ctrl+K to search">
                  Ctrl K
                </kbd>
              )}
            </div>
          </form>

          {/* Autocomplete Suggestions Popup */}
          {showSearchSuggestions && liveSuggestions.length > 0 && (
            <div className="search-autocomplete-dropdown" role="listbox">
              <div className="autocomplete-header">
                <span className="autocomplete-header-title">
                  <Zap size={14} className="autocomplete-header-icon" aria-hidden="true" />
                  INSTANT SUGGESTIONS
                </span>
                <span className="autocomplete-header-count">{liveSuggestions.length} found</span>
              </div>

              <div className="autocomplete-items">
                {liveSuggestions.map((item) => (
                  <div
                    key={item.id}
                    className="autocomplete-item"
                    role="option"
                    aria-selected={false}
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    {item.poster ? (
                      <img
                        src={item.poster}
                        alt={item.name}
                        loading="lazy"
                        className="autocomplete-poster"
                      />
                    ) : (
                      <div className="autocomplete-poster-fallback">
                        <Film size={16} aria-hidden="true" />
                      </div>
                    )}
                    <div className="autocomplete-meta">
                      <p className="autocomplete-title">{item.name}</p>
                      <div className="autocomplete-tags">
                        {item.year && <span className="autocomplete-tag year">{item.year}</span>}
                        {item.type && <span className="autocomplete-tag type">{item.type}</span>}
                        {item.imdbRating && (
                          <span className="autocomplete-tag rating">★ {item.imdbRating}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="autocomplete-footer"
                onClick={handleSearchSubmit}
              >
                <span>Press Enter for all results for "<strong>{searchQuery}</strong>"</span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* Right Section: Status Pills, Notifications & Profile Dropdown */}
        <div className="navbar-right">
          {/* Status Indicators (TorBox & Simkl) */}
          <div className="navbar-status-group">
            {/* TorBox Pill */}
            <div
              className={`navbar-status-pill ${torboxConnected ? 'active' : 'inactive'}`}
              title={torboxConnected ? 'TorBox Debrid API Connected' : 'TorBox Not Connected'}
            >
              <span className={`navbar-status-dot ${torboxConnected ? 'online' : 'offline'}`} />
              <Package size={14} className="navbar-status-icon" aria-hidden="true" />
              <span className="navbar-status-label">TorBox</span>
            </div>

            {/* Simkl Pill */}
            <div
              className={`navbar-status-pill simkl ${simklConnected ? (isSyncingSimkl ? 'syncing' : 'active') : 'inactive'}`}
              onClick={handleManualSimklSync}
              role="button"
              tabIndex={0}
              title={
                simklConnected
                  ? isSyncingSimkl
                    ? 'Syncing with Simkl cloud...'
                    : 'Simkl Connected. Click to sync.'
                  : 'Simkl Not Connected'
              }
            >
              <span
                className={`navbar-status-dot ${simklConnected ? (isSyncingSimkl ? 'syncing' : 'online') : 'offline'}`}
              />
              <BarChart2 size={14} className="navbar-status-icon" aria-hidden="true" />
              <span className="navbar-status-label">
                {isSyncingSimkl ? 'Syncing...' : 'Simkl'}
              </span>
              {isSyncingSimkl && (
                <RefreshCw size={12} className="animate-spin ml-1" aria-hidden="true" />
              )}
            </div>
          </div>

          {/* Notification Bell Dropdown */}
          <div className="navbar-dropdown-wrapper" ref={notificationDropdownRef}>
            <button
              type="button"
              className={`navbar-icon-btn ${showNotifications ? 'active' : ''}`}
              onClick={() => {
                setShowNotifications(!showNotifications)
                setShowProfileDropdown(false)
              }}
              aria-label={`Notifications (${unreadNotificationCount} unread)`}
              aria-expanded={showNotifications}
            >
              <Bell size={18} aria-hidden="true" />
              {unreadNotificationCount > 0 && (
                <span className="navbar-notification-badge">{unreadNotificationCount}</span>
              )}
            </button>

            {showNotifications && (
              <div className="navbar-dropdown-menu notification-menu" role="menu">
                <div className="notification-menu-header">
                  <span className="notification-menu-title">Notifications</span>
                  {unreadNotificationCount > 0 && (
                    <button
                      type="button"
                      className="notification-mark-all"
                      onClick={markAllNotificationsRead}
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="notification-list">
                  {notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`notification-item ${!item.read ? 'unread' : ''}`}
                      role="menuitem"
                    >
                      <div className="notification-item-icon">
                        {item.type === 'success' ? (
                          <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
                        ) : item.type === 'warning' ? (
                          <AlertCircle size={16} className="text-warning" aria-hidden="true" />
                        ) : (
                          <Sparkles size={16} className="text-cyan" aria-hidden="true" />
                        )}
                      </div>
                      <div className="notification-item-content">
                        <p className="notification-item-title">{item.title}</p>
                        <p className="notification-item-msg">{item.message}</p>
                        <span className="notification-item-time">{item.time}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="notification-menu-footer">
                  <span className="notification-footer-text">Windows Nuvio 2.0 Engine Active</span>
                </div>
              </div>
            )}
          </div>

          {/* Profile Avatar Dropdown */}
          <div className="navbar-dropdown-wrapper" ref={profileDropdownRef}>
            <button
              type="button"
              className="navbar-avatar-btn"
              onClick={() => {
                setShowProfileDropdown(!showProfileDropdown)
                setShowNotifications(false)
              }}
              aria-label="User account menu"
              aria-expanded={showProfileDropdown}
            >
              {simklUser?.avatar ? (
                <img src={simklUser.avatar} alt={userDisplayName} className="navbar-avatar-img" />
              ) : (
                <span className="navbar-avatar-initial">{userInitial}</span>
              )}
              <span className={`navbar-avatar-status ${simklConnected ? 'online' : 'offline'}`} />
            </button>

            {showProfileDropdown && (
              <div className="navbar-dropdown-menu profile-menu" role="menu">
                <div className="profile-menu-header">
                  <div className="profile-menu-avatar">
                    {userInitial}
                  </div>
                  <div className="profile-menu-user-info">
                    <p className="profile-menu-name">{userDisplayName}</p>
                    <p className="profile-menu-email">{nuvioEmail || 'Local Profile'}</p>
                  </div>
                </div>

                <div className="profile-menu-divider" />

                <div
                  className="profile-menu-item"
                  role="menuitem"
                  onClick={() => {
                    navigate('/library')
                    setShowProfileDropdown(false)
                  }}
                >
                  <Library size={16} aria-hidden="true" />
                  <span>My Library</span>
                </div>

                <div
                  className="profile-menu-item"
                  role="menuitem"
                  onClick={() => {
                    navigate('/downloads')
                    setShowProfileDropdown(false)
                  }}
                >
                  <Download size={16} aria-hidden="true" />
                  <span>Downloads</span>
                </div>

                <div
                  className="profile-menu-item"
                  role="menuitem"
                  onClick={() => {
                    navigate('/settings')
                    setShowProfileDropdown(false)
                  }}
                >
                  <Settings size={16} aria-hidden="true" />
                  <span>Settings & Addons</span>
                </div>

                {simklConnected && (
                  <div
                    className="profile-menu-item"
                    role="menuitem"
                    onClick={() => {
                      handleManualSimklSync()
                      setShowProfileDropdown(false)
                    }}
                  >
                    <RefreshCw size={16} className={isSyncingSimkl ? 'animate-spin' : ''} aria-hidden="true" />
                    <span>Sync Simkl Watchlist</span>
                  </div>
                )}

                <div className="profile-menu-divider" />

                <div className="profile-menu-theme-indicator">
                  <span className="theme-indicator-dot" />
                  <span>Windows Nuvio Dark (Fluent)</span>
                </div>

                <div className="profile-menu-divider" />

                <div
                  className="profile-menu-item logout"
                  role="menuitem"
                  onClick={handleLogout}
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span>Sign Out</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
