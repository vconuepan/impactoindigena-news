import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE } from '../lib/api'

interface CurationStats {
  crawled24h: number
  published24h: number
  activeFeeds: number
}

/**
 * Cifras con la cantidad de digitos habitual (567 · 29 · 129 el 6-oct-2026):
 * solo dan ancho a la frase invisible que reserva el espacio, nunca se ven.
 */
export const CIFRAS_DE_RESERVA: CurationStats = { crawled24h: 888, published24h: 88, activeFeeds: 888 }

/** La frase de la barra. La misma para el hueco y para los datos, o no medirian igual. */
function Frase({
  stats,
  num,
  t,
  invisible = false,
}: {
  stats: CurationStats
  num: (n: number) => string
  t: (k: string) => string
  invisible?: boolean
}) {
  return (
    <p className={`text-[11px] tracking-wide text-white/75 px-4${invisible ? ' invisible' : ''}`}>
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
  )
}

export default function CurationStatsBar() {
  const [stats, setStats] = useState<CurationStats | null>(null)
  const { t, i18n } = useTranslation()

  useEffect(() => {
    // API_BASE y no '/api' a secas: con la ruta relativa la barra ignoraba
    // VITE_API_URL y, en local contra otro backend, quedaba siempre vacia.
    // (El tracking de usePageTracking SI va relativo a proposito: en local no
    // debe contar visitas en la analitica de produccion.)
    fetch(`${API_BASE}/stats/daily`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: CurationStats) => setStats(data))
      .catch(() => {})
  }, [])

  // El espacio se reserva desde el primer render, aunque todavia no haya datos.
  //
  // Antes esto devolvia null y la barra APARECIA cuando /api/stats/daily
  // respondia, empujando hacia abajo el header y toda la pagina: medido con
  // Lighthouse, era el segundo desplazamiento de la portada. Un elemento que
  // vive ENCIMA del contenido no puede aparecer tarde.
  //
  // Y no basta con reservar UNA linea. En movil la frase real ocupa DOS (a 412 px
  // la barra mide 47,75 px, no 30): el hueco de una linea era el desplazamiento
  // de 0,021 que Lighthouse atribuia a <main> y que quedo «sin causa» el 5-sep.
  // Peor: la portada prerenderizada trae la barra con datos, React la reemplaza
  // por el hueco de una linea, el hero sube 18 px a otra posicion fraccionaria,
  // su area visible sale 52 px² MAYOR y Chrome emite un candidato a LCP nuevo,
  // el de React, que ata el LCP al JS y a los datos (traza del 6-oct-2026).
  //
  // Por eso el hueco es la MISMA frase, invisible, con cifras de magnitud
  // tipica: parte las lineas igual que la real en cualquier ancho y la barra
  // mide lo mismo antes y despues de los datos. Si la peticion falla, se queda
  // asi y no mueve nada.
  if (!stats) {
    return (
      <div
        className="w-full py-1.5 text-center font-dm-sans"
        style={{ backgroundColor: '#0D5F3C' }}
        aria-hidden="true"
      >
        <Frase stats={CIFRAS_DE_RESERVA} num={(n) => String(n)} invisible t={t} />
      </div>
    )
  }

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
      <Frase stats={stats} num={num} t={t} />
    </div>
  )
}
