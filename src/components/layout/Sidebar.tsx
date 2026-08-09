import { useLocation, useNavigate } from 'react-router-dom'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { Home, Search, Library, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/search', icon: Search, label: 'Search' },
  { path: '/library', icon: Library, label: 'Library' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

function SidebarItemComponent({ item, active, onClick }: { item: typeof NAV_ITEMS[0], active: boolean, onClick: () => void }) {
  const { ref, focused } = useFocusable({
    onEnterPress: onClick
  })

  const Icon = item.icon

  return (
    <button
      ref={ref}
      className={`sidebar-item ${active ? 'active' : ''} ${focused ? 'focused' : ''}`}
      onClick={onClick}
      aria-label={item.label}
    >
      <span className="sidebar-icon">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="sidebar-label">{item.label}</span>
    </button>
  )
}

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  const { ref: focusKeyRef } = useFocusable({
    focusable: true,
    isFocusBoundary: true
  })

  return (
    <aside className="sidebar" ref={focusKeyRef}>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <SidebarItemComponent
            key={item.path}
            item={item}
            active={location.pathname === item.path}
            onClick={() => navigate(item.path)}
          />
        ))}
      </nav>
    </aside>
  )
}
