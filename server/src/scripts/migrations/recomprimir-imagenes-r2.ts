/**
 * Recomprime y redimensiona las imagenes que ya estan en R2.
 *
 * El problema que resuelve, medido el 4-sep-2026 sobre la portada en vivo:
 * de 70 imagenes referenciadas, 30 son PNG y pesan 66,92 MB - un promedio de
 * 2.284 KB cada una, contra 429 KB de las 40 restantes. Lighthouse movil marca
 * "Serve images in next-gen formats" (8,7 MB) y "Properly size images" (6,0 MB)
 * como las dos unicas oportunidades grandes del sitio.
 *
 * El cambio a JPEG en composeBrandedStoryCard solo alcanza a las tarjetas
 * nuevas: las ya subidas siguen siendo PNG y seguiran pesando lo mismo para
 * siempre. Esto las alcanza.
 *
 * DECISION DE DISENO: se sobrescribe la MISMA clave con bytes JPEG en vez de
 * subir una clave nueva. La extension queda mintiendo (.png con contenido
 * JPEG), pero el navegador se guia por el Content-Type, no por la extension, y
 * a cambio NO hay que tocar Story.imageUrl en la base de datos: cero escrituras
 * en produccion, cero riesgo de dejar historias apuntando a una URL muerta.
 *
 * REVERSION: antes de sobrescribir, el original se copia a
 * `social/original-png/<nombre>`. Para revertir, se copia de vuelta.
 *
 *   npx tsx src/scripts/migrations/recomprimir-imagenes-r2.ts            # simula
 *   npx tsx src/scripts/migrations/recomprimir-imagenes-r2.ts --apply
 *   npx tsx src/scripts/migrations/recomprimir-imagenes-r2.ts --revertir --apply
 */
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { config } from '../../config.js'

/** Ancho maximo servido. Las tarjetas se componen a 1200x630; nada necesita mas. */
const MAX_WIDTH = 1200
/** Misma calidad que composeBrandedStoryCard, para que el resultado sea identico. */
const JPEG_QUALITY = 82
/** Debajo de esto no vale la pena tocar el objeto. */
const MIN_BYTES = 300_000
/**
 * Trabajadores en paralelo. Medido: en serie el proceso hacia 19 imagenes cada
 * 5 minutos - seis horas para las 1.478. El cuello es la descarga, no la CPU.
 */
const CONCURRENCIA = 8
const PREFIX = 'social/'
/**
 * Donde viven los originales. Son dos porque la primera corrida (1.421 PNG,
 * 4-sep) uso el nombre viejo y migrar esos objetos para renombrar el prefijo no
 * valdria nada. Se escribe en el primero; se leen los dos para saber que ya
 * paso por aca.
 */
const BACKUP_PREFIX = 'social/original/'
const BACKUP_PREFIXES = [BACKUP_PREFIX, 'social/original-png/']
/** Formatos que vale la pena recomprimir. Un WebP ya esta donde queremos. */
const RECOMPRIMIBLES = /\.(png|jpe?g)$/i

const args = process.argv.slice(2)
const APLICAR = args.includes('--apply')
const REVERTIR = args.includes('--revertir')
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
const logFile = path.join(logDir, `recomprimir-r2-${Date.now()}.jsonl`)

async function listarTodo(prefix: string): Promise<{ Key: string; Size: number }[]> {
  const out: { Key: string; Size: number }[] = []
  let token: string | undefined
  do {
    const r = await client.send(
      new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }),
    )
    for (const o of r.Contents ?? []) {
      if (o.Key && o.Size != null) out.push({ Key: o.Key, Size: o.Size })
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  return out
}

async function bajar(Key: string): Promise<Buffer> {
  const r = await client.send(new GetObjectCommand({ Bucket, Key }))
  return Buffer.from(await r.Body!.transformToByteArray())
}

async function revertir(): Promise<void> {
  const copias = (await Promise.all(BACKUP_PREFIXES.map(listarTodo))).flat()
  console.log(`${copias.length} originales guardados`)
  for (const { Key } of copias) {
    const destino = PREFIX + path.basename(Key)
    console.log(`  ${APLICAR ? 'restaurando' : 'restauraria'} ${destino}`)
    if (!APLICAR) continue
    await client.send(
      new CopyObjectCommand({
        Bucket,
        Key: destino,
        CopySource: `${Bucket}/${Key}`,
        ContentType: /\.png$/i.test(Key) ? 'image/png' : 'image/jpeg',
        CacheControl: 'public, max-age=31536000',
        MetadataDirective: 'REPLACE',
      }),
    )
  }
}

