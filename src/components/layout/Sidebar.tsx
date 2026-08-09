import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import {
  Home,
  Search,
  Compass,
  Library,
  Download,
  Settings,
  PanelLeftClose,
  PanelLeft,
  RefreshCw,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth-store'

interface NavItemDef {
  path: string
  icon: React.ComponentType<{ size?: number | string; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  label: string
  badge?: string | number
}

const NAV_ITEMS: NavItemDef[] = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/search', icon: Search, label: 'Search' },
  { path: '/discover', icon: Compass, label: 'Discover' },
  { path: '/library', icon: Library, label: 'Library' },
  { path: '/downloads', icon: Download, label: 'Downloads' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

interface SidebarItemProps {
  item: NavItemDef
  active: boolean
  collapsed: boolean
  onClick: () => void
}

function DesktopSidebarItem({ item, active, collapsed, onClick }: SidebarItemProps) {
  const { ref, focused } = useFocusable({
    onEnterPress: onClick,
  })
  const [hovered, setHovered] = useState(false)
  const Icon = item.icon

  return (
    <div className="sidebar-item-wrapper">
      <button
        ref={ref}
        className={`sidebar-item ${active ? 'active' : ''} ${focused ? 'focused' : ''} ${collapsed ? 'collapsed' : ''}`}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
      >
        <span className="sidebar-accent-bar" aria-hidden="true" />
        <span className="sidebar-icon">
          <Icon size={20} aria-hidden="true" />
        </span>
        {!collapsed && <span className="sidebar-label">{item.label}</span>}
        {!collapsed && item.badge && (
          <span className="sidebar-badge">{item.badge}</span>
        )}
      </button>

      {/* Windows Explorer style floating hover tooltip when collapsed */}
      {collapsed && hovered && (
        <div className="sidebar-floating-tooltip" role="tooltip">
          {item.label}
        </div>
      )}
    </div>
  )
}

function MobileTabItem({ item, active, onClick }: { item: NavItemDef; active: boolean; onClick: () => void }) {
  const Icon = item.icon

  return (
    <button
      className={`bottom-tab-item ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={20} aria-hidden="true" />
      <span className="bottom-tab-label">{item.label}</span>
    </button>
  )
}

interface SidebarProps {
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export default function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const {
    simklConnected,
    isSyncingSimkl,
    simklUser,
    nuvioEmail,
    syncSimklHistory,
    simklSyncQueueLength,
  } = useAuthStore()

  const { ref: focusKeyRef } = useFocusable({
    focusable: true,
    isFocusBoundary: true,
  })

  const handleSyncClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isSyncingSimkl && simklConnected) {
      syncSimklHistory(true).catch(() => {})
    }
  }

  // Determine Simkl Sync Status (green = synced, yellow = syncing, red/gray = error or offline)
  let simklStatus: 'synced' | 'syncing' | 'error' | 'disconnected' = 'disconnected'
  let simklStatusText = 'Simkl Offline'

  if (simklConnected) {
    if (isSyncingSimkl) {
      simklStatus = 'syncing'
      simklStatusText = 'Syncing...'
    } else {
      simklStatus = 'synced'
      simklStatusText = simklSyncQueueLength > 0 ? `Synced (${simklSyncQueueLength} queued)` : 'Simkl Synced'
    }
  } else {
    simklStatus = 'disconnected'
    simklStatusText = 'Simkl Disconnected'
  }

  const userDisplayName = simklUser?.name || simklUser?.username || (nuvioEmail ? nuvioEmail.split('@')[0] : 'User')
  const userInitial = userDisplayName ? userDisplayName.charAt(0).toUpperCase() : 'U'

  return (
    <>
      {/* Desktop Windows Sidebar (>768px) */}
      <aside
        className={`sidebar sidebar-desktop ${collapsed ? 'collapsed' : 'expanded'}`}
        ref={focusKeyRef}
        aria-label="Main Navigation"
      >
        {/* Top Header / Collapse Toggle */}
        <div className="sidebar-header">
          {!collapsed ? (
            <div className="sidebar-brand-wrapper" onClick={() => navigate('/')} role="button" tabIndex={0}>
              <div className="sidebar-logo-glow">
                <span className="sidebar-logo-text">N</span>
              </div>
              <span className="sidebar-brand-name">Nuvio</span>
            </div>
          ) : (
            <div className="sidebar-brand-mini" onClick={() => navigate('/')} role="button" tabIndex={0}>
              <span className="sidebar-logo-mini">N</span>
            </div>
          )}

          {onToggleCollapse && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeft size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
            </button>
          )}
        </div>

        {/* Navigation List */}
        <nav className="sidebar-nav">
          <div className="sidebar-section-title">
            {!collapsed && <span>NAVIGATION</span>}
          </div>
          {NAV_ITEMS.map((item) => {
            const isHome = item.path === '/'
            const active = isHome
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path)

            return (
              <DesktopSidebarItem
                key={item.path}
                item={item}
                active={active}
                collapsed={collapsed}
                onClick={() => navigate(item.path)}
              />
            )
          })}
        </nav>

        {/* Bottom Simkl Sync Status & Profile Indicator */}
        <div className="sidebar-footer">
          {/* Simkl Sync Indicator Widget */}
          <div
            className={`sidebar-sync-card ${simklStatus} ${collapsed ? 'collapsed' : ''}`}
            title={`Simkl Status: ${simklStatusText}. Click to sync.`}
          >
            <div className="sidebar-sync-status">
              <span className={`sidebar-sync-dot ${simklStatus}`} aria-hidden="true" />
              {!collapsed && (
                <div className="sidebar-sync-info">
                  <span className="sidebar-sync-title">Simkl Sync</span>
                  <span className="sidebar-sync-state">{simklStatusText}</span>
                </div>
              )}
            </div>

            {simklConnected && (
              <button
                type="button"
                className={`sidebar-sync-action-btn ${isSyncingSimkl ? 'syncing' : ''}`}
                onClick={handleSyncClick}
                aria-label="Sync Simkl now"
                title="Sync Simkl now"
                disabled={isSyncingSimkl}
              >
                <RefreshCw size={14} className={isSyncingSimkl ? 'animate-spin' : ''} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* User Profile Mini Pill */}
          <div
            className={`sidebar-profile-card ${collapsed ? 'collapsed' : ''}`}
            onClick={() => navigate('/settings')}
            role="button"
            tabIndex={0}
            aria-label="User Profile and Settings"
          >
            <div className="sidebar-avatar">
              {simklUser?.avatar ? (
                <img src={simklUser.avatar} alt={userDisplayName} className="sidebar-avatar-img" />
              ) : (
                <span className="sidebar-avatar-initial">{userInitial}</span>
              )}
              <span className={`sidebar-avatar-status ${simklConnected ? 'online' : 'offline'}`} />
            </div>

            {!collapsed && (
              <div className="sidebar-profile-info">
                <span className="sidebar-profile-name">{userDisplayName}</span>
                <span className="sidebar-profile-sub">
                  {simklConnected ? 'Connected' : 'Free Account'}
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Fixed Bottom Tab Bar (<=768px) */}
      <nav className="bottom-tab-bar" aria-label="Mobile Navigation">
        {NAV_ITEMS.map((item) => {
          const isHome = item.path === '/'
          const active = isHome
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path)

          return (
            <MobileTabItem
              key={item.path}
              item={item}
              active={active}
              onClick={() => navigate(item.path)}
            />
          )
        })}
      </nav>
    </>
  )
}
