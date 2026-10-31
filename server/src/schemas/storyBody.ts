import { z } from 'zod'

/** Lo que el panel puede cambiar del cuerpo de una nota (B2, 25-oct-2026). */
export const updateStoryBodySchema = z
  .object({
    bajada: z.string().max(1000).optional(),
    quePaso: z.string().max(3000).optional(),
    porQueImporta: z.string().max(3000).optional(),
    contexto: z.string().max(3000).optional(),
    queSigue: z.string().max(2000).optional(),
    method: z.enum(['ia_sin_revision', 'ia_revisada', 'humana']).optional(),
    reviewedBy: z.string().max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que cambiar' })
