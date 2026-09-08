import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../../config.js'
import { validateBody } from '../../middleware/validate.js'
import prisma from '../../lib/prisma.js'
import { createLogger } from '../../lib/logger.js'
import { hashNoReversible } from '../../lib/hash-no-reversible.js'

const router = Router()
const log = createLogger('public:feedback')

const feedbackLimiter = rateLimit({
  windowMs: config.feedback.rateLimitWindowMs,
  max: config.feedback.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feedback submissions. Please try again later.' },
})

const feedbackSchema = z.object({
  category: z.enum(['general', 'bug', 'suggestion', 'other']),
  message: z.string().min(1).max(config.feedback.messageMaxLength),
  email: z.string().email().max(255).optional().or(z.literal('')),
  website: z.string().optional(), // honeypot field
})

router.post('/', feedbackLimiter, validateBody(feedbackSchema), async (req, res) => {
  try {
    // Silently reject honeypot-filled submissions (return success to not tip off bots)
    if (req.body.website) {
      res.json({ success: true })
      return
    }

    const { category, message, email } = req.body
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    // Con sal, no SHA-256 crudo: la Politica promete un hash «no reversible» y
    // un sha256 pelado de una IPv4 se revierte por fuerza bruta (2^32 valores).
    const ipHash = hashNoReversible('feedback', ip)

    await prisma.feedback.create({
      data: {
        category,
        message,
        email: email || null,
        ipHash,
      },
    })

    log.info({ category, hasEmail: !!email }, 'feedback submitted')
    res.json({ success: true })
  } catch (err) {
    log.error({ err }, 'failed to save feedback')
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
})

export default router
