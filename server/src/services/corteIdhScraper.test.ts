import { describe, it, expect, vi } from 'vitest'

// ──── Mocks (isolate the module from prisma/config/logger side effects) ──────

vi.mock('../lib/prisma.js', () => ({ default: {} }))
vi.mock('../config.js', () => ({
  config: {
    agenda: { corteIdhEnabled: true },
    crawl: { maxConcurrencyPerDomain: 2, minDelayPerDomainMs: 0 },
  },
}))
vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

const { parseCorteIdhListing, parseSpanishDate, classifyType } = await import('./corteIdhScraper.js')

// ──── parseSpanishDate ───────────────────────────────────────────────────────

describe('parseSpanishDate', () => {
  it('parses "3 de julio de 2026" as a UTC date', () => {
    const d = parseSpanishDate('San José, Costa Rica, 3 de julio de 2026.')!
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(6) // July
    expect(d.getUTCDate()).toBe(3)
  })

  it('rejects an overflow date (31 de abril)', () => {
    expect(parseSpanishDate('31 de abril de 2026')).toBeNull()
  })

  it('returns null when there is no date', () => {
    expect(parseSpanishDate('sin fecha en este texto')).toBeNull()
  })
})

// ──── classifyType ───────────────────────────────────────────────────────────

describe('classifyType', () => {
  it('detects convocatoria', () => {
    expect(classifyType('Convocatoria al concurso de pasantías 2026')).toBe('convocatoria')
  })
  it('detects evento (audiencia)', () => {
    expect(classifyType('La Corte celebrará una audiencia pública del caso')).toBe('evento')
  })
  it('defaults to publicacion', () => {
    expect(classifyType('La Corte notifica la sentencia del caso')).toBe('publicacion')
  })
})

// ──── parseCorteIdhListing ───────────────────────────────────────────────────

const LISTING = `
<ul>
  <li class="tr_normal"><div class="row"><div class="col-3"></div>
    <div class="col-9 text-justify">
      <h4 class="text-justify">La Corte IDH notifica la Sentencia del Caso Pueblos Indígenas de Sarayaku Vs. Ecuador</h4>
      <p><em>San José, Costa Rica, 3 de julio de 2026.</em> La Corte notificó la sentencia sobre los derechos territoriales del pueblo indígena.</p>
      <p><a class="link1" href="docs/comunicados/cp_45_2026.pdf" target="_blank">Versión en español</a></p>
    </div></div>
  </li>
  <li class="tr_normal"><div class="row">
    <div class="col-9 text-justify">
      <h4>La Corte IDH celebra un nuevo aniversario institucional</h4>
      <p><em>San José, 1 de junio de 2026.</em> La Corte celebró su aniversario con un acto protocolar.</p>
      <p><a class="link1" href="docs/comunicados/cp_40_2026.pdf">Versión en español</a></p>
    </div></div>
  </li>
</ul>`

describe('parseCorteIdhListing', () => {
  it('keeps only indigenous-relevant releases and extracts their fields', () => {
    const drafts = parseCorteIdhListing(LISTING)

    // Only the Sarayaku (indigenous) release passes the relevance filter.
    expect(drafts).toHaveLength(1)
    const d = drafts[0]
    expect(d.title).toContain('Sarayaku')
    expect(d.type).toBe('publicacion')
    expect(d.lang).toBe('es')
    expect(d.externalId).toBe('corteidh:cp_45_2026')
    expect(d.sourceUrl).toBe('https://www.corteidh.or.cr/docs/comunicados/cp_45_2026.pdf')
    expect(d.publishedAt?.getUTCMonth()).toBe(6) // July, from the dateline
    expect(d.sourceName).toBe('Corte IDH · Comunicados')
  })
})
