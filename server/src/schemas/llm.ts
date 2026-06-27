import { z } from "zod";
import { EMOTION_TAG_SCHEMA_DESCRIPTION, NARRATIVE_FRAME_SCHEMA_DESCRIPTION } from "../prompts/shared.js";

const EMOTION_TAG_SCHEMA = z
  .enum(["uplifting", "frustrating", "scary", "calm"])
  .describe(EMOTION_TAG_SCHEMA_DESCRIPTION);

const NARRATIVE_FRAME_SCHEMA = z
  .enum(["confrontacion", "resiliencia", "protagonismo", "alianza"])
  .describe(NARRATIVE_FRAME_SCHEMA_DESCRIPTION);

export const preAssessItemSchema = z.object({
  articleId: z
    .string()
    .describe("The article ID exactly as provided in the input"),
  issueSlug: z
    .string()
    .describe("The slug of the most relevant issue from the <ISSUES> list"),
  rating: z
    .number()
    .int()
    .min(0)
    .max(10)
    .describe(
      "Calibrated relevance rating 1-10 per the <RATING GUIDELINES>, using the full scale. Minimum value is 1 — never use 0."
    ),
  emotionTag: EMOTION_TAG_SCHEMA,
  narrativeFrame: NARRATIVE_FRAME_SCHEMA,
});

export const preAssessResultSchema = z.object({
  articles: z
    .array(preAssessItemSchema)
    .describe("One entry per article in the input batch"),
});

export const assessResultSchema = z.object({
  publicationDate: z
    .string()
    .describe(
      "Publication date in YYYY-MM-DD 00:00:00 format, or 1970-01-01 00:00:00 if unknown"
    ),
  quote: z
    .string()
    .describe(
      "Cita clave del artículo, traducida al español si es necesario. " +
        "Máximo ~40 palabras (300 caracteres): elige la oración más potente. " +
        "Sin nombre del hablante ni de la publicación — la atribución es un campo separado. " +
        "Sin comillas al inicio o al final — la interfaz las agrega. " +
        "Usa comillas simples (' ') para cualquier cita anidada dentro del texto."
    ),
  quoteAttribution: z
    .string()
    .describe(
      "Atribución de la cita clave. Si se cita a una persona, usa su nombre completo y cargo/rol " +
        "(ej. 'María Helena Semedo, Directora General Adjunta de la FAO'). Si se cita a una organización o publicación, " +
        "usa el nombre de la organización (ej. 'Organización Mundial de la Salud'). Si la cita es una oración " +
        "llamativa del artículo y no una cita directa de una persona, usa 'Artículo original'."
    ),
  summary: z
    .string()
    .describe(
      "Resumen en texto plano del artículo, 40-70 palabras, en español. " +
        "Usa lenguaje sencillo que una audiencia general pueda entender. " +
        "Evita redundancia con el título."
    ),
  factors: z
    .array(z.string())
    .describe(
      "4 viñetas Markdown que explican por qué el artículo es relevante para los pueblos indígenas, en español. " +
        "Usa lenguaje claro y concreto — explica los mecanismos en términos cotidianos. " +
        'Cada viñeta: "- **[Nombre del factor según el contexto del artículo]:** [evaluación en 1-2 oraciones]." ' +
        "Límite estricto: máximo ~30 palabras por viñeta (incluida la etiqueta en negrita). " +
        "Cada viñeta debe ser breve y autocontenida para caber en pocas líneas sin cortarse. " +
        "Ordena por importancia, con el factor clave primero."
    ),
  limitingFactors: z
    .array(z.string())
    .describe(
      "Viñetas Markdown sobre por qué el artículo podría no ser tan relevante, en español. " +
        "Usa lenguaje claro y específico que cualquiera pueda entender. " +
        'Cada viñeta: "- **[Factor limitante]:** [1 oración: evaluación.] ' +
        '[solo para la primera viñeta: 1 oración adicional, ej. contexto o detalle adicional.]" ' +
        "Incluye factores limitantes genéricos aplicables (artículo de opinión, clickbait, tecnología en etapa temprana, etc.) " +
        "y factores limitantes específicos del tema. Ordena por importancia."
    ),
  relevanceCalculation: z
    .array(z.string())
    .describe(
      "Viñetas Markdown que muestran los pasos del cálculo de calificación, en español. " +
        'Formato: "- **[Factor clave]:** [calificación base 1-10]", ' +
        '"- **[Factor que eleva o limita]:** [modificador, puede sumar o restar]", ' +
        '"- **[Otros factores combinados]:** [modificador, puede sumar o restar]".'
    ),
  relevanceRating: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe(
      "Calificación de relevancia 1-10 calibrada según la <ESCALA_DE_RELEVANCIA>, derivada del cálculo de relevancia. " +
        "Usa todo el rango: reserva 7-8 para alto impacto y 9-10 para casos excepcionales/históricos."
    ),
  relevanceSummary: z
    .string()
    .describe(
      "Resumen de 20-25 palabras del análisis de relevancia, en español. " +
        'No menciones "el artículo"; enfócate en el tema en sí. ' +
        "Lenguaje sencillo, sin jerga. Incluye números concretos cuando estén disponibles."
    ),
  titleLabel: z
    .string()
    .describe(
      "Etiqueta de tema ultrabreve (1-3 palabras cortas), en español, en minúsculas excepto nombres propios. " +
        "Una frase nominal corta — sin conjunciones, sin 'y'. Palabras simples y cortas. " +
        "La etiqueta y el título funcionan como par: la etiqueta establece el tema, el título cuenta la historia. " +
        "Ninguna palabra o frase debe aparecer en ambos. " +
        "Bien: 'derechos territoriales', 'acuerdo CLPI', 'minería mapuche'. " +
        "Mal: 'derechos territoriales y consulta indígena' (demasiado largo)."
    ),
  relevanceTitle: z
    .string()
    .describe(
      "Titular independiente en español, máximo 10 palabras, en minúsculas excepto nombres propios. " +
        "Escribe para un joven de 16 años inteligente — sin jerga ni términos especializados. " +
        "Debe entenderse sin contexto previo. " +
        "Una historia por titular. No repitas la etiqueta — usa ese espacio para decir algo nuevo. " +
        "Ninguna palabra o frase debe aparecer tanto en la etiqueta como en el título. " +
        "Sé concreto: nombra al actor, la acción o las consecuencias. Elimina frases vagas como 'podría afectar'. " +
        "NUNCA uses el patrón 'Etiqueta: titular' con dos puntos — la etiqueta es un campo separado."
    ),
  marketingBlurb: z
    .string()
    .describe(
      "Texto plano en español, hasta 230 caracteres, que resume el punto clave del artículo original y el análisis de relevancia."
    ),
});

