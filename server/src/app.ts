import 'dotenv/config'
import 'express-async-errors'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import { randomUUID } from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import { createLogger } from './lib/logger.js'
import healthRouter from './routes/health.js'
import authRouter from './routes/auth.js'
import authPublicRouter from './routes/auth-public.js'
import adminRouter from './routes/admin/index.js'
import publicRouter from './routes/public/index.js'
import ogRouter from './routes/og.js'


const httpLog = createLogger('http')

const app = express()

// Trust proxy for correct IP detection behind reverse proxy (Render.com)
app.set('trust proxy', 1)

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}))

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  'http://localhost:5174',
  'http://localhost:4174',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:4174',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[]

// Open CORS for public read-only endpoints (widget/embed API calls from any origin)
const publicReadPaths = ['/api/stories', '/api/issues', '/api/homepage', '/api/feed', '/api/docs', '/api/podcast']
app.use((req, res, next) => {
  if (publicReadPaths.some(p => req.path.startsWith(p))) {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    return next()
  }
  // Restricted CORS for everything else (auth, admin, subscribe)
  cors({
    origin: (origin, callback) => {
      // Allow requests without origin (health checks, server-side) for safe methods
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  })(req, res, next)
})

app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())

// Request ID — inherit from header or generate
app.use((req, res, next) => {
  req.id = (req.headers['x-request-id'] as string) || randomUUID()
  res.set('X-Request-Id', req.id)
  next()
})

// Request logging — single line per request, no redundant fields
app.use((req, res, next) => {
  if (req.originalUrl === '/health') return next()
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    const status = res.statusCode
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
    const logUrl = req.originalUrl.includes('/magic/')
      ? req.originalUrl.replace(/([?&])token=[^&]*/g, '$1token=[REDACTED]')
      : req.originalUrl
    httpLog[level]({ requestId: req.id }, `${req.method} ${logUrl} ${status} ${ms}ms`)
  })
  next()
})

// Routes
app.use('/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/auth', authPublicRouter)
app.use('/api/admin', adminRouter)
app.use('/api', publicRouter)
app.use('/og', ogRouter)
app.use('/api/og', ogRouter) // alias for Azure Static Web Apps linked backend proxy


// 404 handler for unmatched routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

// Global error handler — must be last middleware (4 parameters required)
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const log = createLogger('http')

  // Prisma known request errors
  if (err?.constructor?.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Already exists' })
      return
    }
    // P2023: malformed input (e.g. invalid UUID/enum value) reaching a query —
    // a client error, not a server fault. Map to 400 instead of a 500.
    if (err.code === 'P2023') {
      res.status(400).json({ error: 'Invalid request' })
      return
    }
  }

  // Known service errors
  if (err instanceof Error) {
    const notFoundMessages = ['Feed not found', 'Story not found', 'User not found', 'Issue not found']
    if (notFoundMessages.includes(err.message)) {
      res.status(404).json({ error: err.message })
      return
    }
  }

  log.error({ err, method: req.method, url: req.originalUrl }, 'unhandled error')
  res.status(500).json({ error: 'Internal server error' })
})

export default app
