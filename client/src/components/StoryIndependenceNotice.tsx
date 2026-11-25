import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { IndependenceNotice } from '@shared/types'

const DOMINIO: Record<IndependenceNotice['verticals'][number], string> = {
  ai: 'impactoindigena.ai',
  legal: 'impactoindigena.legal',
}

/**
 * Regla 2 de la independencia editorial (director, 25-nov-2026): el medio avisa
 * cuando una nota informa sobre un cliente de impactoindigena.ai o de
 * impactoindigena.legal. El aviso es genérico por decisión del director: dice de
 * qué parte de Impacto Indígena es cliente, nunca qué organización. Va antes del
 * cuerpo, para que se lea antes que la nota y no al final.
 */
export function StoryIndependenceNotice({ notice }: { notice: IndependenceNotice }) {
  const { t } = useTranslation()
  if (notice.verticals.length === 0) return null
  const verticals = notice.verticals.map((v) => DOMINIO[v]).join(t('storyPage.independence.and'))
  const clave = `storyPage.independence.${notice.plural ? 'many' : 'one'}_${notice.current ? 'current' : 'past'}`

  return (
    <aside
      role="note"
      aria-labelledby="aviso-independencia"
      className="max-w-2xl mx-auto mb-8 border-l-2 border-brand-800 bg-brand-50 px-4 py-3"
    >
      <p id="aviso-independencia" className="text-[11px] uppercase tracking-wider text-neutral-600 mb-1">
        {t('storyPage.independence.label')}
      </p>
      <p className="text-sm text-neutral-900 leading-relaxed">
        {t(clave, { verticals })}{' '}
        <span className="text-neutral-600">{t('storyPage.independence.rules')}</span>{' '}
        <Link
          to="/about#independencia"
          className="text-brand-800 hover:text-brand-700 underline focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          {t('storyPage.independence.link')}
        </Link>
      </p>
    </aside>
  )
}
