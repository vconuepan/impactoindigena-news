import { normalizar } from './storyCarouselGuards.js'

/**
 * Quién firma lo que el carrusel cuenta · B4 del TODOS de fei-plataforma, 19-11-2026.
 *
 * Hasta este día toda lámina y todo pie decían «Reporteó: <medio>». Cuando el artículo es
 * un comunicado o una declaración pública de una organización, eso le atribuye al medio un
 * reporteo que no hizo, y a la organización le quita la autoría de lo que afirma. Ahora la
 * firma dice «Comunicado de <organización>», y el medio va al lado solo si es otro: si la
 * organización lo publicó en su propio sitio, nombrarla dos veces no agrega nada.
 *
 * Qué es un comunicado lo dice el modelo (`comunicadoDe` en `schemas/llm.ts`), pero el
 * nombre solo se acepta si aparece en el artículo (`emisorRespaldado`): el modelo no puede
 * inventar un emisor.
 */
export interface FirmaInput {
  medio: string
  fecha?: string | null
  comunicadoDe?: string | null
}

export function firmaDelOriginal(a: FirmaInput, conFecha = true): string {
  const fecha = conFecha && a.fecha ? ` · ${a.fecha}` : ''
  if (a.comunicadoDe) {
    const mismo = normalizar(a.medio) === normalizar(a.comunicadoDe)
    return `Comunicado de ${a.comunicadoDe}${mismo ? '' : ` · ${a.medio}`}${fecha}`
  }
  return `Reporteó: ${a.medio}${fecha}`
}

/**
 * El emisor del comunicado, solo si su nombre está en el artículo. Si no está, o es
 * demasiado corto o largo para ser un nombre, se descarta y el carrusel firma como siempre.
 */
export function emisorRespaldado(emisor: string | null | undefined, original: string): string | null {
  const limpio = (emisor ?? '').replace(/\s+/g, ' ').trim()
  if (limpio.length < 3 || limpio.length > 120) return null
  return normalizar(original).includes(normalizar(limpio)) ? limpio : null
}
