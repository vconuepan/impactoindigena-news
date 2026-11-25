import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'
import { StoryIndependenceNotice } from './StoryIndependenceNotice'
import es from '../locales/es.json'
import en from '../locales/en.json'

let dic: Record<string, unknown> = es

// El diccionario real del sitio, en los dos idiomas: el test lee lo que leerá la gente.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (clave: string, vars?: Record<string, string>) => {
      const valor = clave.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dic)
      if (typeof valor !== 'string') return clave
      return Object.entries(vars ?? {}).reduce((s, [k, v]) => s.split(`{{${k}}}`).join(v), valor)
    },
  }),
}))

function pintar(notice: Parameters<typeof StoryIndependenceNotice>[0]['notice']) {
  return render(<MemoryRouter><StoryIndependenceNotice notice={notice} /></MemoryRouter>)
}

describe('StoryIndependenceNotice (regla 2, 25-nov-2026)', () => {
  it('en español: una organización, cliente vigente del estudio, con las reglas y el enlace', () => {
    dic = es
    pintar({ verticals: ['legal'], current: true, plural: false })
    const aviso = screen.getByRole('note')
    expect(aviso).toHaveTextContent('Aviso de independencia')
    expect(aviso).toHaveTextContent('Esta nota menciona a una organización que es cliente de impactoindigena.legal.')
    expect(aviso).toHaveTextContent('no cobra por publicar')
    expect(screen.getByRole('link', { name: 'Nuestras reglas de independencia' })).toHaveAttribute('href', '/about#independencia')
  })

  it('en inglés: varias organizaciones, las dos verticales, relaciones terminadas', () => {
    dic = en
    pintar({ verticals: ['ai', 'legal'], current: false, plural: true })
    expect(screen.getByRole('note')).toHaveTextContent(
      'This story mentions organizations that were clients of impactoindigena.ai and of impactoindigena.legal.',
    )
    expect(screen.getByRole('link', { name: 'Our independence rules' })).toBeInTheDocument()
  })

  it('no tiene problemas de accesibilidad', async () => {
    dic = es
    const { container } = pintar({ verticals: ['ai'], current: true, plural: false })
    expect(await axe(container)).toHaveNoViolations()
  })
})
