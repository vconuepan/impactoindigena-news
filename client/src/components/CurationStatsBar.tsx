import { useEffect, useState } from 'react'

interface DailyStats {
  crawledToday: number
  publishedToday: number
  activeFeeds: number
}

export default function CurationStatsBar() {
  const [stats, setStats] = useState<DailyStats | null>(null)

  useEffect(() => {
    fetch('/api/stats/daily')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: DailyStats) => setStats(data))
      .catch(() => {})
  }, [])

  if (!stats) return null

  return (
    <div
      className="w-full py-1.5 text-center font-dm-sans"
      style={{ backgroundColor: '#0D5F3C' }}
      role="complementary"
      aria-label="Estadísticas de curaduría"
    >
      <p className="text-[11px] tracking-wide text-white/75 px-4">
        Hoy:{' '}
        <strong className="text-white font-semibold not-italic">
          {stats.crawledToday.toLocaleString('es')}
        </strong>{' '}
        artículos analizados
        <span className="mx-2 opacity-40" aria-hidden="true">·</span>
        <strong className="text-white font-semibold not-italic">
          {stats.publishedToday.toLocaleString('es')}
        </strong>{' '}
        seleccionados
        <span className="mx-2 opacity-40" aria-hidden="true">·</span>
        <strong className="text-white font-semibold not-italic">
          {stats.activeFeeds.toLocaleString('es')}
        </strong>{' '}
        fuentes activas
      </p>
    </div>
  )
}
