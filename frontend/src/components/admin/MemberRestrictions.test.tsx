import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemberRestrictions } from './MemberRestrictions';

/**
 * Panneau d'administration des restrictions.
 *
 * On vérifie trois choses : le catalogue vient bien du serveur, la sélection
 * est bien envoyée en PUT, et un membre non concerné (administrateur ou compte
 * non approuvé) ne voit aucun formulaire.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const CATALOG = {
  restrictions: [
    {
      code: 'event_registration',
      label: 'Inscription aux événements',
      description: 'Ne peut plus s’inscrire aux événements de l’église.',
    },
    {
      code: 'testimony_submission',
      label: 'Publication de témoignages',
      description: 'Ne peut plus soumettre de témoignage.',
    },
  ],
};

let calls: { url: string; method: string; body: unknown }[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });

      if (url.includes('/admin/restrictions/catalog')) return json(CATALOG);
      if (url.includes('/admin/members/') && method === 'PUT') {
        return json({
          restrictions: [
            {
              code: 'event_registration',
              label: 'Inscription aux événements',
              description: '',
              reason: 'Rappel à l’ordre.',
              createdAt: new Date(0).toISOString(),
            },
          ],
          added: ['event_registration'],
          removed: ['testimony_submission'],
        });
      }
      return json({ error: { code: 'NOT_FOUND', message: 'Introuvable.' } }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel(props: Partial<Parameters<typeof MemberRestrictions>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MemberRestrictions
          profileId="11111111-1111-4111-8111-111111111111"
          restrictions={[]}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('panneau des restrictions', () => {
  it('affiche les restrictions disponibles venues du serveur', async () => {
    renderPanel();
    expect(await screen.findByLabelText(/inscription aux événements/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/publication de témoignages/i)).toBeInTheDocument();
    expect(screen.getByText('Aucune restriction')).toBeInTheDocument();
  });

  it('envoie la sélection et le motif à l’enregistrement', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByLabelText(/inscription aux événements/i));
    await user.type(screen.getByLabelText(/motif communiqué au membre/i), 'Rappel à l’ordre.');
    await user.click(screen.getByRole('button', { name: /enregistrer les restrictions/i }));

    const put = calls.find((call) => call.method === 'PUT');
    expect(put).toBeTruthy();
    expect(put?.url).toContain('/admin/members/11111111-1111-4111-8111-111111111111/restrictions');
    expect(put?.body).toEqual({ codes: ['event_registration'], reason: 'Rappel à l’ordre.' });
  });

  it('affiche les restrictions déjà actives avec leur motif', async () => {
    renderPanel({
      restrictions: [
        {
          code: 'testimony_submission',
          reason: 'Propos blessants.',
          createdAt: new Date(0).toISOString(),
        },
      ],
    });

    const case1 = await screen.findByLabelText(/publication de témoignages/i);
    expect(case1).toBeChecked();
    expect(screen.getByLabelText(/inscription aux événements/i)).not.toBeChecked();
    expect(screen.getByLabelText(/motif communiqué au membre/i)).toHaveValue('Propos blessants.');
    expect(screen.getByText('1 restriction active')).toBeInTheDocument();
  });

  it('bascule le bouton en « lever » quand plus rien n’est coché', async () => {
    const user = userEvent.setup();
    renderPanel({
      restrictions: [
        {
          code: 'testimony_submission',
          reason: 'Propos blessants.',
          createdAt: new Date(0).toISOString(),
        },
      ],
    });

    await user.click(await screen.findByLabelText(/publication de témoignages/i));
    expect(screen.getByRole('button', { name: /lever toutes les restrictions/i })).toBeEnabled();
  });

  it('ne propose rien pour un administrateur ou un compte non approuvé', () => {
    renderPanel({ disabled: true });
    expect(screen.getByText(/restrictions indisponibles/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enregistrer/i })).toBeNull();
  });
});
