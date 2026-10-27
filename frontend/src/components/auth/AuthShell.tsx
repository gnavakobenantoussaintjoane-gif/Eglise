import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Quote } from 'lucide-react';
import { useChurchSettings } from '../../hooks/useChurchSettings';
import { Logo } from '../layout/Logo';

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { settings } = useChurchSettings();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="relative hidden overflow-hidden hero-gradient p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-20 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        <Logo name={settings.churchName} slogan={settings.slogan} logoUrl={settings.logoUrl} inverted />
        <div className="relative space-y-6">
          <Quote className="h-10 w-10 text-gold" aria-hidden="true" />
          <p className="max-w-md font-display text-3xl leading-snug">
            « Venez à moi, vous tous qui êtes fatigués et chargés, et je vous donnerai du repos. »
          </p>
          <p className="text-sm text-white/70">Matthieu 11.28</p>
        </div>
        <p className="relative text-sm text-white/60">
          {settings.tagline ?? 'Une église qui accueille, forme et envoie.'}
        </p>
      </div>

      <div className="flex flex-col justify-center bg-white px-5 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md space-y-8">
          <div className="lg:hidden">
            <Logo name={settings.churchName} slogan={settings.slogan} logoUrl={settings.logoUrl} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-brand-dark sm:text-3xl">{title}</h1>
            {description ? <p className="text-sm leading-relaxed text-muted">{description}</p> : null}
          </div>
          {children}
          {footer ? <div className="text-sm text-muted">{footer}</div> : null}
          <Link to="/" className="block text-xs text-muted hover:text-brand">
            ← Retour au site public
          </Link>
        </div>
      </div>
    </div>
  );
}
