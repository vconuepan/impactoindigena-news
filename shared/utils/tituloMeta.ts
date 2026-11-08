// El título y la descripción que una noticia muestra FUERA de su página: la
// pestaña del navegador, el resultado de Google y la tarjeta que arma una red
// social al compartir el enlace.
//
// LO QUE CORRIGE (medido en vivo el 8-nov-2026). La etiqueta del titular viene
// en minúscula —23 de 25 notas publicadas: «artesanía indígena»—, porque en la
// página es un antetítulo que se pinta en versalitas. Pegada delante del
// titular, abría el título de pestaña y de tarjeta en minúscula: «artesanía
// indígena: Ley 21.788 impulsa…». Y la descripción se cortaba a los 200
// caracteres exactos, a mitad de palabra: «…estas trad».
//
// La etiqueta sigue delante del titular a propósito: el plan que la separó del
// titular (`.plans/completed/2026-02-02_headline-label-split.md`) dejó los
// metadatos con el título completo.
//
// GEMELOS: server/src/lib/tituloMeta.ts y shared/utils/tituloMeta.ts son la
// misma función. El servidor no puede importar fuera de su `rootDir` (src) sin
// romper la estructura de dist/ con la que despliega, igual que publisher.ts.
// `tituloMeta.test.ts` del servidor falla si las dos copias divergen.

// --- código gemelo: idéntico en las dos copias desde esta línea ---

/** «Etiqueta: titular», con la etiqueta en mayúscula inicial. Sin etiqueta, el titular solo. */
export function tituloConEtiqueta(etiqueta: string | null | undefined, titular: string): string {
  const e = etiqueta?.trim()
  if (!e) return titular
  return `${e.charAt(0).toLocaleUpperCase('es')}${e.slice(1)}: ${titular}`
}

/**
 * Recorta en el último espacio antes de `max` y cierra con «…». Si no hay un
 * espacio razonablemente cerca (una sola palabra larguísima), corta en `max`.
 * El resultado nunca supera `max` caracteres, contando el «…».
 */
export function recortarEnPalabra(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const corte = t.slice(0, max - 1)
  const espacio = corte.lastIndexOf(' ')
  const base = espacio >= max * 0.6 ? corte.slice(0, espacio) : corte
  return `${base.replace(/[\s,;:.\-–—]+$/, '')}…`
}
