import { z } from 'zod'

const makeADifferenceItem = z.object({
  label: z.string().min(1),
  url: z.string().url(),
})

export const createIssueSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens'),
  description: z.string().optional().default(''),
  promptFactors: z.string().optional().default(''),
  promptAntifactors: z.string().optional().default(''),
  promptRatings: z.string().optional().default(''),
  // min(1), no uuid(): tres temas madre tienen ids que no son UUID
  // (`issue-emp-003`, `issue-clima-001`, `issue-ddhh-002`). Ver schemas/feed.ts.
  parentId: z.string().min(1).nullable().optional().default(null),
  minPreRating: z.number().int().min(1).max(10).nullable().optional().default(null),
  intro: z.string().optional().default(''),
  evaluationIntro: z.string().optional().default(''),
  evaluationCriteria: z.array(z.string()).optional().default([]),
  makeADifference: z.array(makeADifferenceItem).optional().default([]),
})

export const updateIssueSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens').optional(),
  description: z.string().optional(),
  promptFactors: z.string().optional(),
  promptAntifactors: z.string().optional(),
  promptRatings: z.string().optional(),
  parentId: z.string().min(1).nullable().optional(),
  minPreRating: z.number().int().min(1).max(10).nullable().optional(),
  intro: z.string().optional(),
  evaluationIntro: z.string().optional(),
  evaluationCriteria: z.array(z.string()).optional(),
  makeADifference: z.array(makeADifferenceItem).optional(),
})
