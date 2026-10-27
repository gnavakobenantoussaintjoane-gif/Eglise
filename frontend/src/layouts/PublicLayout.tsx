import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Clock, Facebook, Instagram, Mail, MapPin, Menu, Phone, Youtube, X } from 'lucide-react';
import { useChurchSettings } from '../hooks/useChurchSettings';
import { useAuth } from '../hooks/useAuth';
import { Logo } from '../components/layout/Logo';
import { UserMenu } from '../components/layout/UserMenu';
import { Button } from '../components/ui';
import { cn } from '../utils/cn';

const NAV_ITEMS = [
  { to: '/', label: 'Accueil', end: true },
  { to: '/a-propos', label: 'Notre église' },
  { to: '/predications', label: 'Prédications' },
  { to: '/evenements', label: 'Événements' },
  { to: '/departements', label: 'Départements' },
  { to: '/galerie', label: 'Galerie' },
  { to: '/contact', label: 'Contact' },
];

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export function PublicLayout() {
  const { settings } = useChurchSettings();
  const { isAuthenticated, isApproved, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const socials = [
    { key: 'facebook', href: settings.socialLinks.facebook, Icon: Facebook, label: 'Facebook' },
    { key: 'instagram', href: settings.socialLinks.instagram, Icon: Instagram, label: 'Instagram' },
    { key: 'youtube', href: settings.socialLinks.youtube, Icon: Youtube, label: 'YouTube' },
  ].filter((item) => Boolean(item.href));

  const spaceLink = isAdmin ? '/admin' : isApproved ? '/espace-membre' : '/mon-inscription';

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <ScrollToTop />
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Aller au contenu principal
      </a>

      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/90 backdrop-blur-md">
        <div className="container-page flex h-[4.5rem] items-center justify-between gap-4">
          <Logo name={settings.churchName} slogan={settings.slogan} logoUrl={settings.logoUrl} />

          <nav aria-label="Navigation principale" className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-3.5 py-2 text-sm font-medium transition',
                    isActive ? 'bg-lavender-deep text-brand' : 'text-ink/75 hover:bg-lavender hover:text-brand',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <Link to={spaceLink} className="hidden sm:block">
                  <Button size="sm" variant="outline">
                    Mon espace
                  </Button>
                </Link>
                <UserMenu />
              </>
            ) : (
              <>
                <Link to="/connexion" className="hidden text-sm font-medium text-ink/75 transition hover:text-brand sm:block">
                  Connexion
                </Link>
                <Link to="/inscription" className="hidden sm:block">
                  <Button size="sm">Devenir membre</Button>
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-brand lg:hidden"
              aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="border-t border-line bg-white lg:hidden">
            <nav aria-label="Navigation mobile" className="container-page flex flex-col gap-1 py-4">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'rounded-xl px-3 py-2.5 text-sm font-medium',
                      isActive ? 'bg-lavender-deep text-brand' : 'text-ink/75 hover:bg-lavender',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <Link to="/annonces" className="rounded-xl px-3 py-2.5 text-sm font-medium text-ink/75 hover:bg-lavender">
                Annonces
              </Link>
              <Link to="/temoignages" className="rounded-xl px-3 py-2.5 text-sm font-medium text-ink/75 hover:bg-lavender">
                Témoignages
              </Link>
              <div className="mt-3 flex gap-2 border-t border-line pt-3">
                {isAuthenticated ? (
                  <Link to={spaceLink} className="flex-1">
                    <Button block size="sm" variant="outline">
                      Mon espace
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link to="/connexion" className="flex-1">
                      <Button block size="sm" variant="outline">
                        Connexion
                      </Button>
                    </Link>
                    <Link to="/inscription" className="flex-1">
                      <Button block size="sm">
                        Devenir membre
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        ) : null}
      </header>

      <main id="contenu" className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-16 bg-brand-dark text-white/80">
        <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <Logo name={settings.churchName} slogan={settings.slogan} logoUrl={settings.logoUrl} inverted />
            <p className="text-sm leading-relaxed text-white/70">
              {settings.tagline ?? settings.slogan} Une communauté qui accueille, forme et envoie.
            </p>
            {socials.length > 0 ? (
              <div className="flex gap-2">
                {socials.map(({ key, href, Icon, label }) => (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <h2 className="mb-4 font-display text-base font-semibold text-white">Nos rendez-vous</h2>
            <ul className="space-y-2 text-sm">
              {(settings.serviceTimes.length > 0
                ? settings.serviceTimes
                : [
                    { label: 'Culte de célébration', day: 'Dimanche', time: '09h00' },
                    { label: 'Étude biblique', day: 'Mercredi', time: '18h30' },
                    { label: 'Veillée de prière', day: 'Vendredi', time: '21h00' },
                  ]
              ).map((service, index) => (
                <li key={`${service.label}-${index}`} className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                  <span>
                    <span className="text-white">{service.label ?? 'Culte'}</span>
                    <span className="block text-white/60">
                      {[service.day, service.time].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="mb-4 font-display text-base font-semibold text-white">Nous trouver</h2>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                <span>
                  {settings.address ?? 'Abidjan'}
                  {settings.city ? <span className="block text-white/60">{settings.city}, {settings.country}</span> : null}
                </span>
              </li>
              {settings.phone ? (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                  <a href={`tel:${settings.phone.replace(/\s/g, '')}`} className="hover:text-white">
                    {settings.phone}
                  </a>
                </li>
              ) : null}
              {settings.email ? (
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                  <a href={`mailto:${settings.email}`} className="hover:text-white">
                    {settings.email}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>

          <div>
            <h2 className="mb-4 font-display text-base font-semibold text-white">S’engager</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/inscription" className="hover:text-white">
                  Devenir membre
                </Link>
              </li>
              <li>
                <Link to="/priere" className="hover:text-white">
                  Demander la prière
                </Link>
              </li>
              <li>
                <Link to="/temoignages" className="hover:text-white">
                  Partager un témoignage
                </Link>
              </li>
              <li>
                <Link to="/annonces" className="hover:text-white">
                  Annonces de l’église
                </Link>
              </li>
              <li>
                <Link to="/confidentialite" className="hover:text-white">
                  Confidentialité & photos
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="container-page flex flex-col gap-2 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} {settings.churchName}. Tous droits réservés.
            </p>
            <p>Église évangélique · Abidjan, Côte d’Ivoire</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
