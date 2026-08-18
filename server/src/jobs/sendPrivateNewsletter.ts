import { createLogger } from '../lib/logger.js'
import prisma from '../lib/prisma.js'
import { getLLMByTier, rateLimitDelay } from '../services/llm.js'
import { HumanMessage } from '@langchain/core/messages'
import { generateHtmlContent } from '../services/newsletter.js'
import * as brevo from '../services/brevo.js'

const log = createLogger('send_private_newsletter')

const PRIVATE_EMAIL = process.env.PRIVATE_NEWSLETTER_EMAIL || ''

const PRIVATE_INTERESTS = `
1. Debida diligencia indígena en Latinoamérica
2. Minería y pueblos indígenas en las Américas, Australia y Nueva Zelanda
3. Industria acuícola y pueblos indígenas a nivel global
4. Industria energética y pueblos indígenas a nivel global
5. Consentimiento Libre, Previo e Informado (CLPI)
6. Empresas indígenas de Australia, Canadá, Nueva Zelanda, Estados Unidos y Latinoamérica
7. Política indígena de Chile, especialmente pueblo Mapuche, Likanantai y política pública del Gobierno
`

export async function runSendPrivateNewsletter(): Promise<void> {
  log.info('starting private newsletter job')

  // Sin destinatario no hay nada que hacer, y se aborta ANTES de generar: armar
  // el boletin cuesta llamadas al LLM que no se pueden entregar a nadie. Falla
  // fuerte a proposito, para que quede visible en job_runs en vez de correr en
  // vacio cada dia.
  if (!PRIVATE_EMAIL) {
    throw new Error('PRIVATE_NEWSLETTER_EMAIL no esta configurada: el boletin privado no tiene destinatario')
  }

  // Verificar que no se haya enviado uno hoy
  const today = new Date()
  const startOfDay = new Date(today)
  startOfDay.setHours(0, 0, 0, 0)

  const existing = await prisma.newsletter.findFirst({
    where: {
      title: { contains: '[PRIVADO]' },
      createdAt: { gte: startOfDay },
      status: 'published',
    },
  })
  if (existing) {
    log.info('private newsletter already sent today, skipping')
    return
  }

  // Buscar las historias publicadas en los últimos 2 días con mayor relevancia
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000)
  const stories = await prisma.story.findMany({
    where: {
      status: 'published',
      datePublished: { gte: since },
      relevance: { gte: 6 },
      title: { not: null },
      summary: { not: null },
    },
    select: {
      id: true,
      title: true,
      sourceTitle: true,
      sourceUrl: true,
      slug: true,
      summary: true,
      relevanceSummary: true,
      relevanceReasons: true,
      antifactors: true,
      marketingBlurb: true,
      quote: true,
      quoteAttribution: true,
      emotionTag: true,
      relevance: true,
      issue: { select: { name: true, slug: true } },
      feed: { select: { title: true, displayTitle: true } },
    },
    orderBy: { relevance: 'desc' },
    take: 50,
  })

  if (stories.length === 0) {
    log.info('no high-relevance stories found for private newsletter')
    return
  }

  // Usar LLM para seleccionar y priorizar según intereses personales
  const llm = getLLMByTier('large')
  const storiesJson = stories.map(s => ({
    id: s.id,
    title: s.title || s.sourceTitle,
    summary: s.summary,
    issue: s.issue?.name || s.feed?.title || 'General',
    relevance: s.relevance,
  }))

  const selectionPrompt = `Eres un asistente experto en asuntos indígenas. Tu tarea es seleccionar las 12 noticias MÁS RELEVANTES para alguien con estos intereses profesionales específicos:

${PRIVATE_INTERESTS}

INSTRUCCIONES ESTRICTAS:
- Solo incluye noticias que tengan relación DIRECTA con alguno de los 7 intereses listados
- Si una noticia no tiene relación clara con ningún interés, EXCLÚYELA aunque sea interesante
- Prioriza noticias sobre Chile, Latinoamérica, Australia, Nueva Zelanda y Canadá cuando sea relevante
- Para política indígena de Chile: solo incluir si menciona explícitamente pueblo Mapuche, Likanantai, o política pública del Gobierno de Chile
- Selecciona entre 8 y 12 noticias — si no hay suficientes relevantes, selecciona menos

Noticias disponibles (en JSON):
${JSON.stringify(storiesJson, null, 2)}

Responde SOLO con un JSON con este formato exacto, sin texto adicional:
{"selectedIds": ["id1", "id2", ...], "reasoning": "explicación breve de por qué seleccionaste cada una"}`

  await rateLimitDelay()
  const response = await llm.invoke([new HumanMessage(selectionPrompt)])
  const responseText = response.content as string

  let selectedIds: string[] = []
  try {
    const clean = responseText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    selectedIds = parsed.selectedIds || []
    log.info({ reasoning: parsed.reasoning }, 'LLM selection reasoning')
  } catch {
    log.warn('failed to parse LLM response, using top stories by relevance')
    selectedIds = stories.slice(0, 12).map(s => s.id)
  }

  // Filtrar solo IDs válidos
  const validIds = selectedIds.filter(id => stories.find(s => s.id === id))
  if (validIds.length === 0) {
    validIds.push(...stories.slice(0, 12).map(s => s.id))
  }

  // Crear newsletter privado
  const title = `[PRIVADO] Impacto Indígena — ${today.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
  const newsletter = await prisma.newsletter.create({
    data: {
      title,
      storyIds: validIds,
      selectedStoryIds: validIds,
    },
  })

  // Generar contenido personalizado según intereses profesionales
  const selectedStories = await prisma.story.findMany({
    where: { id: { in: validIds } },
    select: {
      id: true, title: true, sourceTitle: true, sourceUrl: true, slug: true,
      summary: true, relevanceSummary: true, marketingBlurb: true,
      quote: true, quoteAttribution: true, relevance: true,
      feed: { select: { title: true, displayTitle: true } },
    },
  })

  // Agrupar por interés profesional usando LLM
  const groupPrompt = `Eres un experto en asuntos indígenas. Clasifica cada noticia según estos intereses profesionales:
