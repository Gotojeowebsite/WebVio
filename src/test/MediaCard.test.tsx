import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MediaCard from '../components/catalog/MediaCard'
import { MetaPreview } from '../api/addon-client'

const mockedNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  }
})

describe('MediaCard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockItem: MetaPreview = {
    id: 'tt1234567',
    type: 'movie',
    name: 'Interstellar Odyssey',
    poster: 'https://example.com/poster.jpg',
    posterShape: 'poster',
    releaseInfo: '2024',
    year: 2024,
    imdbRating: '8.9',
    genres: ['Sci-Fi', 'Adventure'],
  }

  it('renders media card with title, year, type badge, and rating', () => {
    render(
      <MemoryRouter>
        <MediaCard item={mockItem} />
      </MemoryRouter>
    )

    expect(screen.getByText('Interstellar Odyssey')).toBeInTheDocument()
    expect(screen.getByText('8.9')).toBeInTheDocument()
    expect(screen.getByText('2024')).toBeInTheDocument()
    expect(screen.getByText('movie')).toBeInTheDocument()
  })

  it('renders accessible button with aria-label and handles click/enter navigation', () => {
    render(
      <MemoryRouter>
        <MediaCard item={mockItem} />
      </MemoryRouter>
    )

    const card = screen.getByRole('button', { name: /interstellar odyssey/i })
    expect(card).toBeInTheDocument()
    fireEvent.click(card)
    expect(mockedNavigate).toHaveBeenCalledWith('/detail/movie/tt1234567')

    fireEvent.keyDown(card, { key: 'Enter' })
    expect(mockedNavigate).toHaveBeenCalledWith('/detail/movie/tt1234567')

    fireEvent.keyDown(card, { key: ' ' })
    expect(mockedNavigate).toHaveBeenCalledWith('/detail/movie/tt1234567')
  })

  it('renders episode badge and deep links to episode for series cards', () => {
    const seriesItem = {
      id: 'tt0903747',
      type: 'series',
      name: 'Breaking Bad',
      poster: 'https://example.com/breakingbad.jpg',
      video: {
        id: 'tt0903747:2:3',
        season: 2,
        episode: 3,
        title: 'Bit by a Dead Bee',
      },
      progressPercent: 65,
    }

    render(
      <MemoryRouter>
        <MediaCard item={seriesItem} />
      </MemoryRouter>
    )

    expect(screen.getByText('S2:E3')).toBeInTheDocument()
    const card = screen.getByRole('button', { name: /breaking bad/i })
    fireEvent.click(card)

    expect(mockedNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/detail/series/tt0903747?episode=tt0903747%3A2%3A3&season=2')
    )
  })

  it('renders fallback placeholder when poster fails to load', () => {
    render(
      <MemoryRouter>
        <MediaCard item={{ ...mockItem, poster: 'https://invalid.url/image.jpg' }} />
      </MemoryRouter>
    )

    const img = screen.getByRole('img', { name: /interstellar odyssey/i })
    fireEvent.error(img)

    // Poster replaced by fallback placeholder
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getAllByText('Interstellar Odyssey').length).toBeGreaterThanOrEqual(1)
  })
})
