import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import issueRouter from './issues.js'
import feedRouter from './feeds.js'
import storyRouter from './stories.js'
import jobRouter from './jobs.js'
import newsletterRouter from './newsletters.js'
import { podcastRouter } from './podcasts.js'
import userRouter from './users.js'
import clusterRouter from './clusters.js'
import blueskyRouter from './bluesky.js'
import mastodonRouter from './mastodon.js'
import instagramRouter from './instagram.js'
import linkedinRouter from './linkedin.js'
import feedbackRouter from './feedback.js'
import maintenanceRouter from './maintenance.js'
import membersRouter from './members.js'
import adminCommunitiesRouter from './communities.js'
import subscribersRouter from './subscribers.js'
import analyticsRouter from './analytics.js'
import spotlightsRouter from './spotlights.js'
import casesRouter from './cases.js'
import editorialsRouter from './editorials.js'
import integrationHealthRouter from './integration-health.js'
import agendaRouter from './agenda.js'

const router = Router()

// All admin routes require authentication + admin or editor role
router.use(requireAuth, requireRole('admin', 'editor'))

router.use('/issues', issueRouter)
router.use('/feeds', feedRouter)
router.use('/stories', storyRouter)
router.use('/jobs', jobRouter)
router.use('/newsletters', newsletterRouter)
router.use('/podcasts', podcastRouter)
router.use('/users', userRouter)
router.use('/clusters', clusterRouter)
router.use('/bluesky', blueskyRouter)
router.use('/mastodon', mastodonRouter)
router.use('/instagram', instagramRouter)
router.use('/linkedin', linkedinRouter)
router.use('/feedback', feedbackRouter)
router.use('/maintenance', maintenanceRouter)
router.use('/members', membersRouter)
router.use('/communities', adminCommunitiesRouter)
router.use('/subscribers', subscribersRouter)
router.use('/analytics', analyticsRouter)
router.use('/spotlights', spotlightsRouter)
router.use('/cases', casesRouter)
router.use('/editorials', editorialsRouter)
router.use('/integration-health', integrationHealthRouter)
router.use('/agenda', agendaRouter)

export default router
