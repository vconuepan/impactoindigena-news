import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n, { fijarIdiomaDelDocumento } from './i18n'
import Pagination from './components/Pagination'
import es from './locales/es.json'
import en from './locales/en.json'

afterEach(async () => {
  await i18n.changeLanguage('es')
})

describe('<html lang> sigue al idioma de la interfaz', () => {
  // Medido el 12-oct-2026: con el selector en inglés seguía `lang="es"`.
  it('arranca en español, como el HTML horneado', () => {
    expect(document.documentElement.lang).toBe('es')
  })

  it('cambia a inglés al elegir inglés, y vuelve', async () => {
    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
    await i18n.changeLanguage('es')
    expect(document.documentElement.lang).toBe('es')
  })

  it('un idioma regional o desconocido cae en uno de los dos', () => {
    fijarIdiomaDelDocumento('en-GB')
    expect(document.documentElement.lang).toBe('en')
    fijarIdiomaDelDocumento(undefined)
    expect(document.documentElement.lang).toBe('es')
  })
})

describe('el paginador público habla el idioma del sitio', () => {
  // Hasta el 8-nov-2026 decía «Previous» y «Next» en temas, comunidades y búsqueda.
  const pintar = () => render(<Pagination page={2} totalPages={5} onPageChange={() => {}} />)

  it('en español', () => {
    pintar()
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página anterior' })).toHaveTextContent('Anterior')
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toHaveTextContent('Siguiente')
    expect(screen.getByRole('button', { name: 'Página 3' })).toBeInTheDocument()
    expect(screen.queryByText(/Previous|Next/)).not.toBeInTheDocument()
  })

  it('en inglés', async () => {
    await i18n.changeLanguage('en')
    pintar()
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveTextContent('Previous')
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveTextContent('Next')
  })

  it('los dos idiomas declaran las mismas claves', () => {
    expect(Object.keys(es.pagination).sort()).toEqual(Object.keys(en.pagination).sort())
  })
})

describe('las claves que quedaron sin uso no vuelven', () => {
  // El banner de apoyo se fundió el 21-sep y Ko-fi se retiró el 3-oct-2026;
  // sus textos siguieron en los dos idiomas, y `support.heading` tenía a la
  // Fundación de sujeto. `support.message` sí se usa (pie de la portada).
  it.each([['es', es], ['en', en]] as const)('%s', (_, dic) => {
    const d = dic as Record<string, Record<string, unknown>>
    expect(Object.keys(d.support)).toEqual(['message'])
    expect(d.nav).not.toHaveProperty('support')
    expect(d.footer).not.toHaveProperty('support')
  })
})
