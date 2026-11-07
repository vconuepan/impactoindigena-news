import { createLogger } from '../lib/logger.js'
import prisma from '../lib/prisma.js'
import {
  createNewsletter,
  assignStories,
  selectStoriesForNewsletter,
  generateContent,
  generateHtmlContent,
  sendLive,
  refrescarEnviosRecientes,
} from '../services/newsletter.js'

const log = createLogger('send_newsletter')

export async function runSendNewsletter(): Promise<void> {
  log.info('starting daily newsletter job')

  // Crear newsletter con fecha de hoy
  const today = new Date()
  const title = `Voces Indígenas — ${today.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`

  // Verificar que no se haya enviado uno hoy ya
  const startOfDay = new Date(today)
  startOfDay.setHours(0, 0, 0, 0)
  const existing = await prisma.newsletter.findFirst({
    where: { createdAt: { gte: startOfDay }, status: 'published' },
  })
  if (existing) {
    log.info('newsletter already sent today, skipping')
    return
  }

  // Pipeline completo
  const newsletter = await createNewsletter({ title })
  log.info({ newsletterId: newsletter.id }, 'newsletter created')

  await assignStories(newsletter.id)
  log.info({ newsletterId: newsletter.id }, 'stories assigned')

  await selectStoriesForNewsletter(newsletter.id)
  log.info({ newsletterId: newsletter.id }, 'stories selected')

  await generateContent(newsletter.id)
  log.info({ newsletterId: newsletter.id }, 'content generated')

  await generateHtmlContent(newsletter.id)
  log.info({ newsletterId: newsletter.id }, 'html generated')

  await sendLive(newsletter.id)
  log.info({ newsletterId: newsletter.id }, 'newsletter sent!')

  // Marcar como publicado
  await prisma.newsletter.update({
    where: { id: newsletter.id },
    data: { status: 'published' },
  })

  // Al terminar, la edición nueva pone al día a las anteriores: estado `sent`
  // con la hora de Brevo, y aperturas y clics. Si Brevo falla, el envío ya está
  // hecho: no se marca el job como fallido por esto.
  try {
    const refresco = await refrescarEnviosRecientes()
    log.info(refresco, 'métricas de envíos recientes al día')
  } catch (err) {
    log.warn({ err }, 'no se pudieron refrescar las métricas de los envíos recientes')
  }

  log.info('daily newsletter job complete')
}
