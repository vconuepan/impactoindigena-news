import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'
import EditorialDetailPage, { MIN_NOTAS } from './EditorialDetailPage'
import type { Editorial } from '@shared/types'

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  generate: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
  linkedin: vi.fn(),
}))

vi.mock('../../lib/admin-api', () => ({
  adminApi: { editorials: mockApi },
}))

/**
 * El panel de la editorial firmada (plan del 25-oct-2026, B5): sin notas no hay
 * borrador, y sin firma ni método no hay botón de publicar.
 */
function editorial(parcial: Partial<Editorial>): Editorial {
  return {
    id: 'ed-1',
    title: 'Desalojos exprés',
    content: '',
    status: 'draft',
    publishedAt: null,
    createdAt: '2026-10-25T00:00:00.000Z',
    updatedAt: '2026-10-25T00:00:00.000Z',
    notes: '',
    authorName: '',
    method: '',
    sources: '',
    ...parcial,
  }
}

function renderPage(ed: Editorial) {
  mockApi.get.mockResolvedValue(ed)
  mockApi.update.mockImplementation(async (_id: string, data: Partial<Editorial>) => ({ ...ed, ...data }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/admin/editorials/ed-1']}>
            <Routes>
              <Route path="/admin/editorials/:id" element={<EditorialDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

describe('EditorialDetailPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sin notas suficientes no se puede redactar el borrador', async () => {
    renderPage(editorial({}))
    const boton = await screen.findByRole('button', { name: 'Redactar borrador desde mis notas' })
    expect(boton).toBeDisabled()
    expect(screen.getByText(`0 / ${MIN_NOTAS} caracteres mínimos`)).toBeInTheDocument()
  })

  it('con notas suficientes el borrador se redacta y los avisos se muestran', async () => {
    const notas = 'x'.repeat(MIN_NOTAS)
    renderPage(editorial({ notes: notas, authorName: 'Venancio Coñuepán Mesías' }))
    mockApi.generate.mockResolvedValue(
      editorial({ notes: notas, content: 'Las comunidades resisten.', method: 'ia_revisada', avisos: [{ tipo: 'cifra', mensaje: 'La cifra «300» no está en las notas.' }] }),
    )
    const boton = await screen.findByRole('button', { name: 'Redactar borrador desde mis notas' })
    expect(boton).toBeEnabled()
    await userEvent.click(boton)
    expect(await screen.findByText('La cifra «300» no está en las notas.')).toBeInTheDocument()
    expect(mockApi.generate).toHaveBeenCalledWith('ed-1')
  })

  it('sin firma ni método el botón de publicar está deshabilitado y dice por qué', async () => {
    renderPage(editorial({ content: 'Las comunidades resisten.' }))
    const publicar = await screen.findByRole('button', { name: 'Publicar' })
    expect(publicar).toBeDisabled()
    expect(screen.getByText(/sin firma · sin método/)).toBeInTheDocument()
  })

  it('con texto, firma y método guardados se puede publicar', async () => {
    renderPage(editorial({ content: 'Las comunidades resisten.', authorName: 'Venancio Coñuepán Mesías', method: 'humana' }))
    const publicar = await screen.findByRole('button', { name: 'Publicar' })
    expect(publicar).toBeEnabled()
    expect(screen.getByText(/lista para publicar/)).toBeInTheDocument()
  })

  it('ya no existe el botón que generaba desde las noticias de la semana', async () => {
    renderPage(editorial({ content: 'Texto.' }))
    await screen.findByRole('button', { name: 'Publicar' })
    expect(screen.queryByRole('button', { name: /Regenerar con IA|Generar con IA/ })).not.toBeInTheDocument()
  })
})
