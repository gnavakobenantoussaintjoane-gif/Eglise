import type { Queryable } from '../db/client.js';

/**
 * Generation de slugs uniques : translitteration, kebab-case, suffixe si collision.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function uniqueSlug(
  db: Queryable,
  table: 'albums' | 'sermons' | 'events' | 'departments',
  base: string,
  ignoreId?: string,
): Promise<string> {
  const root = slugify(base) || 'element';
  let candidate = root;
  for (let attempt = 1; attempt < 60; attempt += 1) {
    const { rows } = await db.query<{ id: string }>(
      `select id from public.${table} where slug = $1 limit 1`,
      [candidate],
    );
    const existing = rows[0];
    if (!existing || existing.id === ignoreId) return candidate;
    candidate = `${root}-${attempt + 1}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}
