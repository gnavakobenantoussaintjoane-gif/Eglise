import type { AuthContext } from '../auth/permissions.js';

declare global {
  namespace Express {
    interface Request {
      auth: AuthContext | null;
      validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
