import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * El esqueleto del hero y el hero real tienen que medir lo mismo. Si no, al
 * llegar los datos el hero cambia de alto y empuja toda la pagina — eso es CLS,
 * y ya paso: el hero se rediseño a una imagen de alto fijo y el esqueleto quedo
 * atras, con un salto medido de 272 px y un CLS de 0,188.
 *
 * No basta con renderizar los dos y comparar: jsdom no aplica Tailwind, asi que
 * las alturas serian 0 en ambos y el test pasaria siempre. Se comparan las
 * CLASES que declaran el alto, que es lo que el navegador va a usar.
 */

const raiz = path.resolve(__dirname, '../../..')
const leer = (p: string) => readFileSync(path.join(raiz, p), 'utf8')

/** Extrae las clases de alto fijo (h-[Npx], con o sin prefijo de breakpoint). */
function clasesDeAlto(codigo: string): string[] {
  return [...codigo.matchAll(/(?:^|\s|")((?:[a-z]+:)?h-\[\d+px\])/g)].map((m) => m[1]).sort()
}

/**
 * HomePage.tsx tiene varios componentes; solo interesa el hero. Sin acotar, el
 * test se llevaba por delante el `h-[200px]` de la ilustracion decorativa de
 * cada seccion, que no tiene nada que ver.
 */
function soloElHero(homePage: string): string {
  const ini = homePage.indexOf('function HeroSection(')
  if (ini < 0) throw new Error('no se encontro HeroSection en HomePage.tsx')
  // Hasta la siguiente declaracion de nivel superior.
  const resto = homePage.slice(ini + 1)
  const fin = resto.search(/\n(?:function|const|export) /)
  return fin < 0 ? resto : resto.slice(0, fin)
}

describe('HeroSkeleton mide lo mismo que el hero real', () => {
  const skeleton = leer('src/components/skeletons/HeroSkeleton.tsx')
  const homePage = soloElHero(leer('src/pages/HomePage.tsx'))

  it('el hero real sigue declarando un alto fijo', () => {
    // Si algun dia deja de tenerlo, este test hay que repensarlo entero en vez
    // de que siga pasando por comparar dos listas vacias.
    expect(clasesDeAlto(homePage).length).toBeGreaterThan(0)
  })

  it('el esqueleto declara exactamente las mismas alturas que el hero', () => {
    const delHero = clasesDeAlto(homePage)
    const delEsqueleto = clasesDeAlto(skeleton)

    // Cada alto que el hero declara tiene que estar tambien en el esqueleto.
    for (const clase of new Set(delHero)) {
      expect(delEsqueleto, `el hero usa ${clase} y el esqueleto no`).toContain(clase)
    }
  })

  it('el esqueleto ancla su contenido abajo, igual que el hero', () => {
    // Mismo alto total pero texto arriba en vez de abajo seguiria moviendo cosas
    // dentro del hero al reemplazarse.
    expect(skeleton).toContain('absolute inset-0 flex items-end')
    expect(homePage).toContain('absolute inset-0 flex items-end')
  })

  it('no vuelve a usar la clase .hero-section, que se estira con su contenido', () => {
    // Era la causa del salto: `.hero-section` es `py-8 px-4` sin alto, asi que
    // medía lo que midiera su contenido — ~288 px contra los 560 del hero.
    expect(skeleton).not.toContain('"hero-section"')
    expect(skeleton).not.toContain('hero-section-inner')
  })
})
