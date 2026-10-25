import { describe, it, expect } from 'vitest'
import { listInstagramPostsQuerySchema } from './instagram.js'

describe('listInstagramPostsQuerySchema', () => {
  // El panel filtra por «Rechazados» desde el 25-oct-2026: sin el estado en el
  // esquema, el filtro respondía 400.
  it('acepta los estados que el panel ofrece como filtro', () => {
    for (const status of ['draft', 'published', 'failed', 'rejected']) {
      expect(listInstagramPostsQuerySchema.safeParse({ status }).success).toBe(true)
    }
  })

  it('rechaza un estado que no existe', () => {
    expect(listInstagramPostsQuerySchema.safeParse({ status: 'aprobado' }).success).toBe(false)
  })
})
