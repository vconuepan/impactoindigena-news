import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pickHero, type StoryBuckets } from './mix-stories'
import type { PublicStory } from '@shared/types'

/**
 * El <head> de la portada lleva un script en linea que precarga la imagen del
 * hero. Ese script NO puede importar `pickHero`: corre antes que el bundle, asi
 * que la logica esta duplicada a mano dentro de `vite.config.ts`.
 *
 * Duplicar logica es una deuda con fecha de vencimiento: el dia que alguien
 * cambie `pickHero` —otro criterio de orden, otro bucket, otro tramo del dial—
 * el script seguira eligiendo con las reglas viejas y la portada volvera a
 * precargar la imagen equivocada, en silencio y sin que nada falle.
 *
 * Este test extrae el script REAL de vite.config.ts, lo ejecuta y compara su
 * eleccion contra `pickHero`. Si las dos se separan, se cae aca.
 */

/** Extrae el script en linea tal como el build lo inyecta en el <head>. */
function scriptDelHero(): string {
  const config = readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8')
  const m = config.match(/const script = `<script>([\s\S]*?)<\/script>`/)
  if (!m) throw new Error('no se encontro el script del hero en vite.config.ts')
  // El template literal trae `${JSON.stringify(snapshot)}` sin interpolar.
  return m[1].replace('${JSON.stringify(snapshot)}', '"https://r2.example/homepage.json"')
}

function historia(id: string, fecha: string, imagen: string): PublicStory {
  return {
    id,
    slug: id,
    title: `Historia ${id}`,
    datePublished: fecha,
    dateCrawled: fecha,
    imageUrl: imagen,
  } as unknown as PublicStory
}

const buckets = (u: PublicStory[], c: PublicStory[], n: PublicStory[]): StoryBuckets => ({
  uplifting: u,
  calm: c,
  negative: n,
})

// Fechas cruzadas a proposito: la mas reciente de cada tramo del dial es
// distinta, asi que un error de orden o de bucket cambia el resultado.
const DATOS: Record<string, StoryBuckets> = {
  territorio: buckets(
    [historia('u1', '2026-09-05T10:00:00Z', 'https://r2/u1.jpg')],
    [historia('c1', '2026-09-06T08:00:00Z', 'https://r2/c1.jpg')],
    [historia('n1', '2026-09-04T10:00:00Z', 'https://r2/n1.jpg')],
  ),
  clima: buckets(
    [historia('u2', '2026-09-06T09:00:00Z', 'https://r2/u2.jpg')],
    [historia('c2', '2026-09-03T10:00:00Z', 'https://r2/c2.jpg')],
    [historia('n2', '2026-09-06T12:00:00Z', 'https://r2/n2.jpg')],
  ),
}

/** Corre el script real y devuelve el href que precargo, o null. */
async function correrScript(positividadGuardada: string | null): Promise<string | null> {
  document.head.innerHTML = ''
  if (positividadGuardada === null) localStorage.removeItem('ar-positivity')
  else localStorage.setItem('ar-positivity', positividadGuardada)

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => ({ storiesByIssue: DATOS }) })) as never,
  )

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(scriptDelHero())()
  // El script resuelve dentro de promesas encadenadas.
  await new Promise((r) => setTimeout(r, 0))

  const link = document.head.querySelector('link[rel="preload"][as="image"]')
  return link ? link.getAttribute('href') : null
}

describe('el script que precarga el hero de la portada', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Los cinco valores del dial, que son los unicos que el contexto guarda.
  for (const dial of [0, 25, 50, 75, 100]) {
    it(`elige la misma historia que pickHero con el dial en ${dial}`, async () => {
      const esperado = pickHero(DATOS, dial)?.imageUrl ?? null
      expect(await correrScript(String(dial))).toBe(esperado)
    })
  }

  it('sin nada guardado usa 50, que es el valor por defecto del contexto', async () => {
    expect(await correrScript(null)).toBe(pickHero(DATOS, 50)?.imageUrl)
  })

  it('ajusta un valor intermedio al mas cercano, igual que clampToValid', async () => {
    // 60 esta mas cerca de 50 que de 75. Si el script no ajustara, tomaria la
    // rama `> 50` y elegiria otra historia.
    expect(await correrScript('60')).toBe(pickHero(DATOS, 50)?.imageUrl)
    expect(await correrScript('70')).toBe(pickHero(DATOS, 75)?.imageUrl)
  })

  it('un valor corrupto en storage no rompe nada: cae en 50', async () => {
    expect(await correrScript('no-es-un-numero')).toBe(pickHero(DATOS, 50)?.imageUrl)
  })

  it('marca la precarga con prioridad alta, o no serviria de nada', async () => {
    await correrScript('50')
    const link = document.head.querySelector('link[rel="preload"][as="image"]')
    expect(link?.getAttribute('fetchpriority')).toBe('high')
  })

  it('si el snapshot no responde, no precarga nada en vez de fallar', async () => {
    document.head.innerHTML = ''
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red') }) as never)
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(scriptDelHero())()
    await new Promise((r) => setTimeout(r, 0))
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull()
  })

  it('si una historia no tiene imagen, no inventa un preload', async () => {
    document.head.innerHTML = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          storiesByIssue: { x: buckets([], [{ id: 'sinimg', datePublished: '2026-09-06T10:00:00Z' } as unknown as PublicStory], []) },
        }),
      })) as never,
    )
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(scriptDelHero())()
    await new Promise((r) => setTimeout(r, 0))
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull()
  })
})