export const selectResultSchema = z.object({
  selectedIds: z
    .array(z.string())
    .describe(
      "IDs of the selected articles. Must contain exactly the number of articles requested."
    ),
});

export const newsletterSelectResultSchema = z.object({
  selectedIds: z
    .array(z.string())
    .describe(
      "IDs of the selected articles. Must contain exactly the number of articles requested."
    ),
});

export const newsletterIntroSchema = z.object({
  intro: z
    .string()
    .describe(
      "A 2-3 sentence editorial introduction for the newsletter edition. " +
        "Warm and conversational tone. Plain text only, under 60 words."
    ),
});

export const podcastScriptSchema = z.object({
  script: z
    .string()
    .describe("Full podcast script text ready for text-to-speech"),
});

export const reclassifyItemSchema = z.object({
  articleId: z
    .string()
    .describe("The article ID exactly as provided in the input"),
  issueSlug: z
    .string()
    .describe("The slug of the most relevant issue from the <ISSUES> list"),
  emotionTag: EMOTION_TAG_SCHEMA,
  narrativeFrame: NARRATIVE_FRAME_SCHEMA,
});

export const reclassifyResultSchema = z.object({
  articles: z
    .array(reclassifyItemSchema)
    .describe("One entry per article in the input batch"),
});

export const extractTitleLabelSchema = z.object({
  titleLabel: z
    .string()
    .describe(
      "Etiqueta de tema ultrabreve en español (1-3 palabras cortas), en minúsculas excepto nombres propios. " +
        "Una frase nominal corta — sin conjunciones, sin 'y'. Palabras simples y cortas. " +
        "La etiqueta y el título funcionan como par: la etiqueta establece el tema, el título cuenta la historia. " +
        "Ninguna palabra o frase debe aparecer en ambos. " +
        "Bien: 'derechos territoriales', 'acuerdo CLPI', 'minería mapuche', 'riesgo nuclear', 'salud oceánica'. " +
        "Mal: 'derechos territoriales y consulta indígena' (demasiado largo)."
    ),
  title: z
    .string()
    .describe(
      "Titular independiente en español, máximo 10 palabras, en minúsculas excepto nombres propios. " +
        "Escribe para un joven de 16 años inteligente — sin jerga ni términos especializados. " +
        "Debe entenderse sin contexto previo. " +
        "Una historia por titular. No repitas la etiqueta — usa ese espacio para decir algo nuevo. " +
        "Ninguna palabra o frase debe aparecer tanto en la etiqueta como en el título. " +
        "Sé concreto: nombra al actor, la acción o las consecuencias. Elimina frases vagas como 'podría afectar'. " +
        "NUNCA uses el patrón 'Etiqueta: titular' con dos puntos — la etiqueta es un campo separado."
    ),
});

