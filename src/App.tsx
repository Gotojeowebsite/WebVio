import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/auth-store'
import Layout from './components/layout/Layout'
import ErrorBoundary from './components/ui/ErrorBoundary'
import Login from './pages/Login'
import Home from './pages/Home'
import Detail from './pages/Detail'
import Search from './pages/Search'
import Library from './pages/Library'
import Settings from './pages/Settings'
import Player from './pages/Player'
import WasmPlayer from './pages/WasmPlayer'

function App() {
  const { nuvioLoggedIn, loadFromStorage } = useAuthStore()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  return (
    <Routes>
      <Route path="/login" element={
        <ErrorBoundary fallbackTitle="Login Error">
          {nuvioLoggedIn ? <Navigate to="/" replace /> : <Login />}
        </ErrorBoundary>
      } />
      <Route path="/player" element={
        <ErrorBoundary fallbackTitle="Player Error">
          <Player />
        </ErrorBoundary>
      } />
      <Route path="/wasm-player" element={
        <ErrorBoundary fallbackTitle="WASM Player Error">
          <WasmPlayer />
        </ErrorBoundary>
      } />
      <Route element={<Layout />}>
        <Route path="/" element={
          <ErrorBoundary fallbackTitle="Home Feed Error">
            {nuvioLoggedIn ? <Home /> : <Navigate to="/login" replace />}
          </ErrorBoundary>
        } />
        <Route path="/search" element={
          <ErrorBoundary fallbackTitle="Search Error">
            <Search />
          </ErrorBoundary>
        } />
        <Route path="/detail/:type/:id" element={
          <ErrorBoundary fallbackTitle="Media Details Error">
            <Detail />
          </ErrorBoundary>
        } />
        <Route path="/library" element={
          <ErrorBoundary fallbackTitle="Library Error">
            <Library />
          </ErrorBoundary>
        } />
        <Route path="/settings" element={
          <ErrorBoundary fallbackTitle="Settings Error">
            <Settings />
          </ErrorBoundary>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
