import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VocesIndigenasDetailPage, { textoDelMetodo } from './VocesIndigenasDetail'
import type { EditorialFull } from '../lib/api'

const mockApi = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('../lib/api', async () => {
  const real = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...real, publicApi: { ...real.publicApi, editorials: { list: vi.fn(), get: mockApi.get } } }
})

/**
 * La editorial firmada (plan del 25-oct-2026, B6): firma, fecha, método y
 * fuentes en la página, que son los indicadores 2, 4 y 5 del Trust Project.
 */
function editorial(parcial: Partial<EditorialFull>): EditorialFull {
  return {
    id: 'ed-1',
    title: 'La propiedad no es un derecho absoluto',
    content: 'Las comunidades mapuche de Río Negro enfrentan una ley nueva.\n\nA mi juicio, el camino es Waitangi.',
    status: 'published',
    publishedAt: '2026-10-26T12:00:00.000Z',
    createdAt: '2026-10-25T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    authorName: 'Venancio Coñuepán Mesías',
    method: 'ia_revisada',
    sources: 'Resumen Latinoamericano, 23-oct-2026 https://www.resumenlatinoamericano.org/x\nCELS, informe',
    ...parcial,
  }
}

function renderPage(ed: EditorialFull) {
  mockApi.get.mockResolvedValue(ed)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/voces-indigenas/ed-1']}>
          <Routes>
            <Route path="/voces-indigenas/:id" element={<VocesIndigenasDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

describe('VocesIndigenasDetailPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra firma, fecha, método y fuentes', async () => {
    renderPage(editorial({}))
    expect(await screen.findByText('Por Venancio Coñuepán Mesías')).toBeInTheDocument()
    expect(screen.getByText(/26 de octubre de 2026/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Cómo se hizo esta editorial?' })).toBeInTheDocument()
    expect(screen.getByText(/escribió las notas con el hecho/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fuentes consultadas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://www.resumenlatinoamericano.org/x' })).toHaveAttribute('target', '_blank')
    expect(screen.getByText('— Venancio Coñuepán Mesías')).toBeInTheDocument()
  })

  it('una editorial sin método ni fuentes no inventa el recuadro', async () => {
    renderPage(editorial({ method: '', sources: '' }))
    expect(await screen.findByText('Por Venancio Coñuepán Mesías')).toBeInTheDocument()
    expect(screen.queryByText('¿Cómo se hizo esta editorial?')).not.toBeInTheDocument()
    expect(screen.queryByText('Fuentes consultadas')).not.toBeInTheDocument()
  })

  it('una editorial anterior con la firma en el último párrafo la sigue mostrando como firma', async () => {
    renderPage(editorial({ authorName: '', method: '', content: 'Las comunidades resisten.\n\n— Venancio Coñuepan. Mapuche.' }))
    expect(await screen.findByText('— Venancio Coñuepan. Mapuche.')).toBeInTheDocument()
    expect(screen.queryByText(/^Por /)).not.toBeInTheDocument()
  })
})

describe('textoDelMetodo', () => {
  it('dice la verdad de cada método y nada para el vacío', () => {
    expect(textoDelMetodo('humana', 'Ana')).toMatch(/^Ana escribió esta editorial/)
    expect(textoDelMetodo('ia_revisada', 'Ana')).toMatch(/Un modelo de lenguaje las ordenó/)
    expect(textoDelMetodo('', 'Ana')).toBeNull()
  })
})
