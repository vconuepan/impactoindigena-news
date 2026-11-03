import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, utimesSync, chmodSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { opcionesDelArchivo, borrarRegistrosSinFecha } from './logger.js'

/**
 * El archivo de registro rotativo (pino-roll) y sus dos defectos de 2026:
 *
 * - A3: la limpieza ordenaba por numero, conservaba `server.54` a `server.67`
 *   (julio-agosto) para siempre y borraba cada dia los recientes.
 * - A4: borraba el archivo en uso; en un deploy el contenedor nuevo lo elegia y no
 *   podia abrirlo, y el `ENOENT` sin manejar tumbaba el arranque (3-nov-2026 00:57,
 *   19 y 26-oct).
 */
const require = createRequire(import.meta.url)
const { removeOldFiles } = require('pino-roll/lib/utils.js')

let dir: string
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'voces-logs-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const dia = (i: number) => new Date(Date.UTC(2026, 10, 3) - i * 864e5).toISOString().slice(0, 10)

describe('limpieza de pino-roll con nuestras opciones (pino-roll real)', () => {
  // En una rotación real la limpieza casi siempre lista el directorio ANTES de que
  // exista el archivo nuevo; a veces, después. Se prueban los dos órdenes: en
  // ninguno quedan más de 14 días, y el activo nunca se borra.
  for (const activoYaCreado of [false, true]) {
    it(`deja a lo más 14 días y no toca lo que no es suyo (activo ${activoYaCreado ? 'ya creado' : 'todavía sin crear'})`, async () => {
      for (let i = 20; i >= 1; i--) writeFileSync(path.join(dir, `server.${dia(i)}.1.log`), 'x')
      writeFileSync(path.join(dir, 'server.54.log'), 'x')
      writeFileSync(path.join(dir, 'otro.txt'), 'x')
      const o = opcionesDelArchivo(dir, 14)
      const activo = path.join(dir, `server.${dia(0)}.1.log`)
      if (activoYaCreado) writeFileSync(activo, 'x')

      await removeOldFiles({ ...o.limit, baseFile: path.join(dir, 'server'), dateFormat: o.dateFormat, extension: '.log', createdFileNames: [], newFileName: activo })
      if (!activoYaCreado) writeFileSync(activo, 'x') // el archivo nuevo aparece después de la limpieza

      const quedan = readdirSync(dir)
      const fechados = quedan.filter((f) => /\d{4}-\d{2}-\d{2}/.test(f)).sort()
      expect(fechados.length).toBeLessThanOrEqual(14)
      expect(fechados.length).toBeGreaterThanOrEqual(13)
      expect(quedan).toContain(path.basename(activo))
      expect(quedan).toContain('server.54.log')
      expect(quedan).toContain('otro.txt')
    })
  }
})

describe('borrarRegistrosSinFecha (el formato anterior al 3-nov-2026)', () => {
  const ahora = Date.UTC(2026, 10, 3, 12)
  const conFecha = (nombre: string, diasAtras: number) => {
    const ruta = path.join(dir, nombre)
    writeFileSync(ruta, 'x')
    const t = (ahora - diasAtras * 864e5) / 1000
    utimesSync(ruta, t, t)
  }

  it('borra solo server.<n>.log con más días que la retención', async () => {
    conFecha('server.54.log', 100)
    conFecha('server.67.log', 90)
    conFecha('server.1.log', 3)            // el último en uso: todavía en plazo
    conFecha(`server.${dia(30)}.1.log`, 30) // formato nuevo: lo maneja pino-roll
    conFecha('otro.log', 100)
    mkdirSync(path.join(dir, 'server.9.log')) // no es un archivo

    const borrados = await borrarRegistrosSinFecha(dir, 14, ahora)

    expect(borrados.sort()).toEqual(['server.54.log', 'server.67.log'])
    expect(readdirSync(dir).sort()).toEqual(['otro.log', 'server.1.log', `server.${dia(30)}.1.log`, 'server.9.log'].sort())
  })

  it('con un directorio que no existe devuelve vacío y no lanza', async () => {
    await expect(borrarRegistrosSinFecha(path.join(dir, 'no-existe'), 14, ahora)).resolves.toEqual([])
  })

  it('con días inválidos no borra nada (con NaN borraba todo, también el archivo en uso)', async () => {
    conFecha('server.9.log', 0)
    conFecha('server.54.log', 100)
    for (const dias of [Number.NaN, 0, -1, 1.5]) {
      await expect(borrarRegistrosSinFecha(dir, dias, ahora)).resolves.toEqual([])
    }
    expect(readdirSync(dir).sort()).toEqual(['server.54.log', 'server.9.log'])
  })

  it.skipIf(process.getuid?.() === 0)('si no puede leer el directorio por otra razón, lanza para que se registre', async () => {
    conFecha('server.54.log', 100)
    chmodSync(dir, 0o000)
    try {
      await expect(borrarRegistrosSinFecha(dir, 14, ahora)).rejects.toThrow()
    } finally {
      chmodSync(dir, 0o700)
    }
  })
})

