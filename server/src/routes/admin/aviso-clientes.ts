/**
 * La lista de clientes del aviso de independencia (regla 2, 25-nov-2026).
 *
 * SOLO administradores, también para leer: el aviso público es genérico porque
 * la identidad de un cliente del estudio puede estar bajo secreto profesional,
 * así que la lista no se muestra a un editor. Cada cambio queda en audit_log.
 *
 *   GET    /api/admin/aviso-clientes                 la lista
 *   POST   /api/admin/aviso-clientes                 agregar una organización
 *   PATCH  /api/admin/aviso-clientes/:id             editar
 *   DELETE /api/admin/aviso-clientes/:id             quitar (se lleva sus descartes)
 *   GET    /api/admin/aviso-clientes/:id/notas       notas publicadas que la mencionan
 *   PUT    /api/admin/aviso-clientes/:id/notas/:storyId/descarte   marcar falso positivo
 *   DELETE /api/admin/aviso-clientes/:id/notas/:storyId/descarte   devolver el aviso
 */
import { Router } from 'express'
import { z } from 'zod'
import prisma from '../../lib/prisma.js'
import { requireRole } from '../../middleware/auth.js'
import { createLogger } from '../../lib/logger.js'
import { writeAuditLog } from '../../services/audit.js'
import { invalidarListaDeClientes, notasQueMencionan } from '../../services/avisoClientes.js'
import { MIN_LARGO_TERMINO, motivoRutInvalido, terminosDe, VERTICALES_CLIENTE } from '../../lib/avisoClientes.js'

const router = Router()
const log = createLogger('admin:aviso-clientes')

router.use(requireRole('admin'))

const termino = z.string().trim().min(1).max(200)
const clienteSchema = z.object({
  name: termino,
  aliases: z.array(termino).max(20).default([]),
  vertical: z.enum(VERTICALES_CLIENTE as unknown as ['ai', 'legal']),
  rut: z.string().trim().max(20).nullish(),
  endedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
})

/** Los candados que Zod no expresa. Devuelve la lista de motivos; vacía si pasa. */
function motivosDeRechazo(data: { name?: string; aliases?: string[]; rut?: string | null }): string[] {
  const motivos: string[] = []
  if (data.name !== undefined && terminosDe({ name: data.name, aliases: [] }).length === 0) {
    motivos.push(`El nombre debe tener al menos ${MIN_LARGO_TERMINO} letras.`)
  }
  for (const alias of data.aliases ?? []) {
    if (terminosDe({ name: alias, aliases: [] }).length === 0) {
      motivos.push(`El alias «${alias}» es muy corto: marcaría notas que no son del cliente (mínimo ${MIN_LARGO_TERMINO} letras).`)
    }
  }
  if (data.rut) {
    const m = motivoRutInvalido(data.rut)
    if (m) motivos.push(m)
  }
  return motivos
}

function aFecha(d: string | null | undefined): Date | null | undefined {
  if (d === undefined) return undefined
  return d === null ? null : new Date(`${d}T00:00:00Z`)
}

function tablaAusente(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  return code === 'P2021' || code === 'P2022'
}

const SIN_TABLAS = 'La tabla de clientes no existe todavía: falta aplicar la migración 20261125000000_aviso_clientes.'

router.get('/', async (_req, res) => {
  try {
    const clientes = await prisma.disclosureClient.findMany({ orderBy: [{ vertical: 'asc' }, { name: 'asc' }] })
    res.json({ data: clientes })
  } catch (err) {
    if (tablaAusente(err)) { res.status(503).json({ error: SIN_TABLAS }); return }
    log.error({ err }, 'no se pudo leer la lista de clientes')
    res.status(500).json({ error: 'No se pudo leer la lista' })
  }
})

router.post('/', async (req, res) => {
  const parsed = clienteSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }); return }
  const motivos = motivosDeRechazo(parsed.data)
  if (motivos.length) { res.status(422).json({ error: motivos.join(' '), motivos }); return }
  try {
    const { name, aliases, vertical, rut, endedOn } = parsed.data
    const cliente = await prisma.disclosureClient.create({
      data: { name, aliases, vertical, rut: rut || null, endedOn: aFecha(endedOn) ?? null },
    })
    invalidarListaDeClientes()
    await writeAuditLog({ actor: req.user, action: 'disclosure_client.create', targetType: 'disclosure_client', targetId: cliente.id, metadata: { to: parsed.data } })
    res.status(201).json(cliente)
  } catch (err) {
    if (tablaAusente(err)) { res.status(503).json({ error: SIN_TABLAS }); return }
    log.error({ err }, 'no se pudo crear el cliente')
    res.status(500).json({ error: 'No se pudo guardar' })
  }
})

