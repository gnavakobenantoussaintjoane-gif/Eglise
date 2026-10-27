import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from '../hooks/useAuth';
import { FALLBACK_SETTINGS } from '../hooks/useChurchSettings';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const NOT_FOUND = {
  error: { code: 'NOT_FOUND', message: 'Ressource introuvable.' },
};

const PAYLOADS: Record<string, unknown> = {
  '/public/settings': FALLBACK_SETTINGS,
  '/public/departments': { departments: [] },
  '/public/sermons': { sermons: [], pagination: { page: 1, perPage: 3, total: 0, totalPages: 0 } },
  '/public/events': { events: [], pagination: { page: 1, perPage: 3, total: 0, totalPages: 0 } },
  '/public/albums': { albums: [], pagination: { page: 1, perPage: 3, total: 0, totalPages: 0 } },
  '/public/announcements': { announcements: [] },
  '/public/testimonies': { testimonies: [] },
};

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input).replace('/api/v1', '').split('?')[0];
      if (path === '/auth/session') return json(NOT_FOUND, 401);
      if (path in PAYLOADS) return json(PAYLOADS[path]);
      return json(NOT_FOUND, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppRoutes', () => {
  it('affiche la page d’accueil publique', async () => {
    renderAt('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: /un refuge, une famille, une mission/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('affiche la page 404 pour une route inconnue', async () => {
    renderAt('/route-inexistante');
    expect(await screen.findByText('Cette page n’existe pas')).toBeInTheDocument();
  });

  it('redirige un visiteur non connecté vers la connexion pour l’administration', async () => {
    renderAt('/admin');

    expect(await screen.findByText('Connexion à votre espace')).toBeInTheDocument();
    const sessionCall = (fetch as unknown as { mock: { calls: [RequestInfo | URL][] } }).mock.calls.find((call) =>
      String(call[0]).includes('/auth/session'),
    );
    expect(sessionCall).toBeTruthy();
  });

  it('propose la page de connexion publique', async () => {
    renderAt('/connexion');
    expect(await screen.findByRole('button', { name: /se connecter/i })).toBeInTheDocument();
  });
});
