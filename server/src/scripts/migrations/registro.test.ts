import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Toda migracion tiene que tener su comando en package.json.
 *
 * Dos veces el 6-sep se documento un comando que no existia y la corrida fallo
 * con ENOENT: `migration:recomprimir-imagenes` y `migration:remapear-feeds`
 * vivian en disco desde dias antes sin estar registrados. El archivo esta, el
 * codigo funciona, y el comando que uno teclea no existe — que es de las formas
 * mas tontas de perder una tarde.
 *
 * Siete de las veinticuatro migraciones estaban asi.
 */

const DIR = path.resolve(__dirname)
const PKG = path.resolve(__dirname, '../../../package.json')

describe('cada migracion tiene su comando en package.json', () => {
  const scripts: Record<string, string> = JSON.parse(readFileSync(PKG, 'utf8')).scripts
  const registrados = new Set(
    Object.values(scripts).flatMap((cmd) =>
      cmd
        .split(/\s+/)
        .filter((t) => t.endsWith('.ts'))
        .map((t) => path.basename(t)),
    ),
  )
  const enDisco = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

  it('hay migraciones que revisar', () => {
    expect(enDisco.length).toBeGreaterThan(10)
  })

  for (const archivo of enDisco) {
    it(`${archivo} se puede correr con npm run`, () => {
      expect(
        registrados,
        `${archivo} no tiene comando: agregarlo a package.json como migration:<algo>`,
      ).toContain(archivo)
    })
  }

  it('la que acepta --apply tiene tambien su variante :apply', () => {
    // Simular y aplicar son dos comandos distintos a proposito: el que escribe
    // en produccion se teclea entero, no se llega a el por una bandera olvidada.
    for (const archivo of enDisco) {
      const src = readFileSync(path.join(DIR, archivo), 'utf8')
      if (!src.includes('--apply')) continue
      const tieneApply = Object.values(scripts).some(
        (cmd) => cmd.includes(archivo) && cmd.includes('--apply'),
      )
      expect(tieneApply, `${archivo} acepta --apply pero no hay comando que lo pase`).toBe(true)
    }
  })
})
