import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/auth-store'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Detail from './pages/Detail'
import Search from './pages/Search'
import Library from './pages/Library'
import Settings from './pages/Settings'
import Player from './pages/Player'

function App() {
  const { nuvioLoggedIn, loadFromStorage } = useAuthStore()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  return (
    <Routes>
      <Route path="/login" element={
        nuvioLoggedIn ? <Navigate to="/" replace /> : <Login />
      } />
      <Route path="/player" element={<Player />} />
      <Route element={<Layout />}>
        <Route path="/" element={
          nuvioLoggedIn ? <Home /> : <Navigate to="/login" replace />
        } />
        <Route path="/search" element={<Search />} />
        <Route path="/detail/:type/:id" element={<Detail />} />
        <Route path="/library" element={<Library />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
