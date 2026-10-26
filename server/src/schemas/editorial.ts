import { z } from 'zod'

/** Cómo se hizo la editorial. '' mientras el autor no lo fije; sin él no se publica. */
export const EDITORIAL_METHODS = ['humana', 'ia_revisada'] as const
export type EditorialMethod = (typeof EDITORIAL_METHODS)[number]

export const createEditorialSchema = z.object({
  title: z.string().min(1, 'Title is required'),
})

export const updateEditorialSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  status: z.enum(['draft', 'published']).optional(),
  publishedAt: z.string().datetime().optional(),
  // B5 (25-oct-2026): las notas del director, la firma, el método y las fuentes.
  notes: z.string().max(20000).optional(),
  authorName: z.string().max(120).optional(),
  method: z.enum(['', ...EDITORIAL_METHODS]).optional(),
  sources: z.string().max(10000).optional(),
})

export const editorialQuerySchema = z.object({
  status: z.enum(['draft', 'published']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
})
