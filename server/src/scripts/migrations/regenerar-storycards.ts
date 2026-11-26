/**
 * Recompone las tarjetas `storycard-<id>.jpg` ya publicadas con la marca y el título de hoy.
 *
 * EL PROBLEMA, medido el 25-nov-2026 con la API pública. De 5.432 noticias publicadas,
 * 808 tienen como imagen una tarjeta compuesta por `composeBrandedStoryCard`
 * (`lib/storyCard.ts`): la foto del medio medía menos de 1200 px y se le pintó encima un
 * rótulo y el título. Ese rótulo es la marca del día en que se compuso: 201 dicen
 * «IMPACTO INDÍGENA» (13-jul a 23-ago) y 607 «VOCES INDÍGENAS» (24-ago a 25-nov). Desde
 * el 25-nov el medio es Impacto Indígena News. Además el título quedó horneado: una de
 * julio dice «historia del tratado tapihue…» en minúsculas, y ninguna recoge las
 * correcciones de título posteriores. Es un PNG/JPEG estático: ningún cambio de código lo
 * corrige (memoria «la marca horneada en un binario»).
 *
 * CÓMO. La base no guarda la foto original del medio, solo la URL de la tarjeta. Se pide
 * de nuevo a la página de la noticia con `fetchOgImage(sourceUrl)`, como hace
 * `backfill-images.ts`, y se recompone con `composeBrandedStoryCard(img, título)`, el
 * mismo título que usa `publishStories` (`title ?? sourceTitle`). Si la fuente ya no
 * tiene la foto, la tarjeta se queda como está y se informa.
 *
 * SIN ESCRITURAS EN LA BASE. Igual que `recomprimir-imagenes-r2.ts`: se sobrescribe la
 * MISMA clave de R2, con sus variantes de 800 y 1200 px, y `Story.imageUrl` no cambia.
 * Las historias se listan por la API pública, así que el script ni siquiera lee la base.
 *
 * RESPALDO Y REVERSIÓN. Antes de sobrescribir, la tarjeta vieja se copia a
 * `social/original-storycard/<nombre>`. Ese respaldo es también lo que vuelve la corrida
 * reanudable: una tarjeta con respaldo ya pasó por acá y no se toca otra vez (rehacerla
 * pisaría el respaldo con la versión nueva y se perdería el original).
 *
 * LO QUE NO ALCANZA. R2 sirve estas imágenes con `max-age` de un año: quien ya cargó una
 * tarjeta puede seguir viendo la vieja en su navegador. Y Facebook, WhatsApp o LinkedIn
 * guardan su propia copia de la vista previa de los enlaces ya compartidos.
 *
 *   npx tsx src/scripts/migrations/regenerar-storycards.ts                 # simula
 *   npx tsx src/scripts/migrations/regenerar-storycards.ts --apply --limit=20
 *   npx tsx src/scripts/migrations/regenerar-storycards.ts --apply
 *   npx tsx src/scripts/migrations/regenerar-storycards.ts --revertir --apply
 */
// Va PRIMERO: config.ts lee process.env al evaluarse (ver recomprimir-imagenes-r2.ts).
import 'dotenv/config'
import {
  S3Client,
  HeadObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { loadImage } from '@napi-rs/canvas'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { config } from '../../config.js'
import { fetchOgImage } from '../../lib/extract-og-image.js'
import { downloadExternalImage, uploadImageToR2 } from '../../lib/imageStorage.js'
import { composeBrandedStoryCard } from '../../lib/storyCard.js'
import { subirVariantesWeb } from '../../lib/imagen-variantes.js'

export const PREFIJO_TARJETA = 'storycard-'
export const PREFIJO_RESPALDO = 'social/original-storycard/'

/** Nombre de archivo de la tarjeta (`storycard-<uuid>.jpg`) a partir de su URL pública, o null. */
export function nombreDeTarjeta(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null
  const base = imageUrl.split('?')[0].split('/').pop() ?? ''
  return /^storycard-[0-9a-f-]{36}\.(jpe?g|png)$/i.test(base) ? base : null
}

/** El título que pinta la tarjeta: el mismo criterio que `publishStories`. */
export function tituloDeTarjeta(s: { title?: string | null; sourceTitle?: string | null }): string {
  return (s.title ?? '').trim() || (s.sourceTitle ?? '').trim()
}

interface Historia {
  id: string
  slug: string
  title: string | null
  sourceTitle: string | null
  sourceUrl: string
  imageUrl: string | null
  datePublished: string | null
}

const args = process.argv.slice(2)
const APLICAR = args.includes('--apply')
const REVERTIR = args.includes('--revertir')
const LIMITE = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? Infinity)
/** Pocos y con pausa: cada tarjeta pide una página a un medio ajeno. */
const CONCURRENCIA = 4
const PAUSA_MS = 300

const client = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
})
const Bucket = config.r2.bucketName
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function existe(Key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket, Key }))
    return true
  } catch {
    return false
  }
}

async function bajar(Key: string): Promise<Buffer> {
  const r = await client.send(new GetObjectCommand({ Bucket, Key }))
  return Buffer.from(await r.Body!.transformToByteArray())
}

