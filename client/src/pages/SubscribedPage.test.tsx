import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import es from '../locales/es.json'
import en from '../locales/en.json'

/**
 * EL DEFECTO QUE ESTO CIERRA (11-sep-2026): esta pagina estaba escrita a mano
 * en ingles, y su parrafo central cambiaba de idioma a la mitad —
 * `BRAND.claim` en español, «Weekly to your inbox.» en ingles, y
 * `BRAND.claimSupport` otra vez en español, tres lineas seguidas—.
 *
 * Es el ultimo paso del embudo: lo ve alguien que acaba de confirmar su
 * suscripcion a un medio en español.
 *
 * El test que mas importa aqui no es el del render sino el de las claves: una
 * traduccion que falta no rompe nada, solo devuelve el nombre de la clave o el
 * texto del otro idioma, y eso es exactamente como se llega a una pagina
 * bilingue sin que nadie lo note.
 */

/** Resuelve «a.b» contra un objeto de traducciones, como hace i18next. */
function buscar(dic: Record<string, unknown>, clave: string): string | undefined {
  return clave.split('.').reduce<any>((n, parte) => (n == null ? undefined : n[parte]), dic)
}

function renderCon(idioma: Record<string, unknown>, ruta = '/subscribed') {
  vi.doMock('react-i18next', () => ({
    useTranslation: () => ({ t: (clave: string) => buscar(idioma, clave) ?? clave }),
  }))
  return ruta
}

const FUENTE = readFileSync(path.resolve(__dirname, 'SubscribedPage.tsx'), 'utf8')

describe('las traducciones de la pagina de confirmacion', () => {
  const clavesUsadas = [...FUENTE.matchAll(/t\('(subscribed\.[a-zA-Z]+)'\)/g)].map((m) => m[1])

  it('el componente usa claves de traduccion y no texto escrito a mano', () => {
    expect(clavesUsadas.length, 'la pagina dejo de usar t(): volvio el texto fijo').toBeGreaterThan(5)
  })

  it('cada clave usada existe en español Y en ingles', () => {
    const faltan: string[] = []
    for (const clave of clavesUsadas) {
      if (buscar(es as Record<string, unknown>, clave) === undefined) faltan.push(`es: ${clave}`)
      if (buscar(en as Record<string, unknown>, clave) === undefined) faltan.push(`en: ${clave}`)
    }
    expect(
      faltan,
      `faltan traducciones, y una clave sin traducir deja la pagina a medio idioma:\n${faltan.join('\n')}`,
    ).toEqual([])
  })

  it('los dos idiomas declaran exactamente las mismas claves', () => {
    const esKeys = Object.keys((es as any).subscribed ?? {}).sort()
    const enKeys = Object.keys((en as any).subscribed ?? {}).sort()
    expect(esKeys, 'es.json y en.json divergieron en la seccion `subscribed`').toEqual(enKeys)
  })

  it('el texto en español no trae la linea en ingles que causaba la mezcla', () => {
    const textos = Object.values((es as any).subscribed ?? {}).join(' ')
    expect(
      /Weekly to your inbox|Welcome to the newsletter|Explore today/.test(textos),
      'volvio texto en ingles dentro de las traducciones al español',
    ).toBe(false)
  })
})

describe('SubscribedPage', () => {
  it('muestra la confirmacion en español', async () => {
    vi.resetModules()
    renderCon(es as Record<string, unknown>)
    const { default: Pagina } = await import('./SubscribedPage')

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/subscribed']}>
          <Pagina />
        </MemoryRouter>
      </HelmetProvider>,
    )

    expect(screen.getByRole('heading', { name: (es as any).subscribed.successTitle })).toBeInTheDocument()
    expect(screen.queryByText(/Weekly to your inbox/)).not.toBeInTheDocument()
  })

  it('muestra el aviso de enlace expirado, no la bienvenida', async () => {
    vi.resetModules()
    renderCon(es as Record<string, unknown>)
    const { default: Pagina } = await import('./SubscribedPage')

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/subscribed?error=expired']}>
          <Pagina />
        </MemoryRouter>
      </HelmetProvider>,
    )

    expect(screen.getByRole('heading', { name: (es as any).subscribed.expiredTitle })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: (es as any).subscribed.successTitle })).not.toBeInTheDocument()
  })

  it('distingue el enlace invalido del expirado', async () => {
    vi.resetModules()
    renderCon(es as Record<string, unknown>)
    const { default: Pagina } = await import('./SubscribedPage')

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/subscribed?error=invalid']}>
          <Pagina />
        </MemoryRouter>
      </HelmetProvider>,
    )

    expect(screen.getByRole('heading', { name: (es as any).subscribed.invalidTitle })).toBeInTheDocument()
  })
})
