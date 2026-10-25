import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Todo texto que el servidor dibuja con @napi-rs/canvas usa una fuente
 * registrada: DM Sans, por la constante FONT.
 *
 * POR QUE. El contenedor del App Service no trae fuentes del sistema (la imagen
 * appsvc/node:22-lts_20261022.3 tiene 0 archivos de fuente, medido el
 * 24-oct-2026), y @napi-rs/canvas no usa una fuente registrada como respaldo
 * de una familia que no encuentra: el texto sale en blanco y nada falla. En el
 * Mac de desarrollo sí hay fuentes del sistema, así que un test que dibuje no
 * lo ve. Pasó dos veces: el carrusel de Instagram con «Arial» hasta el
 * 31-may-2026 (97cb6ac) y el del boletín con «InterBold, Arial, sans-serif»
 * hasta el 25-oct-2026, con archivos Inter que nunca estuvieron en el repo.
 */

const SRC = path.resolve(__dirname, '..')
const PERMITIDAS = new Set(['${FONT}', 'DM Sans'])

function archivosTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name)
    if (e.isDirectory()) return archivosTs(ruta)
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [ruta] : []
  })
}

/**
 * Las familias que nombra una línea que fija una fuente de canvas: lo que va
 * después de «px», separado por comas y sin comillas. Una línea cuenta si
 * asigna `ctx.font` o arma la cadena con `${FONT}`.
 */
export function familiasDeLinea(linea: string): string[] {
  if (!/ctx\.font\s*=|\$\{FONT\}/.test(linea)) return []
  const familias: string[] = []
  for (const m of linea.matchAll(/px\s+([^`;\n]+)/g)) {
    const resto = m[1].replace(/['"]\s*[,)].*$/, '').replace(/['"`]+\s*$/, '')
    for (const f of resto.split(',')) {
      const familia = f.trim().replace(/^['"]|['"]$/g, '').trim()
      if (familia) familias.push(familia)
    }
  }
  return familias
}

const lienzos = archivosTs(SRC)
  .map((ruta) => ({ ruta, texto: readFileSync(ruta, 'utf8') }))
  .filter(({ texto }) => texto.includes("from '@napi-rs/canvas'"))

describe('fuentes del canvas', () => {
  it('encuentra los archivos que dibujan', () => {
    // Contraprueba: si el filtro deja de ver los lienzos, lo de abajo pasaría vacío.
    const nombres = lienzos.map(({ ruta }) => path.relative(SRC, ruta))
    expect(nombres).toEqual(expect.arrayContaining([
      path.join('lib', 'carouselGen.ts'),
      path.join('lib', 'storyCarouselRender.ts'),
      path.join('services', 'carousel.ts'),
    ]))
  })

  it('el extractor caza la línea que dejaba en blanco el carrusel del boletín', () => {
    expect(familiasDeLinea("  ctx.font = '24px InterBold, Arial, sans-serif'")).toEqual(['InterBold', 'Arial', 'sans-serif'])
    expect(familiasDeLinea("  ctx.font = `700 ${52 * SCALE}px '${FONT}'`")).toEqual(['${FONT}'])
    expect(familiasDeLinea("  const fTitulo = `700 ${s(66)}px '${FONT}'`, lhT = s(80), maxT = 5")).toEqual(['${FONT}'])
  })

  it('ninguna línea pide una familia sin registrar', () => {
    const malas = lienzos.flatMap(({ ruta, texto }) =>
      texto.split('\n').flatMap((linea, i) =>
        familiasDeLinea(linea)
          .filter((f) => !PERMITIDAS.has(f))
          .map((f) => `${path.relative(SRC, ruta)}:${i + 1} pide «${f}»`),
      ),
    )
    expect(malas).toEqual([])
  })

  it('quien usa FONT la registra o la toma de carouselGen.ts', () => {
    const sinRegistro = lienzos
      .filter(({ texto }) => texto.includes('${FONT}'))
      .filter(({ texto }) => {
        const importa = /import \{[^}]*\bFONT\b[^}]*\} from '(\.\.\/lib|\.)\/carouselGen\.js'/.test(texto)
        const registra = /const FONT = 'DM Sans'/.test(texto) && /GlobalFonts\.registerFromPath\([^)]*\bFONT\)/.test(texto)
        return !importa && !registra
      })
      .map(({ ruta }) => path.relative(SRC, ruta))
    expect(sinRegistro).toEqual([])
  })
})
