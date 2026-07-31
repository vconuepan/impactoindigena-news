import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../ui/Toast'
import { LinkedInTokenCard } from './LinkedInTokenCard'
import type { LinkedInTokenStatus } from '../../lib/admin-api'

const mockApi = vi.hoisted(() => ({
  tokenStatus: vi.fn(),
  startAuthorization: vi.fn(),
}))

vi.mock('../../lib/admin-api', () => ({
  adminApi: { linkedin: mockApi },
}))

function renderCard(status: Partial<LinkedInTokenStatus>) {
  mockApi.tokenStatus.mockResolvedValue({ configured: true, canReauthorize: true, ...status })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <LinkedInTokenCard />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('LinkedInTokenCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a healthy token with the days left', async () => {
    renderCard({ active: true, status: 'active', daysLeft: 42, warnThresholdDays: 7 })

    expect(await screen.findByText('Token activo')).toBeInTheDocument()
    expect(screen.getByText(/Quedan 42 días/)).toBeInTheDocument()
  })

  // El caso de junio de 2026: token muerto. Tiene que decirlo sin rodeos.
  it('says plainly that an expired token blocks publishing', async () => {
    renderCard({ active: false, status: 'expired', daysLeft: -12 })

    expect(await screen.findByText(/Token expirado — no se puede publicar/)).toBeInTheDocument()
  })

  it('distinguishes a revoked token from an expired one', async () => {
    renderCard({ active: false, status: 'revoked' })

    expect(await screen.findByText(/Token revocado/)).toBeInTheDocument()
  })

  // El aviso con antelación es el punto: cuando expira, ya es tarde.
  it('warns while the token is still valid but inside the threshold', async () => {
    renderCard({ active: true, status: 'active', daysLeft: 3, warnThresholdDays: 7 })

    expect(await screen.findByText('El token expira en 3 días')).toBeInTheDocument()
    expect(screen.getByText(/Reautoriza ahora/)).toBeInTheDocument()
  })

  it('uses the singular for the last day', async () => {
    renderCard({ active: true, daysLeft: 1, warnThresholdDays: 7 })

    expect(await screen.findByText('El token expira en 1 día')).toBeInTheDocument()
  })

  it('sends the browser to LinkedIn when reauthorizing', async () => {
    const user = userEvent.setup()
    mockApi.startAuthorization.mockResolvedValue({
      url: 'https://www.linkedin.com/oauth/v2/authorization?client_id=x',
    })
    // jsdom no navega: se observa la asignación.
    const location = { href: '' }
    Object.defineProperty(window, 'location', { value: location, writable: true })

    renderCard({ active: false, status: 'expired' })
    await user.click(await screen.findByRole('button', { name: 'Reautorizar' }))

    expect(mockApi.startAuthorization).toHaveBeenCalledTimes(1)
    await vi.waitFor(() =>
      expect(location.href).toBe('https://www.linkedin.com/oauth/v2/authorization?client_id=x'),
    )
  })

  // Sin credenciales de app no hay nada que ofrecer: el botón no debe aparecer.
  it('hides the reauthorize button when the app credentials are missing', async () => {
    renderCard({ active: false, canReauthorize: false })

    expect(await screen.findByText(/Token expirado/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reautorizar' })).not.toBeInTheDocument()
  })

  it('reports that the check itself failed, instead of implying the token is fine', async () => {
    renderCard({ configured: true, canReauthorize: false, error: 'LINKEDIN_CLIENT_ID not configured' })

    expect(await screen.findByText(/No se pudo verificar el token/)).toBeInTheDocument()
  })

  it('says when LinkedIn is not configured at all', async () => {
    renderCard({ configured: false, canReauthorize: false })

    expect(await screen.findByText(/LinkedIn no está configurado/)).toBeInTheDocument()
  })
})
