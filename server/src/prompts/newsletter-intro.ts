import { escapeXml } from './shared.js'

export interface StoryForNewsletterIntro {
  title: string
  issueName: string
  blurb: string
  emotionTag: string
}

const INTRO_STYLES = [
  'Abre con una imagen vívida y concreta de una noticia, luego amplía su significado más amplio.',
  'Traza una conexión inesperada entre dos noticias de categorías distintas.',
  'Comienza con un dato o estadística sorprendente de las noticias, y reencuádralo como motivo de optimismo mesurado.',
  'Usa una analogía o metáfora breve para capturar el hilo que recorre esta edición.',
  'Destaca una tensión o paradoja entre dos desarrollos, y obsérvala con honestidad.',
]

export function pickIntroStyle(): string {
  return INTRO_STYLES[Math.floor(Math.random() * INTRO_STYLES.length)]
}

export function buildNewsletterIntroPrompt(
  stories: StoryForNewsletterIntro[],
  issueNames: string[],
  style?: string,
): string {
  const chosenStyle = style ?? pickIntroStyle()

  let query = `<ROLE>
Eres la voz editorial de "Impacto Indígena," un newsletter que cura las noticias más importantes para pueblos indígenas.
</ROLE>

<LANGUAGE>
Escribe SIEMPRE en español. Nunca uses inglés.
</LANGUAGE>

<GOAL>
Escribe una apertura editorial de 2-3 oraciones que conecte creativamente uno o dos desarrollos positivos de las noticias. No te limites a listar titulares ni mencionar títulos de historias — destila el fondo de las buenas noticias y teje una sola reflexión u observación.
</GOAL>

<STYLE>
${chosenStyle}
</STYLE>

<GUIDELINES>
- Inspírate en historias etiquetadas como "uplifting" o "calm", pero nunca repitas sus titulares o títulos textualmente.
- Conecta los desarrollos positivos con una observación, una reflexión, o un contraste sutil — no una lista ("X pasó, y también Y").
- Ancla la apertura en un detalle concreto de las noticias — un lugar, un número, una imagen — pero sin resumir ninguna historia. El detalle es una puerta, no una sinopsis.
- El tono puede ir de esperanzador y sereno a levemente irónico o francamente asombrado. Ajusta el tono a la historia más potente, no a una calidez por defecto. Sé genuino, sin hipérbole ni sensacionalismo.
- No uses frases como "esta semana" o "en esta edición" — el contexto es obvio.
- No te dirijas al lector directamente con "tú" ni "estimado lector".
- Solo texto plano — sin markdown, sin viñetas, sin encabezados.
- No uses guiones largos (em dashes). Usa comas, puntos o punto y coma.
- Máximo 60 palabras.
</GUIDELINES>

<ISSUE_CATEGORIES>
${issueNames.map(n => `- ${n}`).join('\n')}
</ISSUE_CATEGORIES>

<STORIES>
`

  for (const story of stories) {
    query += `<STORY>\n`
      + `<ISSUE>${escapeXml(story.issueName)}</ISSUE>\n`
      + `<EMOTION>${escapeXml(story.emotionTag)}</EMOTION>\n`
      + `<TITLE>${escapeXml(story.title)}</TITLE>\n`
      + `<BLURB>${escapeXml(story.blurb)}</BLURB>\n`
      + `</STORY>\n`
  }

  query += `</STORIES>`

  return query
}
