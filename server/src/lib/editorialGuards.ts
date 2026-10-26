/**
 * Candados de la editorial firmada: lo que el texto no puede decir aunque el
 * modelo (o quien lo edite) lo escriba.
 *
 * POR QUÉ EN CÓDIGO. Son reglas binarias y una instrucción al modelo es blanda
 * (`.context/llm-analysis.md`). El prompt (`prompts/editorial.ts`) las pide; estas
 * funciones las hacen cumplir en los dos puntos por donde sale la editorial:
 * al generar (avisos para el editor) y al publicar (los bloqueantes la frenan).
 *
 * LAS REGLAS.
 * 1. agencia · la primera frase no abre con el medio, la Fundación ni «nosotros»
 *    (regla 1 de lenguaje de la casa; mismo molde que `storyBodyGuards.ts`).
 * 2. conflicto · nunca «conflicto mapuche» (es el conflicto en La Araucanía o el
 *    conflicto chileno-mapuche; el Estado es parte, no espectador).
 * 3. ia · la editorial no habla de la IA ni de cómo se escribió: el método se
 *    declara en un recuadro aparte, desde `method`.
 * 4. firma · el nombre del autor no va dentro del texto: va en `authorName`.
 * 5. cifra · toda cifra del texto está en las notas del director (informativo:
 *    el autor puede haberla agregado a mano al editar).
 */

import { abreConElMedio } from './storyBodyGuards.js'
import { cifrasSinRespaldo, normalizar } from './storyCarouselGuards.js'

export type EditorialAvisoTipo = 'agencia' | 'conflicto' | 'ia' | 'firma' | 'cifra'

export interface EditorialAviso {
  tipo: EditorialAvisoTipo
  mensaje: string
}

const CONFLICTO_MAPUCHE = /conflicto mapuche/
const HABLA_DE_IA = /(^|[^a-z])(inteligencia artificial|modelo de lenguaje|chatgpt|un modelo|la ia|con ia|por ia)($|[^a-z])/

/** Lo que bloquea la publicación; `cifra` solo avisa. */
export const BLOQUEANTES: ReadonlySet<EditorialAvisoTipo> = new Set(['agencia', 'conflicto', 'ia', 'firma'])

function primeraFrase(texto: string): string {
  return texto.trim().split(/(?<=[.!?…])\s+/)[0] ?? ''
}

export function revisarEditorial(
  content: string,
  opciones: { notes?: string; authorName?: string } = {},
): EditorialAviso[] {
  const avisos: EditorialAviso[] = []
  const texto = content.trim()
  if (!texto) return avisos
  const t = normalizar(texto)

  if (abreConElMedio(primeraFrase(texto))) {
    avisos.push({
      tipo: 'agencia',
      mensaje: 'La primera frase abre con el medio de sujeto. El sujeto de la primera frase son los pueblos, las personas o los hechos.',
    })
  }
  if (CONFLICTO_MAPUCHE.test(t)) {
    avisos.push({
      tipo: 'conflicto',
      mensaje: 'Dice «conflicto mapuche». Es el conflicto en La Araucanía o el conflicto chileno-mapuche: el Estado es parte.',
    })
  }
  if (HABLA_DE_IA.test(t)) {
    avisos.push({
      tipo: 'ia',
      mensaje: 'El texto habla de la IA o de cómo se escribió. El método se declara aparte, en el recuadro; el texto no.',
    })
  }
  const autor = (opciones.authorName ?? '').trim()
  if (autor && t.includes(normalizar(autor))) {
    avisos.push({
      tipo: 'firma',
      mensaje: `El texto incluye el nombre del autor («${autor}»). La firma va aparte, no dentro de la editorial.`,
    })
  }
  if (opciones.notes) {
    for (const cifra of cifrasSinRespaldo(texto, opciones.notes)) {
      avisos.push({
        tipo: 'cifra',
        mensaje: `La cifra «${cifra}» no está en las notas. Si la agregaste a mano, confírmala; si la puso el modelo, quítala.`,
      })
    }
  }
  return avisos
}

export function avisosQueBloquean(avisos: EditorialAviso[]): EditorialAviso[] {
  return avisos.filter((a) => BLOQUEANTES.has(a.tipo))
}
