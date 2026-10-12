/**
 * Línea fija que cierra cada publicación automática en redes (Facebook,
 * Instagram, LinkedIn) y declara el uso de IA. El sitio etiqueta sus resúmenes
 * como generados por IA, y las redes dicen lo mismo.
 *
 * Va en código, en el punto de publicación, y no en el prompt: es una regla
 * binaria y una instrucción al modelo es blanda. Hasta el 12-oct-2026 los tres
 * prompts ordenaban lo contrario («Nunca mencionar que fue generado por IA»).
 * Al agregarse al publicar, una edición del borrador en el panel no la borra.
 */
export const AI_LABEL = 'Texto elaborado con apoyo de IA a partir de la noticia original.'

const SEPARADOR = '\n\n'

/**
 * Agrega la línea al final, sin duplicarla. Si la red tiene un tope de
 * caracteres, recorta el cuerpo para que la línea quepa entera: la declaración
 * nunca es lo que se corta.
 */
export function withAiLabel(text: string, maxLength = Infinity): string {
  const cuerpo = text.trimEnd()
  if (cuerpo.endsWith(AI_LABEL)) return cuerpo
  const espacio = maxLength - AI_LABEL.length - SEPARADOR.length
  const ajustado = cuerpo.length > espacio ? cuerpo.slice(0, espacio - 1).trimEnd() + '…' : cuerpo
  return `${ajustado}${SEPARADOR}${AI_LABEL}`
}
