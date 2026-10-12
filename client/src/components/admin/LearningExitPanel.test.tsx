import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { LearningExitPanel } from './LearningExitPanel'
import type { LearningExitCriteria } from '../../lib/admin-api'

/**
 * El criterio del director para apagar el modo aprendizaje (11-oct-2026,
 * «ambos»): la pantalla dice cuál de las tres condiciones falta y cuánto, no
 * solo sí o no.
 */
const UMBRALES = { minDays: 14, windowDays: 7, score0ReleaseRatio: 0.9, score0MinDecisions: 10, queueAlertHours: 48 }
const base: LearningExitCriteria = {
  reviewSince: '2026-10-04T19:46:00Z',
  earliestOffAt: '2026-10-18T19:46:00Z',
  dateMet: false,
  queueCurrentSince: null,
  queueCurrentDays: 0,
  queueMet: false,
  score0Decided: 4,
  score0Released: 4,
  score0Met: false,
  met: false,
  thresholds: UMBRALES,
}

describe('LearningExitPanel', () => {
  it('hoy (11-oct): nada se cumple, y dice la fecha, la cola vencida y cuántas decisiones faltan', () => {
    render(<LearningExitPanel criteria={base} />)
    const panel = screen.getByRole('region', { name: 'Criterio para apagar el modo aprendizaje' })
    expect(panel).toHaveTextContent('Todavía no se cumple')
    const items = within(panel).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('14 días en revisión')
    expect(items[0]).toHaveTextContent('se cumple el 18 oct')
    expect(items[0]).toHaveTextContent('Todavía no')
    expect(items[1]).toHaveTextContent('hoy hay notas esperando más de 48 h')
    expect(items[2]).toHaveTextContent('Liberas al menos 9 de cada 10 notas de puntaje 0')
    expect(items[2]).toHaveTextContent('4 liberadas de 4 decididas en los últimos 7 días')
    expect(items[2]).toHaveTextContent('faltan 6 decisiones para medir')
    expect(panel).toHaveTextContent('GATE_LEARNING_MODE=false')
  })

  it('con la cola al día muestra desde cuándo y cuántos días lleva', () => {
    render(<LearningExitPanel criteria={{ ...base, dateMet: true, queueCurrentSince: '2026-10-12T13:00:00Z', queueCurrentDays: 3 }} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Se cumple')
    expect(items[1]).toHaveTextContent('al día desde el 12 oct: 3 de 7 días')
    expect(items[1]).toHaveTextContent('Todavía no')
  })

  it('las tres a la vez: ya se puede apagar', () => {
    render(
      <LearningExitPanel
        criteria={{ ...base, dateMet: true, queueCurrentSince: '2026-10-12T13:00:00Z', queueCurrentDays: 8, queueMet: true, score0Decided: 20, score0Released: 19, score0Met: true, met: true }}
      />,
    )
    expect(screen.getByRole('region')).toHaveTextContent('Se cumple: ya se puede apagar')
    expect(screen.getAllByRole('listitem')[2]).not.toHaveTextContent('faltan')
  })

  it('concuerda en número: «1 liberada de 1 decidida» y «falta 1 decisión»', () => {
    render(<LearningExitPanel criteria={{ ...base, score0Decided: 1, score0Released: 1 }} />)
    expect(screen.getAllByRole('listitem')[2]).toHaveTextContent('1 liberada de 1 decidida en los últimos 7 días · faltan 9 decisiones para medir')
  })

  it('con nueve decisiones dice «falta 1 decisión»', () => {
    render(<LearningExitPanel criteria={{ ...base, score0Decided: 9, score0Released: 9 }} />)
    expect(screen.getAllByRole('listitem')[2]).toHaveTextContent('9 liberadas de 9 decididas en los últimos 7 días · falta 1 decisión para medir')
  })
})
