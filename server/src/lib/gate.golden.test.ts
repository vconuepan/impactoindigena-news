import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { evaluateGate } from './gate.js'

interface GoldenCase {
  id: string
  label: 'sensible' | 'neutral'
  category?: string
  narrativeFrame?: string | null
  text: string
}

// Golden set of hand-labeled cases. See server/eval/README.md. The eval runs the
// gate with learning mode OFF so it exercises the discriminative logic (in
// learning mode everything is held and nothing is tested).
const file = new URL('../../eval/gate-golden-set.jsonl', import.meta.url)
const cases: GoldenCase[] = readFileSync(file, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length > 0)
  .map((l) => JSON.parse(l) as GoldenCase)

const run = (c: GoldenCase) =>
  evaluateGate({ narrativeFrame: c.narrativeFrame, text: c.text }, { learningMode: false })

describe('gate golden set', () => {
  it('has a non-trivial number of labeled cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(15)
  })

  // Critical path #2: a sensitive story must NEVER auto-publish. A false negative
  // (sensible -> auto_publish) is exactly the failure this eval exists to catch.
  it('never auto-publishes a sensible story (zero false negatives)', () => {
    const falseNegatives = cases
      .filter((c) => c.label === 'sensible')
      .filter((c) => !run(c).held)
      .map((c) => `${c.id} (${c.category})`)
    expect(falseNegatives).toEqual([])
  })

  // False positives (neutral -> held) are acceptable per the regla de oro (§7.3),
  // but the curated starter set is kept clean. Relax this to a rate threshold when
  // real, messier Araucanía news is added.
  it('auto-publishes curated neutral stories (false-positive check on the starter set)', () => {
    const falsePositives = cases
      .filter((c) => c.label === 'neutral')
      .filter((c) => run(c).held)
      .map((c) => `${c.id}: ${run(c).reasons.join(', ')}`)
    expect(falsePositives).toEqual([])
  })
})
