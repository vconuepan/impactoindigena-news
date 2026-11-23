import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'

/**
 * El candado de la API cuando el frontend se sirve desde Cloudflare Pages.
 *
 * ANTES. La API solo aceptaba tráfico que llegaba por el backend enlazado de
 * Azure Static Web Apps: Easy Auth, con el proveedor `azureStaticWebApps`,
 * rechazaba todo lo demás antes de llegar a Express.
 *
 * AHORA. El frontend pasa a Cloudflare Pages (decisión del director, 21-nov-2026,
 * para ahorrar los US$8,88/mes del Static Web App en la suscripción FKM), y
 * Easy Auth no reconoce a Cloudflare. El reenvío de Pages
 * (`client/functions/_middleware.ts`) manda `X-Origin-Secret` con un secreto que
 * también conoce el App Service (`ORIGIN_SECRET`); sin él, la API responde 403.
 *
 * INERTE HASTA EL CORTE. Sin `ORIGIN_SECRET` configurado (o con uno de menos de
 * LARGO_MINIMO caracteres) el candado no hace nada: se puede desplegar antes del
 * corte sin cambiar el comportamiento. En el corte se pone el secreto en los dos
 * lados y se apaga Easy Auth.
 *
 * `/health` (la raíz, no `/api/health`) queda abierta: la usan las sondas del
 * propio App Service, que no pasan por Cloudflare. Solo dice si el proceso vive.
 *
 * La comparación es de tiempo constante sobre los hashes, igual que
 * `lib/prerenderBypass.ts`, para que ni el contenido ni el largo se filtren.
 */

export const ENCABEZADO_ORIGEN = 'x-origin-secret'

/** Un secreto más corto se ignora: no protege nada y suele ser un error de copia. */
export const LARGO_MINIMO = 32

const RUTAS_ABIERTAS = new Set(['/health'])

const huella = (s: string) => createHash('sha256').update(s, 'utf8').digest()

export function esOrigenAutorizado(recibido: unknown, esperado: string): boolean {
  // Un encabezado repetido llega como arreglo: el reenvío manda uno solo.
  if (typeof recibido !== 'string' || recibido.length === 0) return false
  return timingSafeEqual(huella(recibido), huella(esperado))
}

/** `secreto` se lee una vez al arrancar; por defecto, `process.env.ORIGIN_SECRET`. */
export function exigirSecretoDeOrigen(secreto: string | undefined = process.env.ORIGIN_SECRET) {
  const activo = typeof secreto === 'string' && secreto.length >= LARGO_MINIMO
  return function candadoDeOrigen(req: Request, res: Response, next: NextFunction) {
    if (!activo) return next()
    if (RUTAS_ABIERTAS.has(req.path)) return next()
    if (esOrigenAutorizado(req.headers[ENCABEZADO_ORIGEN], secreto as string)) return next()
    res.status(403).json({ error: 'forbidden' })
  }
}
