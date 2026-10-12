import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../ui/Toast'
import { CommunityKeywordsPanel, parseKeywordList, problemasDeLista } from './CommunityKeywordsPanel'
import type { AdminCommunity, KeywordsPreview } from '../../lib/admin-api'

/**
 * El editor de palabras clave no guarda sin medir: «Guardar» se habilita solo
 * cuando la lista que se guarda es la misma que se midió, y una vertical que
 * quedaría vacía pide confirmación explícita.
 */
const api = vi.hoisted(() => ({ previewKeywords: vi.fn(), updateKeywords: vi.fn() }))

vi.mock('../../lib/admin-api', () => ({
  adminApi: { communities: api },
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

const comunidad: AdminCommunity = {
  id: 'c1',
  slug: 'mapuche',
  name: 'Mapuche',
  description: '',
  type: 'PUEBLO',
  region: null,
  active: true,
  lat: null,
  lng: null,
  keywords: ['mapuche', 'Wallmapu'],
  createdAt: '2026-01-01T00:00:00Z',
  _count: { members: 3 },
}

function medicion(over: Partial<KeywordsPreview> = {}): KeywordsPreview {
  return {
    mode: 'shadow',
    actual: 433,
    propuesta: 440,
    entran: { total: 7, ejemplos: [{ slug: 'n1', title: 'Nota que entra', datePublished: null }] },
    salen: { total: 0, ejemplos: [] },
    nuevas: [{ keyword: 'Puelmapu', notas: 12, ejemplos: [{ slug: 'n2', title: 'Nota del Puelmapu', datePublished: null }] }],
    quitadas: [],
    keywords: ['mapuche', 'Wallmapu', 'Puelmapu'],
    ...over,
  }
}

function montar() {
  const onClose = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <CommunityKeywordsPanel community={comunidad} open onClose={onClose} />
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { onClose, textarea: screen.getByLabelText(/palabras clave, separadas por comas/i) }
}

const guardar = () => screen.getByRole('button', { name: 'Guardar' })
const medir = () => screen.getByRole('button', { name: /medir el cambio/i })
const RESULTADO = /pertenecen hoy 433 notas; con esta lista serían 440/i

beforeEach(() => {
  vi.clearAllMocks()
  api.previewKeywords.mockResolvedValue(medicion())
  api.updateKeywords.mockImplementation(async (_id: string, keywords: string[]) => ({ ...comunidad, keywords }))
})

describe('parseKeywordList y problemasDeLista', () => {
  it('separa por comas, limpia y deduplica sin distinguir mayúsculas', () => {
    expect(parseKeywordList(' mapuche, Mapuche ,, Wallmapu ,')).toEqual(['mapuche', 'Wallmapu'])
  })

  it('dice lo que el servidor rechazaría', () => {
    expect(problemasDeLista(['mapuche'])).toEqual([])
    expect(problemasDeLista(['a', 'x'.repeat(61), 'mapuche'])[0]).toMatch(/2 a 60 caracteres\): a, x+$/)
    expect(problemasDeLista(Array.from({ length: 41 }, (_, i) => `k${i}`))[0]).toMatch(/máximo 40/)
  })
})

describe('CommunityKeywordsPanel', () => {
  it('sin cambios no se puede guardar, aunque se haya medido', async () => {
    montar()
    expect(guardar()).toBeDisabled()
    expect(screen.getByText('Sin cambios')).toBeInTheDocument()
    api.previewKeywords.mockResolvedValue(medicion({ propuesta: 433, entran: { total: 0, ejemplos: [] }, nuevas: [] }))
    fireEvent.click(medir())
    await screen.findByText(/serían 433/i)
    expect(guardar()).toBeDisabled()
  })

  it('con cambios pide medir antes de guardar, anuncia la medición y guarda la lista medida', async () => {
    const { textarea, onClose } = montar()
    fireEvent.change(textarea, { target: { value: 'mapuche, Wallmapu, Puelmapu' } })
    expect(guardar()).toBeDisabled()
    expect(screen.getByText('Mide antes de guardar')).toBeInTheDocument()

    fireEvent.click(medir())
    await screen.findByText(RESULTADO)
    expect(api.previewKeywords).toHaveBeenCalledWith('c1', ['mapuche', 'Wallmapu', 'Puelmapu'])
    expect(screen.getByText('Nota del Puelmapu')).toBeInTheDocument()
    expect(screen.getByText('Entran 7')).toBeInTheDocument()
    // La región viva del pie anuncia el resultado a un lector de pantalla.
    expect(screen.getByText('Medido: serían 440 notas')).toBeInTheDocument()

    expect(guardar()).toBeEnabled()
    fireEvent.click(guardar())
    await waitFor(() => expect(api.updateKeywords).toHaveBeenCalledWith('c1', ['mapuche', 'Wallmapu', 'Puelmapu']))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('si la lista cambia después de medir, vuelve a pedir medir', async () => {
    const { textarea } = montar()
    fireEvent.change(textarea, { target: { value: 'mapuche, Wallmapu, Puelmapu' } })
    fireEvent.click(medir())
    await screen.findByText(RESULTADO)
    expect(guardar()).toBeEnabled()

    fireEvent.change(textarea, { target: { value: 'mapuche, Wallmapu, Puelmapu, lof' } })
    expect(guardar()).toBeDisabled()
    expect(screen.queryByText(RESULTADO)).not.toBeInTheDocument()
  })

  it('si el texto cambia MIENTRAS se mide, la medición vale para la lista enviada y no para la nueva', async () => {
    // TanStack Query corre el onSuccess del último render: la firma tiene que salir
    // de la lista enviada, no del texto en pantalla al volver la respuesta.
    let resolver!: (v: KeywordsPreview) => void
    api.previewKeywords.mockReturnValueOnce(new Promise<KeywordsPreview>((r) => { resolver = r }))
    const { textarea } = montar()
    fireEvent.change(textarea, { target: { value: 'mapuche, Wallmapu, Puelmapu' } })
    fireEvent.click(medir())
    fireEvent.change(textarea, { target: { value: 'mapuche, Wallmapu, cam' } })
    resolver(medicion())
    await waitFor(() => expect(medir()).toBeEnabled())

    expect(guardar()).toBeDisabled()
    expect(screen.getByText('Mide antes de guardar')).toBeInTheDocument()
    expect(screen.queryByText(RESULTADO)).not.toBeInTheDocument()
    // Y si se vuelve a la lista medida, la medición sigue valiendo.
    fireEvent.change(textarea, { target: { value: 'mapuche, Wallmapu, Puelmapu' } })
    expect(screen.getByText(RESULTADO)).toBeInTheDocument()
    expect(guardar()).toBeEnabled()
  })

  it('una vertical que quedaría vacía exige confirmación, y lo dice en la región viva', async () => {
    api.previewKeywords.mockResolvedValue(medicion({ propuesta: 0, salen: { total: 433, ejemplos: [] } }))
    const { textarea } = montar()
    fireEvent.change(textarea, { target: { value: 'zzz' } })
    fireEvent.click(medir())
    await screen.findByText('La vertical quedaría vacía.')
    expect(guardar()).toBeDisabled()
    expect(screen.getByText('Marca la confirmación para guardar')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/no mostrará ninguna nota/i))
    expect(guardar()).toBeEnabled()
  })

  it('las palabras fuera de rango se marcan antes de medir, y el campo queda inválido', () => {
    const { textarea } = montar()
    fireEvent.change(textarea, { target: { value: 'a, mapuche, Wallmapu' } })
    expect(medir()).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(/caracteres\): a$/)
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(textarea.getAttribute('aria-describedby')).toContain('community-keywords-errores')
    expect(screen.getByText('Corrige la lista antes de medir')).toBeInTheDocument()
  })

  it('avisa de las palabras nuevas cortas, que se buscan como parte de otras', () => {
    const { textarea } = montar()
    fireEvent.change(textarea, { target: { value: 'mapuche, Wallmapu, cam' } })
    expect(screen.getByRole('note')).toHaveTextContent('cam')
    expect(textarea.getAttribute('aria-describedby')).toContain('community-keywords-cortas')
  })

  it('en una vertical que aplica la revisión, advierte que las notas que entran esperan a un editor', async () => {
    api.previewKeywords.mockResolvedValue(medicion({ mode: 'enforce' }))
    const { textarea } = montar()
    fireEvent.change(textarea, { target: { value: 'mapuche, Wallmapu, Puelmapu' } })
    fireEvent.click(medir())
    await screen.findByText(RESULTADO)
    expect(screen.getByText(/esperan a que un editor las libere/i)).toBeInTheDocument()
  })
})
