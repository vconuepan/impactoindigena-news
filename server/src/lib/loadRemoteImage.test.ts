import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * `loadImage(url)` de @napi-rs/canvas pide la URL con http.get, sigue las
 * redirecciones y no valida el destino. El carrusel recibia la URL de la imagen
 * de la nota, que puede venir de la pagina de un tercero. `loadRemoteImage` baja
 * los bytes por `downloadExternalImage` (guardia SSRF en cada salto) y solo
 * entonces los decodifica.
 */
const mockDownload = vi.hoisted(() => vi.fn())
vi.mock('./imageStorage.js', () => ({ downloadExternalImage: mockDownload }))
const mockLoadImage = vi.hoisted(() => vi.fn())
vi.mock('@napi-rs/canvas', () => ({ loadImage: mockLoadImage }))

const { loadRemoteImage } = await import('./loadRemoteImage.js')

beforeEach(() => vi.clearAllMocks())

describe('loadRemoteImage', () => {
  it('baja los bytes por la guardia y decodifica el buffer, no la URL', async () => {
    const buffer = Buffer.from('jpeg-bytes')
    mockDownload.mockResolvedValue({ buffer, contentType: 'image/jpeg', ext: 'jpg' })
    mockLoadImage.mockResolvedValue({ width: 10, height: 10 })

    const img = await loadRemoteImage('https://cdn.example/a.jpg')

    expect(mockDownload).toHaveBeenCalledWith('https://cdn.example/a.jpg')
    expect(mockLoadImage).toHaveBeenCalledWith(buffer)
    expect(img).toEqual({ width: 10, height: 10 })
  })

  it('lanza, sin decodificar nada, cuando la guardia rechaza o la descarga falla', async () => {
    mockDownload.mockResolvedValue(null)
    await expect(loadRemoteImage('http://169.254.169.254/x')).rejects.toThrow(/no se pudo descargar/i)
    expect(mockLoadImage).not.toHaveBeenCalled()
  })
})

describe('el carrusel no pide la imagen de la nota con loadImage(url)', () => {
  // Guardia de regresion: es una lectura del archivo, no de comportamiento. Si
  // alguien vuelve a pasar la URL directo a loadImage, este test lo dice.
  it('carouselGen.ts solo decodifica imagenes remotas por loadRemoteImage', () => {
    const ruta = fileURLToPath(new URL('./carouselGen.ts', import.meta.url))
    const fuente = readFileSync(ruta, 'utf8')
    expect(fuente).not.toMatch(/loadImage\(\s*aiImageUrl/)
    expect(fuente).toMatch(/loadRemoteImage\(\s*aiImageUrl/)
  })
})
