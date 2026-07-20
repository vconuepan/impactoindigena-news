import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ArticleInlineCta from './ArticleInlineCta'

const mockSubscribe = vi.fn()

vi.mock('../lib/api', () => ({
  publicApi: {
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
}))

vi.mock('../i18n', () => ({
  default: { language: 'es' },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'articleCta.eyebrow': 'Boletín semanal',
        'articleCta.headline': 'Las noticias que importan, cada semana.',
        'articleCta.emailLabel': 'Correo electrónico',
        'articleCta.placeholder': 'tu@correo.com',
        'articleCta.submit': 'Suscribirse gratis',
        'articleCta.submitting': 'Suscribiendo...',
        'articleCta.success': '¡Listo! Revisa tu correo.',
        'articleCta.error': 'Algo salió mal.',
      }
      return map[key] ?? key
    },
  }),
}))

describe('ArticleInlineCta', () => {
  beforeEach(() => {
    mockSubscribe.mockReset()
  })

  it('renders an inline email field and submit button (no name field, no modal)', () => {
    render(<ArticleInlineCta />)
    expect(screen.getByPlaceholderText('tu@correo.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /suscribirse/i })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/nombre/i)).not.toBeInTheDocument()
  })

  it('subscribes with email + language only and shows inline success', async () => {
    mockSubscribe.mockResolvedValue({ success: true, message: 'ok' })
    const user = userEvent.setup()

    render(<ArticleInlineCta />)
    await user.type(screen.getByPlaceholderText('tu@correo.com'), 'lector@example.com')
    await user.click(screen.getByRole('button', { name: /suscribirse/i }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('¡Listo!')
    })
    expect(mockSubscribe).toHaveBeenCalledWith({ email: 'lector@example.com', language: 'es' })
  })

  it('shows an error when the API reports failure', async () => {
    mockSubscribe.mockResolvedValue({ success: false, message: 'bad' })
    const user = userEvent.setup()

    render(<ArticleInlineCta />)
    await user.type(screen.getByPlaceholderText('tu@correo.com'), 'bad@example.com')
    await user.click(screen.getByRole('button', { name: /suscribirse/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal.')
    })
  })

  it('shows an error on network failure', async () => {
    mockSubscribe.mockRejectedValue(new Error('network'))
    const user = userEvent.setup()

    render(<ArticleInlineCta />)
    await user.type(screen.getByPlaceholderText('tu@correo.com'), 'test@example.com')
    await user.click(screen.getByRole('button', { name: /suscribirse/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
