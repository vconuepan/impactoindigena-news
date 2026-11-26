/**
 * La fecha del artículo original, en español de Chile: «21 de octubre de 2026».
 * La usan la firma del carrusel de una noticia (services/storyCarousel.ts), el
 * carrusel del boletín (services/carousel.ts) y el cuerpo de la nota
 * (services/storyBody.ts).
 */

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago',
})
const FORMATO_FECHA_UTC = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
})

/**
 * La fecha del original, como la dice la firma. Una fecha sin hora (la que
 * devuelve el análisis, «2026-10-21 00:00:00», o un feed que solo da el día)
 * queda guardada a medianoche UTC, y dibujada en hora de Chile caía en el día
 * anterior: el 26-oct-2026 el carrusel de Belo Sun firmó «20 de octubre» sobre
 * un comunicado del 21. Esa medianoche es un día del calendario, no una hora,
 * así que se lee en UTC; una fecha con hora se lee en hora de Chile.
 */
function esDiaSinHora(fecha: Date): boolean {
  return fecha.getUTCHours() === 0 && fecha.getUTCMinutes() === 0
    && fecha.getUTCSeconds() === 0 && fecha.getUTCMilliseconds() === 0
}

export function fechaDelOriginal(fecha: Date): string {
  return (esDiaSinHora(fecha) ? FORMATO_FECHA_UTC : FORMATO_FECHA).format(fecha)
}

const ANIO = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/Santiago' })
const ANIO_UTC = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'UTC' })

/**
 * El año de esa misma fecha, con la misma regla. `getFullYear()` lee la hora
 * del servidor: un original del 1 de enero guardado a medianoche UTC sería, en
 * una máquina en hora de Chile, del año anterior.
 */
export function anioDelOriginal(fecha: Date): number {
  return Number((esDiaSinHora(fecha) ? ANIO_UTC : ANIO).format(fecha))
}
