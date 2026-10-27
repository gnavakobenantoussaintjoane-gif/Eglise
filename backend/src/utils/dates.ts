/**
 * Normalisation des dates renvoyees par le pilote PostgreSQL.
 *
 * Selon le pilote (PGlite, node-postgres), une colonne `date` revient soit sous
 * la forme `AAAA-MM-JJ`, soit sous forme d'horodatage ISO
 * (`AAAA-MM-JJT00:00:00.000Z`). L'API expose toujours la premiere forme afin que
 * le frontend n'ait pas a connaitre le pilote utilise.
 */
export function toDateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}
