import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Downloads from '../pages/Downloads'
import { useDownloadStore } from '../store/download-store'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('Downloads Page Component', () => {
  beforeEach(() => {
    localStorage.clear()
    mockNavigate.mockReset()
    useDownloadStore.setState({
      items: [
        {
          id: 'dl_1',
          title: 'Interstellar',
          subtitle: '1080p BluRay',
          meta: { id: 'tt0816692', name: 'Interstellar', type: 'movie' },
          video: null,
          stream: { url: 'https://example.com/interstellar.mp4' },
          url: 'https://example.com/interstellar.mp4',
          quality: '1080p',
          addonName: 'Torrentio',
          totalBytes: 2.2 * 1024 * 1024 * 1024,
          downloadedBytes: 1.1 * 1024 * 1024 * 1024,
          progress: 50,
          speed: 30 * 1024 * 1024,
          speedFormatted: '30.0 MB/s',
          eta: 37,
          etaFormatted: '37s',
          status: 'downloading',
          createdAt: Date.now(),
        },
        {
          id: 'dl_2',
          title: 'Blade Runner 2049',
          meta: { id: 'tt1856101', name: 'Blade Runner 2049', type: 'movie' },
          video: null,
          stream: { url: 'https://example.com/bladerunner.mp4' },
          url: 'https://example.com/bladerunner.mp4',
          quality: '4K',
          addonName: 'MediaFusion',
          totalBytes: 6.5 * 1024 * 1024 * 1024,
          downloadedBytes: 6.5 * 1024 * 1024 * 1024,
          progress: 100,
          speed: 0,
          speedFormatted: '0 MB/s',
          eta: 0,
          etaFormatted: 'Done',
          status: 'completed',
          createdAt: Date.now() - 60000,
          completedAt: Date.now(),
        },
      ],
      activeTab: 'all',
      searchQuery: '',
    })
  })

  it('renders download page header and overview stats', () => {
    render(
      <MemoryRouter>
        <Downloads />
      </MemoryRouter>
    )

    expect(screen.getByText('Downloads Manager')).toBeInTheDocument()
    expect(screen.getByText('Interstellar')).toBeInTheDocument()
    expect(screen.getByText('Blade Runner 2049')).toBeInTheDocument()
    expect(screen.getAllByText(/30.0 MB\/s/).length).toBeGreaterThan(0)
  })

  it('filters items when switching tabs', () => {
    render(
      <MemoryRouter>
        <Downloads />
      </MemoryRouter>
    )

    // Click Active Tab
    const activeTab = screen.getByRole('tab', { name: /Active/i })
    fireEvent.click(activeTab)

    expect(screen.getByText('Interstellar')).toBeInTheDocument()
    expect(screen.queryByText('Blade Runner 2049')).not.toBeInTheDocument()

    // Click Completed Tab
    const completedTab = screen.getByRole('tab', { name: /Completed/i })
    fireEvent.click(completedTab)

    expect(screen.getByText('Blade Runner 2049')).toBeInTheDocument()
    expect(screen.queryByText('Interstellar')).not.toBeInTheDocument()
  })

  it('filters items using search query', () => {
    render(
      <MemoryRouter>
        <Downloads />
      </MemoryRouter>
    )

    const searchInput = screen.getByPlaceholderText('Search downloads...')
    fireEvent.change(searchInput, { target: { value: 'Blade' } })

    expect(screen.getByText('Blade Runner 2049')).toBeInTheDocument()
    expect(screen.queryByText('Interstellar')).not.toBeInTheDocument()
  })

  it('handles play in WebVio action for completed downloads', () => {
    render(
      <MemoryRouter>
        <Downloads />
      </MemoryRouter>
    )

    const playBtn = screen.getByLabelText('Play Blade Runner 2049 in WebVio')
    fireEvent.click(playBtn)

    expect(mockNavigate).toHaveBeenCalledWith('/player')
  })
})
