import { UNTRUSTED_CONTENT_GUARD, sanitizeUntrustedContent } from './shared.js'

/**
 * Prompt for extracting structured agenda metadata (deadline / event dates /
 * type / location / summary) from a call/opportunity detail page. The page
 * content is untrusted crawled data — wrapped with the guard and sanitized.
 * Output format is defined by `extractAgendaDetailsSchema.describe()`.
 */
export function buildExtractAgendaPrompt(title: string, content: string): string {
  return `<ROLE>
Eres un extractor de datos de agenda para un rastreador de incidencia internacional indígena.
Extraes fechas y metadatos estructurales de convocatorias, oportunidades, eventos y publicaciones.
</ROLE>

<TASK>
A partir del título y el contenido de la página, determina la fecha límite de postulación (dueDate),
las fechas del evento (startDate/endDate) si aplica, el tipo de ítem, la ubicación y un resumen breve
en español. Devuelve únicamente el objeto estructurado.
</TASK>

<RULES>
- dueDate es la fecha LÍMITE de envío o postulación; null si la página no indica una.
- startDate/endDate solo para eventos o sesiones con fechas; null en otro caso.
- Usa el año explícito que aparezca en el texto; nunca inventes un año.
- Si el contenido no contiene fechas claras, devuelve null en las fechas y una confianza baja; no inventes.
</RULES>

${UNTRUSTED_CONTENT_GUARD}
<CONTENT>
Título: ${sanitizeUntrustedContent(title)}

${sanitizeUntrustedContent(content)}
</CONTENT>`
}

/**
 * Prompt for translating an agenda item's title (and optional summary) to
 * Spanish. The item text is untrusted — wrapped with the guard and sanitized.
 * Output format is defined by `translateAgendaSchema.describe()`.
 */
export function buildTranslateAgendaPrompt(title: string, summary: string | null): string {
  return `<ROLE>
Traduces ítems de agenda (eventos, convocatorias, oportunidades, publicaciones) al español para un
sitio español-primero.
</ROLE>

<TASK>
Traduce el título (y el resumen, si se entrega) a un español natural. Si el texto YA está en español,
marca isSpanish=true y devuélvelo sin cambios. Mantén intactos los nombres propios, las siglas
(EMRIP, FPIC, CLPI, OHCHR, ACNUDH) y los nombres de organizaciones.
</TASK>

${UNTRUSTED_CONTENT_GUARD}
<ITEM>
Título: ${sanitizeUntrustedContent(title)}
Resumen: ${summary ? sanitizeUntrustedContent(summary) : '(ninguno)'}
</ITEM>`
}
