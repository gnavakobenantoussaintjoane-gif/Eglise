import { NavLink, Outlet, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CalendarDays,
  House,
  Images,
  LayoutDashboard,
  MessageSquareQuote,
  Users,
  UserRound,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useChurchSettings } from '../hooks/useChurchSettings';
import { Logo } from '../components/layout/Logo';
import { UserMenu } from '../components/layout/UserMenu';
import { Badge } from '../components/ui';
import { cn } from '../utils/cn';

const NAV = [
  { to: '/espace-membre', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/espace-membre/profil', label: 'Mon profil', icon: UserRound },
  { to: '/espace-membre/departements', label: 'Mes départements', icon: Users },
  { to: '/espace-membre/annonces', label: 'Annonces', icon: Bell },
  { to: '/espace-membre/galerie', label: 'Galerie privée', icon: Images },
  { to: '/espace-membre/evenements', label: 'Événements', icon: CalendarDays },
  { to: '/espace-membre/temoignages', label: 'Témoignages', icon: MessageSquareQuote },
  { to: '/espace-membre/notifications', label: 'Notifications', icon: Bell },
];

export function MemberLayout() {
  const { settings } = useChurchSettings();
  const { profile, isAdmin } = useAuth();
  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: ({ signal }) => api.get<{ unread: number }>('/members/notifications/unread-count', undefined, signal),
    refetchInterval: 60_000,
  });
  const unread = unreadQuery.data?.unread ?? 0;

  return (
    <div className="min-h-screen bg-lavender/40">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="container-page flex h-[4.5rem] items-center justify-between gap-4">
          <Logo name={settings.churchName} slogan="Espace membre" logoUrl={settings.logoUrl} />
          <div className="flex items-center gap-3">
            <Link to="/" className="hidden items-center gap-1.5 text-sm font-medium text-ink/70 hover:text-brand sm:flex">
              <House className="h-4 w-4" aria-hidden="true" /> Site public
            </Link>
            {isAdmin ? (
              <Link to="/admin">
                <Badge tone="brand">Admin</Badge>
              </Link>
            ) : null}
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="container-page flex gap-8 py-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <nav aria-label="Navigation de l’espace membre" className="surface sticky top-24 space-y-1 p-3">
            <div className="flex items-center gap-3 px-2 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                {(profile?.firstName?.[0] ?? '') + (profile?.lastName?.[0] ?? '')}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{profile?.fullName}</p>
                <p className="truncate text-xs text-muted">{profile?.city ?? 'Membre'}</p>
              </div>
            </div>
            <div className="h-px bg-line" />
            {NAV.map(({ to, label, icon: Icon, end }) => (
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
                {to.endsWith('notifications') && unread > 0 ? (
                  <span className="rounded-full bg-gold px-1.5 text-[0.65rem] font-bold text-brand-dark">
                    {unread}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <nav
            aria-label="Navigation de l’espace membre (mobile)"
            className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden"
          >
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    isActive
                      ? 'border-brand bg-brand text-white'
                      : 'border-line bg-white text-ink/75',
                  )
                }
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
              </NavLink>
            ))}
          </nav>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
