/**
 * Genera las variantes web (800 y 1200 px) de las imagenes que YA estan en R2.
 *
 * El pipeline sube las variantes de cada imagen nueva desde el 6-oct-2026
 * (`lib/imagen-variantes.ts`), pero las anteriores —miles— no las tienen, y el
 * cliente las referencia por convencion: una tarjeta cuya variante no existe
 * recibe un 404, quita el `srcset` y carga el original. Funciona, pero cuesta
 * una peticion fallida por imagen. Esto las genera de una vez.
 *
 * NO toca ningun original ni ninguna fila de la base: solo AGREGA objetos con
 * sufijo `-w800.jpg` y `-w1200.jpg` junto a cada imagen. Revertir es borrarlos
 * (`--borrar --apply`).
 *
 *   npm run migration:variantes-web --prefix server                 # simula todo el bucket
 *   npm run migration:variantes-web:portada --prefix server         # simula solo las de homepage.json
 *   npm run migration:variantes-web:portada:apply --prefix server   # escribe esas
 *   npm run migration:variantes-web:apply --prefix server           # escribe todas
 *   npm run migration:variantes-web:borrar --prefix server          # borra TODAS las variantes
 *
 * Flags sueltos: `--limit=N` acota el lote (las mas recientes primero).
 */
// Este script NO usa Prisma, y Prisma es quien carga el .env en las demas
// migraciones sin que se note. Va PRIMERO: config.ts lee process.env al
// evaluarse.
import 'dotenv/config'
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'
import { loadImage } from '@napi-rs/canvas'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { config } from '../../config.js'
import { ANCHOS_VARIANTE_WEB, nombreDeVariante, varianteWeb } from '../../lib/imagen-variantes.js'

/** El cuello es la descarga, no la CPU (medido en recomprimir-imagenes-r2). */
const CONCURRENCIA = 8
const PREFIX = 'social/'
/** Respaldos de la recompresion del 4-sep: no son imagenes que el sitio sirva. */
const PREFIJOS_EXCLUIDOS = ['social/original/', 'social/original-png/']
const ES_VARIANTE = /-w(800|1200)\.jpg$/i
const CON_EXTENSION = /\.(jpe?g|png|webp|gif)$/i

const args = process.argv.slice(2)
const APLICAR = args.includes('--apply')
const SOLO_PORTADA = args.includes('--solo-portada')
const BORRAR = args.includes('--borrar')
const LIMITE = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? Infinity)

const client = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
})
const Bucket = config.r2.bucketName

const logDir = path.resolve(process.cwd(), '.migraciones-log')
mkdirSync(logDir, { recursive: true })
const logFile = path.join(logDir, `variantes-web-${Date.now()}.jsonl`)

interface Objeto {
  Key: string
  Size: number
  LastModified: Date
}

async function listarTodo(prefix: string): Promise<Objeto[]> {
  const out: Objeto[] = []
  let token: string | undefined
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }))
    for (const o of r.Contents ?? []) {
      if (o.Key && o.Size != null) out.push({ Key: o.Key, Size: o.Size, LastModified: o.LastModified ?? new Date(0) })
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  return out
}

async function bajar(Key: string): Promise<Buffer> {
  const r = await client.send(new GetObjectCommand({ Bucket, Key }))
  return Buffer.from(await r.Body!.transformToByteArray())
}

/** Las claves de las imagenes que la portada muestra hoy, leidas del snapshot. */
async function clavesDeLaPortada(): Promise<Set<string>> {
  const base = config.r2.publicUrl.replace(/\/$/, '')
  if (!base) throw new Error('R2_PUBLIC_URL vacio: no se puede leer homepage.json')
  const r = await fetch(`${base}/homepage.json`)
  if (!r.ok) throw new Error(`homepage.json respondio ${r.status}`)
  const j = (await r.json()) as { storiesByIssue?: Record<string, Record<string, { imageUrl?: string | null }[]>> }
  const claves = new Set<string>()
  for (const buckets of Object.values(j.storiesByIssue ?? {})) {
    for (const lista of Object.values(buckets)) {
      for (const s of lista ?? []) {
        if (s?.imageUrl && s.imageUrl.startsWith(base + '/')) claves.add(s.imageUrl.slice(base.length + 1))
      }
    }
  }
  return claves
}

