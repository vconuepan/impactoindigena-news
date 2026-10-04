import 'zod-openapi/extend'
import { z } from 'zod'
import { createDocument } from 'zod-openapi'

// --- Reusable schemas ---

const issueRefSchema = z.object({
  name: z.string().openapi({ example: 'Cambio Climático' }),
  slug: z.string().openapi({ example: 'cambio-climatico' }),
}).openapi({ ref: 'IssueRef' })

const feedRefSchema = z.object({
  id: z.string().uuid(),
  title: z.string().openapi({ example: 'The Guardian Environment' }),
  displayTitle: z.string().nullable().openapi({ example: 'The Guardian' }),
  issue: issueRefSchema.nullable(),
}).openapi({ ref: 'FeedRef' })

const publicStorySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().nullable().openapi({ example: 'comunidad-achuar-impulsa-observatorio-tecnologico-en-ecuador' }),
  sourceUrl: z.string().url().openapi({ example: 'https://example.com/article' }),
  sourceTitle: z.string().openapi({ example: 'Major climate breakthrough announced' }),
  sourceAuthor: z.string().nullable(),
  title: z.string().nullable().openapi({ example: 'Scientists announce major climate breakthrough' }),
  titleLabel: z.string().nullable().openapi({ example: 'Climate' }),
  dateCrawled: z.string().datetime(),
  datePublished: z.string().datetime().nullable(),
  status: z.enum(['published']),
  relevancePre: z.number().int().min(0).max(10).nullable(),
  relevance: z.number().int().min(0).max(10).nullable().openapi({ example: 8 }),
  emotionTag: z.enum(['uplifting', 'frustrating', 'scary', 'calm']).nullable(),
  summary: z.string().nullable().openapi({ example: 'Researchers have developed a new carbon capture method...' }),
  quote: z.string().nullable(),
  quoteAttribution: z.string().nullable(),
  marketingBlurb: z.string().nullable(),
  relevanceReasons: z.string().nullable(),
  relevanceSummary: z.string().nullable(),
  antifactors: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  narrativeFrame: z.enum(['confrontacion', 'resiliencia', 'protagonismo', 'alianza']).nullable(),
  titleEn: z.string().nullable(),
  titleLabelEn: z.string().nullable(),
  summaryEn: z.string().nullable(),
  quoteEn: z.string().nullable(),
  marketingBlurbEn: z.string().nullable(),
  relevanceSummaryEn: z.string().nullable(),
  issue: issueRefSchema.nullable(),
  feed: feedRefSchema,
}).openapi({ ref: 'PublicStory' })

// The homepage omits these three fields from each story (HOMEPAGE_OMITE in
// server/src/services/story.ts). zod-openapi drops the ref on .omit(), so it is
// set again explicitly.
const homepageStorySchema = publicStorySchema
  .omit({ antifactors: true, marketingBlurb: true, marketingBlurbEn: true })
  .openapi({ ref: 'HomepageStory' })

const paginationMeta = {
  total: z.number().int().openapi({ example: 142 }),
  page: z.number().int().openapi({ example: 1 }),
  pageSize: z.number().int().openapi({ example: 25 }),
  totalPages: z.number().int().openapi({ example: 6 }),
}

const storyListResponseSchema = z.object({
  data: z.array(publicStorySchema),
  ...paginationMeta,
}).openapi({ ref: 'StoryListResponse' })

const makeADifferenceSchema = z.object({
  label: z.string().openapi({ example: 'Donate to reforestation' }),
  url: z.string().url().openapi({ example: 'https://example.org/donate' }),
})

// Issue IDs are not all UUIDs (e.g. "issue-clima-001"), so id and parentId are plain strings.
const publicIssueFields = {
  id: z.string(),
  name: z.string().openapi({ example: 'Cambio Climático' }),
  slug: z.string().openapi({ example: 'cambio-climatico' }),
  description: z.string(),
  intro: z.string(),
  evaluationIntro: z.string(),
  evaluationCriteria: z.array(z.string()),
  makeADifference: z.array(makeADifferenceSchema),
  parentId: z.string().nullable(),
  sourceNames: z.array(z.string()),
}

const publicIssueSchema: z.ZodType<any> = z.object({
  ...publicIssueFields,
  children: z.array(z.lazy(() => publicIssueSchema)).optional(),
}).openapi({ ref: 'PublicIssue' })

const publicIssueDetailSchema = z.object({
  ...publicIssueFields,
  children: z.array(z.object({
    ...publicIssueFields,
    name: z.string().openapi({ example: 'Bosques y conservación' }),
    slug: z.string().openapi({ example: 'clima-bosques' }),
    parentId: z.string().nullable().openapi({ example: 'issue-clima-001' }),
    publishedStoryCount: z.number().int().openapi({
      description: 'Number of published stories assigned directly to this sub-issue',
    }),
  })),
  parent: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  }).nullable().openapi({ description: 'Parent issue, or null for a top-level issue' }),
}).openapi({ ref: 'PublicIssueDetail' })

