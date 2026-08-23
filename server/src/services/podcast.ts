// @ts-nocheck
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { uploadImageToR2 } from '../lib/imageStorage.js'
import OpenAI, { AzureOpenAI } from 'openai'
import { config } from '../config.js'

const log = createLogger('podcast-service')

const INTRO = `Bienvenidos a Voces Indígenas, el podcast donde cubrimos las noticias más importantes sobre pueblos indígenas alrededor del mundo. Soy tu presentador y hoy te traemos las historias más relevantes del día.`

const OUTRO = `Eso es todo por hoy en Voces Indígenas. Si quieres leer estas noticias completas, visita vocesindigenas.org. Gracias por escucharnos y hasta la próxima.`

function createOpenAIClient(): OpenAI {
  if (config.llm.provider === 'azure') {
    return new AzureOpenAI({
      endpoint: config.llm.azure.endpoint,
      apiKey: config.llm.azure.apiKey,
      apiVersion: config.llm.azure.apiVersion,
      deployment: config.llm.azure.deployments.large,
    })
  }
  return new OpenAI()
}

function createTTSClient(): OpenAI {
  if (config.llm.provider === 'azure') {
    return new AzureOpenAI({
      endpoint: config.llm.azure.endpoint,
      apiKey: config.llm.azure.apiKey,
      apiVersion: config.llm.azure.apiVersion,
      deployment: config.llm.azure.deployments.tts,
    })
  }
  return new OpenAI()
}

async function generateEpisodeScript(
  stories: Array<{ title: string; summary: string; relevanceReasons: string }>,
  episodeNumber: number,
): Promise<{ title: string; description: string; script: string }> {
  const openai = createOpenAIClient()

  const storiesText = stories
    .map(
      (s, i) =>
        `Noticia ${i + 1}: ${s.title}\nResumen: ${s.summary}\nPor qué importa: ${s.relevanceReasons}`,
    )
    .join('\n\n')

  const prompt = `Eres el presentador del podcast "Voces Indígenas", un medio de noticias sobre pueblos indígenas.

Tienes ${stories.length} noticias para narrar en este episodio. Crea un script de podcast en español que:
1. Sea natural y conversacional, como si hablaras directamente al oyente
2. Para cada noticia: introduce el tema, explica qué pasó, por qué importa para los pueblos indígenas
3. Usa transiciones naturales entre noticias
4. Total aproximado: 4-6 minutos de audio (600-900 palabras)
5. NO incluyas intro ni outro, solo el cuerpo de las noticias

Noticias:
${storiesText}

Responde SOLO en JSON sin markdown:
{
  "title": "título del episodio (máximo 60 caracteres)",
  "description": "descripción del episodio (máximo 200 caracteres)",
  "script": "el script completo listo para leer"
}`

  const response = await openai.chat.completions.create({
    model: config.llm.models.large.name,
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 2000,
  })

  const text = response.choices[0]?.message?.content || ''
  const clean = text.replace(/```json|```/g, '').trim()

  try {
    const parsed = JSON.parse(clean)
    return {
      title: parsed.title || `Voces Indígenas - Episodio ${episodeNumber}`,
      description: parsed.description || 'Las noticias más importantes sobre pueblos indígenas.',
      script: parsed.script || '',
    }
  } catch {
    return {
      title: `Voces Indígenas - Episodio ${episodeNumber}`,
      description: 'Las noticias más importantes sobre pueblos indígenas.',
      script: storiesText,
    }
  }
}

async function generateAudio(script: string): Promise<Buffer> {
  const openai = createTTSClient()

  const fullScript = `${INTRO}\n\n${script}\n\n${OUTRO}`

  log.info({ scriptLength: fullScript.length }, 'generating TTS audio')

  const MAX_CHARS = 4000
  const parts: string[] = []

  if (fullScript.length <= MAX_CHARS) {
    parts.push(fullScript)
  } else {
    const paragraphs = fullScript.split('\n\n')
    let current = ''
    for (const para of paragraphs) {
      if ((current + para).length > MAX_CHARS) {
        if (current) parts.push(current.trim())
        current = para + '\n\n'
      } else {
        current += para + '\n\n'
      }
    }
    if (current.trim()) parts.push(current.trim())
  }

  log.info({ parts: parts.length }, 'TTS parts to generate')

  const audioBuffers: Buffer[] = []

  for (const part of parts) {
    const response = await openai.audio.speech.create({
      model: 'tts-1-hd',
      voice: (config.podcast?.voice || 'nova') as 'nova' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'shimmer',
      input: part,
      response_format: 'mp3',
      speed: 0.95,
    })

    const arrayBuffer = await response.arrayBuffer()
    audioBuffers.push(Buffer.from(arrayBuffer))
  }

  return Buffer.concat(audioBuffers)
}

export async function generateDraft(storyIds?: string[]): Promise<{ id: string }> {
  log.info({ storyIds }, 'generating podcast draft')

  let stories
  if (storyIds && storyIds.length > 0) {
    stories = await prisma.story.findMany({
      where: { id: { in: storyIds } },
      select: { id: true, title: true, summary: true, relevanceReasons: true },
    })
  } else {
    stories = await prisma.story.findMany({
      where: {
        status: 'published',
        summary: { not: null },
        relevanceReasons: { not: null },
      },
      orderBy: [{ relevance: 'desc' }, { datePublished: 'desc' }],
      take: config.podcast?.storiesPerEpisode || 4,
      select: { id: true, title: true, summary: true, relevanceReasons: true },
    })
  }

  if (stories.length === 0) throw new Error('No stories available for podcast')

  const episodeCount = await prisma.podcast.count()
  const episodeNumber = episodeCount + 1

  const { title, description, script } = await generateEpisodeScript(
    stories.map((s) => ({
      title: s.title || '',
      summary: s.summary || '',
      relevanceReasons: s.relevanceReasons || '',
    })),
    episodeNumber,
  )

  const podcast = await prisma.podcast.create({
    data: {
      title,
      description,
      script,
      episodeNumber,
      storyIds: stories.map((s) => s.id),
      status: 'draft',
    },
  })

  log.info({ podcastId: podcast.id, episodeNumber, storyCount: stories.length }, 'podcast draft created')
  return { id: podcast.id }
}

export async function publishPodcast(podcastId: string): Promise<unknown> {
  const podcast = await prisma.podcast.findUnique({ where: { id: podcastId } })
  if (!podcast) throw new Error('Podcast not found')
  if (podcast.status !== 'draft') throw new Error('Can only publish draft podcasts')

  log.info({ podcastId }, 'generating audio for podcast')

  try {
    const audioBuffer = await generateAudio(podcast.script)

    const filename = `podcast-${podcast.episodeNumber || podcast.id}-${Date.now()}.mp3`
    const audioUrl = await uploadImageToR2(audioBuffer, filename, 'audio/mpeg')

    const wordCount = podcast.script.split(' ').length
    const duration = Math.round((wordCount / 150) * 60)

    const updated = await prisma.podcast.update({
      where: { id: podcastId },
      data: {
        audioUrl,
        duration,
        status: 'published',
        publishedAt: new Date(),
      },
    })

    log.info({ podcastId, audioUrl, duration }, 'podcast published')
    return updated
  } catch (err) {
    log.error({ err, podcastId }, 'failed to publish podcast')
    throw err
  }
}
