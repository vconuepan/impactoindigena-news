/**
 * unpublish-old-sources.ts
 *
 * Despublica las historias cuyo articulo original supera el techo editorial de
 * antiguedad (`config.crawl.maxSourceAgeMonths`, hoy 18 meses).
 *
 * POR QUE EXISTE. El job de descubrimiento por busqueda nunca aplico un filtro
 * de fecha: crea las historias con `prisma.story.create` directo, sin pasar por
 * el guardia que el crawler de feeds si tiene. Medido en la base el 17-ago-2026:
 * de las 61 historias publicadas el 16 y 17 de agosto, **30 tenian el articulo
 * original con mas de 18 meses**, y la mas vieja era del **2 de mayo de 2011**.
 * Casi la mitad de dos dias de publicacion era archivo presentado como noticia.
 *
 * El filtro ya quedo cerrado hacia adelante (`lib/source-age.ts`, aplicado en el
 * discover y en `createStory`). Esto limpia lo que alcanzo a salir.
 *
 * QUE HACE. Pasa las historias afectadas de `published` a `rejected`. NO borra:
 * el archivo de rechazadas es un registro historico deliberado del proyecto, y
 * una nota rechazada se puede volver a publicar desde el panel si el criterio
 * cambia. Tampoco toca el slug ni el contenido.
 *
 * OJO CON EL SEO. Una historia despublicada devuelve 404 en su URL, y eso es lo
 * correcto —se arreglo en el PR #18, cuando las despublicadas devolvian 200 con
 * la home y Search Console reportaba 229 Soft 404—. Si alguna de estas ya fue
 * indexada, el 404 es la senal honesta.
 *
 * Correr:
 *   npm run migration:unpublish-old --prefix server           # simulacion
 *   npm run migration:unpublish-old:apply --prefix server     # aplica
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { config } from '../../config.js'

const APPLY = process.argv.includes('--apply')

/**
 * Umbral en meses para ESTA limpieza, independiente del techo de publicacion.
 *
 * Por defecto usa `config.crawl.maxSourceAgeMonths` (18), pero se puede subir
 * con `--months N`. La decision editorial del 17-ago-2026 fue justamente esa:
 * el techo de 18 meses rige hacia adelante, y para el archivo ya publicado se
 * despublico solo lo de mas de 36 meses. Una nota de 2008 sobre la promulgacion
 * del Convenio 169 no es noticia, pero sigue siendo referencia; lo de 18 meses a
 * 3 años se conserva. Y borrar 370 URLs indexadas de golpe cuesta mas en SEO de
 * lo que aporta la coherencia formal.
 */
const monthsArg = process.argv.indexOf('--months')
const UMBRAL_MESES = monthsArg !== -1
  ? parseInt(process.argv[monthsArg + 1], 10)
  : config.crawl.maxSourceAgeMonths

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  console.log(APPLY ? '== APLICANDO CAMBIOS ==' : '== SIMULACION (no escribe) ==\n')
  console.log(`Umbral de esta limpieza: ${UMBRAL_MESES} meses` +
    (UMBRAL_MESES !== config.crawl.maxSourceAgeMonths
      ? `  (el techo de publicacion es ${config.crawl.maxSourceAgeMonths})\n`
      : '\n'))

  const publicadas = await prisma.story.findMany({
    where: { status: 'published', sourceDatePublished: { not: null } },
    select: {
      id: true,
      slug: true,
      title: true,
      sourceTitle: true,
      sourceDatePublished: true,
      feed: { select: { title: true } },
    },
    orderBy: { sourceDatePublished: 'asc' },
  })

  const ahora = Date.now()
  const MS_MES = 30.44 * 24 * 60 * 60 * 1000
  const viejas = publicadas
    .map(s => {
      const meses = s.sourceDatePublished
        ? Math.round((ahora - s.sourceDatePublished.getTime()) / MS_MES)
        : null
      return { story: s, meses }
    })
    .filter(x => x.meses !== null && x.meses > UMBRAL_MESES)

  console.log(`Publicadas con fecha de origen: ${publicadas.length}`)
  console.log(`Superan el techo: ${viejas.length}\n`)

  if (viejas.length === 0) {
    console.log('Nada que despublicar.')
    return
  }

  // Por feed, para ver de donde vino el problema.
  const porFeed = new Map<string, number>()
  for (const { story } of viejas) {
    const f = story.feed?.title ?? '(sin feed)'
    porFeed.set(f, (porFeed.get(f) ?? 0) + 1)
  }

  for (const { story, meses } of viejas) {
    const fecha = story.sourceDatePublished?.toISOString().slice(0, 10) ?? '?'
    console.log(`  ${fecha}  (${meses} meses)  ${story.title?.slice(0, 62) ?? ''}`)
    if (APPLY) {
      await prisma.story.update({ where: { id: story.id }, data: { status: 'rejected' } })
    }
  }

  console.log('\nPor fuente:')
  for (const [feed, n] of [...porFeed.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${feed}`)
  }

  console.log(`\n${APPLY ? 'Despublicadas' : 'Se despublicarian'}: ${viejas.length}`)
  if (!APPLY) {
    console.log('\nRevisa la lista. Si convence, corre:')
    console.log(`  npm run migration:unpublish-old:apply --prefix server${monthsArg !== -1 ? ` -- --months ${UMBRAL_MESES}` : ''}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
