import { z } from 'zod'

/** Decisiones del editor de verticales (D4, Tanda B). */
export const reviewDecisionEnum = z.enum(['release', 'hold', 'reopen'])
export const reviewCodeEnum = z.enum(['sensitive', 'out_of_scope'])
export const reviewStateEnum = z.enum(['auto', 'pending', 'released', 'held'])
export const reviewModeEnum = z.enum(['off', 'shadow', 'enforce'])

const decisionFields = {
  decision: reviewDecisionEnum,
  code: reviewCodeEnum.optional(),
  note: z.string().trim().max(500).optional(),
}

export const decideReviewSchema = z.object({ storyId: z.string().uuid(), ...decisionFields })

export const bulkDecideReviewSchema = z.object({
  storyIds: z.array(z.string().uuid()).min(1).max(500),
  ...decisionFields,
})

export const setReviewModeSchema = z.object({ mode: reviewModeEnum })

export const reviewListQuerySchema = z.object({
  state: reviewStateEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const modePreviewQuerySchema = z.object({ mode: reviewModeEnum })
