import { describe, it, expect } from 'vitest'
import { esHostLocal, hostDeDatabaseUrl } from './dbHostGuard.js'

// `prisma migrate dev --create-only` aplica las migraciones pendientes contra la
// base del .env, y ese .env apunta a produccion. La guardia que envuelve a los
// scripts db:migrate* se apoya en esta funcion: si deja pasar un host remoto,
// el proximo `npm run db:migrate:create` escribe en Azure.
describe('esHostLocal — la guardia de los scripts db:migrate*', () => {
  it('acepta las formas locales habituales de PostgreSQL', () => {
    expect(esHostLocal('postgresql://user:password@localhost:5432/db?schema=public')).toBe(true)
    expect(esHostLocal('postgresql://user:password@127.0.0.1:5432/db')).toBe(true)
    expect(esHostLocal('postgresql://user:password@[::1]:5432/db')).toBe(true)
    expect(esHostLocal('postgres://u:p@db.localhost/x')).toBe(true)
    expect(esHostLocal('postgres://u:p@voces.test/x')).toBe(true)
  })

  it('rechaza el host de produccion en Azure, con y sin credenciales', () => {
    expect(esHostLocal('postgresql://iiadmin:secreto@impactoindigena-db.postgres.database.azure.com:5432/impactoindigena_news?sslmode=require')).toBe(false)
    expect(esHostLocal('postgresql://impactoindigena-db.postgres.database.azure.com/db')).toBe(false)
  })

  it('rechaza lo que no se puede leer: vacio, ausente o sin host', () => {
    expect(esHostLocal(undefined)).toBe(false)
    expect(esHostLocal(null)).toBe(false)
    expect(esHostLocal('')).toBe(false)
    expect(esHostLocal('no es una url')).toBe(false)
    expect(esHostLocal('postgresql:///solo-socket')).toBe(false)
  })

  it('no se deja engañar por un host local en las credenciales o en la ruta', () => {
    expect(esHostLocal('postgresql://localhost:pw@impactoindigena-db.postgres.database.azure.com/db')).toBe(false)
    expect(esHostLocal('postgresql://u:p@impactoindigena-db.postgres.database.azure.com/localhost')).toBe(false)
    expect(esHostLocal('postgresql://u:p@localhost.evil.com/db')).toBe(false)
  })

  it('hostDeDatabaseUrl expone el host que se evaluo, en minusculas', () => {
    expect(hostDeDatabaseUrl('postgresql://u:p@LocalHost:5432/db')).toBe('localhost')
    expect(hostDeDatabaseUrl('postgresql://u:p@Impactoindigena-db.postgres.database.azure.com/db')).toBe('impactoindigena-db.postgres.database.azure.com')
    expect(hostDeDatabaseUrl('???')).toBeNull()
  })
})
