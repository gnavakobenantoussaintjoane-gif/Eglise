import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomePage } from './HomePage';

/**
 * Page d'accueil : vérifie que l'interface animée reste alimentée par les
 * données réelles (réglages, départements, prédications, agenda) et que le
 * logo officiel de l'église est bien utilisé.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const pagination = { page: 1, perPage: 3, total: 1, totalPages: 1 };

const SETTINGS = {
  churchName: "La Forteresse de l'Éternel",
  slogan: 'Un refuge, une famille, une mission',
  tagline: 'Église évangélique à Abidjan',
  about: null,
  vision: null,
  mission: null,
  address: 'Yopougon',
  city: 'Abidjan',
  country: "Côte d'Ivoire",
  phone: null,
  whatsapp: null,
  email: null,
  socialLinks: {},
  serviceTimes: [
    { label: 'Culte de célébration', day: 'Dimanche', time: '09h00' },
    { label: 'Étude biblique', day: 'Mercredi', time: '18h30' },
  ],
  logoUrl: null,
  heroUrl: null,
  colors: { primary: '#4c1d95', royal: '#6d28d9', accent: '#8b5cf6' },
  updatedAt: new Date(0).toISOString(),
};

const PAYLOADS: Record<string, unknown> = {
  '/public/settings': SETTINGS,
  '/public/departments': {
    departments: [
      { id: 'd1', name: 'Louange', slug: 'louange', description: 'Musique', memberCount: 4 },
      { id: 'd2', name: 'Intercession', slug: 'intercession', description: 'Prière', memberCount: 3 },
    ],
  },
  '/public/sermons': {
    sermons: [
      {
        id: 's1',
        title: 'La foi qui déplace',
        slug: 'la-foi-qui-deplace',
        speaker: 'Pasteur',
        series: 'Foi',
        summary: 'Résumé',
        scripture: 'Hébreux 11',
        preachedOn: '2026-10-01',
        audioUrl: null,
      },
    ],
    pagination,
  },
  '/public/events': {
    events: [
      {
        id: 'e1',
        title: 'Veillée de prière',
        slug: 'veillee-de-priere',
        description: 'Une nuit de prière',
        startsAt: '2026-11-20T21:00:00.000Z',
        endsAt: null,
        location: 'Temple principal',
        coverUrl: null,
        capacity: null,
        registrationCount: 0,
      },
    ],
    pagination,
  },
  '/public/albums': { albums: [], pagination },
  '/public/announcements': { announcements: [] },
  '/public/testimonies': { testimonies: [] },
};

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <HomePage />
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
      return json({ error: { code: 'NOT_FOUND', message: 'Introuvable.' } }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page d’accueil', () => {
  it('affiche le slogan de l’église en titre principal', async () => {
    renderHome();
    expect(
      await screen.findByRole('heading', { level: 1, name: /un refuge, une famille, une mission/i }),
    ).toBeInTheDocument();
  });

  it('utilise le logo officiel de l’église', async () => {
    renderHome();
    const logo = await screen.findByAltText(/logo de l’église la forteresse de l’éternel/i);
    expect(logo).toHaveAttribute('src', '/brand/logo-mark.png');
  });

  it('reprend la signature et la vision des supports imprimés', async () => {
    renderHome();
    await screen.findAllByText(/le réveil par l’amour du christ/i);
    expect(
      screen.getByText(/bâtir un peuple délivré, transformé par la révélation de la parole de dieu/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/ézéchiel 37\.10/i)).toBeInTheDocument();
  });

  it('affiche les chiffres réels renvoyés par l’API', async () => {
    renderHome();
    // Deux départements et deux horaires dans le jeu de données de test ; les
    // compteurs montent progressivement jusqu'à la valeur réelle.
    await waitFor(() => expect(screen.getAllByText('2').length).toBeGreaterThan(0), {
      timeout: 3000,
    });
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('présente le prochain événement et les horaires', async () => {
    renderHome();
    // Le rendez-vous apparaît dans le hero et dans la carte de l'agenda.
    const occurrences = await screen.findAllByRole('heading', { name: /veillée de prière/i });
    expect(occurrences.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/culte de célébration/i).length).toBeGreaterThan(0);
  });
});
