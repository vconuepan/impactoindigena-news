import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { PublicStory } from '@shared/types'
import StoryCard from './StoryCard'

let idioma = 'es'
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: idioma },
  }),
}))

// Caso real del 5-oct-2026: relevancia 2, publicada el 29-sep, y su
// relevanceSummary explicaba por que la nota NO es indigena.
const juneau = {
  id: 'juneau',
  slug: 'juneau-inundaciones',
  title: 'Juneau enfrenta inundaciones por el deshielo de un lago glaciar',
  titleEn: null,
  titleLabel: 'clima',
  titleLabelEn: null,
  summary: 'La ciudad registra crecidas anuales desde 2011 por el lago Suicide Basin.',
  summaryEn: 'The city has recorded yearly floods since 2011 from Suicide Basin.',
  relevanceSummary: 'Juneau enfrenta inundaciones por cambio climático sin impacto indígena.',
  relevanceSummaryEn: 'Juneau faces climate flooding with no indigenous impact.',
  relevance: 2,
  imageUrl: 'https://r2.example/social/storycard-juneau.jpg',
  datePublished: '2026-09-29T11:00:00.000Z',
  sourceDatePublished: '2026-09-28T15:00:00.000Z',
  sourceUrl: 'https://example.com/juneau',
  narrativeFrame: null,
  issue: { name: 'Cambio climático', slug: 'cambio-climatico' },
  feed: { id: 'feed-1', title: 'Example News', displayTitle: null, issue: { name: 'Cambio climático', slug: 'cambio-climatico' } },
} as unknown as PublicStory

const pertinente = {
  ...juneau,
  id: 'consulta',
  slug: 'consulta-indigena',
  title: 'Comunidad presenta recurso de protección por falta de consulta',
  summary: 'El recurso se presentó ante la Corte de Apelaciones.',
  relevanceSummary: 'Afecta directamente el derecho a consulta de la comunidad.',
  relevance: 8,
} as unknown as PublicStory

function renderCard(story: PublicStory, variant: 'equal' | 'horizontal' | 'compact' = 'equal') {
  return render(
    <MemoryRouter>
      <StoryCard story={story} variant={variant} showCategory={false} />
    </MemoryRouter>,
  )
}

describe('StoryCard — la bajada de una nota bajo el piso de relevancia', () => {
  it('no muestra la explicacion de descarte; muestra el resumen plano', () => {
    idioma = 'es'
    renderCard(juneau)
    expect(screen.queryByText(/sin impacto indígena/)).toBeNull()
    expect(screen.getByText(juneau.summary!)).toBeInTheDocument()
  })

  it('lo mismo en la variante horizontal, que no tiene hideSummary', () => {
    idioma = 'es'
    renderCard(juneau, 'horizontal')
    expect(screen.queryByText(/sin impacto indígena/)).toBeNull()
    expect(screen.getByText(juneau.summary!)).toBeInTheDocument()
  })

  it('en ingles, el resumen traducido y no la explicacion traducida', () => {
    idioma = 'en'
    renderCard(juneau)
    expect(screen.queryByText(/no indigenous impact/)).toBeNull()
    expect(screen.getByText(juneau.summaryEn!)).toBeInTheDocument()
  })

  it('en el piso o por encima sigue prefiriendo la explicacion de relevancia', () => {
    idioma = 'es'
    renderCard(pertinente)
    expect(screen.getByText(pertinente.relevanceSummary!)).toBeInTheDocument()
    expect(screen.queryByText(pertinente.summary!)).toBeNull()
  })
})

describe('StoryCard — nota que entró a la vertical por la marca (D5)', () => {
  const deMarca = {
    ...juneau,
    id: 'marca-1',
    slug: null,
    brandSlug: 'angol-inaugura-su-cesfam-abc123',
    communitySlug: 'wallmapu-araucania',
    title: 'Angol inaugura su nuevo CESFAM',
    relevance: null,
    relevanceSummary: null,
    summary: 'Atenderá a tres sectores rurales.',
    issue: null,
  } as unknown as PublicStory

  it.each(['equal', 'horizontal', 'compact'] as const)('en la variante %s enlaza a su ficha en la vertical, sin tema', (variant) => {
    idioma = 'es'
    const { container, unmount } = render(
      <MemoryRouter>
        <StoryCard story={deMarca} variant={variant} />
      </MemoryRouter>,
    )
    const internos = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('/'))
    expect(internos.length).toBeGreaterThan(0)
    for (const h of internos) expect(h).toBe('/comunidad/wallmapu-araucania/n/angol-inaugura-su-cesfam-abc123')
    // sin el tema del feed: no sale rotulada con un tema indígena
    expect(screen.queryByText('Cambio climático')).toBeNull()
    unmount()
  })

  it('una nota publicada sigue enlazando a /stories', () => {
    const { container } = render(
      <MemoryRouter>
        <StoryCard story={juneau} variant="equal" />
      </MemoryRouter>,
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/stories/juneau-inundaciones')
  })
})
