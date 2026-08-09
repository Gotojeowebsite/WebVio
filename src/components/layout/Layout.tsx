import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import './layout.css'

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('webvio_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('webvio_sidebar_collapsed', String(next))
      } catch {
        // Ignore storage write error
      }
      return next
    })
  }

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-is-collapsed' : 'sidebar-is-expanded'}`}>
      <Navbar onToggleSidebar={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
      <div className="app-body">
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
        <main className={`main-content ${sidebarCollapsed ? 'collapsed' : 'expanded'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
