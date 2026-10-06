import type { PublicStory } from '@shared/types'
import { RELEVANCE_PUBLISH_MIN } from '@shared/constants'

type CamposDeResumen = Pick<
  PublicStory,
  'relevance' | 'summary' | 'summaryEn' | 'relevanceSummary' | 'relevanceSummaryEn'
>

/**
 * Una nota publicada con relevancia por debajo del piso. No deberia existir
 * (`select_stories` descarta lo que queda bajo `SELECT_RELEVANCE_MIN`), pero
 * en vivo el 5-oct-2026 eran el 20-24 % de lo publicado. Una relevancia nula no
 * cuenta como baja: es «desconocida», y se trata como hasta ahora.
 */
export function bajoElPisoDeRelevancia(story: Pick<PublicStory, 'relevance'>): boolean {
  return story.relevance != null && story.relevance < RELEVANCE_PUBLISH_MIN
}

/**
 * El texto de dos o tres lineas que va bajo el titular de una tarjeta.
 *
 * Por defecto se prefiere `relevanceSummary`, que dice por que la nota importa
 * a los pueblos indigenas. Pero ese mismo campo, en una nota que quedo bajo el
 * piso, explica por que NO importa («Juneau enfrenta inundaciones… sin impacto
 * indigena»), y en la tarjeta se lee como la bajada de un medio indigena que se
 * contradice a si mismo. Para esas notas se muestra el resumen plano.
 *
 * La precedencia de idioma es la que ya tenia StoryCard: en ingles, primero la
 * version traducida de cada campo y, si no existe, la del campo siguiente.
 */
export function resumenParaTarjeta(story: CamposDeResumen, isEn: boolean): string | null | undefined {
  if (bajoElPisoDeRelevancia(story)) {
    return (isEn && story.summaryEn) ? story.summaryEn : story.summary
  }
  return (isEn && story.relevanceSummaryEn) ? story.relevanceSummaryEn
    : (isEn && story.summaryEn) ? story.summaryEn
    : story.relevanceSummary || story.summary
}
