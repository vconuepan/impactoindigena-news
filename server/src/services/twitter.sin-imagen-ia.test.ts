/**
 * Los borradores para redes no generan imágenes con IA.
 *
 * Hasta el 21-nov-2026 cada borrador de Twitter pedía una imagen a gpt-image-2, dos veces al día
 * con social_auto_post: era el gasto diario de imágenes en la suscripción de Azure de la Fundación
 * (~USD 9,7 al mes). Decisión del director, para ahorrar créditos: «Sin imágenes IA en redes». El
 * borrador usa la imagen que la historia ya tiene. Este candado falla si vuelve la generación.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const fuente = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'twitter.ts'), 'utf8')

describe('services/twitter · sin imágenes generadas con IA', () => {
  it('no importa ni llama al generador de imágenes', () => {
    expect(fuente).not.toMatch(/imageGen/)
    expect(fuente).not.toMatch(/generateStoryImage/)
  })

  it('usa la imagen que la historia ya tiene', () => {
    expect(fuente).toMatch(/const imageUrl: string \| null = story\.imageUrl \?\? null/)
  })
})
