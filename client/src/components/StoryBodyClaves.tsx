import { useTranslation } from 'react-i18next'
import type { PublicStoryBody } from '@shared/types'

/**
 * La nota con claves en la ficha pública (plan del 25-oct-2026, B3 y B4).
 *
 * Antes la ficha mostraba un resumen de 40-70 palabras y, debajo, las viñetas
 * del puntaje como si fueran la historia. Esto es la historia: una bajada y
 * cuatro claves redactadas desde el artículo completo, con un recuadro que
 * dice cómo se hizo y si alguien la revisó. El recuadro dice la verdad de
 * cada caso: una nota que nadie revisó lo declara.
 *
 * En inglés cae campo por campo al español mientras no haya traducción, igual
 * que el resto de la ficha.
 */

export const CLAVES = ['quePaso', 'porQueImporta', 'contexto', 'queSigue'] as const
export type Clave = (typeof CLAVES)[number]

export function textoLocal(body: PublicStoryBody, campo: 'bajada' | Clave, isEn: boolean): string {
  const en = body[`${campo}En` as const]
  return (isEn && en) ? en : body[campo]
}

interface Props {
  body: PublicStoryBody
  publisher: string
  accentColor: string
}

export default function StoryBodyClaves({ body, publisher, accentColor }: Props) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language === 'en'
  const bajada = textoLocal(body, 'bajada', isEn)
  const reviewer = body.reviewedBy || t('storyPage.body.someone')

  return (
    <section className="mb-10" aria-label={t('storyPage.body.label')}>
      {bajada && (
        <p className="text-lg md:text-xl text-neutral-800 leading-relaxed font-medium mb-8">{bajada}</p>
      )}
      {CLAVES.map((clave) => {
        const texto = textoLocal(body, clave, isEn).trim()
        if (!texto) return null
        return (
          <div key={clave} className="mb-6">
            <h2
              className="text-[11px] uppercase tracking-wider font-bold mb-2 pl-3 border-l-2"
              style={{ color: accentColor, borderColor: accentColor }}
            >
              {t(`storyPage.body.${clave}`)}
            </h2>
            <p className="text-base text-neutral-800 leading-relaxed">{texto}</p>
          </div>
        )
      })}

      {/* ¿Cómo hicimos esta nota? El método, en nuestras palabras y por pieza. */}
      <aside
        className="mt-8 border-l-2 border-neutral-300 pl-4 py-1"
        aria-labelledby="como-hicimos-esta-nota"
        data-method={body.method}
      >
        <h2 id="como-hicimos-esta-nota" className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
          {t('storyPage.body.howWeMadeThis')}
        </h2>
        <p className="text-sm text-neutral-600 leading-relaxed">
          {t(`storyPage.body.method.${body.method}`, { publisher, reviewer })}
        </p>
      </aside>
    </section>
  )
}