/**
 * Las publicadas con tarjeta compuesta, leídas por la API pública (100 por página).
 *
 * El límite público es 100 consultas cada 15 minutos por IP, y el listado completo gasta 55:
 * el 25-nov una corrida con `--limit=20` justo después de la simulación cayó en un 429 en la
 * página 46. Por eso, con `--limit`, deja de paginar en cuanto junta las que necesita, y ante un
 * 429 espera lo que diga `Retry-After` (o un minuto) y reintenta.
 */
async function listarTarjetas(hasta: number): Promise<Historia[]> {
  const base = config.siteUrl.replace(/\/$/, '')
  const out: Historia[] = []
  for (let page = 1; ; page++) {
    let d: { data: Historia[]; totalPages: number } | null = null
    for (let intento = 1; !d; intento++) {
      const r = await fetch(`${base}/api/stories?pageSize=100&page=${page}`, {
        headers: { 'User-Agent': 'regenerar-storycards/1.0' },
      })
      if (r.status === 429 && intento <= 20) {
        const espera = Math.max(Number(r.headers.get('retry-after')) || 60, 10)
        console.log(`  límite de la API (429) en la página ${page}: espero ${espera} s`)
        await dormir(espera * 1000)
        continue
      }
      if (!r.ok) throw new Error(`API pública: HTTP ${r.status} en la página ${page}`)
      d = (await r.json()) as { data: Historia[]; totalPages: number }
    }
    out.push(...d.data.filter((s) => nombreDeTarjeta(s.imageUrl)))
    if (page >= d.totalPages || out.length >= hasta) break
    await dormir(400)
  }
  return out
}

async function revertir(): Promise<void> {
  const copias: string[] = []
  let token: string | undefined
  do {
    const r = await client.send(
      new ListObjectsV2Command({ Bucket, Prefix: PREFIJO_RESPALDO, ContinuationToken: token }),
    )
    for (const o of r.Contents ?? []) if (o.Key) copias.push(o.Key)
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  console.log(`${copias.length} tarjetas respaldadas`)
  for (const Key of copias) {
    const nombre = path.basename(Key)
    console.log(`  ${APLICAR ? 'restaurando' : 'restauraría'} social/${nombre}`)
    if (!APLICAR) continue
    const original = await bajar(Key)
    await uploadImageToR2(original, nombre, 'image/jpeg')
    await subirVariantesWeb(original, nombre)
  }
}

async function main(): Promise<void> {
  if (REVERTIR) return revertir()

  const logDir = path.resolve(process.cwd(), '.migraciones-log')
  mkdirSync(logDir, { recursive: true })
  const logFile = path.join(logDir, `regenerar-storycards-${Date.now()}.jsonl`)

  const todas = await listarTarjetas(LIMITE)
  const candidatas = todas.slice(0, LIMITE)
  console.log(
    `${todas.length} noticias publicadas con tarjeta compuesta` +
      (Number.isFinite(LIMITE) ? ' (listado cortado al juntar el lote)' : ''),
  )
  if (candidatas.length < todas.length) console.log(`este lote toma ${candidatas.length}`)
  console.log(APLICAR ? '=== APLICANDO ===' : '=== SIMULACIÓN (sin --apply no escribe) ===')

  const cuenta: Record<string, number> = {}
  const anotar = (s: Historia, resultado: string, extra: Record<string, unknown> = {}) => {
    cuenta[resultado] = (cuenta[resultado] ?? 0) + 1
    appendFileSync(logFile, JSON.stringify({ id: s.id, slug: s.slug, resultado, ...extra }) + '\n')
  }

  let siguiente = 0
  async function trabajar(): Promise<void> {
    for (;;) {
      const i = siguiente++
      if (i >= candidatas.length) return
      const s = candidatas[i]
      const nombre = nombreDeTarjeta(s.imageUrl)!
      try {
        if (await existe(PREFIJO_RESPALDO + nombre)) {
          anotar(s, 'ya regenerada')
          continue
        }
        const og = await fetchOgImage(s.sourceUrl)
        if (!og) {
          anotar(s, 'la fuente ya no tiene foto')
          continue
        }
        const dl = await downloadExternalImage(og)
        const img = dl ? await loadImage(dl.buffer).catch(() => null) : null
        if (!img) {
          anotar(s, 'la foto no se pudo bajar o leer', { og })
          continue
        }
        const titulo = tituloDeTarjeta(s)
        if (!APLICAR) {
          anotar(s, 'recomponible', { ancho: img.width })
          continue
        }
        // Respaldo primero: si la copia falla, no se pisa nada.
        await client.send(
          new CopyObjectCommand({
            Bucket,
            Key: PREFIJO_RESPALDO + nombre,
            CopySource: `${Bucket}/social/${nombre}`,
          }),
        )
        const tarjeta = composeBrandedStoryCard(img, titulo)
        await uploadImageToR2(tarjeta, nombre, 'image/jpeg')
        await subirVariantesWeb(tarjeta, nombre)
        anotar(s, 'regenerada', { ancho: img.width })
      } catch (err) {
        anotar(s, 'error', { error: err instanceof Error ? err.message : String(err) })
      } finally {
        if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${candidatas.length}`)
        await dormir(PAUSA_MS)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajar))

  console.log('\nResultado:')
  for (const [k, v] of Object.entries(cuenta).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)
  console.log(`\nDetalle por noticia: ${logFile}`)
}

// Solo corre como script, no al importarlo desde un test.
if (process.argv[1] && /regenerar-storycards\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
