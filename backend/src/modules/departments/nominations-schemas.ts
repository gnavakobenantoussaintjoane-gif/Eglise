import { z } from 'zod';

/**
 * Roles internes a un departement.
 *
 * Ils sont distincts du role global du profil (`app_role`) : un membre peut etre
 * « membre » de l'eglise et « responsable » d'un seul departement.
 */
export const DEPARTMENT_MEMBER_ROLES = ['leader', 'assistant', 'member'] as const;
export type DepartmentMemberRole = (typeof DEPARTMENT_MEMBER_ROLES)[number];

/**
 * Corps attendu pour nommer ou reaffecter un membre dans un departement.
 *
 * `startedOn` est facultatif : la date du jour est utilisee si elle est omise.
 * `functionTitle` permet d'indiquer un intitule libre (« Responsable louange »).
 */
export const nominationInputSchema = z.object({
  profileId: z.string().uuid(),
  role: z.enum(DEPARTMENT_MEMBER_ROLES).default('member'),
  functionTitle: z.string().trim().max(120).optional(),
  startedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
    .optional(),
});

export const nominationEndSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