async function borrarVariantes(todos: Objeto[]): Promise<void> {
  const variantes = todos.filter((o) => ES_VARIANTE.test(o.Key))
  console.log(`${variantes.length} variantes en el bucket`)
  if (!APLICAR) {
    console.log('=== SIMULACION: con --apply se borrarian ===')
    return
  }
  for (let i = 0; i < variantes.length; i += 1000) {
    const lote = variantes.slice(i, i + 1000)
    await client.send(
      new DeleteObjectsCommand({ Bucket, Delete: { Objects: lote.map((o) => ({ Key: o.Key })), Quiet: true } }),
    )
    console.log(`  borradas ${Math.min(i + 1000, variantes.length)}/${variantes.length}`)
  }
}

async function main(): Promise<void> {
  const todos = await listarTodo(PREFIX)
  if (BORRAR) return borrarVariantes(todos)

  const existentes = new Set(todos.filter((o) => ES_VARIANTE.test(o.Key)).map((o) => o.Key))
  const portada = SOLO_PORTADA ? await clavesDeLaPortada() : null

  // Cada original con las variantes que le faltan.
  const pendientes = todos
    .filter((o) => !PREFIJOS_EXCLUIDOS.some((p) => o.Key.startsWith(p)))
    .filter((o) => !ES_VARIANTE.test(o.Key) && CON_EXTENSION.test(o.Key))
    .filter((o) => !portada || portada.has(o.Key))
    .map((o) => ({
      ...o,
      faltan: ANCHOS_VARIANTE_WEB.filter((a) => !existentes.has(nombreDeVariante(o.Key, a)!)),
    }))
    .filter((o) => o.faltan.length > 0)
    .sort((a, b) => b.LastModified.getTime() - a.LastModified.getTime())
  const candidatos = pendientes.slice(0, LIMITE)

  console.log(`${todos.length} objetos en ${PREFIX} · ${existentes.size} variantes ya existen`)
  if (portada) console.log(`portada: ${portada.size} imagenes en homepage.json`)
  console.log(
    `${pendientes.length} originales sin variantes completas` +
      (candidatos.length < pendientes.length ? ` - este lote toma ${candidatos.length}` : ''),
  )
  console.log(APLICAR ? '=== APLICANDO ===' : '=== SIMULACION (sin --apply no escribe) ===\n')

  let originales = 0
  let subidas = 0
  let bytesOriginal = 0
  let bytesVariantes = 0
  let errores = 0
  let siguiente = 0

  async function trabajar(): Promise<void> {
    for (;;) {
      const i = siguiente++
      if (i >= candidatos.length) return
      const o = candidatos[i]
      try {
        const original = await bajar(o.Key)
        const img = await loadImage(original)
        const hechas: string[] = []
        for (const ancho of o.faltan) {
          const key = nombreDeVariante(o.Key, ancho)!
          const buffer = varianteWeb(img, ancho)
          bytesVariantes += buffer.length
          hechas.push(`${ancho}:${(buffer.length / 1024).toFixed(0)}KB`)
          if (!APLICAR) continue
          await client.send(
            new PutObjectCommand({
              Bucket,
              Key: key,
              Body: buffer,
              ContentType: 'image/jpeg',
              CacheControl: 'public, max-age=31536000',
            }),
          )
          appendFileSync(logFile, JSON.stringify({ key, ancho, bytes: buffer.length, de: o.Key }) + '\n')
          subidas++
        }
        originales++
        bytesOriginal += original.length
        console.log(
          `  [${i + 1}/${candidatos.length}] ${o.Key} ${img.width}x${img.height} ${(original.length / 1024).toFixed(0)}KB -> ${hechas.join(' ')}`,
        )
      } catch (err) {
        errores++
        console.log(`  [${i + 1}] ERROR ${o.Key}: ${(err as Error).message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajar))

  console.log(
    `\n${originales} originales (${(bytesOriginal / 2 ** 20).toFixed(1)} MB) -> ` +
      `variantes por ${(bytesVariantes / 2 ** 20).toFixed(1)} MB · ${errores} errores` +
      (APLICAR ? ` · ${subidas} objetos subidos · registro: ${logFile}` : ''),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
