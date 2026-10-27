import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UnsubscribePage } from './UnsubscribePage';

/**
 * Page publique de désinscription : elle doit fonctionner sans session, ne rien
 * modifier avant confirmation, et rester lisible quand le lien est invalide.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <UnsubscribePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.includes('/public/unsubscribe')) {
      if (method === 'POST') {
        return json({
          ok: true,
          changed: true,
          maskedEmail: 'jo***@gmail.com',
          message: 'Vous ne recevrez plus les messages d information de l eglise.',
        });
      }
      return json({ valid: true, maskedEmail: 'jo***@gmail.com', alreadyUnsubscribed: false });
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Introuvable.' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page de désinscription', () => {
  it('affiche un message clair quand le lien ne porte pas de jeton', () => {
    renderAt('/desinscription');
    expect(screen.getByText(/ne contient pas de jeton/i)).toBeInTheDocument();
    // Aucune requête réseau inutile.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('vérifie le lien et attend une confirmation explicite', async () => {
    renderAt('/desinscription?token=jeton-de-test-signe');

    expect(await screen.findByText(/jo\*\*\*@gmail\.com/)).toBeInTheDocument();
    // Tant que la personne ne confirme pas, rien n'est envoyé.
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST'),
    ).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: /me désinscrire/i }));

    await waitFor(() =>
      expect(screen.getByText(/ne recevrez plus les messages/i)).toBeInTheDocument(),
    );
  });

  it('ne montre jamais l adresse complete', async () => {
    renderAt('/desinscription?token=jeton-de-test-signe');
    await screen.findByText(/jo\*\*\*@gmail\.com/);
    expect(screen.queryByText('joannegnava@gmail.com')).not.toBeInTheDocument();
  });

  it('signale un lien invalide sans bloquer la navigation', async () => {
    fetchMock.mockImplementation(async () =>
      json({ valid: false, error: { code: 'INVALID_TOKEN', message: 'Lien invalide.' } }, 400),
    );
    renderAt('/desinscription?token=jeton-de-test-signe');
    expect(await screen.findByText(/invalide/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /votre profil/i })).toBeInTheDocument();
  });

  it('indique une désinscription déjà effective', async () => {
    fetchMock.mockImplementation(async () =>
      json({ valid: true, maskedEmail: 'jo***@gmail.com', alreadyUnsubscribed: true }),
    );
    renderAt('/desinscription?token=jeton-de-test-signe');
    expect(await screen.findByText(/déjà désinscrit/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /me désinscrire/i })).not.toBeInTheDocument();
  });
});
