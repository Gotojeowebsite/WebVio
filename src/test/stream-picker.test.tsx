import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import StreamPicker from '../components/detail/StreamPicker'
import { Meta } from '../api/addon-client'
import { useAddonStore } from '../store/addon-store'
import { useAuthStore } from '../store/auth-store'
import { usePlayerStore } from '../store/player-store'
import * as streamResolver from '../utils/stream-resolver'
import { AddonClient } from '../api/addon-client'

const mockedNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  }
})

describe('StreamPicker Component (Nuvio Stream Selection UI)', () => {
  const mockMeta: Meta = {
    id: 'tt0903747',
    type: 'series',
    name: 'Breaking Bad',
    videos: [
      { id: 'tt0903747:1:1', title: 'Pilot', season: 1, episode: 1 },
      { id: 'tt0903747:1:2', title: "Cat's in the Bag...", season: 1, episode: 2 },
    ],
  }

  const sampleStreams = [
    {
      name: 'Torrentio\n4K HDR',
      title: 'Breaking.Bad.S01E01.2160p.UHD.BluRay.x265.TrueHD.Atmos.7.1-FLUX\n💾 14.5 GB 👤 150',
      infoHash: '4k_flux_hash_12345678901234567890123456',
    },
    {
      name: 'Torrentio\n1080p',
      title: 'Breaking.Bad.S01E01.1080p.WEB-DL.DDP5.1.H.264-NTb\n💾 3.2 GB 👤 90',
      infoHash: '1080p_ntb_hash_123456789012345678901234',
    },
    {
      name: 'Direct CDN',
      title: 'Breaking.Bad.S01E01.720p.HDTV.AAC\n💾 900 MB',
      url: 'https://cdn.example.com/s01e01_720p.mp4',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    useAddonStore.setState({
      addons: [
        {
          manifestUrl: 'https://torrentio.strem.fun/manifest.json',
          manifest: {
            id: 'torrentio',
            name: 'Torrentio',
            version: '1.0.0',
            description: 'Torrentio provider',
            types: ['movie', 'series'],
            resources: ['stream'],
            catalogs: [],
          },
          enabled: true,
          order: 0,
        },
      ],
    })

    useAuthStore.setState({
      torboxApiKey: 'mock_tb_key',
      torboxConnected: true,
    })

    // Mock AddonClient getStreams and loadManifest
    vi.spyOn(AddonClient.prototype, 'loadManifest').mockResolvedValue({
      name: 'Stream Provider',
      id: 'provider',
    } as any)

    vi.spyOn(AddonClient.prototype, 'getStreams').mockResolvedValue({
      streams: sampleStreams as any,
    })

    // Mock batchCheckCached
    vi.spyOn(streamResolver, 'batchCheckCached').mockResolvedValue({
      '4k_flux_hash_12345678901234567890123456': true,
      '1080p_ntb_hash_123456789012345678901234': false,
    })

    // Mock resolveStreamUrl
    vi.spyOn(streamResolver, 'resolveStreamUrl').mockImplementation(async (stream) => {
      if (stream.url) return stream.url
      if (stream.infoHash) return `https://debrid.torbox.app/download/${stream.infoHash}.mp4`
      return null
    })
  })

  it('renders modal dialog when isOpen is true with stream counts and episode context', async () => {
    const handleClose = vi.fn()
    render(
      <MemoryRouter>
        <StreamPicker
          isOpen={true}
          onClose={handleClose}
          type="series"
          videoId="tt0903747:1:1"
          meta={mockMeta}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/select a stream/i)).toBeInTheDocument()
    expect(screen.getByText('S1 E1')).toBeInTheDocument()

    // Wait for streams to load
    await waitFor(() => {
      expect(screen.getByText(/Breaking Bad S01E01 2160p/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/3 streams/i)).toBeInTheDocument()
  })

  it('filters stream list when clicking quality filter tabs', async () => {
    render(
      <MemoryRouter>
        <StreamPicker
          isOpen={true}
          onClose={vi.fn()}
          type="series"
          videoId="tt0903747:1:1"
          meta={mockMeta}
        />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Breaking Bad S01E01 2160p/i)).toBeInTheDocument()
    })

    // Filter by 4K tab
    const tab4K = screen.getByRole('button', { name: /^4K/i })
    fireEvent.click(tab4K)

    expect(screen.getByText(/Breaking Bad S01E01 2160p/i)).toBeInTheDocument()
    expect(screen.queryByText(/Breaking Bad S01E01 1080p/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Breaking Bad S01E01 720p/i)).not.toBeInTheDocument()

    // Filter by 1080p tab
    const tab1080p = screen.getByRole('button', { name: /^1080p/i })
    fireEvent.click(tab1080p)

    expect(screen.queryByText(/Breaking Bad S01E01 2160p/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Breaking Bad S01E01 1080p/i)).toBeInTheDocument()

    // Filter by Direct tab
    const tabDirect = screen.getByRole('button', { name: /direct \/ free/i })
    fireEvent.click(tabDirect)

    expect(screen.getByText(/Breaking Bad S01E01 720p/i)).toBeInTheDocument()
    expect(screen.queryByText(/Breaking Bad S01E01 2160p/i)).not.toBeInTheDocument()
  })

  it('filters streams by text search query and allows clearing', async () => {
    render(
      <MemoryRouter>
        <StreamPicker
          isOpen={true}
          onClose={vi.fn()}
          type="series"
          videoId="tt0903747:1:1"
          meta={mockMeta}
        />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Breaking Bad S01E01 2160p/i)).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/search streams/i)
    fireEvent.change(searchInput, { target: { value: 'FLUX' } })

    expect(screen.getByText(/Breaking Bad S01E01 2160p/i)).toBeInTheDocument()
    expect(screen.queryByText(/Breaking Bad S01E01 1080p/i)).not.toBeInTheDocument()

    // Clear search
    const clearBtn = screen.getByLabelText(/clear search query/i)
    fireEvent.click(clearBtn)

    expect(screen.getByText(/Breaking Bad S01E01 1080p/i)).toBeInTheDocument()
  })

  it('sorts streams by quality, size, and seeders', async () => {
    render(
      <MemoryRouter>
        <StreamPicker
          isOpen={true}
          onClose={vi.fn()}
          type="series"
          videoId="tt0903747:1:1"
          meta={mockMeta}
        />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Breaking Bad S01E01 2160p/i)).toBeInTheDocument()
    })

    const sortSelect = screen.getByLabelText(/sort streams by/i)
    fireEvent.change(sortSelect, { target: { value: 'size' } })

    const cards = screen.getAllByRole('button', { name: /play stream/i })
    expect(cards.length).toBe(3)
    // 14.5 GB should be first
    expect(cards[0]).toHaveTextContent(/2160p|4K|14\.5 GB/i)
  })

  it('resolves stream and navigates to player when card is clicked', async () => {
    const handleClose = vi.fn()
    render(
      <MemoryRouter>
        <StreamPicker
          isOpen={true}
          onClose={handleClose}
          type="series"
          videoId="tt0903747:1:1"
          meta={mockMeta}
        />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Breaking Bad S01E01 2160p/i)).toBeInTheDocument()
    })

    const card4K = screen.getByRole('button', { name: /play stream.*2160p/i })
    fireEvent.click(card4K)

    await waitFor(() => {
      expect(handleClose).toHaveBeenCalled()
      expect(mockedNavigate).toHaveBeenCalledWith('/player')
    })

    const playerState = usePlayerStore.getState()
    expect(playerState.currentStream?.url).toContain('4k_flux_hash')
  })

  it('closes modal when Escape key is pressed', async () => {
    const handleClose = vi.fn()
    render(
      <MemoryRouter>
        <StreamPicker
          isOpen={true}
          onClose={handleClose}
          type="series"
          videoId="tt0903747:1:1"
          meta={mockMeta}
        />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Breaking Bad S01E01 2160p/i)).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalled()
  })

  it('triggers download and displays success toast when download button is clicked', async () => {
    render(
      <MemoryRouter>
        <StreamPicker
          isOpen={true}
          onClose={vi.fn()}
          type="series"
          videoId="tt0903747:1:1"
          meta={mockMeta}
        />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Breaking Bad S01E01 2160p/i)).toBeInTheDocument()
    })

    const downloadButtons = screen.getAllByRole('button', { name: /download/i })
    expect(downloadButtons.length).toBeGreaterThan(0)

    // Click download on the 4K stream
    fireEvent.click(downloadButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Added.*Download Manager/i)
    })

    const toastDismiss = screen.getByLabelText(/dismiss toast/i)
    fireEvent.click(toastDismiss)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