async function main(): Promise<void> {
  if (REVERTIR) return revertir()

  const todos = await listarTodo(PREFIX)

  // Un objeto con respaldo ya paso por aca. Reprocesarlo lo recomprimiria dos
  // veces Y pisaria el respaldo con la version ya comprimida, perdiendo el
  // original para siempre. Este conjunto es lo que hace la corrida reanudable.
  const yaHechos = new Set(
    todos
      .filter((o) => BACKUP_PREFIXES.some((p) => o.Key.startsWith(p)))
      .map((o) => path.basename(o.Key)),
  )

  const elegibles = todos
    .filter((o) => !BACKUP_PREFIXES.some((p) => o.Key.startsWith(p)))
    .filter((o) => RECOMPRIMIBLES.test(o.Key) && o.Size >= MIN_BYTES)
    .filter((o) => !yaHechos.has(path.basename(o.Key)))
    .sort((a, b) => b.Size - a.Size)
  const candidatos = elegibles.slice(0, LIMITE)

  const pesoTotal = todos.reduce((s, o) => s + o.Size, 0)
  const pesoElegible = elegibles.reduce((s, o) => s + o.Size, 0)
  console.log(`${todos.length} objetos en ${PREFIX} (${(pesoTotal / 2 ** 20).toFixed(1)} MB)`)
  if (yaHechos.size) console.log(`${yaHechos.size} ya recomprimidas en corridas anteriores`)
  console.log(
    `${elegibles.length} imagenes de mas de ${MIN_BYTES / 1024} KB (${(pesoElegible / 2 ** 20).toFixed(0)} MB)` +
      (candidatos.length < elegibles.length ? ` - este lote toma ${candidatos.length}` : ''),
  )
  console.log(APLICAR ? '=== APLICANDO ===' : '=== SIMULACION (sin --apply no escribe) ===\n')

  let antes = 0
  let despues = 0
  let hechos = 0
  let siguiente = 0

  async function trabajar(): Promise<void> {
    for (;;) {
      const i = siguiente++
      if (i >= candidatos.length) return
      const o = candidatos[i]
      try {
        const original = await bajar(o.Key)
        const img = await loadImage(original)
        const escala = Math.min(1, MAX_WIDTH / img.width)
        const w = Math.round(img.width * escala)
        const h = Math.round(img.height * escala)
        const canvas = createCanvas(w, h)
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const jpeg = canvas.toBuffer('image/jpeg', JPEG_QUALITY)

        if (jpeg.length >= original.length) {
          console.log(`  [${i + 1}] SALTA ${o.Key} (el JPEG no es mas chico)`)
          continue
        }

        antes += original.length
        despues += jpeg.length
        hechos++
        const pct = (100 * (1 - jpeg.length / original.length)).toFixed(0)
        console.log(
          `  [${i + 1}/${candidatos.length}] ${(original.length / 1024).toFixed(0)} KB -> ${(jpeg.length / 1024).toFixed(0)} KB (-${pct}%) ${img.width}x${img.height} -> ${w}x${h}  ${o.Key}`,
        )

        if (!APLICAR) continue

        // El registro se escribe ANTES de tocar nada, para que un fallo a mitad
        // de camino deje rastro de lo que ya se movio.
        appendFileSync(
          logFile,
          JSON.stringify({ key: o.Key, antes: original.length, despues: jpeg.length }) + '\n',
        )
        // El respaldo se hace con CopyObject: R2 copia el objeto de su lado, asi
        // que los 3,4 GB de originales no vuelven a subir por esta conexion.
        await client.send(
          new CopyObjectCommand({
            Bucket,
            Key: BACKUP_PREFIX + path.basename(o.Key),
            CopySource: `${Bucket}/${o.Key}`,
          }),
        )
        await client.send(
          new PutObjectCommand({
            Bucket,
            Key: o.Key,
            Body: jpeg,
            ContentType: 'image/jpeg',
            CacheControl: 'public, max-age=31536000',
          }),
        )
      } catch (err) {
        console.log(`  [${i + 1}] ERROR ${o.Key}: ${(err as Error).message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajar))

  console.log(
    `\n${hechos} imagenes · ${(antes / 2 ** 20).toFixed(1)} MB -> ${(despues / 2 ** 20).toFixed(1)} MB` +
      (antes ? ` (-${(100 * (1 - despues / antes)).toFixed(0)}%)` : ''),
  )
  if (APLICAR) console.log(`registro: ${logFile}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
