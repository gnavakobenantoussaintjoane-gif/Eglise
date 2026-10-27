import type { ApiErrorShape } from '../types';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get fieldErrors(): Record<string, string> {
    const issues = (this.details as { issues?: { path?: string; message: string }[] } | undefined)?.issues;
    if (!Array.isArray(issues)) return {};
    return issues.reduce<Record<string, string>>((acc, issue) => {
      if (issue.path) acc[issue.path] = issue.message;
      return acc;
    }, {});
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, params?: QueryParams): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: QueryParams;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, signal } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;

  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: payload,
      signal,
      credentials: 'include',
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.',
    );
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(response.status, 'HTTP_ERROR', 'Réponse inattendue du serveur.');
    }
    return (await response.text()) as unknown as T;
  }

  const data = (await response.json()) as unknown;

  if (!response.ok) {
    const shaped = data as ApiErrorShape;
    throw new ApiError(
      response.status,
      shaped?.error?.code ?? 'ERROR',
      shaped?.error?.message ?? 'Une erreur est survenue.',
      shaped?.error?.details,
    );
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, params?: QueryParams, signal?: AbortSignal) =>
    request<T>(path, { params, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', body: formData }),
  uploadPatch: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'PATCH', body: formData }),
};

/** Telecharge un fichier binaire protege (ZIP d'album) via fetch + blob. */
export async function downloadBinary(path: string, fileName: string): Promise<void> {
  const response = await fetch(buildUrl(path), { credentials: 'include' });
  if (!response.ok) {
    let message = 'Téléchargement impossible.';
    try {
      const data = (await response.json()) as ApiErrorShape;
      message = data.error?.message ?? message;
    } catch {
      /* reponse non JSON */
    }
    throw new ApiError(response.status, 'DOWNLOAD_ERROR', message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
