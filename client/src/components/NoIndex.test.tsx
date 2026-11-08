import { describe, it, expect } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import NoIndex, { TituloDeEstado } from './NoIndex'

describe('los estados sin página tienen título propio', () => {
  // Medido el 2-nov-2026: tema, comunidad y noticia inexistentes conservaban el
  // título de la portada que trae el HTML prerenderizado.
  it('TituloDeEstado escribe el título de la pestaña', async () => {
    document.title = 'Voces Indígenas - Noticias que importan a los pueblos indígenas'
    render(
      <HelmetProvider>
        <NoIndex />
        <TituloDeEstado texto="Comunidad no encontrada" />
      </HelmetProvider>,
    )
    await waitFor(() => expect(document.title).toBe('Comunidad no encontrada - Voces Indígenas'))
  })

  it.each([
    'IssuePage', 'StoryPage', 'CommunityPage', 'BrandStoryPage', 'VocesIndigenasDetail',
  ])('%s lo usa junto al noindex', (pagina) => {
    const fuente = readFileSync(path.resolve(__dirname, '../pages', `${pagina}.tsx`), 'utf8')
    expect(fuente).toContain('<NoIndex />')
    expect(fuente).toContain('<TituloDeEstado texto=')
  })
})
