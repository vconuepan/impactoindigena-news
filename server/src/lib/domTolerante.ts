import { JSDOM } from 'jsdom'

/**
 * Arma el documento para Readability aunque la pagina traiga CSS que jsdom no
 * entiende.
 *
 * jsdom 27 lanza AL CONSTRUIR el documento (no al leerlo) cuando una hoja de
 * estilo trae un valor que su analizador de CSS (css-tree) no acepta. Medido el
 * 19-nov-2026 (B24): elinformadordigital.cl lleva `height:calc(~100% + 1px)`,
 * sintaxis de LESS que quedo en su CSS publicado, y `new JSDOM` lanza
 * `")" is expected`. El extractor lo atrapaba y devolvia null, asi que el diario
 * perdia 10 de 10 notas en cada rastreo.
 *
 * El reintento quita los bloques `<style>`. Readability no los usa: para decidir
 * que es visible mira el atributo `style` en linea, `hidden` y `aria-hidden`, y
 * jsdom no carga hojas externas. El camino normal no cambia: solo se reintenta
 * cuando el primer intento lanza.
 */
export function sinHojasDeEstilo(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
}

export function crearDomTolerante(html: string, url: string): { dom: JSDOM; sinEstilos: boolean } {
  try {
    return { dom: new JSDOM(html, { url }), sinEstilos: false }
  } catch {
    return { dom: new JSDOM(sinHojasDeEstilo(html), { url }), sinEstilos: true }
  }
}