1. Debida Diligencia Indígena
2. Minería y Pueblos Indígenas
3. Industria Acuícola
4. Industria Energética
5. Consentimiento Libre Previo e Informado (CLPI)
6. Empresas Indígenas
7. Política Indígena Chile

Noticias:
${selectedStories.map(s => `- ID: ${s.id} | Título: ${s.title || s.sourceTitle} | Resumen: ${s.summary}`).join('\n')}

Responde SOLO con JSON sin texto adicional:
{"groups": {"Debida Diligencia Indígena": ["id1","id2"], "Minería y Pueblos Indígenas": ["id3"], ...}}`

  await rateLimitDelay()
  const groupResponse = await llm.invoke([new HumanMessage(groupPrompt)])
  let groups: Record<string, string[]> = {}
  try {
    const clean = (groupResponse.content as string).replace(/```json|```/g, '').trim()
    groups = JSON.parse(clean).groups || {}
  } catch {
    groups = { 'Noticias Relevantes': validIds }
  }

  // Construir contenido markdown agrupado por interés
  let content = `**Newsletter Privado — ${today.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}**\n\n---\n\n`

  const storyMap = new Map(selectedStories.map(s => [s.id, s]))
  for (const [groupName, ids] of Object.entries(groups)) {
    if (!ids || ids.length === 0) continue
    content += `# ${groupName}\n\n`
    for (const id of ids) {
      const story = storyMap.get(id)
      if (!story) continue
      const publisher = story.feed?.displayTitle || story.feed?.title || 'Fuente'
      const relevanceUrl = story.slug ? `https://impactoindigena.news/stories/${story.slug}` : ''
      content += `## ${story.title || story.sourceTitle}\n`
      content += `${publisher} · [artículo original](${story.sourceUrl})`
      if (relevanceUrl) content += ` · [análisis](${relevanceUrl})`
      content += `\n\n`
      const body = story.relevanceSummary || story.marketingBlurb || story.summary || ''
      if (body) content += `${body}\n\n`
      if (story.quote && story.quoteAttribution) {
        content += `> "${story.quote}"\n> — ${story.quoteAttribution}\n\n`
      }
    }
    content += `---\n\n`
  }

  await prisma.newsletter.update({
    where: { id: newsletter.id },
    data: { content: content.trim(), selectedStoryIds: validIds },
  })

  await generateHtmlContent(newsletter.id)

  // Obtener el HTML generado
  const updated = await prisma.newsletter.findUnique({ where: { id: newsletter.id } })
  if (!updated?.html) throw new Error('No HTML generated')

  // Enviar directo al email privado
  await brevo.sendTransactional({
    to: PRIVATE_EMAIL,
    subject: title,
    body: updated.html,
  })

  // Marcar como publicado
  await prisma.newsletter.update({
    where: { id: newsletter.id },
    data: { status: 'published' },
  })

  log.info({ newsletterId: newsletter.id, storyCount: validIds.length }, 'private newsletter ready')
  log.info('private newsletter job complete')
}
