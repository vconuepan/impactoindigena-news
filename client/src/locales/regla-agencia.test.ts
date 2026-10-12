import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * El candado de la regla de agencia sobre la mision del sitio.
 *
 * Regla 1 de lenguaje de la casa: la agencia es de los pueblos; el sujeto de la
 * primera frase nunca es la Fundacion ni la plataforma. Hasta el 12-oct-2026 la
 * mision de la portada abria con «Cubrimos…» —el medio de sujeto, en la frase
 * mas visible del sitio— y ningun test lo miraba. Esta prueba mira solo la
 * mision, en los dos idiomas. Es copy, y el copy lo decide direccion: el test
 * no lo redacta, solo impide que vuelva a entrar con el sujeto equivocado.
 *
 * Mismo molde que `__tests__/unit/regla-agencia.test.ts` en el monorepo de la
 * Fundacion Empresas Indigenas: una lista escrita a mano y no una heuristica,
 * porque la morfologia sola se equivoca («Hablemos» tambien es primera persona
 * del plural y no reclama la agencia).
 */
function mision(idioma: 'es' | 'en'): string {
  const ruta = path.resolve(__dirname, `${idioma}.json`)
  const json = JSON.parse(readFileSync(ruta, 'utf8')) as { mission: { statement: string } }
  return json.mission.statement
}

/** Abrir nombrandose a si mismo, o en primera persona del plural con el medio detras. */
const EL_MEDIO_DE_SUJETO = {
  es: /^\s*(en\s+)?(voces\s+ind[íi]genas|la\s+fundaci[óo]n|la\s+plataforma|(este|el|un)\s+medio|nosotros|cubrimos|publicamos|seleccionamos|elegimos|curamos|monitoreamos|tendemos|construimos|somos|nuestr[oa]s?)\b/i,
  en: /^\s*(at\s+)?(voces\s+ind[íi]genas|the\s+foundation|the\s+platform|(this|an?)\s+outlet|we|our)\b/i,
}

describe('la mision del sitio no tiene al medio de sujeto', () => {
  for (const idioma of ['es', 'en'] as const) {
    it(`${idioma}: existe y no abre con el medio ni con la Fundacion`, () => {
      const texto = mision(idioma)
      expect(texto.trim().length).toBeGreaterThan(0)
      expect(texto).not.toMatch(EL_MEDIO_DE_SUJETO[idioma])
    })
  }

  it('la frase que se retiro el 12-oct-2026 no vuelve', () => {
    for (const idioma of ['es', 'en'] as const) {
      expect(mision(idioma)).not.toMatch(/protagonistas, no como v[íi]ctimas|protagonists, not (as )?victims/i)
    }
  })
})
