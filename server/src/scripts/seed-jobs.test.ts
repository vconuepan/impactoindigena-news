import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * El pipeline es un embudo y su orden importa: crawl alimenta a preassess,
 * preassess a assess, assess a select, y select a publish. Si una etapa corre
 * ANTES que la que la alimenta, trabaja sobre lo de la vuelta anterior y el
 * material se retrasa un ciclo entero sin que nada falle.
 *
 * OJO CON EL ALCANCE DE ESTE TEST: los horarios vivos estan en la base de datos
 * y se editan desde el panel de admin. `seed-jobs.ts` solo siembra los que aun
 * no existen —su upsert lleva `update: {}`—, asi que esto valida **la intencion
 * declarada**, no lo que corre en produccion. Para eso hay que mirar la tabla.
 */

const SEED = readFileSync(path.resolve(__dirname, 'seed-jobs.ts'), 'utf8')

/** Las horas a las que dispara un cron `M H * * *`, incluidas las listas `H1,H2`. */
function horasDe(cron: string): number[] {
  const campo = cron.trim().split(/\s+/)[1]
  if (!campo || campo.includes('*')) return []
  return campo.split(',').map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
}

function cronDe(job: string): string {
  const m = SEED.match(new RegExp(`jobName:\\s*'${job}',\\s*cronExpression:\\s*'([^']+)'`))
  if (!m) throw new Error(`no se encontro el job ${job} en seed-jobs.ts`)
  return m[1]
}

describe('la cadena del pipeline mantiene su orden', () => {
  it('estan los cinco jobs de la cadena', () => {
    for (const j of ['crawl_feeds', 'preassess_stories', 'assess_stories', 'select_stories', 'publish_stories']) {
      expect(() => cronDe(j)).not.toThrow()
    }
  })

  it('cada seleccion corre despues de una evaluacion', () => {
    const assess = horasDe(cronDe('assess_stories'))
    const select = horasDe(cronDe('select_stories'))
    expect(select.length).toBeGreaterThan(0)
    for (const h of select) {
      expect(
        assess.some((a) => a < h),
        `select corre a las ${h} UTC y ninguna evaluacion la precede ese dia`,
      ).toBe(true)
    }
  })

  it('cada publicacion corre despues de una seleccion', () => {
    const select = horasDe(cronDe('select_stories'))
    const publish = horasDe(cronDe('publish_stories'))
    expect(publish.length).toBeGreaterThan(0)
    for (const h of publish) {
      expect(
        select.some((s) => s < h),
        `publish corre a las ${h} UTC y ninguna seleccion la precede ese dia`,
      ).toBe(true)
    }
  })

  it('el posteo social corre, y su ventana cubre mas de un dia', () => {
    // Este test empezo exigiendo que cada posteo tuviera una publicacion previa
    // EL MISMO DIA, y produccion lo desmintio: el social corre a las 9 y 18 UTC
    // mientras la primera publicacion es a las 11. No esta roto —
    // `findAutoPostCandidates` mira `lookbackHours`, que vale 25, asi que el
    // posteo de las 9 toma lo publicado el dia anterior—.
    //
    // La leccion vale mas que el test: la suposicion era mia, no del sistema.
    // Lo que si importa es que el social corra y que la ventana siga cubriendo
    // mas de 24 horas; si alguien la bajara a 12, el orden intradia pasaria a
    // ser critico y este test tendria que volverse estricto.
    const social = horasDe(cronDe('social_auto_post'))
    expect(social.length).toBeGreaterThan(0)

    const config = readFileSync(path.resolve(__dirname, '../config.ts'), 'utf8')
    const m = config.match(/SOCIAL_LOOKBACK_HOURS[^)]*?'(\d+)'/)
    expect(m, 'no se encontro el valor por defecto de SOCIAL_LOOKBACK_HOURS').not.toBeNull()
    expect(
      Number(m![1]),
      'la ventana bajo de 24 h: ahora el orden intradia del posteo SI importa',
    ).toBeGreaterThan(24)
  })

  it('se publica mas de una vez al dia', () => {
    // Una sola franja deja el sitio congelado 23 de cada 24 horas y el sitemap
    // de noticias con una unica hora de publicacion. Ver el comentario del seed.
    expect(horasDe(cronDe('publish_stories')).length).toBeGreaterThanOrEqual(2)
  })

  it('el seed declara en que zona se leen los cron', () => {
    // Hasta el 8-sep-2026 corrian en UTC mientras el panel mostraba hora de
    // Chile, y un horario editado ahi caia tres o cuatro horas antes de lo que
    // su autor creia. Ahora la zona se le pasa a node-cron; el seed tiene que
    // decir cual, o vuelve la misma confusion con el signo cambiado.
    expect(SEED).toMatch(/SE LEEN EN HORA DE CHILE/i)
    expect(SEED).toContain('America/Santiago')
  })

  it('la zona llega de verdad a node-cron, en las DOS llamadas', () => {
    // El seed puede prometer hora de Chile y el scheduler seguir leyendo en la
    // del proceso: son archivos distintos y nada los ata. Aqui se atan.
    // Son dos registros —el del arranque y el del hot reload— y olvidar uno
    // deja los horarios editados desde el panel corriendo en otra zona que los
    // del arranque, que es la peor de las mezclas porque no se nota.
    const scheduler = readFileSync(path.resolve(__dirname, '../jobs/scheduler.ts'), 'utf8')
    const registros = scheduler.match(/cron\.schedule\(/g) || []
    // El patron cierra el callback ANTES de las opciones: `}, { timezone: … })`.
    // Buscar solo `{ timezone: TIMEZONE }` contaria tambien el log de arranque
    // y el test pasaria de largo una llamada sin zona.
    const conZona = scheduler.match(/\},\s*\{\s*timezone:\s*TIMEZONE\s*\}\)/g) || []
    expect(registros.length, 'no se encontro ninguna llamada a cron.schedule').toBeGreaterThan(0)
    expect(conZona.length, 'hay llamadas a cron.schedule sin la zona').toBe(registros.length)
    expect(scheduler).toMatch(/config\.scheduler\.timezone/)
  })

  it('la zona por defecto es la de Chile y se puede cambiar sin desplegar', () => {
    const cfg = readFileSync(path.resolve(__dirname, '../config.ts'), 'utf8')
    expect(cfg).toMatch(/SCHEDULER_TIMEZONE/)
    expect(cfg).toMatch(/America\/Santiago/)
  })

  it('el panel no anuncia una zona distinta de la que usa el scheduler', () => {
    // Ese desajuste es el defecto original: /server-time devolvia
    // 'America/Santiago' quemado mientras los cron corrian en UTC.
    const rutaJobs = readFileSync(path.resolve(__dirname, '../routes/admin/jobs.ts'), 'utf8')
    expect(rutaJobs).toMatch(/timezone:\s*config\.scheduler\.timezone/)
    expect(rutaJobs, 'la zona volvio a quedar quemada en el endpoint').not.toMatch(/timezone:\s*'America\/Santiago'/)
  })
})
