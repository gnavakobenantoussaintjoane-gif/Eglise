import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ChurchSettings } from '../types';

const SETTINGS_KEY = ['settings'] as const;

export const FALLBACK_SETTINGS: ChurchSettings = {
  churchName: "La Forteresse de l'Éternel",
  slogan: 'Un refuge, une famille, une mission',
  tagline: 'Église évangélique à Abidjan',
  about: null,
  vision: null,
  mission: null,
  address: null,
  city: 'Abidjan',
  country: "Côte d'Ivoire",
  phone: null,
  whatsapp: null,
  email: null,
  socialLinks: {},
  serviceTimes: [],
  logoUrl: null,
  heroUrl: null,
  colors: { primary: '#4c1d95', royal: '#6d28d9', accent: '#8b5cf6' },
  updatedAt: new Date(0).toISOString(),
};

export function useChurchSettings() {
  const query = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: ({ signal }) => api.get<ChurchSettings>('/public/settings', undefined, signal),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const colors = query.data?.colors;
    if (!colors) return;
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', colors.primary);
    root.style.setProperty('--brand-royal', colors.royal);
    root.style.setProperty('--brand-accent', colors.accent);
  }, [query.data]);

  useEffect(() => {
    if (query.data?.churchName) {
      document.title = `${query.data.churchName} · ${query.data.slogan}`;
    }
  }, [query.data]);

  return { ...query, settings: query.data ?? FALLBACK_SETTINGS };
}

export function useServiceTimes() {
  const { settings } = useChurchSettings();
  return settings.serviceTimes ?? [];
}
