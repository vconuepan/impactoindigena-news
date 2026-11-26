import { describe, it, expect, vi } from 'vitest'

// El script arma un cliente S3 al importarse; en el test no hace falta uno real.
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  HeadObjectCommand: vi.fn(),
  CopyObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(),
}))

const { nombreDeTarjeta, tituloDeTarjeta, altoFranjaLimpia } = await import('./regenerar-storycards.js')

describe('nombreDeTarjeta', () => {
  const R2 = 'https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social/'

  it('reconoce una tarjeta compuesta', () => {
    expect(nombreDeTarjeta(`${R2}storycard-90c456f6-ce6e-4ad2-b911-7bb44e653df6.jpg`)).toBe(
      'storycard-90c456f6-ce6e-4ad2-b911-7bb44e653df6.jpg',
    )
  })

  it('no toca la foto del medio rehospedada ni otras imagenes', () => {
    // `oghero-` es la foto del medio tal cual: no lleva rotulo que corregir.
    expect(nombreDeTarjeta(`${R2}oghero-97f873e9-5710-4f94-8ee3-a2534e874138.jpg`)).toBeNull()
    expect(nombreDeTarjeta(`${R2}97f873e9-5710-4f94-8ee3-a2534e874138.png`)).toBeNull()
    expect(nombreDeTarjeta('https://medio.example/storycard-x.jpg')).toBeNull()
    expect(nombreDeTarjeta(null)).toBeNull()
  })

  it('ignora una cadena de consulta', () => {
    expect(nombreDeTarjeta(`${R2}storycard-90c456f6-ce6e-4ad2-b911-7bb44e653df6.jpg?v=2`)).toBe(
      'storycard-90c456f6-ce6e-4ad2-b911-7bb44e653df6.jpg',
    )
  })
})

describe('tituloDeTarjeta', () => {
  it('usa el titulo editorial, como publishStories', () => {
    expect(tituloDeTarjeta({ title: 'Historia del Tratado de Tapihue', sourceTitle: 'otro' })).toBe(
      'Historia del Tratado de Tapihue',
    )
  })

  it('cae al titulo de la fuente si no hay editorial', () => {
    expect(tituloDeTarjeta({ title: null, sourceTitle: 'Titulo de la fuente' })).toBe('Titulo de la fuente')
    expect(tituloDeTarjeta({ title: '  ', sourceTitle: 'Titulo de la fuente' })).toBe('Titulo de la fuente')
  })
})

describe('altoFranjaLimpia', () => {
  it('corta por encima del texto de la tarjeta (420 de 630)', () => {
    expect(altoFranjaLimpia(630)).toBe(420)
    // Proporcional: vale igual para una tarjeta del doble de alto.
    expect(altoFranjaLimpia(1260)).toBe(840)
  })
})
