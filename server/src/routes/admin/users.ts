import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import * as userService from '../../services/user.js'
import { revokeAllUserTokens } from '../../services/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { requireRole } from '../../middleware/auth.js'
import { createUserSchema, updateUserSchema } from '../../schemas/user.js'
import { resetPasswordSchema } from '../../schemas/auth.js'
import { writeAuditLog } from '../../services/audit.js'
import { suprimirPorCorreo, BrevoNoRespondeError, SupresionPropiaError } from '../../services/supresion.js'

const router = Router()
const log = createLogger('users')

// All user management requires admin role
router.use(requireRole('admin'))

router.get('/', async (_req, res) => {
  try {
    const users = await userService.listUsers()
    res.json(users)
  } catch (err) {
    log.error({ err }, 'failed to list users')
    res.status(500).json({ error: 'Failed to list users' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json(user)
  } catch (err) {
    log.error({ err }, 'failed to get user')
    res.status(500).json({ error: 'Failed to get user' })
  }
})

router.post('/', validateBody(createUserSchema), async (req, res) => {
  try {
    const user = await userService.createUser(req.body)
    res.status(201).json(user)
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'A user with this email already exists' })
      return
    }
    log.error({ err }, 'failed to create user')
    res.status(500).json({ error: 'Failed to create user' })
  }
})

router.put('/:id', validateBody(updateUserSchema), async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body)
    res.json(user)
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'A user with this email already exists' })
      return
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'User not found' })
      return
    }
    log.error({ err }, 'failed to update user')
    res.status(500).json({ error: 'Failed to update user' })
  }
})

router.put('/:id/password', validateBody(resetPasswordSchema), async (req, res) => {
  try {
    await userService.resetPassword(req.params.id, req.body.password)
    res.json({ message: 'Password reset' })
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'User not found' })
      return
    }
    log.error({ err }, 'failed to reset password')
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

/**
 * DELETE /api/admin/users/:id
 *
 * Supresión completa, igual que el autoservicio ARCO: la cuenta con sus
 * cascadas y además todo lo que guarda su correo sin llave a la cuenta
 * (boletín y contacto en Brevo, alertas, enlaces mágicos, comentarios). Hasta
 * el 3-nov-2026 borraba solo la fila del usuario. Si Brevo no responde no se
 * borra nada (502).
 */
router.delete('/:id', async (req, res) => {
  try {
    if (req.user?.userId === req.params.id) {
      res.status(400).json({ error: 'Cannot delete your own account' })
      return
    }
    const usuario = await userService.getUserById(req.params.id)
    if (!usuario) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    const resultado = await suprimirPorCorreo({
      correo: usuario.email,
      userId: usuario.id,
      protegerUserId: req.user?.userId,
    })
    await revokeAllUserTokens(req.params.id)
    await writeAuditLog({
      actor: req.user,
      action: 'user.delete',
      targetType: 'user',
      targetId: req.params.id,
      metadata: { ...resultado },
    })
    res.status(204).send()
  } catch (err: any) {
    if (err instanceof BrevoNoRespondeError) {
      res.status(502).json({ error: 'Brevo no respondió; no se borró nada en nuestra base. Reintenta en unos minutos.' })
      return
    }
    if (err instanceof SupresionPropiaError) {
      res.status(400).json({ error: 'Cannot delete your own account' })
      return
    }
    log.error({ err }, 'failed to delete user')
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

export default router
