/**
 * Candado de lenguaje para lo que redacta el carril de marca (D5, diseño 8).
 *
 * Portado el 13-oct-2026 de fei-plataforma/scripts/verificar-lenguaje.mjs, el
 * candado de doctrina de la Fundación, con las reglas que aplican a un texto
 * noticioso:
 *   2 · el Convenio 169 obliga al Estado: se bloquea solo cuando el cumplimiento
 *       se atribuye a una empresa. En una nota regional, «el Estado debe cumplir
 *       el Convenio 169» es correcto y no se bloquea (adaptación declarada).
 *   3 · afiliación a la GSDA no aprobada.
 *   4 · vocabulario DEI.
 *   6 · respaldo institucional de la Fundación inflado.
 * Las reglas 1 (la agencia es de los pueblos) y 5 (sin marcos de competencia
 * entre organizaciones indígenas) no tienen verificación determinista para este
 * texto: van en el prompt y quedan sin candado, declarado en el diseño.
 *
 * Además, el motivo de admisión no puede nombrar personas (regla del dato
 * sensible: el juicio describe la nota, nunca a alguien).
 */

interface Regla {
  id: string
  patron: RegExp
}

const REGLAS: Regla[] = [
  { id: 'dei-diversidad-de-proveedores', patron: /\bdiversidad\s+de\s+proveedor(?:es)?\b/iu },
  { id: 'dei-compras-inclusivas', patron: /\bcompras?\s+inclusivas?\b/iu },
  { id: 'dei-proveedores-inclusivos', patron: /\bproveedor(?:es)?\s+inclusivos?\b/iu },
  { id: 'dei-gasto-diverso', patron: /\bgasto\s+divers[oa]s?\b/iu },
  { id: 'dei-supplier-diversity', patron: /(?<!Global\s)\bsupplier\s+diversity\b(?!\s+Alliance)/iu },
  { id: 'dei-sigla', patron: /\bDEI\b/u },
  { id: 'dei-minorias', patron: /\bminor(?:ía|ias|ías)\b/iu },
  {
    id: '169-empresa',
    patron:
      /\b(?:empresa|compañía|minera|forestal|salmonera|eléctrica|inmobiliaria)\b[^.]{0,80}\bcumpl\w*\s+(?:(?:con\s+)?(?:de[lr]?|el|la|los)\s+)?(?:Convenio\s+)?169\b|\bcumpl\w*\s+(?:(?:con\s+)?(?:de[lr]?|el|la|los)\s+)?(?:Convenio\s+)?169\b[^.]{0,80}\b(?:empresa|compañía|minera|forestal|salmonera)\b/iu,
  },
  {
    id: 'gsda-afiliacion-no-aprobada',
    patron:
      /\bassociate\s+member\b|\bmiembros?(?:\s+(?:asociad|plen|afiliad)[oa]s?)?\s+de\s+la\s+(?:GSDA|Global\s+Supplier\s+Diversity\s+Alliance)\b|\bmember\s+of\s+the\s+(?:GSDA|Global\s+Supplier\s+Diversity\s+Alliance)\b/iu,
  },
  {
    id: 'respaldo-de-la-fundacion',
    patron: /(?:la\s+)?Fundaci[óo]n\s+Empresas\s+Ind[íi]genas[^.;]{0,70}\b(?:miembro|integrante|afiliad[ao]|socio\s+estrat[ée]gico|forma\s+parte)\b/iu,
  },
]

/** Ids de las reglas de lenguaje que el texto infringe; vacío si pasa. */
export function infraccionesDeLenguaje(texto: string | null | undefined): string[] {
  if (!texto) return []
  return REGLAS.filter((r) => r.patron.test(texto)).map((r) => r.id)
}

/**
 * Palabras con mayúscula inicial que no son nombres de persona aunque vayan
 * juntas: lugares e instituciones que el motivo de admisión nombra con razón.
 */
const NO_PERSONAS = new Set([
  'la', 'el', 'los', 'las', 'de', 'del', 'en', 'y', 'región', 'araucanía', 'temuco', 'padre', 'casas', 'nueva', 'imperial',
  'gobierno', 'regional', 'municipalidad', 'municipio', 'ministerio', 'seremi', 'servicio', 'salud', 'universidad',
  'frontera', 'conaf', 'indap', 'conadi', 'corte', 'suprema', 'apelaciones', 'banco', 'central', 'estado', 'chile',
  'malleco', 'cautín', 'puerto', 'teodoro', 'schmidt', 'los', 'sauces', 'plan', 'despega', 'congreso', 'senado',
])

/**
 * Verdadero si el motivo parece nombrar a una persona: dos palabras seguidas con
 * mayúscula inicial que no son lugares ni instituciones conocidas. Es un
 * candado grueso a propósito: ante la duda, el motivo se descarta y se guarda
 * uno genérico; nunca un nombre.
 */
export function pareceNombrarPersona(texto: string | null | undefined): boolean {
  if (!texto) return false
  const palabras = texto.split(/[\s,;:()«»"“”]+/).filter(Boolean)
  for (let i = 0; i + 1 < palabras.length; i++) {
    const a = palabras[i]
    const b = palabras[i + 1]
    const mayA = /^\p{Lu}\p{Ll}+$/u.test(a)
    const mayB = /^\p{Lu}\p{Ll}+$/u.test(b)
    if (mayA && mayB && !NO_PERSONAS.has(a.toLowerCase()) && !NO_PERSONAS.has(b.toLowerCase())) {
      // La primera palabra de la oración no cuenta como nombre por sí sola.
      if (i === 0 && NO_PERSONAS.has(b.toLowerCase())) continue
      return true
    }
  }
  return false
}

export const MOTIVO_GENERICO = 'motivo omitido: nombraba a una persona'
