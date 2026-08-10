import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface CurationStats {
  crawled24h: number
  published24h: number
  activeFeeds: number
}

export default function CurationStatsBar() {
  const [stats, setStats] = useState<CurationStats | null>(null)
  const { t, i18n } = useTranslation()

  useEffect(() => {
    fetch('/api/stats/daily')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: CurationStats) => setStats(data))
      .catch(() => {})
  }, [])

  if (!stats) return null

  const num = (n: number) => n.toLocaleString(i18n.language === 'en' ? 'en' : 'es')

  return (
    <div
      className="w-full py-1.5 text-center font-dm-sans"
      style={{ backgroundColor: '#0D5F3C' }}
      role="complementary"
      aria-label={t('curationStats.ariaLabel')}
    >
      {/* text-white/75 sobre #0D5F3C da 5.12:1 — pasa AA a 11px. No bajar de /70
          (0.65 cae a 4.26:1 y falla). */}
      <p className="text-[11px] tracking-wide text-white/75 px-4">
        {t('curationStats.window')}{' '}
        <strong className="text-white font-semibold not-italic">
          {num(stats.crawled24h)}
        </strong>{' '}
        {t('curationStats.analyzed')}
        <span className="mx-2 opacity-40" aria-hidden="true">·</span>
        <strong className="text-white font-semibold not-italic">
          {num(stats.published24h)}
        </strong>{' '}
        {t('curationStats.selected')}
        <span className="mx-2 opacity-40" aria-hidden="true">·</span>
        <strong className="text-white font-semibold not-italic">
          {num(stats.activeFeeds)}
        </strong>{' '}
        {t('curationStats.sources')}
      </p>
    </div>
  )
}
