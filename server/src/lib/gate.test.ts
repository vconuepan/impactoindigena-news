import { describe, it, expect } from 'vitest'
import { evaluateGate, GATE_VERSION, LISTA_A, LISTA_B, LARGO_SIGLA } from './gate.js'
import { createHash } from 'node:crypto'

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

  it('catches plurals/inflections (imput -> imputados, imputaron, imputó) via accent-insensitive prefix match', () => {
    const r = evaluateGate(
      { narrativeFrame: null, text: 'Formalizaron a dos imputados por el hecho' },
      NOT_LEARNING,
    )
    expect(r.decision).toBe('held_for_review')
    expect(r.reasons).toContain('listA:imput')
    const r2 = evaluateGate({ narrativeFrame: null, text: 'Imputaron a doce integrantes de la comunidad' }, NOT_LEARNING)
    expect(r2.reasons).toContain('listA:imput')
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

  it('holds a present-tense arrest headline (Detienen a…) with no other term', () => {
    const r = evaluateGate({ narrativeFrame: null, text: 'Detienen a dos integrantes de una comunidad mapuche en Chubut' }, NOT_LEARNING)
    expect(r.decision).toBe('held_for_review')
    expect(r.reasons).toContain('listA:detienen')
  })

  // 7.3.3: NNA retienen solo en contexto de violencia o conflicto. Medido: «niños»
  // solo retenía 6 notas de lengua y educación de la vertical Mapuche.
  it('lets a children-and-language story pass (nino is Lista B now) but holds it when corroborated', () => {
    const cultural = evaluateGate({ narrativeFrame: 'protagonismo', text: 'Nidos lingüísticos para que 200 niños aprendan mapuzugun' }, NOT_LEARNING)
    expect(cultural.decision).toBe('auto_publish')
    expect(cultural.signals).toContain('listB:nino')
    const abuso = evaluateGate({ narrativeFrame: null, text: 'Denuncian abusos contra niños de una comunidad' }, NOT_LEARNING)
    expect(abuso.decision).toBe('held_for_review')
    expect(abuso.reasons).toContain('listB+corroborated:nino')
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

// Retencion por vertical (D4): cada fila guarda con que reglas se evaluo, y el
// conciliador reevalua las decisiones de maquina cuando la huella cambia.
describe('GATE_VERSION', () => {
  it('es la huella de las dos listas y del largo de sigla', () => {
    const esperado = createHash('sha1')
      .update(['A', ...LISTA_A, 'B', ...LISTA_B, 'SIGLA', String(LARGO_SIGLA)].join('\n'))
      .digest('hex')
      .slice(0, 12)
    expect(GATE_VERSION).toBe(esperado)
    expect(GATE_VERSION).toMatch(/^[0-9a-f]{12}$/)
  })
  it('cambia si cambia un termino', () => {
    const otra = createHash('sha1')
      .update(['A', ...LISTA_A, 'termino-nuevo', 'B', ...LISTA_B, 'SIGLA', String(LARGO_SIGLA)].join('\n'))
      .digest('hex')
      .slice(0, 12)
    expect(otra).not.toBe(GATE_VERSION)
  })
})

