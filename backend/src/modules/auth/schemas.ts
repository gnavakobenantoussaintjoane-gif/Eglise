import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(180)
  .email('Adresse e-mail invalide.')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caracteres.')
  .max(200, 'Mot de passe trop long.')
  .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre.')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre.');

const trimmedString = (max: number) => z.string().trim().max(max);

export const registerSchema = z.object({
  firstName: trimmedString(80).min(2, 'Prenom requis.'),
  lastName: trimmedString(80).min(2, 'Nom requis.'),
  email: emailSchema,
  password: passwordSchema,
  phone: trimmedString(40).optional(),
  city: trimmedString(120).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis.').max(200),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const profileUpdateSchema = z.object({
  firstName: trimmedString(80).min(2, 'Prenom requis.').optional(),
  lastName: trimmedString(80).min(2, 'Nom requis.').optional(),
  phone: trimmedString(40).nullish(),
  city: trimmedString(120).nullish(),
  profession: trimmedString(120).nullish(),
  bio: z.string().trim().max(1500, 'Presentation trop longue (1500 caracteres max).').nullish(),
  departmentInterestId: z.string().uuid('Departement invalide.').nullish(),
  consentPhotos: z.boolean().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
