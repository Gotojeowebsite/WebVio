import { useLocation, useNavigate } from 'react-router-dom'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'

const NAV_ITEMS = [
  { path: '/', icon: '🏠', label: 'Home' },
  { path: '/search', icon: '🔍', label: 'Search' },
  { path: '/library', icon: '📚', label: 'Library' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
]

function SidebarItemComponent({ item, active, onClick }: { item: any, active: boolean, onClick: () => void }) {
  const { ref, focused } = useFocusable({
    onEnterPress: onClick
  })

  return (
    <button
      ref={ref}
      className={`sidebar-item ${active ? 'active' : ''} ${focused ? 'focused' : ''}`}
      onClick={onClick}
    >
      <span className="sidebar-icon">{item.icon}</span>
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
