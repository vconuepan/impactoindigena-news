import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PublicStoryBody } from '@shared/types'
import StoryBodyClaves, { textoLocal } from './StoryBodyClaves'
import es from '../locales/es.json'

let idioma = 'es'

// El mismo diccionario real del sitio, para que el test lea los textos que
// leerá la gente y no copias.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: idioma },
    t: (clave: string, vars?: Record<string, string>) => {
      const valor = clave.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], es)
      if (typeof valor !== 'string') return clave
      return Object.entries(vars ?? {}).reduce((s, [k, v]) => s.split(`{{${k}}}`).join(v), valor)
    },
  }),
}))

function body(parcial: Partial<PublicStoryBody> = {}): PublicStoryBody {
  return {
    bajada: 'Las comunidades mapuche de Río Negro enfrentan una ley que facilita los desalojos.',
    quePaso: 'La Cámara aprobó el proyecto con 124 votos a favor.',
    porQueImporta: 'Cambia cómo un juez puede ordenar un desalojo.',
    contexto: 'En 2024 se derogó la ley de emergencia territorial.',
    queSigue: '',
    bajadaEn: null, quePasoEn: 'The Chamber passed the bill with 124 votes.', porQueImportaEn: null, contextoEn: null, queSigueEn: null,
    method: 'ia_sin_revision',
    reviewedBy: '',
    updatedAt: '2026-10-30T00:00:00.000Z',
    ...parcial,
  }
}

describe('StoryBodyClaves', () => {
  it('muestra la bajada y las claves con texto, y omite «Qué sigue» vacío', () => {
    idioma = 'es'
    render(<StoryBodyClaves body={body()} publisher="Resumen Latinoamericano" accentColor="#0D5F3C" />)
    expect(screen.getByText(/Las comunidades mapuche de Río Negro/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Qué pasó' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Por qué importa a los pueblos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Contexto' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Qué sigue' })).not.toBeInTheDocument()
  })

  it('sin revisión, el recuadro dice que nadie la revisó y nombra al medio', () => {
    idioma = 'es'
    render(<StoryBodyClaves body={body()} publisher="Resumen Latinoamericano" accentColor="#0D5F3C" />)
    expect(screen.getByRole('heading', { name: '¿Cómo hicimos esta nota?' })).toBeInTheDocument()
    expect(screen.getByText(/Nadie la revisó antes de publicarla/)).toBeInTheDocument()
    expect(screen.getByText(/artículo completo de Resumen Latinoamericano/)).toBeInTheDocument()
  })

  it('revisada, el recuadro nombra a quien la revisó', () => {
    idioma = 'es'
    render(<StoryBodyClaves body={body({ method: 'ia_revisada', reviewedBy: 'Venancio Coñuepán Mesías' })} publisher="Mongabay" accentColor="#0D5F3C" />)
    expect(screen.getByText(/Venancio Coñuepán Mesías la leyó, la corrigió y la aprobó/)).toBeInTheDocument()
  })

  it('en inglés cae campo por campo al español mientras no haya traducción', () => {
    const b = body()
    expect(textoLocal(b, 'quePaso', true)).toBe('The Chamber passed the bill with 124 votes.')
    expect(textoLocal(b, 'contexto', true)).toBe(b.contexto)
    expect(textoLocal(b, 'quePaso', false)).toBe(b.quePaso)
  })
})
