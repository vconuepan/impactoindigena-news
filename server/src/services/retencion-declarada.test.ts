import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * La Politica de Privacidad declara plazos de conservacion y el codigo los
 * aplica. Son dos lados que pueden divergir sin que ninguno se vea mal.
 *
 * `cleanupAnalytics.ts` ya lo advertia por escrito —«Debe coincidir con el plazo
 * declarado en la Política de Privacidad»— y **nada lo comprobaba**: bastaba
 * cambiar una variable de entorno para que el documento prometiera un plazo que
 * el sistema no aplica. Es la misma clase de defecto que la auditoria legal del
 * 7-sep-2026 encontro nueve veces: la pagina se ve perfecta mientras dice algo
 * que el sistema no hace.
 *
 * El test lee los dos lados y los compara. No valida la redaccion: valida que
 * el numero de meses del documento sea el que sale del codigo.
 */

const CONFIG = readFileSync(path.resolve(__dirname, '../config.ts'), 'utf8')
const POLITICA = readFileSync(
  path.resolve(__dirname, '../../../client/src/pages/PrivacyPage.tsx'),
  'utf8',
)

/** Los dias por defecto de una retencion declarada en `config.ts`. */
function diasDe(clave: string): number {
  const m = CONFIG.match(new RegExp(`${clave}:\\s*parseInt\\(process\\.env\\.\\w+\\s*\\|\\|\\s*"(\\d+)"`))
  if (!m) throw new Error(`no se encontro la retencion «${clave}» en config.ts: se renombro o cambio de forma`)
  return Number(m[1])
}

/** La viñeta de Conservacion que empieza por `rotulo`, con su `<strong>N meses</strong>`. */
function mesesDeclarados(rotulo: string): number {
  const i = POLITICA.indexOf(rotulo)
  if (i === -1) throw new Error(`la Politica ya no tiene la viñeta «${rotulo}»`)
  const vineta = POLITICA.slice(i, POLITICA.indexOf('</li>', i))
  const m = vineta.match(/<strong>(\d+)&nbsp;meses<\/strong>|<strong>(\d+) meses<\/strong>/)
  if (!m) throw new Error(`la viñeta «${rotulo}» ya no declara un plazo en meses`)
  return Number(m[1] ?? m[2])
}

const CASOS = [
  {
    nombre: 'registro de actividad (audit_log)',
    clave: 'retentionDays',
    rotulo: 'Registro de actividad sobre datos personales',
  },
  {
    nombre: 'metricas de audiencia (daily_visitors)',
    clave: 'visitorRetentionDays',
    rotulo: 'Métricas de audiencia',
  },
]

describe('los plazos de conservacion del codigo y de la Politica coinciden', () => {
  it('las dos fuentes se leyeron', () => {
    expect(CONFIG.length, 'no se leyo config.ts').toBeGreaterThan(1000)
    expect(POLITICA.length, 'no se leyo PrivacyPage.tsx').toBeGreaterThan(1000)
  })

  for (const { nombre, clave, rotulo } of CASOS) {
    it(`${nombre}: los dias del codigo equivalen a los meses declarados`, () => {
      const dias = diasDe(clave)
      const meses = mesesDeclarados(rotulo)
      const mesesDelCodigo = Math.round(dias / 30.44)
      expect(
        mesesDelCodigo,
        `la Politica promete ${meses} meses para ${nombre} y el codigo aplica ${dias} dias (~${mesesDelCodigo} meses): uno de los dos hay que corregir`,
      ).toBe(meses)
    })
  }
})

describe('el registro de actividad se purga de verdad', () => {
  const SEED = readFileSync(path.resolve(__dirname, '../scripts/seed-jobs.ts'), 'utf8')
  const HANDLERS = readFileSync(path.resolve(__dirname, '../jobs/handlers.ts'), 'utf8')

  it('el job existe en el registro de handlers', () => {
    // Un job declarado en el seed y sin handler falla al ejecutarse, en silencio
    // hasta que alguien mire `job_runs`.
    expect(
      HANDLERS.includes('cleanup_audit_log:'),
      'cleanup_audit_log dejo de estar en el registro de handlers: el job quedaria declarado y sin ejecutar',
    ).toBe(true)
  })

  it('el job esta declarado en el seed y habilitado', () => {
    const m = SEED.match(/\{\s*jobName:\s*'cleanup_audit_log',[^}]*\}/)
    expect(m, 'cleanup_audit_log ya no esta en el seed de jobs').not.toBeNull()
    expect(
      m![0],
      'cleanup_audit_log quedo deshabilitado: la tabla volveria a crecer sin plazo',
    ).toContain('enabled: true')
  })
})

describe('los caminos de autoservicio no guardan el correo del titular', () => {
  const AUTH = readFileSync(path.resolve(__dirname, '../routes/auth.ts'), 'utf8')

  it('el borrado de cuenta y el export usan actorTitular, no req.user', () => {
    // `req.user` lleva el correo. En el borrado de cuenta eso escribia el correo
    // del titular en `audit_log` EN EL MISMO ACTO de borrarlo.
    const crudos = [...AUTH.matchAll(/writeAuditLog\(\{\s*actor:\s*req\.user/g)]
    expect(
      crudos.length,
      'un camino de autoservicio volvio a pasar `req.user` a writeAuditLog: eso guarda el correo del titular en el registro de actividad',
    ).toBe(0)
  })

  it('siguen registrando la operacion, que es lo que la auditoria necesita', () => {
    // Quitar el correo no debe convertirse en dejar de auditar.
    expect(AUTH).toContain("action: 'account.delete'")
    expect(AUTH).toContain("action: 'data.export'")
  })
})
