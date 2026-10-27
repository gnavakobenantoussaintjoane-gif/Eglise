import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from '../hooks/useAuth';
import { FALLBACK_SETTINGS } from '../hooks/useChurchSettings';

/**
 * Fumée : chaque route publique doit se monter sans erreur d'exécution,
 * même quand l'API ne renvoie que des listes vides.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const emptyPage = { page: 1, perPage: 12, total: 0, totalPages: 0 };

const PAYLOADS: Record<string, unknown> = {
  '/public/settings': FALLBACK_SETTINGS,
  '/public/departments': { departments: [] },
  '/public/sermons': { sermons: [], pagination: emptyPage },
  '/public/events': { events: [], pagination: emptyPage },
  '/public/albums': { albums: [], pagination: emptyPage },
  '/public/announcements': { announcements: [] },
  '/public/testimonies': { testimonies: [] },
  '/auth/session': { session: null, profile: null, permissions: null },
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
      if (path in PAYLOADS) return json(PAYLOADS[path]);
      return json({ error: { code: 'NOT_FOUND', message: 'Ressource introuvable.' } }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PUBLIC_ROUTES: [string, RegExp][] = [
  ['/', /un refuge, une famille, une mission/i],
  ['/a-propos', /notre histoire|notre église|qui sommes-nous/i],
  ['/predications', /prédications/i],
  ['/evenements', /événements/i],
  ['/departements', /départements/i],
  ['/galerie', /galerie/i],
  ['/annonces', /annonces/i],
  ['/temoignages', /témoignages/i],
  ['/priere', /prière/i],
  ['/contact', /contact/i],
  ['/confidentialite', /confidentialité/i],
  ['/inscription', /créer mon compte/i],
  ['/mot-de-passe-oublie', /mot de passe/i],
];

describe('routes publiques (fumée)', () => {
  for (const [path, heading] of PUBLIC_ROUTES) {
    it(`monte ${path}`, async () => {
      renderAt(path);
      await waitFor(() => expect(screen.getAllByRole('heading').length).toBeGreaterThan(0));
      expect(screen.getAllByText(heading).length).toBeGreaterThan(0);
    });
  }

  it('protège /espace-membre et /media', async () => {
    renderAt('/espace-membre');
    expect(await screen.findByRole('heading', { name: /connexion/i })).toBeInTheDocument();
  });
});
