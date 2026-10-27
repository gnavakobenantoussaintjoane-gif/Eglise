/** Erreur applicative portant un statut HTTP et un code stable. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Authentification requise.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Acces refuse.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Ressource introuvable.') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string, details?: unknown) {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static tooManyRequests(message = 'Trop de requetes, reessayez plus tard.') {
    return new AppError(429, 'RATE_LIMITED', message);
  }

  static internal(message = 'Erreur interne du serveur.') {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }
}
