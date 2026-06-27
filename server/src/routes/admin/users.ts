import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import * as userService from '../../services/user.js'
import { revokeAllUserTokens } from '../../services/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { requireRole } from '../../middleware/auth.js'
import { createUserSchema, updateUserSchema } from '../../schemas/user.js'
import { resetPasswordSchema } from '../../schemas/auth.js'
import { writeAuditLog } from '../../services/audit.js'

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

router.delete('/:id', async (req, res) => {
  try {
    if (req.user?.userId === req.params.id) {
      res.status(400).json({ error: 'Cannot delete your own account' })
      return
    }
    await revokeAllUserTokens(req.params.id)
    await userService.deleteUser(req.params.id)
    await writeAuditLog({ actor: req.user, action: 'user.delete', targetType: 'user', targetId: req.params.id })
    res.status(204).send()
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'User not found' })
      return
    }
    log.error({ err }, 'failed to delete user')
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

export default router
