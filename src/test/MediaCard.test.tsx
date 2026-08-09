import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
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
  const mockItem: MetaPreview = {
    id: 'tt1234567',
    type: 'movie',
    name: 'Interstellar Odyssey',
    poster: 'https://example.com/poster.jpg',
    posterShape: 'poster',
    releaseInfo: '2024',
    imdbRating: '8.9',
    genres: ['Sci-Fi', 'Adventure'],
  }

  it('renders media card with title and rating', () => {
    render(
      <MemoryRouter>
        <MediaCard item={mockItem} />
      </MemoryRouter>
    )

    expect(screen.getByText('Interstellar Odyssey')).toBeInTheDocument()
    expect(screen.getByText('8.9')).toBeInTheDocument()
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
  })
})

