import { describe, it, expect } from 'vitest'
import { canonicalIssueSlug, LEGACY_ISSUE_SLUGS } from './issue-slug.js'

describe('canonicalIssueSlug', () => {
  it('traduce el slug legado de Economias', () => {
    expect(canonicalIssueSlug('desarrollo-sostenible-y-autodeterminado')).toBe('economias-indigenas')
  })

  it('deja pasar cualquier otro slug sin tocarlo', () => {
    for (const s of ['derechos-indigenas', 'territorio-y-tierras', 'oceania', 'no-existe']) {
      expect(canonicalIssueSlug(s)).toBe(s)
    }
  })

  it('es idempotente', () => {
    // Importa porque el slug pasa por aqui en mas de una capa: si aplicarlo dos
    // veces cambiara el resultado, el orden de las llamadas seria significativo.
    for (const s of [...LEGACY_ISSUE_SLUGS, 'derechos-indigenas']) {
      expect(canonicalIssueSlug(canonicalIssueSlug(s))).toBe(canonicalIssueSlug(s))
    }
  })

  it('ningun slug canonico es a su vez un alias', () => {
    for (const legado of LEGACY_ISSUE_SLUGS) {
      expect(LEGACY_ISSUE_SLUGS).not.toContain(canonicalIssueSlug(legado))
    }
  })
})
