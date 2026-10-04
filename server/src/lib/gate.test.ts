import { describe, it, expect } from 'vitest'
import { evaluateGate } from './gate.js'

const NOT_LEARNING = { learningMode: false }

describe('evaluateGate', () => {
  it('auto-publishes a neutral story (no frame, no keywords)', () => {
    const r = evaluateGate(
      { narrativeFrame: 'resiliencia', text: 'Feria de emprendimiento local reunio a productores de la region' },
      NOT_LEARNING,
    )
    expect(r.decision).toBe('auto_publish')
    expect(r.held).toBe(false)
    expect(r.reasons).toEqual([])
  })

  it('holds when a Lista A term is present (always sensitive)', () => {
    const r = evaluateGate(
      { narrativeFrame: null, text: 'Un atentado incendiario destruyo maquinaria durante la noche' },
      NOT_LEARNING,
    )
    expect(r.decision).toBe('held_for_review')
    expect(r.reasons).toContain('listA:atentado')
  })

  it('holds when the narrative frame is confrontacion', () => {
    const r = evaluateGate(
      { narrativeFrame: 'confrontacion', text: 'Manifestacion por demandas sociales en la plaza central' },
      NOT_LEARNING,
    )
    expect(r.decision).toBe('held_for_review')
    expect(r.reasons).toContain('frame:confrontacion')
  })

  it('holds everything in learning mode, even neutral stories', () => {
    const r = evaluateGate(
      { narrativeFrame: 'resiliencia', text: 'Torneo deportivo escolar en la comuna' },
      { learningMode: true },
    )
    expect(r.decision).toBe('held_for_review')
    expect(r.reasons).toContain('learning_mode')
  })

  it('does NOT hold on a Lista B term alone (avoids saturation), but records it as a signal', () => {
    const r = evaluateGate(
      { narrativeFrame: 'protagonismo', text: 'La machi encabezo una ceremonia tradicional en la comunidad' },
      NOT_LEARNING,
    )
    expect(r.decision).toBe('auto_publish')
    expect(r.held).toBe(false)
    expect(r.signals).toContain('listB:machi')
  })

  it('holds a Lista B term when corroborated by the confrontacion frame', () => {
    const r = evaluateGate(
      { narrativeFrame: 'confrontacion', text: 'Comuneros realizaron una toma en un predio de una forestal' },
      NOT_LEARNING,
    )
    expect(r.decision).toBe('held_for_review')
    expect(r.reasons).toContain('frame:confrontacion')
    expect(r.reasons).toContain('listB+corroborated:predio')
  })

  it('catches plurals/inflections (imputa -> imputados, imputaron) via accent-insensitive prefix match', () => {
    const r = evaluateGate(
      { narrativeFrame: null, text: 'Formalizaron a dos imputados por el hecho' },
      NOT_LEARNING,
    )
    expect(r.decision).toBe('held_for_review')
    expect(r.reasons).toContain('listA:imputa')
    const r2 = evaluateGate({ narrativeFrame: null, text: 'Imputaron a doce integrantes de la comunidad' }, NOT_LEARNING)
    expect(r2.reasons).toContain('listA:imputa')
  })

  // Puelmapu (2026-10-04)
  it('holds an eviction (desalojo) in Argentina even without a narrative frame', () => {
    const r = evaluateGate(
      { narrativeFrame: null, text: 'La Justicia ordenó el desalojo de una comunidad mapuche en Villa La Angostura' },
      NOT_LEARNING,
    )
    expect(r.decision).toBe('held_for_review')
    expect(r.reasons).toContain('listA:desaloj')
  })

  it('does not hold a place of the conflict (Villa Mascardi) on its own, only with corroboration', () => {
    const solo = evaluateGate(
      { narrativeFrame: 'protagonismo', text: 'Una familia pasó la tarde en un camping mapuche de Villa Mascardi' },
      NOT_LEARNING,
    )
    expect(solo.decision).toBe('auto_publish')
    expect(solo.signals).toContain('listB:villa mascardi')
    const con = evaluateGate(
      { narrativeFrame: 'confrontacion', text: 'Nuevo operativo en Villa Mascardi tras el ataque a un puesto' },
      NOT_LEARNING,
    )
    expect(con.decision).toBe('held_for_review')
    expect(con.reasons).toContain('listB+corroborated:villa mascardi')
  })

  it('holds RAM as a whole word and ignores it inside other words', () => {
    const r = evaluateGate({ narrativeFrame: null, text: 'El gobierno declaró organización terrorista a la RAM' }, NOT_LEARNING)
    expect(r.reasons).toContain('listA:ram')
    const r2 = evaluateGate({ narrativeFrame: 'protagonismo', text: 'La rama femenina del club se reunió en Ramos Mejía' }, NOT_LEARNING)
    expect(r2.reasons).not.toContain('listA:ram')
    expect(r2.decision).toBe('auto_publish')
  })

  it('does not false-trigger on mid-word coincidences (toma inside automatico)', () => {
    const r = evaluateGate(
      { narrativeFrame: 'resiliencia', text: 'El proceso automatico de la region concluyo sin problemas' },
      NOT_LEARNING,
    )
    expect(r.decision).toBe('auto_publish')
    expect(r.held).toBe(false)
  })

  it('is accent-insensitive on the input (víctima matches victima)', () => {
    const r = evaluateGate(
      { narrativeFrame: null, text: 'La víctima declaró ante el tribunal' },
      NOT_LEARNING,
    )
    expect(r.decision).toBe('held_for_review')
    expect(r.reasons).toContain('listA:victima')
  })

  // Siglas: palabra completa, no prefijo. Medido sobre 787 notas publicadas, el
  // prefijo «cam» disparaba en 92 textos por «cambio», «camara», «caminos».
  it('does not fire a short acronym (cam) as a prefix of ordinary words', () => {
    const r = evaluateGate(
      { narrativeFrame: 'confrontacion', text: 'El cambio climatico altera los caminos y la camara regional debate' },
      NOT_LEARNING,
    )
    expect(r.reasons).not.toContain('listB+corroborated:cam')
    expect(r.signals).not.toContain('listB:cam')
  })

  it('fires a short acronym (cam) only as a whole word, with accents and punctuation around it', () => {
    const r = evaluateGate(
      { narrativeFrame: 'protagonismo', text: 'Vocero de la CAM, en entrevista, descartó negociar.' },
      NOT_LEARNING,
    )
    expect(r.signals).toContain('listB:cam')
  })
})
