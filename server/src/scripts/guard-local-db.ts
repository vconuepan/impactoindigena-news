// Guardia de los scripts db:migrate* de server/package.json.
//
// `prisma migrate dev`, tambien con `--create-only`, aplica las migraciones
// pendientes contra la base del .env antes de hacer nada mas, y ese .env apunta
// a produccion. Este script corre antes que Prisma y aborta si el host no es
// local. Carga el .env igual que prisma.config.ts (dotenv, sin sobrescribir
// variables ya presentes), asi que evalua exactamente la URL que Prisma usaria.
//
// Escape, solo para el director: MIGRATE_REMOTE_OK=1.
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { esHostLocal, hostDeDatabaseUrl } from '../lib/dbHostGuard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const url = process.env.DATABASE_URL
const host = url ? hostDeDatabaseUrl(url) : null

if (process.env.MIGRATE_REMOTE_OK === '1') {
  console.error(`[guard-local-db] MIGRATE_REMOTE_OK=1: se permite el host remoto «${host ?? '?'}».`)
  process.exit(0)
}

if (!esHostLocal(url)) {
  console.error(
    `[guard-local-db] DATABASE_URL apunta a «${host ?? '(sin host legible)'}», que no es una base local.\n` +
      '  Las migraciones de este repo se aplican a mano con SQL (ver .context/database-migrations.md).\n' +
      '  `prisma migrate dev` aplicaria las pendientes contra esa base, incluso con --create-only.\n' +
      '  Para una base local, apunta DATABASE_URL a localhost. Si de verdad quieres el host remoto: MIGRATE_REMOTE_OK=1.',
  )
  process.exit(1)
}

console.error(`[guard-local-db] host local «${host}»: adelante.`)
