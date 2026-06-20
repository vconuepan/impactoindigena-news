import { Router } from 'express'
import { apiLimiter } from '../../middleware/rateLimit.js'
import storiesRouter from './stories.js'
import issuesRouter from './issues.js'
import feedRouter from './feed.js'
import subscribeRouter from './subscribe.js'
import sitemapRouter from './sitemap.js'
import homepageRouter from './homepage.js'
import docsRouter from './docs.js'
import sourcesRouter from './sources.js'
import feedbackRouter from './feedback.js'
import podcastFeedRouter from './podcastFeed.js'
import communitiesRouter from './communities.js'
import coverageRouter from './coverage.js'
import trackRouter from './track.js'
import opendataRouter from './opendata.js'
import spotlightRouter from './spotlight.js'
import contrastRouter from './contrast.js'
import newslettersRouter from './newsletters.js'
import casesRouter from './cases.js'
import alertsRouter from './alerts.js'
import editorialsRouter from './editorials.js'
import statsRouter from './stats.js'
import agendaRouter from './agenda.js'

const router = Router()

// Apply rate limiting to public API
router.use(apiLimiter)

router.use('/homepage', homepageRouter)
router.use('/stories', storiesRouter)
router.use('/issues', issuesRouter)
router.use('/sources', sourcesRouter)
router.use('/feed', feedRouter)
router.use('/subscribe', subscribeRouter)
router.use('/sitemap.xml', sitemapRouter)
router.use('/docs', docsRouter)
router.use('/feedback', feedbackRouter)
router.use('/podcast', podcastFeedRouter)
router.use('/communities', communitiesRouter)
router.use('/coverage', coverageRouter)
router.use('/track', trackRouter)
router.use('/opendata', opendataRouter)
router.use('/spotlight', spotlightRouter)
router.use('/contrast', contrastRouter)
router.use('/newsletters', newslettersRouter)
router.use('/cases', casesRouter)
router.use('/alerts', alertsRouter)
router.use('/editorials', editorialsRouter)
router.use('/stats', statsRouter)
router.use('/agenda', agendaRouter)

export default router
