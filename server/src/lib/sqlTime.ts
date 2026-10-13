import { Prisma } from '@prisma/client'

/**
 * Una fecha de JS como timestamp SIN zona en UTC, sea cual sea la zona de la
 * sesion de la base. Hace falta porque las columnas son `timestamp(3)` (sin
 * zona): Prisma, en sus escrituras propias, guarda UTC; pero un Date pasado
 * como parametro a SQL crudo se convierte con la zona de la sesion. Medido el
 * 4-oct-2026: con la sesion en Europe/London, gate_evaluated_at quedaba una hora
 * adelantada respecto de stories.updated_at, y el conciliador habria dejado de
 * ver como vieja una nota editada en esa hora. Azure corre en UTC y no se nota;
 * el codigo no debe depender de eso.
 *
 * Movida aqui desde services/communityReview.ts el 13-oct-2026 para que el
 * carril de marca (D5) compare fechas con la misma regla.
 */
export function utc(d: Date | null): Prisma.Sql {
  return d === null ? Prisma.sql`NULL` : Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`
}
