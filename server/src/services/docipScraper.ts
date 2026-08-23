import axios from 'axios'
import * as cheerio from 'cheerio'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { normalizeUrl } from '../utils/urlNormalization.js'

const log = createLogger('docip-scraper')

const DOCIP_NEWS_URL = 'https://www.docip.org/en/our-services-solutions/news/'
const DOCIP_FEED_ID = process.env.DOCIP_FEED_ID || ''

export async function scrapeDOCIP(): Promise<void> {
  log.info('starting DOCIP scraper')

  // Obtener el feed de DOCIP en la base de datos
  let feed = await prisma.feed.findFirst({
    where: { rssUrl: DOCIP_NEWS_URL }
  })

  if (!feed) {
    log.warn('DOCIP feed not found in database, skipping')
    return
  }

  // Descargar la página de noticias
  const response = await axios.get(DOCIP_NEWS_URL, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; VocesIndigenas/1.0)',
      'Accept-Language': 'en',
    }
  })

  const $ = cheerio.load(response.data)
  const items: { url: string; title: string; description: string; date: string }[] = []

  // Extraer noticias — DOCIP usa estructura de lista con enlaces
  $('a').each((_, el) => {
    const href = $(el).attr('href')
    const title = $(el).text().trim()
    if (
      href &&
      title.length > 20 &&
      (href.includes('/news/') || href.includes('/single-news/')) &&
      !href.includes('#')
    ) {
      const fullUrl = href.startsWith('http') ? href : `https://www.docip.org${href}`
      items.push({
        url: normalizeUrl(fullUrl),
        title,
        description: '',
        date: new Date().toISOString(),
      })
    }
  })

  log.info({ itemCount: items.length }, 'found DOCIP items')

  // Deduplicar contra lo que ya existe
  const urls = items.map(i => i.url)
  const existing = await prisma.story.findMany({
    where: { sourceUrl: { in: urls } },
    select: { sourceUrl: true }
  })
  const existingSet = new Set(existing.map(s => s.sourceUrl))
  const newItems = items.filter(i => !existingSet.has(i.url))

  log.info({ newCount: newItems.length }, 'new DOCIP items to save')

  // Guardar nuevas historias
  for (const item of newItems) {
    try {
      await prisma.story.create({
        data: {
          sourceUrl: item.url,
          sourceTitle: item.title,
          sourceContent: item.description || item.title,
          feedId: feed.id,
          sourceDatePublished: new Date(item.date),
        }
      })
      log.info({ url: item.url }, 'saved DOCIP item')
    } catch (err: any) {
      if (err.code === 'P2002') continue // ya existe
      log.error({ err, url: item.url }, 'failed to save DOCIP item')
    }
  }

  // Actualizar última vez crawleado
  await prisma.feed.update({
    where: { id: feed.id },
    data: { lastCrawledAt: new Date(), lastSuccessfulCrawlAt: new Date() }
  })

  log.info('DOCIP scraper complete')
}
