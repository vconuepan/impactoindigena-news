import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * El hueco sin foto de StoryCard pinta el pictograma de la categoria, y la
 * lista de categorias con pictograma vive escrita en el componente. Si un slug
 * cambia, el pictograma deja de cargar en silencio: paso el 6-sep-2026 con seis
 * de las ocho ilustraciones de la portada. Este test ata la lista a los archivos.
 */
describe('NoPhotoFill: la lista de slugs coincide con los pictogramas', () => {
  it('cada slug declarado tiene su PNG, y cada PNG esta declarado', () => {
    const fuente = readFileSync(path.resolve(__dirname, 'StoryCard.tsx'), 'utf8')
    const bloque = fuente.match(/ILLUSTRATED_SLUGS = new Set\(\[([\s\S]*?)\]\)/)
    expect(bloque, 'no se encontro ILLUSTRATED_SLUGS en StoryCard.tsx').not.toBeNull()
    const declarados = [...bloque![1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort()

    const dir = path.resolve(__dirname, '../../public/illustrations')
    const archivos = readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')).sort()

    expect(declarados).toEqual(archivos)
  })
})
