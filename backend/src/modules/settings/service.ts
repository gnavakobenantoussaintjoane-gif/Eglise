import { z } from 'zod';
import { getDatabase } from '../../db/client.js';
import { getStorage } from '../../storage/index.js';
import type { AuthProfile } from '../../auth/permissions.js';
import { recordAudit } from '../../middlewares/audit.js';

export interface ChurchSettingsRow {
  id: number;
  church_name: string;
  slogan: string;
  tagline: string | null;
  about: string | null;
  vision: string | null;
  mission: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  social_links: Record<string, string>;
  service_times: ServiceTime[];
  logo_path: string | null;
  hero_image_path: string | null;
  color_primary: string;
  color_royal: string;
  color_accent: string;
  updated_at: string;
}

export const serviceTimeSchema = z.object({
  label: z.string().trim().min(2).max(80),
  day: z.string().trim().min(2).max(40),
  time: z.string().trim().min(2).max(40),
  location: z.string().trim().max(120).optional().default(''),
});

export type ServiceTime = z.infer<typeof serviceTimeSchema>;

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hexadecimale attendue (#RRGGBB).');

export const settingsUpdateSchema = z.object({
  churchName: z.string().trim().min(2).max(120).optional(),
  slogan: z.string().trim().min(2).max(160).optional(),
  tagline: z.string().trim().max(200).nullish(),
  about: z.string().trim().max(5000).nullish(),
  vision: z.string().trim().max(3000).nullish(),
  mission: z.string().trim().max(3000).nullish(),
  address: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(120).nullish(),
  country: z.string().trim().max(120).nullish(),
  phone: z.string().trim().max(40).nullish(),
  whatsapp: z.string().trim().max(40).nullish(),
  email: z.string().trim().email('E-mail invalide.').max(180).nullish(),
  socialLinks: z.record(z.string().trim().min(1).max(40), z.string().trim().max(300)).optional(),
  serviceTimes: z.array(serviceTimeSchema).max(20).optional(),
  colorPrimary: hexColor.optional(),
  colorRoyal: hexColor.optional(),
  colorAccent: hexColor.optional(),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

export interface ChurchSettings {
  churchName: string;
  slogan: string;
  tagline: string | null;
  about: string | null;
  vision: string | null;
  mission: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  socialLinks: Record<string, string>;
  serviceTimes: ServiceTime[];
  logoUrl: string | null;
  heroUrl: string | null;
  colors: { primary: string; royal: string; accent: string };
  updatedAt: string;
}

async function mapSettings(row: ChurchSettingsRow): Promise<ChurchSettings> {
  const storage = getStorage();
  const [logoUrl, heroUrl] = await Promise.all([
    row.logo_path ? storage.publicUrl(row.logo_path) : Promise.resolve(null),
    row.hero_image_path ? storage.publicUrl(row.hero_image_path) : Promise.resolve(null),
  ]);
  return {
    churchName: row.church_name,
    slogan: row.slogan,
    tagline: row.tagline,
    about: row.about,
    vision: row.vision,
    mission: row.mission,
    address: row.address,
    city: row.city,
    country: row.country,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    socialLinks: row.social_links ?? {},
    serviceTimes: row.service_times ?? [],
    logoUrl,
    heroUrl,
    colors: {
      primary: row.color_primary,
      royal: row.color_royal,
      accent: row.color_accent,
    },
    updatedAt: row.updated_at,
  };
}

export async function getSettingsRow(): Promise<ChurchSettingsRow> {
  const db = getDatabase();
  const { rows } = await db.query<ChurchSettingsRow>(
    'select * from public.church_settings where id = 1',
  );
  if (!rows[0]) {
    await db.query(
      `insert into public.church_settings (id) values (1) on conflict (id) do nothing`,
    );
    const retry = await db.query<ChurchSettingsRow>(
      'select * from public.church_settings where id = 1',
    );
    if (!retry.rows[0]) throw new Error("Parametres de l'eglise introuvables.");
    return retry.rows[0];
  }
  return rows[0];
}

export async function getSettings(): Promise<ChurchSettings> {
  return mapSettings(await getSettingsRow());
}

export async function updateSettings(
  input: SettingsUpdateInput,
  actor: AuthProfile,
): Promise<ChurchSettings> {
  const db = getDatabase();
  const { rows } = await db.query<ChurchSettingsRow>(
    `update public.church_settings set
       church_name = coalesce($1, church_name),
       slogan = coalesce($2, slogan),
       tagline = case when $3::boolean then $4 else tagline end,
       about = case when $5::boolean then $6 else about end,
       vision = case when $7::boolean then $8 else vision end,
       mission = case when $9::boolean then $10 else mission end,
       address = case when $11::boolean then $12 else address end,
       city = case when $13::boolean then $14 else city end,
       country = case when $15::boolean then $16 else country end,
       phone = case when $17::boolean then $18 else phone end,
       whatsapp = case when $19::boolean then $20 else whatsapp end,
       email = case when $21::boolean then $22 else email end,
       social_links = coalesce($23::jsonb, social_links),
       service_times = coalesce($24::jsonb, service_times),
       color_primary = coalesce($25, color_primary),
       color_royal = coalesce($26, color_royal),
       color_accent = coalesce($27, color_accent)
     where id = 1
     returning *`,
    [
      input.churchName ?? null,
      input.slogan ?? null,
      input.tagline !== undefined,
      input.tagline ?? null,
      input.about !== undefined,
      input.about ?? null,
      input.vision !== undefined,
      input.vision ?? null,
      input.mission !== undefined,
      input.mission ?? null,
      input.address !== undefined,
      input.address ?? null,
      input.city !== undefined,
      input.city ?? null,
      input.country !== undefined,
      input.country ?? null,
      input.phone !== undefined,
      input.phone ?? null,
      input.whatsapp !== undefined,
      input.whatsapp ?? null,
      input.email !== undefined,
      input.email ?? null,
      input.socialLinks ? JSON.stringify(input.socialLinks) : null,
      input.serviceTimes ? JSON.stringify(input.serviceTimes) : null,
      input.colorPrimary ?? null,
      input.colorRoyal ?? null,
      input.colorAccent ?? null,
    ],
  );

  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'settings.update',
    entityType: 'church_settings',
    entityId: '1',
    metadata: { fields: Object.keys(input) },
  });

  return mapSettings(rows[0]);
}

export async function setBrandingImage(
  kind: 'logo' | 'hero',
  storagePath: string,
  actor: AuthProfile,
): Promise<ChurchSettings> {
  const db = getDatabase();
  const column = kind === 'logo' ? 'logo_path' : 'hero_image_path';
  const { rows } = await db.query<ChurchSettingsRow>(
    `update public.church_settings set ${column} = $1, updated_at = now() where id = 1 returning *`,
    [storagePath],
  );
  await recordAudit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: `settings.${kind}_updated`,
    entityType: 'church_settings',
    entityId: '1',
  });
  return mapSettings(rows[0]);
}

export async function currentBrandingPaths(): Promise<{ logo: string | null; hero: string | null }> {
  const row = await getSettingsRow();
  return { logo: row.logo_path, hero: row.hero_image_path };
}
