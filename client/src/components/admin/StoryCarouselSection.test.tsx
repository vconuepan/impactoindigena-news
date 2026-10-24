import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StoryCarouselDraft } from '@shared/types'
import { StoryCarouselSection } from './StoryCarouselSection'

const mockApi = vi.hoisted(() => ({
  carousel: vi.fn(),
  carouselPreview: vi.fn(),
  carouselDownload: vi.fn(),
}))

vi.mock('../../lib/admin-api', () => ({
  adminApi: { stories: mockApi },
}))

const STORY = { id: 'story-1', slug: 'plan-del-bosque' }

const DRAFT: StoryCarouselDraft = {
  laminas: [
    { titulo: 'La comunidad presenta su plan', texto: 'En Curarrehue, este martes.' },
    { titulo: 'Bosque y escuela', texto: 'La lonko dijo «el bosque es de todos».' },
    { titulo: 'Qué abarca', texto: 'El plan cubre 320 hectáreas.' },
    { titulo: 'Qué viene', texto: 'La revisión será en noviembre.' },
  ],
  lectura: null,
  atribucion: {
    medio: 'BioBío Chile',
    autor: 'Equipo BioBío',
    fecha: '21 de octubre de 2026',
    tituloOriginal: 'Comunidad presenta plan para su bosque',
    dominio: 'biobiochile.cl',
  },
  avisos: [{ lamina: 1, tipo: 'cita', mensaje: 'La cita «el bosque es de todos» no está tal cual en el artículo original.' }],
}

const IMG = 'data:image/jpeg;base64,/9j/AA=='

describe('StoryCarouselSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('pide el texto con o sin la lectura, según la casilla', async () => {
    mockApi.carousel.mockResolvedValue(DRAFT)
    render(<StoryCarouselSection story={STORY} />)

    await userEvent.click(screen.getByRole('checkbox', { name: /lectura de Venancio/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear carrusel' }))

    expect(mockApi.carousel).toHaveBeenCalledWith('story-1', true)
    expect(await screen.findByText('BioBío Chile')).toBeInTheDocument()
    expect(screen.getByText('Portada')).toBeInTheDocument()
    expect(screen.getByText('Cierre')).toBeInTheDocument()
  })

  it('muestra el aviso en su lámina y no deja descargar', async () => {
    mockApi.carousel.mockResolvedValue(DRAFT)
    render(<StoryCarouselSection story={STORY} />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear carrusel' }))

    const lamina2 = (await screen.findByText('Lámina 2')).closest('fieldset')!
    expect(within(lamina2).getByText(/no está tal cual/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar imágenes y PDF' })).toBeDisabled()
  })

  it('con una vista previa limpia del texto actual habilita la descarga, y editar la vuelve a bloquear', async () => {
    mockApi.carousel.mockResolvedValue({ ...DRAFT, avisos: [] })
    mockApi.carouselPreview.mockResolvedValue({ imagenes: [IMG, IMG, IMG, IMG], avisos: [] })
    render(<StoryCarouselSection story={STORY} />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear carrusel' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Ver láminas' }))
    expect(await screen.findAllByRole('img', { name: /Lámina \d de 4/ })).toHaveLength(4)
    const descargar = screen.getByRole('button', { name: 'Descargar imágenes y PDF' })
    expect(descargar).toBeEnabled()

    await userEvent.type(screen.getByLabelText(/Texto · 4 palabras/), ' Hoy.')
    expect(descargar).toBeDisabled()
  })

  it('manda a la vista previa el texto editado', async () => {
    mockApi.carousel.mockResolvedValue({ ...DRAFT, avisos: [] })
    mockApi.carouselPreview.mockResolvedValue({ imagenes: [IMG], avisos: [] })
    render(<StoryCarouselSection story={STORY} />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear carrusel' }))

    const titulo = (await screen.findAllByLabelText('Título'))[3]
    await userEvent.clear(titulo)
    await userEvent.type(titulo, 'Lo que sigue')
    await userEvent.click(screen.getByRole('button', { name: 'Ver láminas' }))

    expect(mockApi.carouselPreview.mock.calls[0][1].laminas[3].titulo).toBe('Lo que sigue')
  })

  it('muestra el motivo cuando el servidor no puede armar el carrusel', async () => {
    mockApi.carousel.mockRejectedValue(new Error('No se sabe qué medio reporteó esta noticia'))
    render(<StoryCarouselSection story={STORY} />)

    await userEvent.click(screen.getByRole('button', { name: 'Crear carrusel' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se sabe qué medio reporteó')
  })

  it('recupera el borrador guardado en el navegador', () => {
    localStorage.setItem('carrusel-borrador:story-1', JSON.stringify(DRAFT))
    render(<StoryCarouselSection story={STORY} />)

    expect(screen.getByDisplayValue('La comunidad presenta su plan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear carrusel' })).not.toBeInTheDocument()
  })
})
