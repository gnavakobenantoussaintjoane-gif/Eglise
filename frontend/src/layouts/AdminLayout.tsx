import { NavLink, Outlet, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  Coins,
  House,
  Images,
  LayoutDashboard,
  Mail,
  MessageSquareQuote,
  Quote,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useChurchSettings } from '../hooks/useChurchSettings';
import { Logo } from '../components/layout/Logo';
import { UserMenu } from '../components/layout/UserMenu';
import { Badge } from '../components/ui';
import { cn } from '../utils/cn';
import type { AdminDashboard } from '../types';

const GROUPS: { title: string; items: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean; adminOnly?: boolean }[] }[] = [
  {
    title: 'Pilotage',
    items: [{ to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true, adminOnly: true }],
  },
  {
    title: 'Communauté',
    items: [
      { to: '/admin/membres', label: 'Membres', icon: Users, adminOnly: true },
      { to: '/admin/departements', label: 'Départements', icon: ShieldCheck },
      { to: '/admin/messagerie', label: 'Messagerie', icon: Mail, adminOnly: true },
    ],
  },
  {
    title: 'Contenus',
    items: [
      { to: '/admin/galerie', label: 'Albums & photos', icon: Images },
      { to: '/admin/predications', label: 'Prédications', icon: BookOpen, adminOnly: true },
      { to: '/admin/evenements', label: 'Événements', icon: CalendarDays, adminOnly: true },
      { to: '/admin/annonces', label: 'Annonces', icon: Bell, adminOnly: true },
    ],
  },
  {
    title: 'Vie de l’église',
    items: [
      { to: '/admin/priere', label: 'Demandes de prière', icon: MessageSquareQuote, adminOnly: true },
      { to: '/admin/temoignages', label: 'Modération', icon: Quote, adminOnly: true },
    ],
  },
  {
    title: 'Système',
    items: [
      { to: '/admin/finances', label: 'Finances', icon: Coins, adminOnly: true },
      { to: '/admin/parametres', label: 'Paramètres', icon: Settings, adminOnly: true },
      { to: '/admin/journal', label: 'Journal d’audit', icon: Activity, adminOnly: true },
    ],
  },
];

export function AdminLayout() {
  const { settings } = useChurchSettings();
  const { isAdmin, canManageDepartments } = useAuth();
  const dashboardQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'badges'],
    queryFn: ({ signal }) => api.get<AdminDashboard>('/admin/dashboard', undefined, signal),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const badges: Record<string, number> = {
    '/admin/membres': dashboardQuery.data?.members.pending ?? 0,
    '/admin/priere': dashboardQuery.data?.prayerRequests.new ?? 0,
    '/admin/temoignages': dashboardQuery.data?.testimonies.pending ?? 0,
  };

  return (
    <div className="min-h-screen bg-lavender/40">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="container-page flex h-[4.5rem] items-center justify-between gap-4">
          <Logo name={settings.churchName} slogan="Administration" logoUrl={settings.logoUrl} />
          <div className="flex items-center gap-3">
            <Link to="/" className="hidden items-center gap-1.5 text-sm font-medium text-ink/70 hover:text-brand sm:flex">
              <House className="h-4 w-4" aria-hidden="true" /> Voir le site
            </Link>
            {!isAdmin && canManageDepartments ? <Badge tone="brand">Responsable</Badge> : null}
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="container-page flex gap-8 py-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <nav aria-label="Navigation de l’administration" className="space-y-5">
            {GROUPS.map((group) => {
              const items = group.items.filter((item) => !item.adminOnly || isAdmin);
              if (items.length === 0) return null;
              return (
                <div key={group.title}>
                  <p className="mb-2 px-3 text-[0.68rem] font-semibold tracking-[0.16em] text-muted uppercase">
                    {group.title}
                  </p>
                  <div className="space-y-0.5">
                    {items.map(({ to, label, icon: Icon, end }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={end}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                            isActive ? 'bg-brand text-white' : 'text-ink/75 hover:bg-lavender',
                          )
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="flex-1">{label}</span>
                        {badges[to] ? (
                          <span className="rounded-full bg-gold px-1.5 text-[0.65rem] font-bold text-brand-dark">
                            {badges[to]}
                          </span>
                        ) : null}
                      </NavLink>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <nav
            aria-label="Navigation de l’administration (mobile)"
            className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden"
          >
            {GROUPS.flatMap((group) => group.items)
              .filter((item) => !item.adminOnly || isAdmin)
              .map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
                      isActive ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink/75',
                    )
                  }
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
                </NavLink>
              ))}
          </nav>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