export const extractQuoteAttributionSchema = z.object({
  quote: z
    .string()
    .describe(
      "La cita clave, limpia y en español. Elimina el nombre del hablante o publicación embebido, las comillas circundantes y la puntuación sobrante. Reemplaza cualquier comilla doble interior con comillas simples (' ')."
    ),
  quoteAttribution: z
    .string()
    .describe(
      "Atribución de la cita clave. Si se cita a una persona, usa su nombre completo y cargo/rol " +
        "(ej. 'María Helena Semedo, Directora General Adjunta de la FAO'). Si se cita a una organización o publicación, " +
        "usa el nombre de la organización (ej. 'Organización Mundial de la Salud'). Si la cita es una oración " +
        "llamativa del artículo y no una cita directa de una persona, usa 'Artículo original'."
    ),
});

export type ExtractQuoteAttribution = z.infer<
  typeof extractQuoteAttributionSchema
>;
export const extractRelevanceSummarySchema = z.object({
  relevanceSummary: z
    .string()
    .describe(
      "Resumen de 20-25 palabras del análisis de relevancia, en español. " +
        'No menciones "el artículo"; enfócate en el tema en sí. ' +
        "Lenguaje sencillo, sin jerga. Incluye números concretos cuando estén disponibles."
    ),
});
export type ExtractRelevanceSummary = z.infer<
  typeof extractRelevanceSummarySchema
>;
export const relatedStoriesResultSchema = z.object({
  selectedIds: z
    .array(z.string())
    .describe(
      "IDs of the most related candidates, in order of relatedness. Must contain exactly the number of articles requested."
    ),
});

export type RelatedStoriesResult = z.infer<typeof relatedStoriesResultSchema>;

export const dedupConfirmationSchema = z.object({
  assessments: z.array(z.object({
    candidateNumber: z.number().int().describe("The candidate number from the input list"),
    isDuplicate: z.boolean().describe("True ONLY if this candidate reports on the exact same specific event as the source. False if they merely share the same topic, conflict, or field."),
    reason: z.string().describe("Brief explanation identifying the specific event in each article and why they are or are not the same event"),
  })).describe("One entry per candidate in the input list"),
});

export type DedupConfirmation = z.infer<typeof dedupConfirmationSchema>;
export type ExtractTitleLabel = z.infer<typeof extractTitleLabelSchema>;
export type PreAssessResult = z.infer<typeof preAssessResultSchema>;
export type AssessResult = z.infer<typeof assessResultSchema>;
export type SelectResult = z.infer<typeof selectResultSchema>;
export type ReclassifyResult = z.infer<typeof reclassifyResultSchema>;
export type NewsletterSelectResult = z.infer<
  typeof newsletterSelectResultSchema
>;
export type NewsletterIntro = z.infer<typeof newsletterIntroSchema>;
export type PodcastScript = z.infer<typeof podcastScriptSchema>;

export const editorialSchema = z.object({
  title: z.string().describe('Título de la editorial, máximo 12 palabras, sin punto final'),
  content: z.string().describe('Cuerpo de la editorial: 5 párrafos (~444 palabras) separados por líneas en blanco, más la firma al final. Sin markdown.'),
})

export type EditorialResult = z.infer<typeof editorialSchema>;
