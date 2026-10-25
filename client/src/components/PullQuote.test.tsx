import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { PublicStory } from '@shared/types'
import PullQuote from './PullQuote'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'storyPage.fromArticle' ? 'Frase del artículo original' : key),
    i18n: { language: 'es' },
  }),
}))

/**
 * La «cita clave» no siempre es una cita: cuando el artículo no trae ninguna,
 * el prompt pone una frase del redactor con la atribución «Artículo original».
 * Hasta el 25-oct-2026 este componente solo conocía el marcador en inglés, y
 * firmaba esas frases «Artículo original, via …» como si alguien las hubiera
 * dicho: 225 de las 500 últimas publicadas.
 */
function story(parcial: Partial<PublicStory>): PublicStory {
  return {
    slug: 'una-noticia',
    title: 'Comunidades mapuche resisten un desalojo',
    sourceTitle: 'Título del medio',
    quote: 'Las comunidades van a resistir',
    ...parcial,
  } as unknown as PublicStory
}

function renderQuote(s: PublicStory) {
  return render(
    <MemoryRouter>
      <PullQuote story={s} />
    </MemoryRouter>,
  )
}

describe('PullQuote', () => {
  it('una cita de una persona lleva su atribución', () => {
    renderQuote(story({ quoteAttribution: 'Orlando Carriqueo, Parlamento Mapuche' }))
    expect(screen.getByText(/Orlando Carriqueo, Parlamento Mapuche, via/)).toBeInTheDocument()
  })

  it.each(['Artículo original', 'Original article'])('«%s» se rotula como frase del artículo, no como cita', (marca) => {
    renderQuote(story({ quoteAttribution: marca }))
    expect(screen.getByText(/Frase del artículo original:/)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(`${marca}, via`))).not.toBeInTheDocument()
  })

  it('sin cita no pinta nada', () => {
    const { container } = renderQuote(story({ quote: '' }))
    expect(container).toBeEmptyDOMElement()
  })
})
