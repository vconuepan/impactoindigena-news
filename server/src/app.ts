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
import { resolveClientIp } from './middleware/clientIp.js'
import { exigirSecretoDeOrigen } from './middleware/originSecret.js'
import { config } from './config.js'


const httpLog = createLogger('http')

const app = express()

// Trust proxy: un salto, el del App Service. Sirve para el protocolo y el host,
// pero NO da la IP del lector: detras de Static Web Apps `req.ip` es la salida del
// proxy. Esa la resuelve `resolveClientIp`, que cuenta X-Forwarded-For desde la
// derecha y debe ir ANTES de los limitadores y del log.
app.set('trust proxy', 1)
app.use(resolveClientIp(config.proxy.clientIpFromRight))

// El candado de la API cuando el frontend vive en Cloudflare Pages: sin la
// cabecera X-Origin-Secret, 403. Inerte mientras ORIGIN_SECRET no esté puesto
// (ver middleware/originSecret.ts). Va antes de todo lo demás para que una
// petición que no viene de Cloudflare no gaste limitadores ni log.
app.use(exigirSecretoDeOrigen())

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

// `inflate: false`: ningun cliente legitimo manda el cuerpo comprimido (el sitio
// usa fetch con JSON plano), y descomprimir es la puerta del GHSA-27r3-jxmh-p828
// de body-parser: un cuerpo comprimido con bytes de sobra tumbaba el proceso
// antes del enrutado y de los limitadores. Hoy el proxy de Static Web Apps quita
// `Content-Encoding` (medido el 21-nov-2026), pero esa defensa es del proxy, no
// de esta app. Un cuerpo comprimido responde 415.
app.use(express.json({ limit: '100kb', inflate: false }))
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
  // `token` y `email` se ocultan en CUALQUIER ruta, no solo en las que se
  // conocian: las URL de confirmacion de la suscripcion y de las alertas llevan
  // las dos cosas en la query. En las alertas el token es ademas la credencial de
  // baja permanente (`unsubscribeByToken` ignora el vencimiento), y el correo es
  // un dato personal que la Politica promete no dejar en los logs.
  let out = url.replace(/([?&])(token|unsubscribe_token|email)=[^&]*/gi, '$1$2=[REDACTED]')
  // `code` y `state` si dependen de la ruta: en /api/stories son filtros legitimos.
  if (out.includes('/oauth/')) {
    out = out.replace(/([?&])(code|state)=[^&]*/g, '$1$2=[REDACTED]')
  }
  return out
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

/**
 * Errores de body-parser: traen `type` (p. ej. `entity.parse.failed`,
 * `entity.too.large`, `encoding.unsupported`) y un `status` 4xx. Se exige el
 * `type` con la forma de body-parser para no tomar por error del cliente
 * cualquier excepcion que por casualidad traiga un status.
 */
export function isBodyParserError(err: unknown): err is { type: string; status: number } {
  if (!err || typeof err !== 'object') return false
  const { type, status } = err as { type?: unknown; status?: unknown }
  return (
    typeof type === 'string' &&
    /^(entity|encoding|charset|request)\./.test(type) &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
  )
}

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

  // Cuerpo que body-parser rechaza (JSON malformado 400, demasiado grande 413,
  // comprimido o con charset no soportado 415): es un error del cliente. Antes
  // caia al 500 y cada cuerpo roto quedaba como falla del servidor en el log. La
  // respuesta es generica a proposito: el mensaje de body-parser cita el cuerpo.
  if (isBodyParserError(err)) {
    log.warn({ type: err.type, status: err.status, method: req.method, url: redactSensitiveQuery(req.originalUrl) }, 'request body rejected')
    res.status(err.status).json({ error: 'Invalid request body' })
    return
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

  // Redactada como la linea HTTP: un GET de confirmacion que falla por dentro no
  // debe dejar el token ni el correo crudos en el log.
  log.error({ err, method: req.method, url: redactSensitiveQuery(req.originalUrl) }, 'unhandled error')
  res.status(500).json({ error: 'Internal server error' })
})

export default app
