import { describe, it, expect } from 'vitest'
import { classifyUserAgent, TOKENS_DE_ROBOT } from './uaFamily.js'
import { isBot } from './analyticsVisitor.js'

// La lista que tenia analyticsVisitor.ts hasta el 20-nov-2026. Reorganizarla en
// familias no puede dejar de reconocer ningun robot: si uno de estos dejara de
// ser robot, volveria a inflar el panel.
const LISTA_ANTERIOR = [
  'bot', 'crawler', 'spider', 'crawling', 'slurp',
  'googlebot', 'adsbot', 'mediapartners', 'apis-google', 'feedfetcher',
  'google-inspectiontool', 'storebot-google', 'bingpreview', 'yandex',
  'baiduspider', 'applebot', 'semrush', 'ahrefs', 'mj12', 'dotbot', 'petal',
  'dataforseo', 'screaming frog', 'sitebulb', 'serpstat',
  'gptbot', 'chatgpt-user', 'oai-searchbot', 'claudebot', 'claude-web',
  'anthropic-ai', 'perplexity', 'ccbot', 'bytespider', 'amazonbot',
  'meta-externalagent', 'applebot-extended',
  'facebookexternalhit', 'facebot', 'twitterbot', 'slackbot', 'discordbot',
  'telegrambot', 'whatsapp', 'linkedinbot', 'embedly', 'redditbot', 'skypeuripreview',
  'headlesschrome', 'phantomjs', 'puppeteer', 'playwright', 'chrome-lighthouse',
  'pagespeed', 'gtmetrix', 'pingdom', 'uptimerobot', 'python-requests', 'scrapy',
  'curl/', 'wget', 'go-http-client', 'okhttp', 'java/', 'node-fetch', 'axios/',
  'libwww-perl', 'httpclient', 'guzzle',
]

describe('classifyUserAgent', () => {
  it('reconoce como robot todo lo que la lista anterior reconocia', () => {
    for (const t of LISTA_ANTERIOR) {
      expect(TOKENS_DE_ROBOT, `se perdio el token «${t}»`).toContain(t)
      expect(isBot(`Mozilla/5.0 (compatible; ${t}/1.0)`), t).toBe(true)
    }
  })

  it.each([
    ['Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'buscador', 'Googlebot'],
    ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'buscador', 'Bingbot'],
    ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)', 'ia_busqueda', 'OAI-SearchBot'],
    ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot', 'ia_busqueda', 'ChatGPT-User'],
    ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)', 'ia_busqueda', 'Claude-User'],
    ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot', 'ia_entrenamiento', 'GPTBot'],
    ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', 'ia_entrenamiento', 'ClaudeBot'],
    ['Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)', 'ia_entrenamiento', 'Bytespider'],
    ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'vista_previa', 'Facebook'],
    ['WhatsApp/2.23.20.0', 'vista_previa', 'WhatsApp'],
    ['TelegramBot (like TwitterBot)', 'vista_previa', 'Telegram'],
    ['LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)', 'vista_previa', 'LinkedIn'],
    ['Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)', 'seo_monitoreo', 'AhrefsBot'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36 Chrome-Lighthouse', 'seo_monitoreo', 'Lighthouse'],
    ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36', 'automatizacion', 'HeadlessChrome'],
    ['python-requests/2.31.0', 'automatizacion', 'python-requests'],
    ['curl/8.4.0', 'automatizacion', 'curl'],
    ['Mozilla/5.0 (compatible; MiRastreador/1.0; +https://example.com/bot)', 'otro_robot', 'otro (bot)'],
  ])('%s → %s', (ua, family, agent) => {
    expect(classifyUserAgent(ua)).toEqual({ family, agent })
  })

  it('un UA vacio, ausente o solo espacios es «sin_ua»', () => {
    expect(classifyUserAgent(undefined).family).toBe('sin_ua')
    expect(classifyUserAgent(null).family).toBe('sin_ua')
    expect(classifyUserAgent('').family).toBe('sin_ua')
    expect(classifyUserAgent('   ').family).toBe('sin_ua')
  })

  it('los navegadores reales son «navegador», sin nombre de agente', () => {
    for (const ua of [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      // El navegador dentro de la app de Facebook: lector real, no vista previa.
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/es_LA;FBOP/5]',
    ]) {
      expect(classifyUserAgent(ua)).toEqual({ family: 'navegador', agent: '' })
    }
  })
})
