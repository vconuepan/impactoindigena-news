/**
 * Parseo de argumentos de línea de comandos para los scripts de `scripts/`.
 *
 * Funciones puras, sin `process`: reciben el `argv` y devuelven o lanzan. Así
 * se testean sin correr el script, que al importarse toca la base de datos.
 */

export class CliArgError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliArgError'
  }
}

const USO_LIMIT = 'Uso: --limit 20 o --limit=20'

/**
 * Lee `--limit N` o `--limit=N` de `argv`.
 *
 * - Sin `--limit` devuelve `null`: sin límite.
 * - Con `--limit` y un entero ≥ 0 devuelve ese entero (`--limit 0` es 0, no
 *   «sin límite»).
 * - Con `--limit` sin valor, o con un valor que no es un entero ≥ 0, lanza
 *   `CliArgError` con el mensaje para la persona.
 *
 * Por qué es estricto: hasta el 20-oct-2026 el backfill de traducciones hacía
 * `parseInt(argv[idx + 1])`, y `--limit=20`, `--limit veinte`, `--limit -5` o
 * un `--limit` final dejaban el límite en NaN, negativo o Infinity. Con
 * `--apply`, eso era traducir las 3.421 pendientes sin preguntar.
 */
export function parseLimitArg(argv: readonly string[]): number | null {
  const idx = argv.findIndex((a) => a === '--limit' || a.startsWith('--limit='))
  if (idx === -1) return null

  const arg = argv[idx]
  const raw = arg === '--limit' ? argv[idx + 1] : arg.slice('--limit='.length)

  // `--limit` al final, `--limit=` vacío, o `--limit --apply`: el valor que
  // sigue es otra opción, no un número.
  if (raw === undefined || raw === '' || raw.startsWith('--')) {
    throw new CliArgError(`--limit viene sin valor. ${USO_LIMIT}`)
  }
  if (!/^\d+$/.test(raw)) {
    throw new CliArgError(`--limit necesita un entero mayor o igual a 0, no «${raw}». ${USO_LIMIT}`)
  }
  return Number(raw)
}
