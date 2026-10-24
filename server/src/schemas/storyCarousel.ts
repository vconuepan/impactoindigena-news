import { z } from 'zod'

const laminaSchema = z.object({
  titulo: z.string().max(300),
  texto: z.string().max(1200),
})

export const draftStoryCarouselBodySchema = z.object({
  conLectura: z.boolean().default(false),
})

// Lo que el editor aprobó en el panel. Portada y cierre son obligatorios; el
// tope deja margen sobre las ocho láminas que pide el formato.
export const renderStoryCarouselBodySchema = z.object({
  laminas: z.array(laminaSchema).min(2).max(12),
  lectura: laminaSchema.nullable().default(null),
})
