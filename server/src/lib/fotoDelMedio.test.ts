import { describe, it, expect } from 'vitest'
import { fotoDelMedio, origenDeImagen } from './fotoDelMedio.js'

const BUCKET = 'https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social'

describe('fotoDelMedio (la foto real de la noticia para el carrusel)', () => {
  it('la foto rehospedada del medio va al carrusel', () => {
    const url = `${BUCKET}/oghero-11cfa890-1234-4abc-9def-000000000001.jpg`
    expect(origenDeImagen(url)).toBe('medio')
    expect(fotoDelMedio(url)).toBe(url)
  })

  it('la foto servida desde el sitio del medio también va', () => {
    const url = 'https://www.biobiochile.cl/static/foto-plan-bosque.jpg'
    expect(origenDeImagen(url)).toBe('externa')
    expect(fotoDelMedio(url)).toBe(url)
  })

  it('una imagen de IA nunca va: el 24-oct inventó una escena', () => {
    const url = `${BUCKET}/99d66c21-6277-461a-9f16-e18c82b9d899-1793271943280.png`
    expect(origenDeImagen(url)).toBe('ia')
    expect(fotoDelMedio(url)).toBeNull()
  })

  it('la tarjeta compuesta no va: ya trae nuestra marca y el título', () => {
    const url = `${BUCKET}/storycard-0a58582b-3ee7-48a5-b456-bf7668ae6351.jpg`
    expect(origenDeImagen(url)).toBe('compuesta')
    expect(fotoDelMedio(url)).toBeNull()
  })

  it('sin imagen, sin foto', () => {
    expect(fotoDelMedio(null)).toBeNull()
    expect(fotoDelMedio(undefined)).toBeNull()
    expect(fotoDelMedio('')).toBeNull()
  })

  it('el prefijo se mira en el nombre del objeto, no en la ruta ni en la consulta', () => {
    expect(origenDeImagen(`${BUCKET}/oghero-abc.jpg?v=2`)).toBe('medio')
    expect(origenDeImagen(`${BUCKET}/abc-oghero-123.png`)).toBe('ia')
  })
})