/** Fecha UTC de hoy y de mañana: el hijo corre con TZ=UTC y puede cruzar la medianoche. */
const diasUtc = () => {
  const hoy = new Date()
  return [hoy, new Date(hoy.getTime() + 864e5)].map((d) => d.toISOString().slice(0, 10))
}

function arrancarHijo(cuerpo: string, env: Record<string, string> = {}) {
  const logger = fileURLToPath(new URL('./logger.ts', import.meta.url))
  const guion = path.join(dir, 'arrancar.ts')
  writeFileSync(guion, `
    async function main() {
      const { createLogger } = await import(${JSON.stringify(logger)})
      const log = createLogger('prueba-a4')
      ${cuerpo}
    }
    main()
  `)
  const tsx = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../node_modules/.bin/tsx')
  return spawnSync(tsx, [guion], {
    env: { ...process.env, NODE_ENV: 'production', LOG_DIR: dir, TZ: 'UTC', ...env },
    encoding: 'utf8',
    timeout: 40_000,
  })
}

describe('un archivo de registro que no se puede abrir no tumba el servidor (A4)', () => {
  it('el proceso sigue, avisa una vez y sigue registrando por la salida estándar', () => {
    // El archivo del día es una carpeta: pino-roll lo elige y no puede abrirlo,
    // el mismo mecanismo del ENOENT del 3-nov-2026 (aquí EISDIR).
    for (const d of diasUtc()) mkdirSync(path.join(dir, `server.${d}.1.log`))
    const r = arrancarHijo(`
      for (let i = 0; i < 4; i++) { log.info({ i }, 'linea de prueba'); await new Promise((r) => setTimeout(r, 200)) }
      log.info('fin sin caida')
      await new Promise((r) => setTimeout(r, 300))
    `)

    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('fin sin caida')
    expect(r.stdout.match(/linea de prueba/g)).toHaveLength(4)
    expect(r.stdout.match(/el archivo de registro fallo/g)).toHaveLength(1)
  }, 50_000)

  it('cuando el archivo vuelve a poder abrirse, se reconecta, lo avisa y escribe en él', () => {
    const carpetas = diasUtc().map((d) => path.join(dir, `server.${d}.1.log`))
    for (const c of carpetas) mkdirSync(c)
    const r = arrancarHijo(`
      const { rmdirSync } = await import('node:fs')
      log.info('antes de arreglar')
      await new Promise((r) => setTimeout(r, 400))
      for (const c of ${JSON.stringify(carpetas)}) rmdirSync(c)
      await new Promise((r) => setTimeout(r, 1500))
      log.info('despues de reconectar')
      await new Promise((r) => setTimeout(r, 500))
    `, { LOG_FILE_RETRY_MS: '300' })

    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout.match(/el archivo de registro fallo/g)).toHaveLength(1)
    expect(r.stdout).toContain('el archivo de registro se recupero')
    const escrito = carpetas.filter((c) => existsSync(c)).map((c) => readFileSync(c, 'utf8')).join('')
    expect(escrito).toContain('despues de reconectar')
  }, 50_000)
})
