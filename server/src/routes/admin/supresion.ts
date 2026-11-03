/**
 * Supresión por correo desde el panel: la herramienta para cuando alguien pide
 * por correo que se le borre (la Política promete responder en dos días
 * hábiles). Antes no existía: las alertas no tenían ninguna ruta de admin, y
 * borrarlas obligaba a entrar a la base a mano.
 *
 * POST /api/admin/supresion/vista-previa  { email }                      → qué se borraría
 * POST /api/admin/supresion               { email, confirm: 'SUPRIMIR' } → lo borra
 *
 * El correo viaja en el cuerpo, nunca en la URL. Solo administradores.
 */
import { Router } from 'express'
import { z } from 'zod'
import { createLogger, maskEmail } from '../../lib/logger.js'
import { requireRole } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { writeAuditLog } from '../../services/audit.js'
import {
  suprimirPorCorreo,
  vistaPreviaSupresion,
  BrevoNoRespondeError,
  SupresionPropiaError,
} from '../../services/supresion.js'

const router = Router()
const log = createLogger('admin:supresion')

router.use(requireRole('admin'))

const correoSchema = z.object({ email: z.string().trim().email().max(255) })
const suprimirSchema = correoSchema.extend({ confirm: z.literal('SUPRIMIR') })

router.post('/vista-previa', validateBody(correoSchema), async (req, res) => {
  try {
    res.json(await vistaPreviaSupresion(req.body.email))
  } catch (err) {
    log.error({ err }, 'suppression preview failed')
    res.status(500).json({ error: 'No se pudo revisar el correo' })
  }
})

router.post('/', validateBody(suprimirSchema), async (req, res) => {
  try {
    const resultado = await suprimirPorCorreo({
      correo: req.body.email,
      protegerUserId: req.user?.userId,
    })
    log.info({ email: maskEmail(req.body.email), ...resultado }, 'person suppressed by admin')
    // El correo del titular NO entra al registro: lo que se borró no puede
    // quedar guardado justo en la constancia de que se borró. Queda quién
    // operó, cuándo y cuántas filas; el correo del operador sí, porque es
    // trazabilidad de quien borra datos ajenos.
    await writeAuditLog({ actor: req.user, action: 'person.suppress', targetType: 'email', metadata: { ...resultado } })
    res.json(resultado)
  } catch (err) {
    if (err instanceof BrevoNoRespondeError) {
      res.status(502).json({ error: 'Brevo no respondió; no se borró nada en nuestra base. Reintenta en unos minutos.' })
      return
    }
    if (err instanceof SupresionPropiaError) {
      res.status(400).json({ error: 'Ese correo es el de tu propia cuenta.' })
      return
    }
    log.error({ err }, 'suppression failed')
    res.status(500).json({ error: 'No se pudo suprimir el correo' })
  }
})

export default router