const emotionBucketSchema = z.object({
  uplifting: z.array(homepageStorySchema),
  calm: z.array(homepageStorySchema),
  negative: z.array(homepageStorySchema).openapi({
    description: 'Stories tagged frustrating or scary',
  }),
})

const activeCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  keywords: z.array(z.string()),
  storyCount: z.number().int().openapi({
    description: 'Published stories whose title or summary contains any of the case keywords',
  }),
}).openapi({ ref: 'ActiveCase' })

const homepageResponseSchema = z.object({
  issues: z.array(publicIssueSchema),
  storiesByIssue: z.record(z.string(), emotionBucketSchema).openapi({
    description: 'Keyed by thematic issue slug. Geographic issues have no entry.',
  }),
  activeCases: z.array(activeCaseSchema),
}).openapi({ ref: 'HomepageResponse' })

const errorResponseSchema = z.object({
  error: z.string().openapi({ example: 'Not found' }),
}).openapi({ ref: 'ErrorResponse' })

// Every public endpoint sits behind apiLimiter (server/src/routes/public/index.ts).
const rateLimitedResponse = {
  description: 'Rate limit exceeded',
  content: {
    'application/json': {
      schema: errorResponseSchema,
      example: { error: 'Too many requests. Please try again later.' },
    },
  },
}

// Shared description for dateFrom and dateTo (regex in server/src/schemas/story.ts; range built by buildPublishedDateRange in server/src/services/story.ts).
const dateParamDescription =
  'Filter by datePublished (date the story was published on Voces Indígenas, UTC). ' +
  'dateFrom is inclusive from 00:00Z; dateTo is inclusive through the end of that day. ' +
  'Also applies together with `search`. A malformed value returns 400; ' +
  'a well-formed but impossible date (e.g. month 13) currently returns 500.'

