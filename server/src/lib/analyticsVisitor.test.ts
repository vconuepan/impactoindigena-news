import { describe, it, expect } from 'vitest'
import { deviceType, dailyVisitorHash, clientIpForAnalytics, isBot } from './analyticsVisitor.js'

describe('deviceType', () => {
  it('detects mobile', () => {
    expect(deviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('mobile')
    expect(deviceType('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36')).toBe('mobile')
  })
  it('detects tablet', () => {
    expect(deviceType('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1')).toBe('tablet')
    expect(deviceType('Mozilla/5.0 (Linux; Android 14; SM-X200) Safari/537.36')).toBe('tablet') // Android, no "mobile"
  })
  it('detects desktop', () => {
    expect(deviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1')).toBe('desktop')
    expect(deviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('desktop')
  })
  it('defaults to desktop for empty/unknown UA', () => {
    expect(deviceType('')).toBe('desktop')
    expect(deviceType(undefined)).toBe('desktop')
    expect(deviceType(null)).toBe('desktop')
  })
})

describe('dailyVisitorHash', () => {
  const day = '2026-07-20'
  it('is stable for the same visitor within a day', () => {
    expect(dailyVisitorHash('1.1.1.1', 'UA-x', day)).toBe(dailyVisitorHash('1.1.1.1', 'UA-x', day))
  })
  it('differs for different IPs', () => {
    expect(dailyVisitorHash('1.1.1.1', 'UA-x', day)).not.toBe(dailyVisitorHash('2.2.2.2', 'UA-x', day))
  })
  it('differs for different user-agents', () => {
    expect(dailyVisitorHash('1.1.1.1', 'UA-x', day)).not.toBe(dailyVisitorHash('1.1.1.1', 'UA-y', day))
  })
  it('rotates across days (no cross-day correlation)', () => {
    expect(dailyVisitorHash('1.1.1.1', 'UA-x', day)).not.toBe(dailyVisitorHash('1.1.1.1', 'UA-x', '2026-07-21'))
  })
  it('produces a 64-char hex sha256 digest', () => {
    expect(dailyVisitorHash('1.1.1.1', 'UA-x', day)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('isBot', () => {
  // Regression: Googlebot renders JS and fired /api/track like a browser, so a
  // sitemap sweep read as ~180 "visitors" on 23-jul-2026.
  it('flags the crawlers that actually execute JS', () => {
    expect(isBot('Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true)
    expect(isBot('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')).toBe(true)
    expect(isBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36')).toBe(true)
    expect(isBot('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36 Chrome-Lighthouse')).toBe(true)
  })

  it('flags AI fetchers, unfurlers and scripted clients', () => {
    expect(isBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot')).toBe(true)
    expect(isBot('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')).toBe(true)
    expect(isBot('WhatsApp/2.23.20.0')).toBe(true)
    expect(isBot('curl/8.4.0')).toBe(true)
    expect(isBot('python-requests/2.31.0')).toBe(true)
  })

  it('treats a missing User-Agent as a bot (every real browser sends one)', () => {
    expect(isBot(undefined)).toBe(true)
    expect(isBot('')).toBe(true)
  })

  it('does NOT flag real browsers — the false-positive guard', () => {
    // Desktop Chrome, macOS Safari, Windows Firefox, iPhone Safari, Android Chrome,
    // Edge, and the Facebook in-app browser (how readers arrive from FB on mobile).
    const humans = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/es_LA;FBOP/5]',
    ]
    for (const ua of humans) expect(isBot(ua), ua.slice(0, 60)).toBe(false)
  })
})

describe('clientIpForAnalytics', () => {
  // La cadena real detras de Static Web Apps: «lector[:puerto], salida-del-proxy».
  // El lector es la penultima entrada (CLIENT_IP_FROM_RIGHT = 2, el valor de produccion).
  const DESDE_LA_DERECHA = 2

  // Regresion del 23-jul: con req.ip a secas todos los visitantes salian «NL».
  it('toma al lector, no la salida del proxy', () => {
    expect(clientIpForAnalytics('190.20.30.40, 10.0.0.1', '10.0.0.1', DESDE_LA_DERECHA)).toBe('190.20.30.40')
  })

  // EL DEFECTO DEL 20-NOV: un robot que antepone su propio X-Forwarded-For
  // fabricaba un visitante y un pais nuevos por peticion.
  it('ignora lo que el cliente antepone en X-Forwarded-For', () => {
    expect(clientIpForAnalytics('8.8.8.8, 190.20.30.40, 10.0.0.1', '10.0.0.1', DESDE_LA_DERECHA)).toBe('190.20.30.40')
    expect(clientIpForAnalytics('1.1.1.1, 9.9.9.9, 190.20.30.40, 10.0.0.1', '10.0.0.1', DESDE_LA_DERECHA)).toBe('190.20.30.40')
  })
  it('dos IP inventadas distintas dan el mismo lector (el mismo hash del dia)', () => {
    const a = clientIpForAnalytics('5.5.5.5, 190.20.30.40, 10.0.0.1', '10.0.0.1', DESDE_LA_DERECHA)!
    const b = clientIpForAnalytics('6.6.6.6, 190.20.30.40, 10.0.0.1', '10.0.0.1', DESDE_LA_DERECHA)!
    expect(dailyVisitorHash(a, 'Mozilla/5.0', '2026-11-20')).toBe(dailyVisitorHash(b, 'Mozilla/5.0', '2026-11-20'))
  })
  it('quita el puerto que agrega Static Web Apps (ip:puerto)', () => {
    expect(clientIpForAnalytics('190.20.30.40:51840, 10.0.0.1', '10.0.0.1', DESDE_LA_DERECHA)).toBe('190.20.30.40')
  })
  it('IPv6 entre corchetes con puerto, agrupada al /64', () => {
    expect(clientIpForAnalytics('[2001:db8:aaaa:1::7]:443, 10.0.0.1', '10.0.0.1', DESDE_LA_DERECHA)).toBe('2001:db8:aaaa:1::')
  })
  it('dos IPv6 del mismo /64 cuentan como el mismo lector', () => {
    const a = clientIpForAnalytics('2001:db8:aaaa:1::7, 10.0.0.1', '10.0.0.1', DESDE_LA_DERECHA)
    const b = clientIpForAnalytics('2001:db8:aaaa:1:ffff::9, 10.0.0.1', '10.0.0.1', DESDE_LA_DERECHA)
    expect(a).toBe(b)
  })
  it('vuelve a req.ip si la cadena es mas corta de lo esperado o falta', () => {
    expect(clientIpForAnalytics('190.20.30.40', '10.0.0.9', DESDE_LA_DERECHA)).toBe('10.0.0.9')
    expect(clientIpForAnalytics(undefined, '10.0.0.9', DESDE_LA_DERECHA)).toBe('10.0.0.9')
    expect(clientIpForAnalytics('', '10.0.0.9', DESDE_LA_DERECHA)).toBe('10.0.0.9')
  })
  it('vuelve a req.ip si la entrada elegida no es una IP', () => {
    expect(clientIpForAnalytics('basura, 10.0.0.1', '10.0.0.9', DESDE_LA_DERECHA)).toBe('10.0.0.9')
  })
  it('con CLIENT_IP_FROM_RIGHT=0 (apagado) usa req.ip, igual que los limitadores', () => {
    expect(clientIpForAnalytics('190.20.30.40, 10.0.0.1', '10.0.0.9', 0)).toBe('10.0.0.9')
  })
  it('acepta la cabecera en forma de arreglo', () => {
    expect(clientIpForAnalytics(['190.20.30.40, 10.0.0.1'], '10.0.0.1', DESDE_LA_DERECHA)).toBe('190.20.30.40')
  })
})
