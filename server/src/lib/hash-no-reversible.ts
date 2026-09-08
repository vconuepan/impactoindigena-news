import crypto from 'crypto'

/**
 * Hash de un dato personal que NO se puede revertir a su origen.
 *
 * EL DEFECTO QUE ESTO CORRIGE (8-sep-2026): la Politica de Privacidad declara
 * que del feedback «de la IP solo guardamos un hash no reversible», y el codigo
 * hacia `createHash('sha256').update(ip)` — SHA-256 crudo, sin sal. El espacio
 * de IPv4 son 2^32 valores: quien tenga la tabla recupera la IP exacta por
 * busqueda exhaustiva en minutos. La promesa era falsa.
 *
 * LA SAL VIVE SOLO EN MEMORIA Y ROTA CADA DIA. Eso es lo que vuelve el hash
 * irreversible de verdad: no hay secreto guardado que robar junto a la tabla, y
 * pasado el dia ni nosotros podemos reconstruir a quien correspondia. Es el
 * mismo patron que `analyticsVisitor.ts` ya usaba y documentaba con esa misma
 * palabra —«non-reversible»— para los visitantes; el camino del feedback se
 * habia quedado fuera. Cada superficie mantiene su propia sal: un hash de
 * feedback no debe poder cruzarse con uno de analitica.
 *
 * LO QUE SE PIERDE, Y POR QUE NO IMPORTA AQUI: dos envios del mismo IP en dias
 * distintos —o separados por un reinicio del servidor— dan hashes distintos, asi
 * que el valor no sirve para correlacionar. Verificado el 8-sep: **ningun codigo
 * lee `Feedback.ipHash`**, solo se escribe (grep sobre server/src). El abuso lo
 * ataja `feedbackLimiter`, un rate limit por IP, no este campo.
 *
 * QUEDA UNA PREGUNTA ABIERTA que este modulo no resuelve: si el dato no se lee
 * nunca, la conservacion limitada dice que no deberia guardarse. Dejar de
 * hacerlo exige una migracion —`ipHash` es obligatorio en el schema— y esa es
 * decision del director.
 */

/** Sales por ambito, en memoria, regeneradas al cambiar el dia. */
const sales = new Map<string, { sal: Buffer; dia: string }>()

function salDelDia(ambito: string, dia: string): Buffer {
  const actual = sales.get(ambito)
  if (!actual || actual.dia !== dia) {
    const nueva = { sal: crypto.randomBytes(32), dia }
    sales.set(ambito, nueva)
    return nueva.sal
  }
  return actual.sal
}

/** El dia UTC en formato YYYY-MM-DD. */
export function diaUtc(ahora: Date = new Date()): string {
  return ahora.toISOString().slice(0, 10)
}

/**
 * Devuelve `sha256(salDelDia + valor)` en hexadecimal.
 *
 * `ambito` aisla las sales entre superficies —usa una constante por caso de uso,
 * no un valor que venga del usuario—. `dia` decide cuando rota; pasarlo
 * explicitamente mantiene la funcion pura y comprobable.
 */
export function hashNoReversible(ambito: string, valor: string, dia: string = diaUtc()): string {
  return crypto
    .createHash('sha256')
    .update(salDelDia(ambito, dia))
    .update('|')
    .update(valor)
    .digest('hex')
}

/** Solo para pruebas: olvida las sales para que cada caso empiece limpio. */
export function _olvidarSales(): void {
  sales.clear()
}