// --- Document ---
// Only include public endpoints advertised on the /free-api landing page.
// Internal endpoints (subscribe, sitemap, etc.) should not appear here.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOpenAPIDocument(): any {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Voces Indígenas API',
      version: '0.1.0',
      description:
        'Stories that matter to indigenous peoples, selected from sources worldwide and analyzed with AI by Voces Indígenas, a program of Fundación KM. ' +
        'Access published stories, issues, homepage data, and RSS feeds. No authentication required.\n\n' +
        'Rate limits: 100 requests per 15-minute window per client (RateLimit-Policy: 100;w=900, draft-6 RateLimit-* headers). ' +
        'Requests with `search` also count against a separate limit of 20 per 15 minutes. ' +
        'Counters are kept in memory per server instance, so rely on the RateLimit-Remaining/RateLimit-Reset headers of each response rather than counting locally. ' +
        'Exceeding a limit returns 429 with {"error":"Too many requests. Please try again later."} ' +
        '(search: {"error":"Too many search requests. Please try again later."}). ' +
        'Use pageSize=100 to page through the archive (~40 requests for ~4,000 stories).',
      contact: {
        name: 'Voces Indígenas',
        url: 'https://vocesindigenas.org',
      },
    },
    servers: [
      { url: process.env.API_URL || 'https://vocesindigenas.org', description: 'Production' },
    ],
    paths: {
      '/api/homepage': {
        get: {
          operationId: 'getHomepage',
          summary: 'Get homepage data',
          description:
            'Returns all issues (with hierarchy) and, for the eight thematic sections only ' +
            '(territorio-y-tierras, cambio-climatico, consulta-y-consentimiento, economias-indigenas, ' +
            'derechos-indigenas, defensores-y-proteccion, mujeres-indigenas, cultura-y-conocimientos-ancestrales), ' +
            'up to 7 stories per bucket whose original article was published in the last 18 months. ' +
            'Buckets: uplifting, calm, negative (= frustrating + scary). Geographic issues have no entry in storiesByIssue. ' +
            'Used by the client to power the positivity slider without additional API calls.',
          tags: ['Homepage'],
          responses: {
            '200': {
              description: 'Homepage data with issues and emotion-bucketed stories',
              content: {
                'application/json': { schema: homepageResponseSchema },
              },
            },
            '429': rateLimitedResponse,
          },
        },
      },
      '/api/stories': {
        get: {
          operationId: 'listStories',
          summary: 'List published stories',
          description:
            'Returns a paginated list of published stories. Supports filtering by issue and semantic search.',
          tags: ['Stories'],
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1, minimum: 1 },
              description: 'Page number',
            },
            {
              name: 'pageSize',
              in: 'query',
              schema: { type: 'integer', default: 25, minimum: 1, maximum: 100 },
              description: 'Number of stories per page',
            },
            {
              name: 'issueSlug',
              in: 'query',
              schema: { type: 'string' },
              description:
                'Filter by issue slug (e.g., "cambio-climatico"). Parent slugs include their sub-issues. ' +
                'Get valid slugs from GET /api/issues. An unknown slug returns 200 with an empty list, not 404.',
            },
            {
              name: 'search',
              in: 'query',
              schema: { type: 'string', minLength: 2, maxLength: 200 },
              description:
                'Semantic search query — searches by meaning, not just keywords. Subject to a stricter rate limit (20 requests per 15 minutes). ' +
                'Returns at most 100 matches (up to 50 semantic matches plus up to the 50 most recent keyword matches, merged by reciprocal rank fusion); ' +
                '`total` counts that capped set, not every matching story.',
            },
            {
              name: 'emotionTags',
              in: 'query',
              schema: { type: 'string' },
              description:
                'Comma-separated list of: uplifting, calm, frustrating, scary (e.g., "uplifting" or "uplifting,calm"). ' +
                '("negative" is a homepage bucket, not a tag.) An unknown value returns 500. ' +
                'Ignored when `search` is present: semantic search results are not filtered by emotion tag.',
            },
            {
              name: 'dateFrom',
              in: 'query',
              schema: { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
              description: dateParamDescription,
            },
            {
              name: 'dateTo',
              in: 'query',
              schema: { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
              description: dateParamDescription,
            },
          ],
          responses: {
            '200': {
              description: 'Paginated list of published stories',
              content: {
                'application/json': { schema: storyListResponseSchema },
              },
            },
            '400': {
              description: 'Invalid query parameters',
              content: {
                'application/json': {
                  schema: errorResponseSchema,
                  example: { error: 'Invalid query parameters' },
                },
              },
            },
            '429': rateLimitedResponse,
          },
        },
      },
      '/api/stories/{slug}': {
        get: {
          operationId: 'getStory',
          summary: 'Get a single story',
          description: 'Returns a single published story by its URL slug.',
          tags: ['Stories'],
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Story URL slug',
            },
          ],
          responses: {
            '200': {
              description: 'Story details',
              content: {
                'application/json': { schema: publicStorySchema },
              },
            },
            '404': {
              description: 'Story not found',
              content: {
                'application/json': { schema: errorResponseSchema },
              },
            },
            '429': rateLimitedResponse,
          },
        },
      },
      '/api/issues': {
        get: {
          operationId: 'listIssues',
          summary: 'List all issues',
          description:
            'Returns all issues with their hierarchy (parents contain children). ' +
            'Cached for 5 minutes.',
          tags: ['Issues'],
          responses: {
            '200': {
              description: 'List of issues with hierarchy',
              content: {
                'application/json': {
                  schema: z.array(publicIssueSchema),
                },
              },
            },
            '429': rateLimitedResponse,
          },
        },
      },
      '/api/issues/{slug}': {
        get: {
          operationId: 'getIssue',
          summary: 'Get a single issue',
          description: 'Returns a single issue by its URL slug, including children and source names.',
          tags: ['Issues'],
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Issue URL slug (e.g., "cambio-climatico")',
            },
          ],
          responses: {
            '200': {
              description: 'Issue details',
              content: {
                'application/json': { schema: publicIssueDetailSchema },
              },
            },
            '404': {
              description: 'Issue not found',
              content: {
                'application/json': { schema: errorResponseSchema },
              },
            },
            '429': rateLimitedResponse,
          },
        },
      },
      '/api/feed': {
        get: {
          operationId: 'getRssFeed',
          summary: 'RSS feed (all stories)',
          description: 'Returns an RSS 2.0 feed of the 50 most recent published stories. Cached for 15 minutes.',
          tags: ['Feed'],
          responses: {
            '200': {
              description: 'RSS 2.0 XML feed',
              content: {
                'application/rss+xml': {
                  schema: { type: 'string' },
                },
              },
            },
            '429': rateLimitedResponse,
          },
        },
      },
      '/api/feed/{issueSlug}': {
        get: {
          operationId: 'getRssFeedByIssue',
          summary: 'RSS feed (per issue)',
          description: 'Returns an RSS 2.0 feed of the 50 most recent published stories for the specified issue. Cached for 15 minutes.',
          tags: ['Feed'],
          parameters: [
            {
              name: 'issueSlug',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Issue slug to filter by',
            },
          ],
          responses: {
            '200': {
              description: 'RSS 2.0 XML feed for the specified issue',
              content: {
                'application/rss+xml': {
                  schema: { type: 'string' },
                },
              },
            },
            '404': {
              description: 'Issue not found',
              content: {
                'application/json': { schema: errorResponseSchema },
              },
            },
            '429': rateLimitedResponse,
          },
        },
      },
    },
    components: {
      schemas: {},
    },
    tags: [
      { name: 'Homepage', description: 'Homepage data with emotion-bucketed stories' },
      { name: 'Stories', description: 'Published story listing and detail' },
      { name: 'Issues', description: 'Issue categories and hierarchy' },
      { name: 'Feed', description: 'RSS 2.0 feeds' },
    ],
  })
}
