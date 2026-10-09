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
import linkedinOAuthRouter from './routes/linkedinOAuth.js'
import publicRouter from './routes/public/index.js'
import ogRouter from './routes/og.js'
import { ogLimiter } from './middleware/rateLimit.js'
import { getAllowedOrigins } from './lib/allowedOrigins.js'
import { config } from './config.js'


const httpLog = createLogger('http')

const app = express()

// Trust proxy for correct IP detection behind reverse proxy (Azure App Service)
app.set('trust proxy', 1)

/**
 * Origen del bucket público de R2, o null si no está configurado o no es una URL.
 *
 * El cliente lee de ahí el snapshot de la portada (`homepage.json`). La CSP del
 * Static Web App ya lo declara en `connect-src` (client/public/staticwebapp.config.json);
 * esta es la copia de la del servidor, y `app.csp.test.ts` vigila que las dos
 * nombren el mismo origen.
 */
export function r2ConnectOrigin(publicUrl: string = config.r2.publicUrl): string | null {
  if (!publicUrl) return null
  try {
    return new URL(publicUrl).origin
  } catch {
    return null
  }
}

// Security headers
const r2Origin = r2ConnectOrigin()
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: r2Origin ? ["'self'", r2Origin] : ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}))

// CORS configuration
const allowedOrigins = getAllowedOrigins()

// Open CORS for public read-only endpoints (widget/embed API calls from any origin)
// /api/opendata entro el 4-oct-2026: los datos abiertos son un bien publico y
// deben poder consultarse tambien desde un navegador en otro dominio.
const publicReadPaths = ['/api/stories', '/api/issues', '/api/homepage', '/api/feed', '/api/docs', '/api/podcast', '/api/opendata']
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
      return callback(Object.assign(new Error('Not allowed by CORS'), { status: 403 }))
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

/**
 * Oculta las credenciales que viajan en la query antes de escribir la URL al log.
 *
 * Los logs se descargan y se comparten para depurar, así que lo que entra acá
 * sale de la máquina. El token de un enlace mágico da acceso a la cuenta; el
 * código de OAuth es de un solo uso y dura segundos, pero mientras vive alcanza
 * para canjear un token de publicación.
 *
 * Exportada para poder probarla: es una protección de seguridad, no un detalle
 * de formato.
 */
export function redactSensitiveQuery(url: string): string {
  if (url.includes('/magic/')) {
    return url.replace(/([?&])token=[^&]*/g, '$1token=[REDACTED]')
  }
  if (url.includes('/oauth/')) {
    return url.replace(/([?&])(code|state)=[^&]*/g, '$1$2=[REDACTED]')
  }
  return url
}

// Request logging — single line per request, no redundant fields
app.use((req, res, next) => {
  if (req.originalUrl === '/health' || req.originalUrl === '/api/health') return next()
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    const status = res.statusCode
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
    const logUrl = redactSensitiveQuery(req.originalUrl)
    httpLog[level]({ requestId: req.id }, `${req.method} ${logUrl} ${status} ${ms}ms`)
  })
  next()
})

// Routes
// `/health` en la raíz es para las sondas del propio App Service. Lo que ve un
// monitor externo es `/api/health` (dentro del router público, con limitador):
// el Static Web App solo reenvía `/api/*` al backend, y `/health` ahí devuelve
// el HTML del SPA con 200, o sea «sano» aunque el backend esté muerto.
app.use('/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/auth', authPublicRouter)
app.use('/api/admin', adminRouter)
// Callback de OAuth de LinkedIn: público a la fuerza (llega por redirect del
// navegador, sin el Bearer del admin) y protegido por un `state` firmado.
app.use('/api/linkedin', linkedinOAuthRouter)
app.use('/api', publicRouter)
app.use('/og', ogLimiter, ogRouter)
app.use('/api/og', ogLimiter, ogRouter) // alias for Azure Static Web Apps linked backend proxy


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

  // Origen no permitido por CORS: es un rechazo del cliente, no una falla del servidor.
  if (err instanceof Error && err.message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'Origin not allowed' })
    return
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
