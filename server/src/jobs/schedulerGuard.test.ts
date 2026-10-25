import { describe, it, expect } from 'vitest'
import { schedulerStartDecision, databaseHost, isLocalDatabaseHost } from './schedulerGuard.js'

const PRODUCCION_DB = 'postgresql://u:p@impactoindigena-db.postgres.database.azure.com/impactoindigena_news?sslmode=require'

describe('schedulerStartDecision', () => {
  it('no programa fuera de producción con la base de Azure (el .env local del 23-oct)', () => {
    const d = schedulerStartDecision({ DATABASE_URL: PRODUCCION_DB, NODE_ENV: 'development' })
    expect(d.start).toBe(false)
    expect(d.reason).toContain('impactoindigena-db.postgres.database.azure.com')
    expect(d.reason).toContain('SCHEDULER_ALLOW_REMOTE_DB=true')
  })

  it('tampoco sin NODE_ENV, que es como arranca `npm run dev`', () => {
    expect(schedulerStartDecision({ DATABASE_URL: PRODUCCION_DB }).start).toBe(false)
  })

  it('en producción programa: NODE_ENV=production está en el App Service', () => {
    expect(schedulerStartDecision({ DATABASE_URL: PRODUCCION_DB, NODE_ENV: 'production' }).start).toBe(true)
  })

  it('en el App Service programa también por WEBSITE_SITE_NAME', () => {
    expect(schedulerStartDecision({ DATABASE_URL: PRODUCCION_DB, WEBSITE_SITE_NAME: 'impactoindigena-news-api' }).start).toBe(true)
  })

  it('con una base local programa: localhost, 127.0.0.1, ::1 y el servicio de docker-compose', () => {
    for (const url of [
      'postgresql://u:p@localhost:5432/db',
      'postgresql://u:p@127.0.0.1:5433/db',
      'postgresql://u:p@[::1]:5432/db',
      'postgresql://u:p@db:5432/db',
    ]) {
      expect(schedulerStartDecision({ DATABASE_URL: url }).start, url).toBe(true)
    }
  })

  it('con una base remota solo programa si se pide a propósito', () => {
    const d = schedulerStartDecision({ DATABASE_URL: PRODUCCION_DB, SCHEDULER_ALLOW_REMOTE_DB: 'true' })
    expect(d.start).toBe(true)
    expect(d.reason).toContain('SCHEDULER_ALLOW_REMOTE_DB=true')
    expect(schedulerStartDecision({ DATABASE_URL: PRODUCCION_DB, SCHEDULER_ALLOW_REMOTE_DB: '1' }).start).toBe(false)
  })

  it('una URL ilegible o ausente no habilita nada fuera de producción', () => {
    expect(schedulerStartDecision({ DATABASE_URL: 'no es una url' }).start).toBe(false)
    expect(schedulerStartDecision({}).start).toBe(false)
  })
})

describe('databaseHost / isLocalDatabaseHost', () => {
  it('lee el host de la URL de Postgres', () => {
    expect(databaseHost(PRODUCCION_DB)).toBe('impactoindigena-db.postgres.database.azure.com')
    expect(databaseHost(undefined)).toBeNull()
  })

  it('una IP privada con puntos no cuenta como local', () => {
    expect(isLocalDatabaseHost('10.0.0.5')).toBe(false)
  })
})
