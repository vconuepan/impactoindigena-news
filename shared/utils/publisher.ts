// Derives the real publisher name from a story's source URL.
//
// Stories discovered via Google News search belong to feeds named
// "Google News", which is what readers used to see as the source. The real
// outlet lives in the sourceUrl hostname. A curated map prettifies well-known
// outlets; anything else falls back to the cleaned hostname. Only
// news.google.com URLs (rows where the real article URL was never resolved)
// fall back to the feed name — nothing better is available for those.
//
// KEEP IN SYNC: shared/utils/publisher.ts and server/src/lib/publisher.ts are
// twin copies. The server cannot import outside its tsconfig rootDir (src)
// without breaking the dist/ layout that deploys run on, so the function is
// duplicated deliberately. Mirror any change in BOTH files and BOTH tests.

const PUBLISHER_NAMES: Record<string, string> = {
  'elpais.com': 'El País',
  'elmostrador.cl': 'El Mostrador',
  'biobiochile.cl': 'BioBío Chile',
  'latercera.com': 'La Tercera',
  'emol.com': 'Emol',
  'cooperativa.cl': 'Cooperativa',
  'eldesconcierto.cl': 'El Desconcierto',
  'df.cl': 'Diario Financiero',
  'infobae.com': 'Infobae',
  'jornada.com.mx': 'La Jornada',
  'eluniversal.com.mx': 'El Universal',
  'mongabay.com': 'Mongabay',
  'es.mongabay.com': 'Mongabay',
  'news.mongabay.com': 'Mongabay',
  'theguardian.com': 'The Guardian',
  'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC',
  'aljazeera.com': 'Al Jazeera',
  'reuters.com': 'Reuters',
  'apnews.com': 'AP News',
  'dw.com': 'DW',
  'france24.com': 'France 24',
  'swissinfo.ch': 'Swissinfo',
  'telesurtv.net': 'teleSUR',
  'servindi.org': 'Servindi',
  'news.un.org': 'Noticias ONU',
  'survivalinternational.org': 'Survival International',
  'culturalsurvival.org': 'Cultural Survival',
  'amazonwatch.org': 'Amazon Watch',
  'iwgia.org': 'IWGIA',
  'debatesindigenas.org': 'Debates Indígenas',
}

export function publisherFromUrl(
  sourceUrl: string | null | undefined,
  feedName?: string | null,
): string {
  const fallback = feedName ?? ''
  if (!sourceUrl) return fallback

  let hostname: string
  try {
    hostname = new URL(sourceUrl).hostname.toLowerCase()
  } catch {
    return fallback
  }
  hostname = hostname.replace(/^www\./, '')

  // Aggregator hostnames mean the real article URL was never captured —
  // the feed name is the only signal left.
  if (hostname === 'news.google.com' || hostname === 'google.com') return fallback

  return PUBLISHER_NAMES[hostname] ?? hostname
}
