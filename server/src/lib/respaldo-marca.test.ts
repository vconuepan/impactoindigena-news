import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { CIERRE_MARCA } from './carouselGen.js'

/**
 * Lo que Voces Indígenas dice de sí misma tiene que poder sostenerse.
 *
 * El 4-oct-2026 (`dc14657`) el director retiró del sitio dos afirmaciones que
 * no se sostenían: «el primer medio indígena AI-native» (superlativo sin
 * verificar) y «curado por pueblos indígenas» (la publicación es automática).
 * La lámina final del carrusel de Instagram las tenía escritas a mano y las
 * siguió publicando hasta el 25-oct-2026: 22 publicaciones en los 30 días
 * previos. La corrección del sitio no la alcanzó porque era otra copia.
 *
 * Este test amarra la lámina al colofón del sitio y prohíbe las dos frases en
 * todo el servidor.
 */

const SRC = path.resolve(__dirname, '..')
const ES = path.resolve(SRC, '../../client/src/locales/es.json')

/** Minúsculas y sin tildes, para que «Curado» y «curado» caigan igual. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const RETIRADAS: Array<{ frase: RegExp; motivo: string }> = [
  { frase: /curad[oa]s? por (los )?pueblos/, motivo: 'la publicación es automática' },
  { frase: /curated by indigenous/, motivo: 'la publicación es automática' },
  { frase: /primer medio indigena/, motivo: 'superlativo sin verificar' },
  { frase: /first (ai.native )?indigenous (news|media)/, motivo: 'superlativo sin verificar' },
]

function archivosTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name)
    if (e.isDirectory()) return archivosTs(ruta)
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [ruta] : []
  })
}

describe('la lámina de cierre del carrusel', () => {
  it('dice lo mismo que el colofón del sitio', () => {
    const { colophon } = JSON.parse(readFileSync(ES, 'utf8'))
    // El sitio usa U+2011 (guion que no corta la línea); el lienzo, el guion común.
    expect(CIERRE_MARCA.titular.join(' ')).toBe(colophon.tagline.replace(/‑/g, '-'))
    expect(CIERRE_MARCA.principios.join(' ')).toBe(colophon.principles)
  })
})

describe('afirmaciones retiradas el 4-oct-2026', () => {
  const archivos = archivosTs(SRC)

  it('lee el servidor entero', () => {
    // Contraprueba: si la ruta se rompe, el test de abajo pasaría sin leer nada.
    expect(archivos.length).toBeGreaterThan(100)
    expect(archivos.some((a) => a.endsWith(path.join('lib', 'carouselGen.ts')))).toBe(true)
  })

  it('el patrón caza las frases tal como estaban escritas', () => {
    const antes = normalizar('El primer medio indígena AI-native. Curado por pueblos indígenas.')
    expect(RETIRADAS.filter(({ frase }) => frase.test(antes))).toHaveLength(2)
  })

  it('ningún archivo del servidor las vuelve a decir', () => {
    const hallazgos = archivos.flatMap((archivo) => {
      const texto = normalizar(readFileSync(archivo, 'utf8'))
      return RETIRADAS
        .filter(({ frase }) => frase.test(texto))
        .map(({ frase, motivo }) => `${path.relative(SRC, archivo)}: ${frase} (${motivo})`)
    })
    expect(hallazgos).toEqual([])
  })
})
