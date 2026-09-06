import { describe, it, expect, vi } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'

vi.mock('./logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

const { normalizar, normalizarDecodificada, ANCHO_MAXIMO } = await import('./imagen-normalizar.js')

/**
 * Un PNG con ruido por pixel, que es lo que hace fotografica a una imagen a ojos
 * de un compresor: PNG comprime sin perdida y con ruido no tiene nada que
 * aprovechar, mientras que JPEG lo descarta. Sin ruido no se prueba nada — un
 * relleno solido, un degradado o un patron periodico comprimen tan bien en PNG
 * que el JPEG sale MAS pesado y `normalizar` devuelve null con razon.
 *
 * El generador es un LCG con semilla fija: mismo buffer en cada corrida, sin
 * Math.random, para que el test no sea intermitente.
 */
function pngFotografico(w: number, h: number): Buffer {
  const c = createCanvas(w, h)
  const ctx = c.getContext('2d')
  const datos = ctx.createImageData(w, h)
  let semilla = 12345
  for (let i = 0; i < datos.data.length; i += 4) {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff
    datos.data[i] = semilla & 0xff
    datos.data[i + 1] = (semilla >> 8) & 0xff
    datos.data[i + 2] = (semilla >> 16) & 0xff
    datos.data[i + 3] = 255
  }
  ctx.putImageData(datos, 0, 0)
  return c.toBuffer('image/png')
}

describe('normalizar — el PNG del generador de imagenes', () => {
  it('un hero de 1536x1024 sale mucho mas liviano y acotado a 1200 px', async () => {
    // La medida real del defecto: el modelo devuelve 1536x1024 en PNG.
    const original = pngFotografico(1536, 1024)
    const salida = await normalizar(original)

    expect(salida).not.toBeNull()
    expect(salida!.length).toBeLessThan(original.length)

    const img = await loadImage(salida!)
    expect(img.width).toBe(ANCHO_MAXIMO)
    // La proporcion se conserva: 1024/1536 de 1200 son 800.
    expect(img.height).toBe(800)
  })

  it('un JPEG ya optimizado y dentro del ancho maximo NO se reencodea', async () => {
    // El caso que destapo la simulacion contra la portada el 6-sep-2026: tres
    // imagenes daban -0% de ahorro y aun asi se reencodeaban, degradandose. Un
    // JPEG q82 pasado otra vez por el encoder a q82 sale casi del mismo tamano:
    // pierde calidad y no ahorra nada.
    const original = pngFotografico(1200, 630)
    const yaOptimizado = (await normalizar(original))!
    expect(yaOptimizado).not.toBeNull()

    // Segunda pasada sobre el resultado: no debe tocarlo.
    expect(await normalizar(yaOptimizado)).toBeNull()
  })

  it('no reencodea en balde: si el original ya pesa menos, devuelve null', async () => {
    // Un JPEG chico ya optimizado no gana nada pasando otra vez por el encoder,
    // y reencodear degrada la imagen sin ahorrar un byte.
    const c = createCanvas(400, 300)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#888'
    ctx.fillRect(0, 0, 400, 300)
    const jpegChico = c.toBuffer('image/jpeg', 40)

    expect(await normalizar(jpegChico)).toBeNull()
  })

  it('un buffer que no es una imagen devuelve null en vez de lanzar', async () => {
    // Quien llama sube el original y sigue: una imagen pesada es mejor que una
    // historia sin imagen, y peor todavia seria tumbar la publicacion entera.
    await expect(normalizar(Buffer.from('esto no es una imagen'))).resolves.toBeNull()
  })

  it('una imagen mas angosta que el maximo no se agranda', async () => {
    const original = pngFotografico(600, 400)
    const salida = await normalizar(original)

    // Puede o no convenir reencodearla, pero jamas debe escalarse hacia arriba.
    if (salida) {
      const img = await loadImage(salida)
      expect(img.width).toBe(600)
    }
  })

  it('normalizarDecodificada acota el ancho al maximo', async () => {
    const original = pngFotografico(2400, 1200)
    const img = await loadImage(original)
    const salida = normalizarDecodificada(img, original)

    expect(salida).not.toBeNull()
    expect((await loadImage(salida!)).width).toBe(ANCHO_MAXIMO)
  })
})
