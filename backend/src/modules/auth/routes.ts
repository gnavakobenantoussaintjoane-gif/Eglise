import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.js';
import { bodyOf, validate } from '../../middlewares/validate.js';
import { authContext, loadAuthContext, requireAuth } from '../../middlewares/auth.js';
import { authLimiter, uploadLimiter } from '../../middlewares/rateLimit.js';
import { upload, validateUpload } from '../../middlewares/upload.js';
import { storeUpload, removeStoredFile } from '../../services/files.js';
import { buildSession } from '../../services/profile-view.js';
import { getDatabase } from '../../db/client.js';
import { mapProfileRow, type ProfileRow } from '../profiles/mapper.js';
import { recordAudit, clientIp } from '../../middlewares/audit.js';
import { AppError } from '../../utils/errors.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileUpdateSchema,
  registerSchema,
  resetPasswordSchema,
  type LoginInput,
  type ProfileUpdateInput,
  type RegisterInput,
} from './schemas.js';
import {
  authService,
  clearSessionCookies,
  readRefreshToken,
  setSessionCookies,
} from './service.js';

export const authRouter = Router();

authRouter.use(loadAuthContext);

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<RegisterInput>(req);
    const result = await authService.register(input);
    if (result.token) setSessionCookies(res, result.token, result.refreshToken);
    const session = await buildSession(result.profile);
    res.status(201).json({
      ...session,
      emailConfirmationRequired: result.emailConfirmationRequired ?? false,
      authenticated: Boolean(result.token),
    });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const input = bodyOf<LoginInput>(req);
    const result = await authService.login(input);
    setSessionCookies(res, result.token, result.refreshToken);
    res.json(await buildSession(result.profile));
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.auth?.token ?? null;
    await authService.logout(token);
    clearSessionCookies(res);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = readRefreshToken(req.cookies as Record<string, string>);
    if (!refreshToken) throw AppError.unauthorized('Aucune session a rafraichir.');
    const session = await authService.refresh(refreshToken);
    setSessionCookies(res, session.token, session.refreshToken);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/session',
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      res.json({ profile: null, permissions: null, status: null });
      return;
    }
    res.json(await buildSession(req.auth.profile));
  }),
);

authRouter.patch(
  '/profile',
  requireAuth,
  validate({ body: profileUpdateSchema }),
  asyncHandler(async (req, res) => {
    const { profile: current } = authContext(req);
    const input = bodyOf<ProfileUpdateInput>(req);
    const updated = await authService.updateProfile(current, input);
    res.json(await buildSession(updated));
  }),
);

authRouter.post(
  '/profile/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const updated = await authService.submitMembership(profile);
    const session = await buildSession(updated);
    res.json(session);
  }),
);

authRouter.post(
  '/avatar',
  requireAuth,
  uploadLimiter,
  upload.single('avatar'),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const file = validateUpload(req.file, 'image');
    if (file.size > 5 * 1024 * 1024) {
      throw AppError.badRequest('Photo trop volumineuse (5 Mo maximum).');
    }
    const stored = await storeUpload(`profiles/${profile.id}`, file);
    const db = getDatabase();
    const { rows } = await db.query<ProfileRow>(
      'update public.profiles set photo_path = $2 where id = $1 returning *',
      [profile.id, stored.path],
    );
    await removeStoredFile(profile.photoPath);
    await recordAudit(db, {
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'profile.avatar',
      entityType: 'profile',
      entityId: profile.id,
      ip: clientIp(req.ip),
    });
    res.json(await buildSession(mapProfileRow(rows[0])));
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  authLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const input = bodyOf<{ currentPassword: string; newPassword: string }>(req);
    await authService.changePassword(profile, input.currentPassword, input.newPassword);
    res.json({ ok: true, message: 'Mot de passe mis a jour.' });
  }),
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { email } = bodyOf<{ email: string }>(req);
    const result = await authService.requestPasswordReset(email);
    res.json({
      ok: true,
      message:
        'Si un compte correspond a cette adresse, un lien de reinitialisation a ete genere.',
      ...(result.devResetUrl ? { devResetUrl: result.devResetUrl } : {}),
    });
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { token, password } = bodyOf<{ token: string; password: string }>(req);
    await authService.resetPassword(token, password);
    res.json({ ok: true, message: 'Mot de passe reinitialise.' });
  }),
);

authRouter.get(
  '/me/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { profile } = authContext(req);
    const db = getDatabase();
    const { rows } = await db.query<{
      status: string;
      note: string | null;
      created_at: string;
    }>(
      `select status, note, created_at from public.membership_history
       where profile_id = $1 order by created_at desc limit 30`,
      [profile.id],
    );
    res.json({
      history: rows.map((row) => ({
        status: row.status,
        note: row.note,
        createdAt: row.created_at,
      })),
    });
  }),
);

export const authParamsSchema = z.object({});
