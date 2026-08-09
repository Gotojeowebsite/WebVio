import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Toast } from '../components/ui/Toast'

describe('Toast Component', () => {
  it('renders success toast with message', () => {
    render(<Toast message="Connection successful" variant="success" />)
    expect(screen.getByText('Connection successful')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('toast-success')
  })

  it('renders error toast with alert role', () => {
    render(<Toast message="Failed to load streams" variant="error" />)
    expect(screen.getByText('Failed to load streams')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveClass('toast-error')
  })

  it('calls onClose callback when close button is clicked', () => {
    const handleClose = vi.fn()
    render(<Toast message="Notification" variant="info" onClose={handleClose} />)
    const closeBtn = screen.getByRole('button', { name: /close notification/i })
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
