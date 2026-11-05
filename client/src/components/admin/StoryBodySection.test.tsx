import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({
  body: vi.fn(),
  bodyVerificacion: vi.fn(),
  updateBody: vi.fn(),
  draftBody: vi.fn(),
}))
vi.mock('../../lib/admin-api', () => ({ adminApi: { stories: api } }))

import { StoryBodySection } from './StoryBodySection'

const cuerpo = {
  id: 'b1', storyId: 's1', bajada: 'Bajada.', quePaso: 'Se pagaron 150 millones.', porQueImporta: 'Importa.', contexto: 'Contexto.', queSigue: '',
  bajadaEn: null, quePasoEn: null, porQueImportaEn: null, contextoEn: null, queSigueEn: null,
  method: 'ia_sin_revision', reviewedBy: '', model: 'gpt-4.1-mini', inputTokens: 100, outputTokens: 50, sourceChars: 2000,
  updatedAt: '2026-11-05T00:00:00Z', createdAt: '2026-11-05T00:00:00Z',
}

const verificacion = {
  original: 'Texto original completo del medio.',
  puntos: [
    { campo: 'quePaso', tipo: 'cifra', valor: '150', enOriginal: true, contextos: ['…el tribunal ordenó pagar 150 millones de dólares…'] },
    { campo: 'quePaso', tipo: 'nombre', valor: 'Burgum', enOriginal: false, contextos: [] },
  ],
}

describe('StoryBodySection · cotejo con el original', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    api.body.mockResolvedValue({ body: cuerpo })
    api.bodyVerificacion.mockResolvedValue(verificacion)
  })

  it('muestra cada cifra con su frase del original y marca lo que no aparece', async () => {
    render(<StoryBodySection story={{ id: 's1', slug: 'x' }} />)
    expect(await screen.findByText(/Para cotejar con el original \(2, 1 sin respaldo\)/)).toBeInTheDocument()
    expect(screen.getByText(/el tribunal ordenó pagar/)).toBeInTheDocument()
    expect(screen.getByText(/No aparece igual en el original/)).toBeInTheDocument()
    expect(screen.getByText('Texto original completo del medio.')).toBeInTheDocument()
  })

  it('si el cotejo no carga, la revisión sigue siendo posible', async () => {
    api.bodyVerificacion.mockRejectedValue(new Error('500'))
    render(<StoryBodySection story={{ id: 's1', slug: 'x' }} />)
    expect(await screen.findByRole('button', { name: 'Dar por revisada' })).toBeInTheDocument()
    expect(screen.queryByText(/Para cotejar/)).not.toBeInTheDocument()
  })

  it('recuerda el nombre del revisor: la siguiente nota se aprueba de un clic', async () => {
    api.updateBody.mockResolvedValue({ body: { ...cuerpo, method: 'ia_revisada', reviewedBy: 'Ana' }, avisos: [] })
    const user = userEvent.setup()
    const { unmount } = render(<StoryBodySection story={{ id: 's1', slug: 'x' }} />)
    await user.type(await screen.findByLabelText('Revisada por'), 'Ana')
    await user.click(screen.getByRole('button', { name: 'Dar por revisada' }))
    await waitFor(() => expect(api.updateBody).toHaveBeenCalledWith('s1', { reviewedBy: 'Ana' }))
    unmount()

    render(<StoryBodySection story={{ id: 's2', slug: 'y' }} />)
    const campo = (await screen.findByLabelText('Revisada por')) as HTMLInputElement
    expect(campo.value).toBe('Ana')
    expect(screen.getByRole('button', { name: 'Dar por revisada' })).toBeEnabled()
  })
})
