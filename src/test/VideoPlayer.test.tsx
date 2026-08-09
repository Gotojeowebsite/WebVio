import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VideoPlayer from '../components/player/VideoPlayer'
import { usePlayerStore } from '../store/player-store'

// Mock HTMLMediaElement methods
window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve())
window.HTMLMediaElement.prototype.pause = vi.fn()
window.HTMLMediaElement.prototype.load = vi.fn()

describe('VideoPlayer Component', () => {
  beforeEach(() => {
    localStorage.clear()
    usePlayerStore.setState({
      availableStreams: [
        {
          addonName: 'Torrentio',
          addonId: 'torrentio',
          url: 'https://example.com/stream-4k.mp4',
          quality: '4K',
          size: '6.5 GB',
        },
        {
          addonName: 'MediaFusion',
          addonId: 'mediafusion',
          url: 'https://example.com/stream-1080p.mp4',
          quality: '1080p',
          size: '2.2 GB',
        },
      ],
    })
  })

  it('renders title, subtitle, and control buttons', () => {
    render(
      <VideoPlayer
        src="https://example.com/video.mp4"
        title="Dune: Part Two"
        subtitle="S1E1 - Arrival"
        quality="4K"
      />
    )

    expect(screen.getByText('Dune: Part Two')).toBeInTheDocument()
    expect(screen.getByText('S1E1 - Arrival')).toBeInTheDocument()
    expect(screen.getByTitle('Play/Pause (Space)')).toBeInTheDocument()
    expect(screen.getByTitle('Stream Quality')).toBeInTheDocument()
    expect(screen.getByTitle('Picture-in-Picture (P)')).toBeInTheDocument()
    expect(screen.getByTitle('Fullscreen (F)')).toBeInTheDocument()
  })

  it('opens and displays stream quality popover options', () => {
    render(
      <VideoPlayer
        src="https://example.com/stream-4k.mp4"
        title="Dune: Part Two"
        quality="4K"
      />
    )

    const qualityBtn = screen.getByTitle('Stream Quality')
    fireEvent.click(qualityBtn)

    expect(screen.getByText('Stream Quality')).toBeInTheDocument()
    expect(screen.getByText(/4K • Torrentio/)).toBeInTheDocument()
    expect(screen.getByText(/1080p • MediaFusion/)).toBeInTheDocument()
  })

  it('responds to keyboard shortcuts for play/pause and mute', () => {
    render(
      <VideoPlayer
        src="https://example.com/video.mp4"
        title="Dune: Part Two"
      />
    )

    // Space key for Play/Pause
    fireEvent.keyDown(window, { key: ' ' })
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled()

    // Mute key
    fireEvent.keyDown(window, { key: 'm' })
    const muteBtn = screen.getByTitle('Mute/Unmute (M)')
    expect(muteBtn).toBeInTheDocument()
  })
})
