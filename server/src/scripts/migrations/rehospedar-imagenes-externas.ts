/**
 * Rehospeda en R2 las imagenes de historias que hoy se sirven desde el medio
 * de origen.
 *
 * Medido el 4-sep-2026: 1.220 historias publicadas apuntan a un dominio ajeno,
 * y esas imagenes son las unicas que quedan sin optimizar. En la portada, una
 * sola de ellas -de media.biobiochile.cl- pesa 1.345 KB: el 56% de todo lo que
 * el navegador descarga arriba, y con eso el LCP movil no baja de 9,3 s.
 *
 * No es solo peso. Mientras la imagen viva en el servidor del medio, la carga
 * de nuestra portada depende de la disponibilidad y la latencia de terceros, y
 * el enlace se rompe el dia que ese medio reorganiza su CDN.
 *
 * Cada imagen se normaliza igual que en el pipeline (ancho maximo 1200, JPEG
 * 82), no se sube tal cual: subir verbatim es justamente lo que puso en R2
 * fotos de 6000x3376 y 5 MB.
 *
 * REVERSION: la URL anterior de cada historia se anota en el registro JSONL
 * ANTES de escribir. `--revertir` lo lee y las restaura.
 *
 *   npx tsx src/scripts/migrations/rehospedar-imagenes-externas.ts             # simula
 *   npx tsx src/scripts/migrations/rehospedar-imagenes-externas.ts --apply
 *   npx tsx src/scripts/migrations/rehospedar-imagenes-externas.ts --revertir --apply --registro=<archivo.jsonl>
 */
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { downloadExternalImage, uploadImageToR2 } from '../../lib/imageStorage.js'
import { config } from '../../config.js'

const MAX_WIDTH = 1200
const JPEG_QUALITY = 82
/** Contra dominios ajenos se va con la mano liviana: son servidores de otros. */
const CONCURRENCIA = 4

const args = process.argv.slice(2)
const APLICAR = args.includes('--apply')
const REVERTIR = args.includes('--revertir')
const LIMITE = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? Infinity)
const REGISTRO_ENTRADA = args.find((a) => a.startsWith('--registro='))?.split('=')[1]

const prisma = new PrismaClient()
const logDir = path.resolve(process.cwd(), '.migraciones-log')
mkdirSync(logDir, { recursive: true })
const logFile = path.join(logDir, `rehospedar-externas-${Date.now()}.jsonl`)

/** Reconoce lo que ya vive en nuestro bucket, sea cual sea el host publico. */
function esNuestra(url: string): boolean {
  return config.r2.publicUrl ? url.startsWith(config.r2.publicUrl) : url.includes('r2.dev')
}

async function revertir(): Promise<void> {
  if (!REGISTRO_ENTRADA) {
    console.error('--revertir necesita --registro=<archivo.jsonl> de la corrida a deshacer')
    process.exit(1)
  }
  const filas = readFileSync(REGISTRO_ENTRADA, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { id: string; antes: string })
  console.log(`${filas.length} historias en el registro`)
  for (const f of filas) {
    console.log(`  ${APLICAR ? 'restaurando' : 'restauraria'} ${f.id} -> ${f.antes}`)
    if (APLICAR) await prisma.story.update({ where: { id: f.id }, data: { imageUrl: f.antes } })
  }
}

async function main(): Promise<void> {
  if (REVERTIR) return revertir()

  const todas = await prisma.story.findMany({
    where: { status: 'published', imageUrl: { not: null } },
    select: { id: true, imageUrl: true, title: true },
    orderBy: { datePublished: 'desc' },
  })
  const externas = todas.filter((s) => s.imageUrl && !esNuestra(s.imageUrl))
  const candidatas = externas.slice(0, LIMITE)

  console.log(`${todas.length} publicadas con imagen · ${externas.length} apuntan a un dominio ajeno`)
  if (candidatas.length < externas.length) console.log(`este lote toma ${candidatas.length}`)
  console.log(APLICAR ? '=== APLICANDO ===' : '=== SIMULACION (sin --apply no escribe) ===\n')

  let ok = 0
  let fallos = 0
  let antes = 0
  let despues = 0
  let siguiente = 0

  async function trabajar(): Promise<void> {
    for (;;) {
      const i = siguiente++
      if (i >= candidatas.length) return
      const s = candidatas[i]
      const urlVieja = s.imageUrl!
      try {
        const dl = await downloadExternalImage(urlVieja)
        if (!dl) {
          fallos++
          console.log(`  [${i + 1}] SIN DESCARGA ${urlVieja.slice(0, 70)}`)
          continue
        }
        const img = await loadImage(dl.buffer).catch(() => null)
        if (!img) {
          fallos++
          console.log(`  [${i + 1}] NO DECODIFICA ${urlVieja.slice(0, 70)}`)
          continue
        }
        const escala = Math.min(1, MAX_WIDTH / img.width)
        const w = Math.round(img.width * escala)
        const h = Math.round(img.height * escala)
        const canvas = createCanvas(w, h)
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const jpeg = canvas.toBuffer('image/jpeg', JPEG_QUALITY)

        antes += dl.buffer.length
        despues += jpeg.length
        ok++
        console.log(
          `  [${i + 1}/${candidatas.length}] ${(dl.buffer.length / 1024).toFixed(0)} KB -> ${(jpeg.length / 1024).toFixed(0)} KB  ${img.width}x${img.height} -> ${w}x${h}  ${urlVieja.slice(0, 52)}`,
        )

        if (!APLICAR) continue

        // La URL anterior se anota ANTES de escribir: si la corrida muere a
        // mitad de camino, lo ya movido sigue siendo reversible.
        appendFileSync(logFile, JSON.stringify({ id: s.id, antes: urlVieja }) + '\n')
        const nueva = await uploadImageToR2(jpeg, `oghero-${s.id}.jpg`, 'image/jpeg')
        await prisma.story.update({ where: { id: s.id }, data: { imageUrl: nueva } })
      } catch (err) {
        fallos++
        console.log(`  [${i + 1}] ERROR ${urlVieja.slice(0, 60)}: ${(err as Error).message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajar))

  console.log(
    `\n${ok} rehospedadas · ${fallos} sin tocar · ${(antes / 2 ** 20).toFixed(1)} MB -> ${(despues / 2 ** 20).toFixed(1)} MB` +
      (antes ? ` (-${(100 * (1 - despues / antes)).toFixed(0)}%)` : ''),
  )
  if (APLICAR) console.log(`registro: ${logFile}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
