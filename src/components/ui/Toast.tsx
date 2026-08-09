import React from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import './toast.css'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface ToastProps {
  id?: string
  message: string
  variant?: ToastVariant
  onClose?: () => void
  duration?: number
}

const variantIcons: Record<ToastVariant, React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

export function Toast({ message, variant = 'info', onClose }: ToastProps) {
  const Icon = variantIcons[variant]

  return (
    <div
      className={`toast toast-${variant}`}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      <span className="toast-icon-wrapper" aria-hidden="true">
        <Icon size={18} />
      </span>
      <p className="toast-message">{message}</p>
      {onClose && (
        <button
          type="button"
          className="toast-close-btn"
          onClick={onClose}
          aria-label="Close notification"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export default Toast
