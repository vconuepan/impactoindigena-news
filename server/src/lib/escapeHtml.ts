/**
 * Codifica un valor para insertarlo en HTML, tanto en contenido como dentro de un
 * atributo entre comillas.
 *
 * POR QUE EXISTE. Las plantillas de correo se arman con cadenas, y varias metian
 * valores que no son nuestros sin codificarlos: los temas de las alertas los
 * escribe quien llama al formulario publico, y el titulo, el resumen y la fuente
 * de una nota salen de la pagina de un tercero. Un correo con ese marcado crudo
 * sale desde el remitente de la Fundacion: un cliente de correo no ejecuta
 * scripts, pero si pinta enlaces e imagenes, que es suplantacion con remitente
 * confiable. El sitio no tiene el problema porque React codifica; los correos,
 * si.
 *
 * Cubre las cinco: `&`, `<`, `>`, `"` y `'`. La comilla simple importa porque
 * hay atributos escritos con ella. `null` y `undefined` dan cadena vacia.
 *
 * Regla de uso: se aplica en el punto donde el valor entra a la plantilla, no
 * antes. Codificar al guardar mezcla datos con presentacion, y codificar dos
 * veces deja `&amp;amp;` a la vista.
 */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