router.patch('/:id', async (req, res) => {
  const parsed = clienteSchema.partial().safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }); return }
  const motivos = motivosDeRechazo(parsed.data)
  if (motivos.length) { res.status(422).json({ error: motivos.join(' '), motivos }); return }
  try {
    const antes = await prisma.disclosureClient.findUnique({ where: { id: req.params.id } })
    if (!antes) { res.status(404).json({ error: 'No existe' }); return }
    const { name, aliases, vertical, rut, endedOn } = parsed.data
    const cliente = await prisma.disclosureClient.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(aliases !== undefined && { aliases }),
        ...(vertical !== undefined && { vertical }),
        ...(rut !== undefined && { rut: rut || null }),
        ...(endedOn !== undefined && { endedOn: aFecha(endedOn) }),
      },
    })
    invalidarListaDeClientes()
    await writeAuditLog({ actor: req.user, action: 'disclosure_client.update', targetType: 'disclosure_client', targetId: cliente.id, metadata: { from: antes, to: parsed.data } })
    res.json(cliente)
  } catch (err) {
    if (tablaAusente(err)) { res.status(503).json({ error: SIN_TABLAS }); return }
    log.error({ err }, 'no se pudo editar el cliente')
    res.status(500).json({ error: 'No se pudo guardar' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const antes = await prisma.disclosureClient.findUnique({ where: { id: req.params.id } })
    if (!antes) { res.status(404).json({ error: 'No existe' }); return }
    await prisma.disclosureClient.delete({ where: { id: req.params.id } })
    invalidarListaDeClientes()
    await writeAuditLog({ actor: req.user, action: 'disclosure_client.delete', targetType: 'disclosure_client', targetId: antes.id, metadata: { from: antes } })
    res.status(204).end()
  } catch (err) {
    if (tablaAusente(err)) { res.status(503).json({ error: SIN_TABLAS }); return }
    log.error({ err }, 'no se pudo quitar el cliente')
    res.status(500).json({ error: 'No se pudo quitar' })
  }
})

router.get('/:id/notas', async (req, res) => {
  try {
    const notas = await notasQueMencionan(req.params.id)
    if (!notas) { res.status(404).json({ error: 'No existe' }); return }
    res.json({ data: notas })
  } catch (err) {
    if (tablaAusente(err)) { res.status(503).json({ error: SIN_TABLAS }); return }
    log.error({ err }, 'no se pudieron buscar las notas del cliente')
    res.status(500).json({ error: 'No se pudo buscar' })
  }
})

const descarteSchema = z.object({ reason: z.string().trim().min(5).max(500) })

router.put('/:id/notas/:storyId/descarte', async (req, res) => {
  const parsed = descarteSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Escribe el motivo (mínimo 5 letras).' }); return }
  const { id: clientId, storyId } = req.params
  const dismissedBy = req.user?.email ?? ''
  try {
    const descarte = await prisma.storyDisclosureDismissal.upsert({
      where: { storyId_clientId: { storyId, clientId } },
      create: { storyId, clientId, reason: parsed.data.reason, dismissedBy },
      update: { reason: parsed.data.reason, dismissedBy },
    })
    await writeAuditLog({ actor: req.user, action: 'disclosure.dismiss', targetType: 'story', targetId: storyId, metadata: { clientId, reason: parsed.data.reason } })
    res.json(descarte)
  } catch (err) {
    if (tablaAusente(err)) { res.status(503).json({ error: SIN_TABLAS }); return }
    if ((err as { code?: string }).code === 'P2003') { res.status(404).json({ error: 'No existe la nota o el cliente' }); return }
    log.error({ err }, 'no se pudo descartar')
    res.status(500).json({ error: 'No se pudo guardar' })
  }
})

router.delete('/:id/notas/:storyId/descarte', async (req, res) => {
  const { id: clientId, storyId } = req.params
  try {
    await prisma.storyDisclosureDismissal.deleteMany({ where: { storyId, clientId } })
    await writeAuditLog({ actor: req.user, action: 'disclosure.restore', targetType: 'story', targetId: storyId, metadata: { clientId } })
    res.status(204).end()
  } catch (err) {
    if (tablaAusente(err)) { res.status(503).json({ error: SIN_TABLAS }); return }
    log.error({ err }, 'no se pudo devolver el aviso')
    res.status(500).json({ error: 'No se pudo guardar' })
  }
})

export default router
